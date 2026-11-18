// End-to-end traceability audit using a real headless Chrome page plus API/Mongo/chain assertions.
require('dotenv').config();
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { ethers } = require('ethers');
const WebSocket = require('ws');
const mongoose = require('mongoose');
const { User, Product, Shipment, TrackingEvent, BlockchainTransaction, AuditLog } = require('../models');

const API = process.env.API_URL || 'http://localhost:4000';
const FRONTEND = process.env.FRONTEND_URL || 'http://localhost:3000';
const contractAddress = process.env.CONTRACT_ADDRESS;
const artifactPath = process.env.ARTIFACT_PATH || './artifacts/contracts/CustodyRegistry.sol/CustodyRegistry.json';
const runId = Date.now().toString().slice(-8);
const productId = `PRD-AUDIT-${runId}`;
const rfidTag = `TAG-AUDIT-${runId}`;
const shipmentId = `TRC-AUDIT-${runId}`;
const password = { admin: 'Admin@123', operator: 'Operator@123' };
let ws, nextId = 0;
const inflight = new Map();

async function api(path, { method = 'GET', token, body } = {}) {
  const response = await fetch(`${API}${path}`, { method, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const data = await response.json().catch(() => ({}));
  return { status: response.status, data };
}
function send(method, params = {}) {
  const id = ++nextId;
  ws.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => inflight.set(id, { resolve, reject }));
}
async function evaluate(expression) {
  let out;
  try { out = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }); }
  catch (error) { throw new Error(`Browser evaluation failed for ${expression}: ${error.message}`); }
  if (out.exceptionDetails) throw new Error(out.exceptionDetails.exception?.description || out.exceptionDetails.text);
  return out.result?.result?.value;
}
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(predicate, label, timeout = 15000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    if (await predicate()) return;
    await sleep(200);
  }
  throw new Error(`Timed out waiting for ${label}`);
}
async function setValue(selector, value) {
  const s = JSON.stringify(selector), v = JSON.stringify(String(value));
  await evaluate(`(()=>{const e=document.querySelector(${s});if(!e)throw Error('Missing '+${s});const d=Object.getOwnPropertyDescriptor(Object.getPrototypeOf(e),'value');if(d&&d.set)d.set.call(e,${v});else e.value=${v};e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));return true})()`);
}
async function clickText(selector, text) {
  const s = JSON.stringify(selector), t = JSON.stringify(text);
  const clicked = await evaluate(`(()=>{const e=[...document.querySelectorAll(${s})].find(x=>x.innerText.includes(${t}));if(!e)return false;e.click();return true})()`);
  assert.equal(clicked, true, `UI control not found: ${text}`);
}
async function login(email, pass) {
  await until(async () => !!(await evaluate('!!document.querySelector("form.stack")')), 'login form');
  await until(async () => !!(await evaluate('Object.keys(document.querySelector("form.stack button")||{}).some(k=>k.startsWith("__reactProps"))')), 'React login form hydration');
  await setValue('form.stack input[name="email"]', email);
  await setValue('form.stack input[name="password"]', pass);
  await evaluate('document.querySelector("form.stack").requestSubmit()');
  await sleep(1000);
  const ok = await evaluate('!!document.querySelector(".sidebar")');
  if (!ok) throw new Error(`${email} sign-in failed; UI=${(await evaluate('document.body.innerText')).slice(0,800)}`);
}
async function signOut() {
  await evaluate('localStorage.removeItem("tracenet-token");localStorage.removeItem("tracenet-user")');
  await send('Page.navigate', { url: FRONTEND });
  await until(async () => !!(await evaluate('!!document.querySelector("form.stack")')), 'signed out');
}
async function logout() {
  if (await evaluate('!!document.querySelector(".profile button[title=\"Sign out\"]")')) {
    await evaluate('document.querySelector(".profile button[title=\"Sign out\"]").click()');
    await until(async () => !!(await evaluate('document.querySelector("form.stack")')), 'sign out');
  }
}
async function installSession(session) {
  await evaluate(`localStorage.setItem("tracenet-token",${JSON.stringify(session.token)});localStorage.setItem("tracenet-user",${JSON.stringify(JSON.stringify(session.user))})`);
  await send('Page.navigate', { url: FRONTEND });
  try { await until(async () => !!(await evaluate('document.querySelector(".sidebar")')), 'session dashboard', 15000); }
  catch(e) { throw new Error(`${e.message}; role=${session.user.role}; UI=${(await evaluate('document.body.innerText')).slice(0,700)}`); }
}
async function nav(label) { await clickText('nav button', label); await sleep(250); }
async function submitProduct(id, tag, label) {
  await nav('Products');
  await setValue('.module-form input[name="productId"]', id);
  await setValue('.module-form input[name="name"]', label);
  await setValue('.module-form input[name="rfidTag"]', tag);
  await evaluate('document.querySelector(".module-form").requestSubmit()');
}
async function submitShipment() {
  await nav('Shipments');
  const forms = await evaluate('document.querySelectorAll(".module-form").length');
  assert.ok(forms > 0, 'Shipment form rendered');
  await setValue('.module-form input[name="shipmentId"]', shipmentId);
  await setValue('.module-form input[name="trackingId"]', shipmentId);
  await setValue('.module-form select[name="productId"]', productId);
  await setValue('.module-form input[name="source"]', 'Hyderabad');
  await setValue('.module-form input[name="destination"]', 'Bengaluru');
  await setValue('.module-form input[name="checkpoints"]', 'Kurnool');
  await evaluate('document.querySelector(".module-form input[name=shipmentId]").form.requestSubmit()');
}
async function scan(checkpoint, deviceId) {
  await nav('RFID Simulator');
  await setValue('.scan-form input[name="rfidTag"]', rfidTag);
  await setValue('.scan-form select[name="deviceId"]', deviceId);
  await setValue('.scan-form input[name="checkpoint"]', checkpoint);
  await evaluate('document.querySelector(".scan-form").requestSubmit()');
  await until(async () => (await evaluate('document.querySelector(".alert")?.innerText || ""')).includes('blockchain'), `${checkpoint} scan result`, 20000);
  return await evaluate('document.querySelector(".alert").innerText');
}
async function changeAnchorPermission(allowed) {
  const provider = new ethers.providers.JsonRpcProvider(process.env.RPC_URL || 'http://127.0.0.1:8545');
  const artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf8'));
  const owner = new ethers.Wallet('0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80', provider);
  const backend = new ethers.Wallet(process.env.BACKEND_PRIVATE_KEY, provider);
  const contract = new ethers.Contract(contractAddress, artifact.abi, owner);
  const tx = await contract.setAnchorer(backend.address, allowed);
  await tx.wait();
}
async function main() {
  assert.ok(contractAddress, 'CONTRACT_ADDRESS required');
  await mongoose.connect(process.env.MONGODB_URI);
  assert.equal((await fetch(`${FRONTEND}/`)).status, 200, 'frontend is reachable');
  const targets = await (await fetch('http://localhost:9223/json/list')).json();
  const page = targets.find(t => t.type === 'page' && t.url.startsWith(FRONTEND));
  assert.ok(page, 'Chrome debug page opened at the frontend URL');
  ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { ws.once('open', resolve); ws.once('error', reject); });
  ws.on('message', raw => { const msg = JSON.parse(raw); if (msg.id && inflight.has(msg.id)) { const p = inflight.get(msg.id); inflight.delete(msg.id); msg.error ? p.reject(new Error(msg.error.message)) : p.resolve(msg); } });
  await send('Page.enable'); await send('Runtime.enable');
  await send('Page.addScriptToEvaluateOnNewDocument', { source: 'localStorage.removeItem("tracenet-token");localStorage.removeItem("tracenet-user");' });
  await send('Page.navigate', { url: FRONTEND });

  // Admin creates the product and route through the rendered app.
  await login('admin@tracenet.com', password.admin);
  const adminLogin = await api('/api/auth/login', { method:'POST', body:{email:'admin@tracenet.com',password:password.admin} });
  const adminSession = adminLogin.data;
  assert.ok((await evaluate('document.body.innerText')).includes('Total products'));
  assert.ok((await evaluate('document.body.innerText')).includes('Shipment status'));
  assert.ok((await evaluate('document.querySelectorAll(".status-bar-row").length')) >= 5, 'live status chart uses actual shipment categories');
  await submitProduct(productId, rfidTag, 'Traceability audit product');
  await until(async () => (await evaluate('document.body.innerText')).includes('Product registered'), 'admin product create');
  await submitShipment();
  try { await until(async () => (await evaluate('document.body.innerText')).includes('Shipment created'), 'admin shipment create'); }
  catch(e) { throw new Error(`${e.message}; UI=${(await evaluate('document.body.innerText')).slice(0,1400)}`); }
  const created = await Shipment.findOne({ shipmentId }).lean();
  assert.deepEqual(created.checkpoints.map(c => c.location), ['Hyderabad', 'Kurnool', 'Bengaluru']);
  console.log('PASS UI admin product + shipment creation; MongoDB route is Hyderabad > Kurnool > Bengaluru');

  await nav('Users');
  assert.ok((await evaluate('document.body.innerText')).includes('Team accounts'));
  await nav('Devices');
  assert.ok((await evaluate('document.body.innerText')).includes('Register reader'));
  console.log('PASS Admin dashboard cards, Users and Devices management pages render');

  await signOut();
  await login('operator@tracenet.com', password.operator);
  const operatorAdminNav = await evaluate('[...document.querySelectorAll("nav button")].some(b=>b.innerText.includes("Users")||b.innerText.includes("Audit log")||b.innerText.includes("Devices"))');
  assert.equal(operatorAdminNav, false, `operator must not see admin nav; role=${await evaluate('document.querySelector(".profile small")?.innerText')}`);
  await nav('Products');
  assert.equal(await evaluate('document.body.innerText.includes("Register product")'), false);
  await nav('Shipments');
  assert.equal(await evaluate('!!document.querySelector(".module-form input[name=shipmentId]")'), false);

  // Operator cannot perform administrative product creation, but can process the assigned shipment in the actual UI.
  const operatorLogin = await api('/api/auth/login', { method:'POST', body:{email:'operator@tracenet.com',password:password.operator} });
  const operatorSession = operatorLogin.data;
  const operatorShipments = await api('/api/shipments', { token:operatorSession.token });
  assert.ok(operatorShipments.data.some(s => s.shipmentId === shipmentId));
  assert.ok(operatorShipments.data.every(s => !s.assignedOperator || String(s.assignedOperator) === operatorSession.user.id));
  const forbiddenId = `PRD-FORBIDDEN-${runId}`;
  const operatorProductAttempt = await api('/api/products', { method:'POST', token:operatorSession.token, body:{productId:forbiddenId,name:'Should not be created',rfidTag:`TAG-FORBIDDEN-${runId}`} });
  const operatorShipmentAttempt = await api('/api/shipments', { method:'POST', token:operatorSession.token, body:{shipmentId:`${shipmentId}-DENIED`,trackingId:`${shipmentId}-DENIED`,productId,source:'Hyderabad',destination:'Bengaluru',checkpoints:['Kurnool']} });
  assert.equal(operatorProductAttempt.status,403); assert.equal(operatorShipmentAttempt.status,403);
  assert.equal(await Product.findOne({ productId: forbiddenId }).lean(), null);
  const opProduct=await Product.create({productId:`PRD-OP-${runId}`,name:'Operator permission check',rfidTag:`TAG-OP-${runId}`});
  await Shipment.create({shipmentId:`${shipmentId}-OP`,trackingId:`${shipmentId}-OP`,productRef:opProduct._id,productId:opProduct.productId,productName:opProduct.name,rfidTag:opProduct.rfidTag,source:'Hyderabad',destination:'Bengaluru',assignedOperator:operatorSession.user.id,status:'READY_FOR_PICKUP',checkpoints:['Hyderabad','Kurnool','Bengaluru'].map((location,sequence)=>({location,sequence,scanned:false}))});
  const operatorScan=await api('/api/scans',{method:'POST',token:operatorSession.token,body:{rfidTag:opProduct.rfidTag,deviceId:'ESP32-WH-01',checkpoint:'Hyderabad'}});
  assert.equal(operatorScan.status,202);
  for(let i=0;i<30&&!(await BlockchainTransaction.exists({eventId:operatorScan.data.event.eventId,status:'CONFIRMED'}));i++)await sleep(250);
  assert.ok(await BlockchainTransaction.exists({eventId:operatorScan.data.event.eventId,status:'CONFIRMED'}));
  console.log('PASS Operator sees assigned shipment, can scan assigned route, and cannot create product/shipment (403)');

  // Fail one actual chain submission by revoking the backend writer, then retry through admin UI.
  await changeAnchorPermission(false);
  const failedMessage = await scan('Hyderabad', 'ESP32-WH-01');
  await until(async () => (await BlockchainTransaction.findOne({ shipmentId, status: 'FAILED' }).lean()), 'failed outbox anchor', 15000);
  const failedTx = await BlockchainTransaction.findOne({ shipmentId, status: 'FAILED' }).lean();
  const failedEvent = await TrackingEvent.findOne({ eventId: failedTx.eventId }).lean();
  const noAnchor = await api(`/api/blockchain/verify/${failedTx.eventId}`, { token: (await api('/api/auth/login', { method:'POST', body:{email:'operator@tracenet.com',password:password.operator} })).data.token });
  assert.equal(noAnchor.data.status, 'NOT_ANCHORED');
  console.log(`PASS UI first scan persisted despite anchor failure; verification=${noAnchor.data.status}; UI said: ${failedMessage}`);
  await changeAnchorPermission(true);
  await signOut();
  await login('admin@tracenet.com', password.admin);
  await nav('Blockchain');
  const rowExpr = JSON.stringify(failedTx.eventId);
  const retryFound = await evaluate(`(()=>{const r=[...document.querySelectorAll("tbody tr")].find(x=>x.innerText.includes(${rowExpr}));if(!r)return false;const b=[...r.querySelectorAll("button")].find(x=>x.innerText.includes("Retry"));if(!b)return false;b.click();return true})()`);
  assert.equal(retryFound, true, 'admin retry control is shown for failed outbox record');
  await until(async () => (await BlockchainTransaction.findOne({ eventId: failedTx.eventId, status: 'CONFIRMED' }).lean()), 'outbox retry confirmation', 20000);
  const duplicateRetry = await api(`/api/blockchain/retry/${failedTx.eventId}`, { method:'POST', token:adminSession.token });
  assert.equal(duplicateRetry.status,409,'confirmed anchor cannot be retried/duplicated');
  console.log('PASS admin retry produced a confirmed on-chain anchor');

  // Tamper demonstration is performed through the admin UI and compares a changed payload hash.
  await nav('Blockchain');
  const tamperFound = await evaluate(`(()=>{const r=[...document.querySelectorAll("tbody tr")].find(x=>x.innerText.includes(${rowExpr}));if(!r)return false;const b=[...r.querySelectorAll("button")].find(x=>x.innerText.includes("Tamper demo"));if(!b)return false;b.click();return true})()`);
  assert.equal(tamperFound, true, 'admin tamper demonstration control is visible');
  await until(async () => (await evaluate('document.querySelector(".alert")?.innerText || ""')).includes('MISMATCH'), 'tamper mismatch result');
  console.log('PASS UI tamper demonstration returns MISMATCH');

  // Operator advances the remaining two stops through the simulator.
  await signOut();
  await login('operator@tracenet.com', password.operator);
  const mid = await scan('Kurnool', 'ESP32-KU-01');
  const end = await scan('Bengaluru', 'ESP32-BL-01');
  await until(async () => (await Shipment.findOne({ shipmentId }).lean())?.status === 'DELIVERED', 'shipment delivered');
  const events = await TrackingEvent.find({ shipmentId }).sort({ 'eventData.occurredAt': 1 }).lean();
  assert.equal(events.length, 3);
  assert.deepEqual(events.map(e => e.checkpoint), ['Hyderabad', 'Kurnool', 'Bengaluru']);
  const artifact = JSON.parse(fs.readFileSync(artifactPath,'utf8'));
  const iface = new ethers.utils.Interface(artifact.abi);
  const chainProvider = new ethers.providers.JsonRpcProvider(process.env.RPC_URL || 'http://127.0.0.1:8545');
  for (const ev of events) {
    const tx = await BlockchainTransaction.findOne({ eventId: ev.eventId }).lean();
    assert.equal(tx.status, 'CONFIRMED'); assert.ok(tx.txHash); assert.ok(tx.blockNumber > 0);
    assert.equal(ev.eventHash,ethers.utils.keccak256(ethers.utils.toUtf8Bytes(JSON.stringify(ev.eventData))));
    const proof = await api(`/api/blockchain/verify/${ev.eventId}`, { token: (await api('/api/auth/login', { method:'POST', body:{email:'operator@tracenet.com',password:password.operator} })).data.token });
    assert.equal(proof.data.status, 'MATCH');
    const receipt = await chainProvider.getTransactionReceipt(tx.txHash);
    assert.equal(receipt.status, 1); assert.equal(receipt.blockNumber, tx.blockNumber);
    const anchorLog=receipt.logs.map(log=>{try{return iface.parseLog(log)}catch(_){return null}}).find(log=>log?.name==='ShipmentEventAnchored');
    assert.ok(anchorLog);assert.equal(anchorLog.args.eventId,ev.eventId);assert.equal(anchorLog.args.eventHash.toLowerCase(),ev.eventHash.toLowerCase());
  }
  console.log(`PASS UI scans ${mid} / ${end}; Mongo event order, tx receipts, blocks and on-chain MATCH verified`);

  await signOut();
  await login('admin@tracenet.com', password.admin);

  // Append-only history: unsupported mutation route returns 404 and records remain unchanged.
  const before = await TrackingEvent.countDocuments({ shipmentId });
  const attemptedDelete = await fetch(`${API}/api/shipments/${shipmentId}/timeline/${events[0].eventId}`, { method: 'DELETE' });
  assert.equal(attemptedDelete.status, 404);
  assert.equal(await TrackingEvent.countDocuments({ shipmentId }), before);
  console.log('PASS no event deletion API; event count unchanged');

  // Admin dashboard aggregates and audit records are backed by MongoDB records.
  const audit = await api('/api/audit', { token:adminLogin.data.token });
  assert.equal(audit.status, 200); assert.ok(audit.data.some(a => a.action === 'RFID_SCAN' && a.details.includes(shipmentId)));
  const dashboard = await api('/api/dashboard', { token:adminLogin.data.token });
  const calculated = await Shipment.countDocuments({ status: { $nin: ['DELIVERED','CANCELLED'] } });
  assert.equal(dashboard.data.summary.activeShipments, calculated);
  await nav('Audit log');
  assert.ok((await evaluate('document.body.innerText')).includes('RFID_SCAN'));
  console.log('PASS dashboard count and UI audit log reflect MongoDB state');

  // Public tracking page runs without a bearer token.
  await evaluate('localStorage.removeItem("tracenet-token");localStorage.removeItem("tracenet-user")');
  await send('Page.navigate', { url: `${FRONTEND}/verify` });
  await until(async () => (await evaluate('location.pathname')) === '/verify', 'public tracking page');
  await until(async () => !!(await evaluate('Object.keys(document.querySelector(".public-hero form button")||{}).some(k=>k.startsWith("__reactProps"))')), 'public page hydration');
  await setValue('.public-hero input', shipmentId);
  await evaluate('document.querySelector(".public-hero form").requestSubmit()');
  try { await until(async () => (await evaluate('document.body.innerText')).includes(shipmentId), 'public shipment details'); }
  catch(e) { throw new Error(`${e.message}; UI=${(await evaluate('document.body.innerText')).slice(0,1000)}`); }
  assert.ok((await evaluate('document.body.innerText')).includes('Bengaluru'));
  const publicResponse = await fetch(`${API}/api/public/track/${shipmentId}`);
  assert.equal(publicResponse.status, 200);
  const publicData = await publicResponse.json();
  assert.deepEqual(Object.keys(publicData.shipment).sort(), ['checkpoints','destination','eta','productName','shipmentId','source','status','trackingId'].sort());
  assert.ok(!JSON.stringify(publicData).includes(rfidTag));
  assert.ok(!JSON.stringify(publicData).includes('assignedOperator'));
  assert.equal(await evaluate('localStorage.getItem("tracenet-token")'), null);
  console.log('PASS unauthenticated public page shows completed shipment route');

  // Capture requested roles: Public Viewer is guest access, not a persisted account role.
  const roles = await User.distinct('role');
  assert.ok(roles.includes('ADMIN') && roles.includes('OPERATOR'));
  console.log(`ROLE NOTE: stored roles=${roles.join(',')}; public viewing is anonymous endpoint access (no PUBLIC_VIEWER user role).`);
  console.log(`AUDIT SHIPMENT: ${shipmentId}; product ${productId}; tag ${rfidTag}; events=${events.length}`);
}
main().catch(e => { console.error('TRACEABILITY AUDIT FAILED:', e.stack || e.message); process.exitCode = 1; }).finally(async () => { try { if (ws) ws.close(); await mongoose.disconnect(); } catch (_) {} });
