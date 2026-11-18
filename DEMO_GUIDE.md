# TraceNet Mentor Demonstration Guide

## Before presenting

Verified services in this workspace use local MongoDB and a local Hardhat EVM. Confirm these are available, then configure `.env` from `.env.example` with a strong local `JWT_SECRET`, the MongoDB URI, and local Hardhat backend key/address. Do not use the example key outside the local Hardhat network. The current machine already has a working local configuration and deployed local contract.

## Start-up

1. Start MongoDB service (for local MongoDB, ensure `mongod` is listening at `127.0.0.1:27017`).
2. In project root, open a PowerShell terminal and run:

   ```powershell
   $env:APPDATA = (Join-Path (Get-Location) '.hardhat-local')
   $env:LOCALAPPDATA = (Join-Path (Get-Location) '.hardhat-local')
   npm run node
   ```

   Keep this terminal open. The local RPC is `http://127.0.0.1:8545`.
3. In a second project-root terminal, run `npm run api`; wait for MongoDB and blockchain connected messages.
4. In a third terminal, run `npm --prefix frontend run start` (after `npm --prefix frontend run build`). For interactive development use `npm run frontend` instead.
5. Check `http://localhost:4000/health`, `http://localhost:3000/`, and `http://localhost:3000/verify`.

`run-demo.bat` is also provided, but it launches visible console windows and rewrites `.env` with a local default address; inspect current `.env` first if you have custom values.

## Browser demo sequence (5–7 minutes)

1. Sign in as `admin@tracenet.com` / `Admin@123` (development-only seeded credentials).
2. Show the dashboard counts and the audit log.
3. Open Products and confirm `PRD-100`, `TAG-100`.
4. Open Shipments and confirm `TRC-100` and route Hyderabad → Kurnool → Bengaluru.
5. Sign out, sign in as `operator@tracenet.com` / `Operator@123`.
6. Open RFID Simulator. Use `TAG-100`, choose `ESP32-WH-01`, scan `Hyderabad`.
7. Show the event and wait for anchor confirmation, then show its transaction hash/block and Verify `MATCH`.
8. Scan `Kurnool` using `ESP32-KU-01`, then `Bengaluru` using `ESP32-BL-01`; show delivered route.
9. Return to Admin for the authorized Tamper demo. It changes only a copy in memory and should report `MISMATCH`; the recorded event remains intact.
10. Open `/verify`, enter `TRC-100`, and show the public route and proofs without signing in.

## Repeatability / reset warning

The seed procedure is idempotent and creates missing demo records; it does **not** reset existing `TRC-100` scan progress. A dedicated safe demo reset script has not been implemented. For a repeatable clean demo, use a fresh MongoDB database name in `MONGODB_URI` before startup (for example `mongodb://127.0.0.1:27017/tracenet_demo_review`), then start the API so it seeds the accounts, product, shipment and devices. Keep the same local EVM/deployed address in `.env`. Do not drop collections in the current project database right before the presentation.

## Important limits to state honestly

- RFID is simulated; no ESP32/RC522 hardware is connected.
- Frontend is Next.js/React with mixed JS/TS; backend is Express JavaScript. The PPT technology preference was React/Vite/TypeScript and Express/TypeScript.
- Outbox failure and admin retry were tested; killing/restarting while SUBMITTED was not tested.
- Test environment is local MongoDB and local Hardhat, not Atlas or a public chain.
