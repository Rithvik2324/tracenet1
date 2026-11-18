# TraceNet Release Test Report

**Run date:** 2026-11-18. This report separates tests that actually ran from code review and untested requirements. Full status detail is in `TRACEABILITY_AUDIT.md`.

## Executed checks

| Check | Result | Evidence |
|---|---|---|
| Express API syntax | PASS | `node --check tracenet-api.js` after final backend changes. |
| Deployment script syntax | PASS | `node --check scripts/deploy.js`. |
| Frontend optimized production build | PASS | `npm --prefix frontend run build`; Next 15.5.2 compiled, type-checked and generated `/` and `/verify`. |
| Solidity compile | PASS | Workspace-local solc-js 0.8.15; workspace-local Hardhat cache paths; `npx hardhat compile` returned `Nothing to compile` (existing artifact already compiled). |
| API/Mongo/chain health | PASS | `GET /health` returned `{ok:true,database:"mongodb",blockchain:true}`. |
| Dashboard data accuracy and chart | PASS | Authenticated dashboard and browser showed Mongo-derived counters, pending-anchor card, and five-or-more shipment status bars matching current shipment data. |
| No SQLite runtime dependency | PASS | `npm ls sqlite3 --all` returned `(empty)`; API requires `MONGODB_URI`. |
| Admin browser flow | PASS | Real Chrome UI created product and shipment; route persisted in Mongo as Hyderabad ? Kurnool ? Bengaluru. |
| Operator authorization | PASS | Assigned shipment was visible; operator scan succeeded; product/shipment create attempts returned 403 and left no product. |
| RFID negative tests | PASS | `npm run test:reliability`: unknown RFID 404; invalid/unknown/inactive reader credentials 401; wrong checkpoint, duplicate scan, invalid route progression, and invalid shipment status 409; rejected scans did not change event count. |
| RFID route workflow | PASS | Actual frontend scanned Hyderabad, Kurnool, Bengaluru; 3 Mongo events appeared in order and shipment status became DELIVERED. |
| On-chain receipt/hash/block proof | PASS | For all 3 events, Mongo tx status was CONFIRMED, tx hash/block number matched successful RPC receipts, and `ShipmentEventAnchored` receipt log IDs/hashes matched. |
| MATCH / MISMATCH / NOT_ANCHORED | PASS | Valid saved events verified MATCH; UI in-memory tamper demonstration showed MISMATCH; unauthorized contract writer induced persisted scan + failed anchor + NOT_ANCHORED. |
| Outbox retry | PASS | After re-authorizing writer, Admin UI Retry reached CONFIRMED; second retry returned 409. |
| Outbox RPC outage and process restart | PASS | Dedicated Mongo test DB retained scan event/outbox as PENDING with no tx hash/block/false confirmation when RPC was unavailable; API restarted with RPC restored; exactly one anchor, successful receipt, matching block/hash, and final MATCH. |
| Append-only API behavior | PASS (API scope) | DELETE event route returned 404 and event count remained unchanged. No DB-privilege immutability test. |
| Dashboard audit history | PASS | Audit API/UI showed test scan and administrative blockchain actions. |
| Anonymous tracking and privacy allowlist | PASS | Browser tracked without JWT; JSON allowlist contained public fields only, with no RFID tag or assigned operator; full route and proofs rendered. |
| Public page and dashboard after latest edits | PASS | `GET /` and `/verify` returned 200; dashboard new summary values were verified after final backend update. |

## Not executed or not verified

- Physical RFID hardware is not available in this environment.
- Fault injection between RPC transaction acceptance and Mongo persistence of the transaction hash was not performed.
- Restart while the RPC endpoint remains unavailable was not separately tested; the tested sequence restarted after RPC recovery.
- End-to-end scan of the seeded `TRC-100` (the UI E2E used a newly-created audit shipment with the same route; seed contents were inspected separately).
- Persisted-data tampering (the authorized UI demo alters a copy in memory, preserving source history).
- MongoDB Atlas; test used local MongoDB.
- Backend TypeScript compile (backend is JavaScript, not TypeScript).
- Responsive/device viewport matrix, browser-console error sweep, and every button/action in the app.

## Environment notes

The final reliability regression run and final browser demo summary are recorded in `TRACEABILITY_AUDIT.md`. The browser-generated shipment for the final run was `TRC-AUDIT-96251732`.

- The app is running with local MongoDB, local Hardhat, API and built frontend when their processes remain alive. Restart URLs: `http://localhost:4000/health`, `http://localhost:3000/`.
- The development EVM is local only. Demo signing keys must never be reused on a public network.
- Next build initially tried fetching Google Fonts and failed due restricted network; removed the remote font dependency. It also found pre-existing ZXing API typing and QRCode export errors; those were fixed.
- Temporary audit Chrome profile deletion was blocked by an active Chrome process lock; the directory is ignored by Git. No application data outside the project was modified.

