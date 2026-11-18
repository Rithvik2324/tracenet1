# TraceNet

TraceNet is a blockchain and IoT-based logistics tracking MVP. It stores shipment operations in MongoDB and anchors event hashes to a local EVM smart contract. The RFID flow is simulated; no physical reader is claimed.

## Architecture

- **Frontend:** React + Next.js 15 App Router in `frontend/` (mixed JavaScript/TypeScript). Admin/operator workspace and anonymous `/verify` tracking page.
- **API:** Express REST API in `tracenet-api.js` (JavaScript, JWT and role middleware).
- **Database:** MongoDB + Mongoose models/indexes in `models.js`. Startup requires `MONGODB_URI`; no SQLite or in-memory fallback.
- **Blockchain:** Solidity `CustodyRegistry` with unique event anchors and owner-managed writer permission; Hardhat local EVM, ethers.js, locally installed solc-js 0.8.15.
- **Reliability:** Mongo tracking event + transaction outbox status (`PENDING`, `SUBMITTED`, `CONFIRMED`, `FAILED`), worker and admin retry.

The PPT’s preferred Vite/TypeScript frontend and TypeScript/Zod backend are not implemented. Current framework remains Next.js to preserve the working application. See `TRACEABILITY_AUDIT.md` for requirement status and test evidence.

## Prerequisites and setup

Install Node.js/npm and run MongoDB locally, or set a reachable MongoDB URI. Then in PowerShell from the project root:

```powershell
npm install
npm --prefix frontend install
Copy-Item .env.example .env
```

Edit `.env` before startup:

- `MONGODB_URI`: local MongoDB URI or Atlas URI.
- `JWT_SECRET`: long random secret, not the example placeholder.
- `DEMO_DEVICE_SECRET`: development-only simulator credential.
- `BACKEND_PRIVATE_KEY`: local Hardhat account key only; never use on a public network.
- `CONTRACT_ADDRESS`: address printed by deployment.

## Start services

Use separate PowerShell windows. To keep Hardhat files in the workspace:

```powershell
$env:APPDATA = (Join-Path (Get-Location) '.hardhat-local')
$env:LOCALAPPDATA = (Join-Path (Get-Location) '.hardhat-local')
npm run compile
npm run node
```

Keep the local EVM window open. In another terminal, with the same workspace-local environment variables:

```powershell
npm run deploy
```

Set the printed `CONTRACT_ADDRESS` in `.env`; the deploy script grants `BACKEND_PRIVATE_KEY` anchoring rights. Start API and frontend in two further terminals:

```powershell
npm run api
npm --prefix frontend run build
npm --prefix frontend run start
```

For development frontend hot reload, use `npm run frontend` instead of build/start. API is `http://localhost:4000`, UI `http://localhost:3000`, public tracking `http://localhost:3000/verify`; health is `http://localhost:4000/health`.

`run-demo.bat` automates local compile/node/deploy/API/frontend windows. Review `.env` first because the script writes its local default contract address into it.

## Seed and credentials

API startup idempotently creates missing demo records: Admin, Operator, `PRD-100` / `TAG-100`, `TRC-100` with Hyderabad → Kurnool → Bengaluru, and three simulated devices. `npm run seed` runs the seed independently. Development-only credentials:

- Admin: `admin@tracenet.com` / `Admin@123`
- Operator: `operator@tracenet.com` / `Operator@123`

Seed is not a reset: it does not clear previous scan state. For a clean repeatable demo, configure a fresh MongoDB database name before API startup. Do not clear the current database blindly.

## Demo workflow

See [DEMO_GUIDE.md](DEMO_GUIDE.md) for the 5–7 minute browser walkthrough. The verified flow is product → shipment → scans → Mongo event/outbox → real chain receipt → MATCH / MISMATCH → public tracking.

## API overview

- Auth: `POST /api/auth/login`, `GET /api/auth/me`, `POST /api/auth/users` (Admin).
- Products: `GET/POST /api/products` (create Admin).
- Shipments: `GET/POST /api/shipments`, `GET /api/shipments/:id`, `GET /api/shipments/:id/timeline`.
- Scans: `POST /api/scans` with `{ "rfidTag":"TAG-100", "deviceId":"ESP32-WH-01", "checkpoint":"Hyderabad" }`; optional `X-Device-Secret` header.
- Devices: `GET/POST /api/devices`.
- Blockchain: `GET /api/blockchain/transactions`, `POST /api/blockchain/retry/:eventId` (Admin), `GET /api/blockchain/verify/:eventId`, `POST /api/blockchain/tamper-demo/:eventId` (Admin).
- Public: `GET /api/public/track/:trackingId` (no token).
- Dashboard/audit: `GET /api/dashboard`, `GET /api/audit` (Admin), `GET /health`.

Authenticated routes use `Authorization: Bearer <JWT>`. Public response uses an explicit allowlist and omits RFID tags, device identifiers, and operator data.

## Build and audit

```powershell
npm run compile
npm --prefix frontend run build
node --check tracenet-api.js
node --check scripts/deploy.js
npm ls sqlite3 --all
```

`scripts/traceability-ui-audit.cjs` exercises the real UI using a headless Chrome DevTools page at port 9223, plus Mongo and RPC assertions. See `TEST_REPORT.md` for executed checks, and `TRACEABILITY_AUDIT.md` for the slide-by-slide requirement matrix.

## Known limitations

- Next.js is used instead of Vite; frontend and backend are not fully TypeScript; backend does not use Zod.
- Product/shipment update, user/device management, separate Operator dashboard, full chart widgets, status transition validation, and physical `/iot/events` ingestion are incomplete.
- Event API has no edit/delete operation, but MongoDB does not enforce immutable event documents against privileged writes.
- Outbox retry after an induced anchor failure passed; backend process-crash recovery and RPC-outage recovery were not fault-injected.
- Current verified chain is local Hardhat and database is local MongoDB, not public EVM or Atlas.
