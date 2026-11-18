require('dotenv').config();
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { spawn } = require('node:child_process');
const { ethers } = require('ethers');
const mongoose = require('mongoose');
const { User, Product, Shipment, TrackingEvent, BlockchainTransaction } = require('../models');
const { seed } = require('../tracenet-api');

const ROOT = require('node:path').resolve(__dirname, '..');
const API_PORT = Number(process.env.REGRESSION_API_PORT || 4111);
const API = `http://127.0.0.1:${API_PORT}`;
const RPC = process.env.RPC_URL || 'http://127.0.0.1:8545';
const ARTIFACT = process.env.ARTIFACT_PATH || './artifacts/contracts/CustodyRegistry.sol/CustodyRegistry.json';
const TEST_MONGO = process.env.REGRESSION_MONGODB_URI || 'mongodb://127.0.0.1:27017/tracenet_reliability';
const id = `TRC-REG-${Date.now()}`;
let apiProcess;

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function waitForHealth(expectChain, timeout = 20000) {
  const until = Date.now() + timeout;
  while (Date.now() < until) {
    try {
      const health = await (await fetch(`${API}/health`)).json();
      if (health.ok && health.blockchain === expectChain) return health;
    } catch (_) {}
    await sleep(250);
  }
  throw new Error(`API did not become ready with blockchain=${expectChain}`);
}
async function startApi(rpcUrl) {
  apiProcess = spawn(process.execPath, ['tracenet-api.js'], {
    cwd: ROOT,
    env: { ...process.env, MONGODB_URI: TEST_MONGO, PORT: String(API_PORT), RPC_URL: rpcUrl, OUTBOX_POLL_MS: '250' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  apiProcess.stdout.on('data', data => process.stdout.write(`[api] ${data}`));
  apiProcess.stderr.on('data', data => process.stderr.write(`[api] ${data}`));
  apiProcess.on('exit', code => { if (code && code !== 0) console.log(`[api] exited ${code}`); });
  await waitForHealth(rpcUrl === RPC);
}
async function stopApi() {
  if (!apiProcess) return;
  const child = apiProcess;
  apiProcess = null;
  if (child.exitCode !== null) return;
  child.kill('SIGTERM');
  await Promise.race([new Promise(resolve => child.once('exit', resolve)), sleep(3000)]);
  if (child.exitCode === null) {
    try { require('node:child_process').execFileSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' }); }
    catch (_) { child.kill('SIGKILL'); }
  }
  const until = Date.now() + 5000;
  while (Date.now() < until) {
    try { await fetch(`${API}/health`); await sleep(100); }
    catch (_) { return; }
  }
  throw new Error(`Test API port ${API_PORT} remained open after stopping its spawned backend`);
}
async function request(path, { token, method = 'GET', body, deviceSecret } = {}) {
  const response = await fetch(`${API}${path}`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(deviceSecret ? { 'X-Device-Secret': deviceSecret } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: response.status, body: await response.json().catch(() => ({})) };
}
async function fixture(tag, status = 'READY_FOR_PICKUP') {
  const product = await Product.create({ productId: `${id}-${tag}`, name: 'Reliability fixture', rfidTag: tag });
  const operator = await User.findOne({ role: 'OPERATOR' });
  return Shipment.create({
    shipmentId: `${id}-${tag}`, trackingId: `${id}-${tag}`, productRef: product._id,
    productId: product.productId, productName: product.name, rfidTag: tag,
    source: 'Hyderabad', destination: 'Bengaluru', assignedOperator: operator._id,
    status, checkpoints: ['Hyderabad', 'Kurnool', 'Bengaluru'].map((location, sequence) => ({ location, sequence, scanned: false })),
  });
}
async function main() {
  assert.ok(process.env.JWT_SECRET && process.env.BACKEND_PRIVATE_KEY);
  await mongoose.connect(TEST_MONGO);
  await seed();
  const operator = await User.findOne({ email: 'operator@tracenet.com' });
  assert.ok(operator, 'seeded operator exists');
  const operatorToken = require('jsonwebtoken').sign({ id: operator.id, email: operator.email, role: operator.role }, process.env.JWT_SECRET);
  const tag = `${id}-NORMAL`;
  const shipment = await fixture(tag);
  await fixture(`${id}-CANCEL`, 'CANCELLED');
  await fixture(`${id}-CREATED`, 'CREATED');

  try {
    // Negative scan cases against the real Express route, asserting no events are inserted.
    await startApi(RPC);
    const before = await TrackingEvent.countDocuments({ shipmentId: shipment.shipmentId });
    let result = await request('/api/scans', { token: operatorToken, method: 'POST', body: { rfidTag: `${id}-UNKNOWN`, deviceId: 'ESP32-WH-01', checkpoint: 'Hyderabad' } });
    assert.equal(result.status, 404); assert.match(result.body.error, /RFID tag/);
    result = await request('/api/scans', { token: operatorToken, method: 'POST', deviceSecret: 'incorrect-secret', body: { rfidTag: tag, deviceId: 'ESP32-WH-01', checkpoint: 'Hyderabad' } });
    assert.equal(result.status, 401); assert.match(result.body.error, /Device authentication/);
    result = await request('/api/scans', { token: operatorToken, method: 'POST', body: { rfidTag: tag, deviceId: 'NO-SUCH-DEVICE', checkpoint: 'Hyderabad' } });
    assert.equal(result.status, 401); assert.match(result.body.error, /device/);
    result = await request('/api/scans', { token: operatorToken, method: 'POST', body: { rfidTag: tag, deviceId: 'ESP32-WH-01', checkpoint: 'Bengaluru' } });
    assert.equal(result.status, 409); assert.match(result.body.error, /Invalid checkpoint progression/);
    assert.equal(await TrackingEvent.countDocuments({ shipmentId: shipment.shipmentId }), before);
    console.log('PASS invalid RFID, bad device credential, unknown device and wrong checkpoint reject without event writes');

    result = await request('/api/scans', { token: operatorToken, method: 'POST', body: { rfidTag: tag, deviceId: 'ESP32-WH-01', checkpoint: 'Hyderabad' } });
    assert.equal(result.status, 202);
    const firstEvent = result.body.event.eventId;
    for (let i = 0; i < 40 && !(await BlockchainTransaction.exists({ eventId: firstEvent, status: 'CONFIRMED' })); i++) await sleep(250);
    assert.ok(await BlockchainTransaction.exists({ eventId: firstEvent, status: 'CONFIRMED' }));
    const eventCount = await TrackingEvent.countDocuments({ shipmentId: shipment.shipmentId });
    result = await request('/api/scans', { token: operatorToken, method: 'POST', body: { rfidTag: tag, deviceId: 'ESP32-WH-01', checkpoint: 'Hyderabad' } });
    assert.equal(result.status, 409); assert.match(result.body.error, /Invalid checkpoint progression|already been scanned/);
    assert.equal(await TrackingEvent.countDocuments({ shipmentId: shipment.shipmentId }), eventCount);
    const cancelled = await Shipment.findOne({ rfidTag: `${id}-CANCEL` });
    result = await request('/api/scans', { token: operatorToken, method: 'POST', body: { rfidTag: cancelled.rfidTag, deviceId: 'ESP32-WH-01', checkpoint: 'Hyderabad' } });
    assert.equal(result.status, 409); assert.match(result.body.error, /CANCELLED/);
    assert.equal(await TrackingEvent.countDocuments({ shipmentId: cancelled.shipmentId }), 0);
    const created = await Shipment.findOne({ rfidTag: `${id}-CREATED` });
    result = await request('/api/scans', { token: operatorToken, method: 'POST', body: { rfidTag: created.rfidTag, deviceId: 'ESP32-WH-01', checkpoint: 'Hyderabad' } });
    assert.equal(result.status, 409); assert.match(result.body.error, /CREATED/);
    assert.equal(await TrackingEvent.countDocuments({ shipmentId: created.shipmentId }), 0);
    const adminLogin = await request('/api/auth/login', { method: 'POST', body: { email: 'admin@tracenet.com', password: 'Admin@123' } });
    assert.equal(adminLogin.status, 200);
    const productEdit = await request(`/api/products/${shipment.productId}`, { token: adminLogin.body.token, method: 'PATCH', body: { description: 'Updated in regression test' } });
    assert.equal(productEdit.status, 200); assert.equal(productEdit.body.description, 'Updated in regression test');
    result = await request(`/api/products/${shipment.productId}`, { token: operatorToken, method: 'PATCH', body: { description: 'unauthorized' } });
    assert.equal(result.status, 403);
    const users = await request('/api/auth/users', { token: adminLogin.body.token });
    assert.equal(users.status, 200); assert.ok(users.body.some(user => user.email === 'admin@tracenet.com'));
    result = await request('/api/auth/users', { token: operatorToken });
    assert.equal(result.status, 403);
    result = await request(`/api/shipments/${cancelled.shipmentId}`, { token: adminLogin.body.token, method: 'PATCH', body: { status: 'IN_TRANSIT' } });
    assert.equal(result.status, 409); assert.match(result.body.error, /Invalid shipment status transition/);
    result = await request('/api/devices/ESP32-KU-01', { token: adminLogin.body.token, method: 'PATCH', body: { status: 'INACTIVE' } });
    assert.equal(result.status, 200); assert.equal(result.body.secretHash, undefined);
    result = await request('/api/scans', { token: operatorToken, method: 'POST', body: { rfidTag: tag, deviceId: 'ESP32-KU-01', checkpoint: 'Hyderabad' } });
    assert.equal(result.status, 401);
    await request('/api/devices/ESP32-KU-01', { token: adminLogin.body.token, method: 'PATCH', body: { status: 'ACTIVE' } });
    assert.equal(await TrackingEvent.countDocuments({ shipmentId: shipment.shipmentId }), eventCount);
    console.log('PASS product/user/device management authorization and status transitions');
    console.log('PASS duplicate scan and CANCELLED shipment rejected without additional tracking events');
    await stopApi();

    // Start with unavailable RPC, submit a real scan, restart backend on healthy RPC, and prove exactly one anchor.
    await startApi('http://127.0.0.1:18545');
    assert.equal((await (await fetch(`${API}/health`)).json()).blockchain, false);
    const outboxTag = `${id}-OUTBOX`;
    const pendingShipment = await fixture(outboxTag);
    result = await request('/api/scans', { token: operatorToken, method: 'POST', body: { rfidTag: outboxTag, deviceId: 'ESP32-WH-01', checkpoint: 'Hyderabad' } });
    assert.equal(result.status, 202);
    const pendingId = result.body.event.eventId;
    await sleep(900);
    const pendingEvent = await TrackingEvent.findOne({ eventId: pendingId }).lean();
    const pendingTx = await BlockchainTransaction.findOne({ eventId: pendingId }).lean();
    assert.ok(pendingEvent); assert.equal(pendingEvent.anchorStatus, 'PENDING'); assert.equal(pendingTx.status, 'PENDING');
    assert.equal(pendingEvent.txHash, null); assert.equal(pendingEvent.blockNumber, null);
    console.log('PASS RPC unavailable: event/outbox persist as PENDING with no false transaction confirmation');
    await stopApi();

    await startApi(RPC);
    let confirmed;
    for (let i = 0; i < 80; i++) {
      confirmed = await BlockchainTransaction.findOne({ eventId: pendingId, status: 'CONFIRMED' }).lean();
      if (confirmed) break;
      await sleep(250);
    }
    assert.ok(confirmed, 'restart worker confirms pending outbox item');
    const finalEvent = await TrackingEvent.findOne({ eventId: pendingId }).lean();
    assert.equal(finalEvent.anchorStatus, 'CONFIRMED'); assert.ok(confirmed.txHash); assert.ok(confirmed.blockNumber > 0);
    const provider = new ethers.providers.JsonRpcProvider(RPC);
    const receipt = await provider.getTransactionReceipt(confirmed.txHash);
    assert.equal(receipt.status, 1); assert.equal(receipt.blockNumber, confirmed.blockNumber);
    const artifact = JSON.parse(fs.readFileSync(require('node:path').resolve(ROOT, ARTIFACT), 'utf8'));
    const iface = new ethers.utils.Interface(artifact.abi);
    const contract = new ethers.Contract(process.env.CONTRACT_ADDRESS, artifact.abi, provider);
    const storedHash = await contract.getEventHash(pendingId);
    assert.equal(storedHash.toLowerCase(), finalEvent.eventHash.toLowerCase());
    const logs = await contract.queryFilter(contract.filters.ShipmentEventAnchored());
    assert.equal(logs.filter(log => log.args.shipmentId === pendingShipment.shipmentId && log.args.eventId === pendingId && log.args.eventHash.toLowerCase() === finalEvent.eventHash.toLowerCase()).length, 1);
    assert.ok(receipt.logs.some(log => { try { const parsed = iface.parseLog(log); return parsed.name === 'ShipmentEventAnchored' && parsed.args.eventId === pendingId; } catch (_) { return false; } }));
    const login = await request('/api/auth/login', { method: 'POST', body: { email: 'operator@tracenet.com', password: 'Operator@123' } });
    const verification = await request(`/api/blockchain/verify/${pendingId}`, { token: login.body.token });
    assert.equal(verification.body.status, 'MATCH');
    assert.equal(await BlockchainTransaction.countDocuments({ eventId: pendingId }), 1);
    console.log('PASS backend restart + RPC restore: one mined anchor/receipt/block, persisted confirmed state and final MATCH');
  } finally {
    await stopApi();
    await mongoose.disconnect();
  }
}
main().catch(error => { console.error('RELIABILITY REGRESSION FAILED:', error.stack || error); process.exitCode = 1; });
