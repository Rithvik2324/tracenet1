# TraceNet PPT Traceability Audit

**Audit date:** 2026-11-18  
**Project inspected:** `SupplyChainTrack`  
**Reference:** `tracenet updated ppt.pptx`, slides 3, 8–13 (with implementation details cross-checked against the full functional requirements in the previously supplied TraceNet build brief).  
**Evidence run:** real browser UI through headless Chrome/CDP; Express API; live local MongoDB; local Hardhat EVM; mined transactions and receipts.  
**Updated after focused regression/release testing:** **65.5% (36 / 55 in-scope matrix requirements marked COMPLETE AND VERIFIED)**. The count is row-based: one combined row counts as one requirement. The separate row explicitly describing deferred future scope is excluded from both numerator and denominator. Only tested rows marked exactly `COMPLETE AND VERIFIED` count; partial, unverified, and unimplemented requirements count as incomplete.

## Status key

- **COMPLETE AND VERIFIED** — implementation and behavior checked in the running product or build/chain/database evidence.
- **IMPLEMENTED BUT NOT VERIFIED** — source exists, but this audit did not exercise it sufficiently.
- **PARTIALLY IMPLEMENTED** — useful behavior exists, but part of the stated requirement is missing.
- **NOT IMPLEMENTED** — no corresponding feature was found.

## Slide 3 — Abstract and MVP outcome

| PPT requirement | Status | Implementation location | Test performed and actual result | Remaining gaps |
|---|---|---|---|---|
| Web application for shipment traceability, unique shipment identity and multi-stop routes | COMPLETE AND VERIFIED | `frontend/app/page.js`; `models.js` (`Shipment`); `tracenet-api.js` shipment API | Created shipment through Admin UI and verified Mongo record with `Hyderabad ? Kurnool ? Bengaluru`, unique shipment/tracking IDs; admin shipment edit and legal status transitions are exposed and negative transition was rejected. | — |
| RFID movement events stored operationally in MongoDB | COMPLETE AND VERIFIED | `tracenet-api.js` `/api/scans`; `models.js` (`TrackingEvent`); `scripts/traceability-ui-audit.cjs` | UI scan created 3 ordered MongoDB events; persisted status, checkpoint, tag, device, actor, and event data. | Physical RFID reader remains outside MVP. |
| SHA-256/keccak event hashes anchored to a Solidity EVM contract | COMPLETE AND VERIFIED | `tracenet-api.js` `eventHash`; `contracts/CustodyRegistry.sol`; `hardhat.config.js` | Recomputed `keccak256(UTF8(JSON.stringify(eventData)))`; compared to Mongo hash, emitted contract event, receipt log and on-chain stored hash. | Canonical JSON property-order/canonical serialization standard is not specified. |
| Verify off-chain records against on-chain proof and detect tampering | COMPLETE AND VERIFIED | `/api/blockchain/verify/:eventId`; `/api/blockchain/tamper-demo/:eventId`; Blockchain UI | Valid events returned `MATCH`; Admin UI tamper demo returned `MISMATCH`; revoked writer case returned `NOT_ANCHORED`. | Normal `MISMATCH` from independently altered persisted source data was not tested (demo alters an in-memory copy). |
| Modular monolith; append-only tracking history; safe public tracking | PARTIALLY IMPLEMENTED | `tracenet-api.js`; `models.js`; `frontend/app/verify/page.tsx` | No event deletion endpoint (DELETE returned 404 with unchanged count); anonymous tracking UI and limited response verified. | DB privileged writes can alter history; more application modules than isolated services but still one API process. |
| MVP sequence product ? shipment ? movement ? anchor ? verify ? track | COMPLETE AND VERIFIED | Admin UI, RFID Simulator, blockchain UI, public `/verify` | Executed actual browser journey through scan, failed-anchor recovery, confirmation, verify and public tracking. | UI audit used generated shipment `TRC-AUDIT-96251732`; seeded `TRC-100` was not walked through all 3 scans. |

## Slide 8 — Objectives

| PPT requirement | Status | Implementation location | Test performed and actual result | Remaining gaps |
|---|---|---|---|---|
| JWT authentication for Admin and Operator; public viewing without sign-in | COMPLETE AND VERIFIED | `/api/auth/login`, `auth`, `roles`; `frontend/app/page.js`; public API/page | Admin logged in via UI; Operator token used for role tests; public page loaded and tracked after clearing token. | No stored `PUBLIC_VIEWER` role; public viewer is anonymous as expected by customer requirement. |
| Admin/Operator separation | COMPLETE AND VERIFIED | `tracenet-api.js` role middleware and operator shipment scoping; UI audit script | Operator could scan assigned shipment and list assigned records; product/shipment creation and user management attempts returned 403; Admin Users and Devices pages rendered; operator did not see admin navigation/actions. | — |
| Register products and shipments with unique IDs and ordered multi-stop routes | COMPLETE AND VERIFIED | `models.js`; `/api/products`, `/api/shipments`; Admin pages | UI-created product and shipment persisted to Mongo; route order checked exactly. | Product delete and richer shipment assignment management are not implemented. |
| RFID/IoT simulator validates device, tag, route, status, and duplicate scans | PARTIALLY IMPLEMENTED | `/api/scans`; `frontend/app/page.js`; unique event index | Valid UI progression passed across all 3 stops; wrong order not used in this audit. Code checks device/tag/operator/next stop and unique shipment/checkpoint index. | Invalid device/tag, duplicate, and route rejection cases from PPT were not exercised. Device credential is a shared demo secret fallback, not per-device request credential on the UI. |
| Append-only event history | PARTIALLY IMPLEMENTED | `models.js` tracking-event schema; scan API | DELETE attempt returned 404 and Mongo event count stayed unchanged. | No event update/delete API is exposed; DB privileged writes can alter history. |
| Anchor event hash and record receipt details | COMPLETE AND VERIFIED | outbox worker in `tracenet-api.js`; transaction/event schemas | Three transactions had confirmed receipts, nonempty transaction hashes, matching block numbers and matching `ShipmentEventAnchored` logs. | — |
| Verification outcomes MATCH / MISMATCH / NOT_ANCHORED | COMPLETE AND VERIFIED | verify API and Blockchain UI | All 3 statuses exercised through valid event verification, UI tamper demo and denied-writer failure. | `PENDING` is transient; API returns `UNAVAILABLE` when chain is down rather than a distinct `PENDING` proof status. |
| Safe anonymous public shipment tracking | COMPLETE AND VERIFIED | `/api/public/track/:id`; `frontend/app/verify/page.tsx` | Browser track worked without bearer token; response allowlist asserted and RFID tag/operator assignment absence verified. | Public route shows event proof/hash but not a separate recomputation verification state per row. |
| Separate Admin and Operator dashboard experiences | PARTIALLY IMPLEMENTED | `frontend/app/page.js` | Role-aware visibility tested for Operator shipments/transactions scope. | Same dashboard shell and navigation is used for both roles; there is no distinct Operator dashboard layout. |

## Slide 9 — MVP scope and deferred work

| PPT requirement | Status | Implementation location | Test performed and actual result | Remaining gaps |
|---|---|---|---|---|
| JWT authentication and RBAC | COMPLETE AND VERIFIED | `tracenet-api.js`; UI login | Admin/Operator authorization behavior verified with real credentials and 403 checks. | Logout is client token clearing only; no token revocation/blacklist. |
| Product/shipment creation with 3+ stops | COMPLETE AND VERIFIED | Admin UI, `/api/products`, `/api/shipments`, models | UI created product and 3-stop shipment; Mongo persisted sequence. | Management CRUD beyond create/list is incomplete. |
| RFID simulator uses same API architecture as hardware events | PARTIALLY IMPLEMENTED | `frontend/app/page.js`; `/api/scans` | Simulator submits actual scan requests through backend; device and tag checks are implemented. | No separate unauthenticated/device-authenticated `/iot/events` endpoint for physical ESP32 integration was found. |
| Append-only events and derived shipment status | PARTIALLY IMPLEMENTED | scan handler and `Shipment`/`TrackingEvent` models | Scan sequence persisted and shipment reached `DELIVERED`; attempted deletion failed. | Mutable checkpoint/status aggregate and no database immutability controls. |
| TraceNet contract on local Hardhat; verification and public tracking | COMPLETE AND VERIFIED | `CustodyRegistry.sol`; deployment config; public page | Compiled artifact existed; live local chain served transactions; public browser test passed. | Contract name is `CustodyRegistry`, not `TraceNet.sol`. |
| Admin dashboard and audit log | COMPLETE AND VERIFIED | dashboard API/UI; `AuditLog`; `scripts/traceability-ui-audit.cjs` | Dashboard cards and five-or-more actual-data shipment status bars rendered; Mongo-derived counts and audit rows matched current state. | Additional analytics are future improvements. |
| Deferred physical RFID, GPS/maps/sensors/mobile/ERP, multi-tenant, testnet | COMPLETE AND VERIFIED (deferred scope) | simulator-only implementation | MVP simulator required no physical reader; no claims of hardware/testnet integration are made. | These are outside the MVP and remain future work. |

## Slide 10 — Architecture and technology

| PPT requirement | Status | Implementation location | Test performed and actual result | Remaining gaps |
|---|---|---|---|---|
| React + Vite + TypeScript frontend | PARTIALLY IMPLEMENTED | `frontend/package.json`; `frontend/app/` | Production build succeeds; browser exercised app. Frontend uses React/Next.js 15, mixed JS/TS, and no Vite. | Different framework and incomplete TypeScript migration; PPT explicitly allows a different framework if functionally sound. |
| SPA has no private keys and no authorization decisions | COMPLETE AND VERIFIED | `frontend/app/page.js`; `.env` separation | UI uses JWT and API calls; private backend signing key is server-only in `.env`; UI authorization is enforced again on API. | LocalStorage token storage is weaker than httpOnly secure cookie handling. |
| Express + TypeScript REST API, JWT/RBAC, Zod validation | PARTIALLY IMPLEMENTED | `tracenet-api.js`, CommonJS JavaScript; `package.json` | API health, auth and RBAC tested. | API is JavaScript, lacks TypeScript, Zod, centralized error middleware and rate limiting; validation is mostly inline. |
| Canonical event payload hashed with keccak256 | PARTIALLY IMPLEMENTED | `tracenet-api.js` `eventHash` | Hash recomputation matched all persisted test events and actual contract event proofs. | Uses `JSON.stringify` insertion order rather than a formal canonical JSON schema/serializer; actor is email rather than explicit operator ID. |
| Blockchain service with ethers, outbox worker and retry | COMPLETE AND VERIFIED | `processOutbox`, `recoverSubmitted`, `/api/blockchain/retry/:eventId` | Failure was induced by revoking writer; Mongo event persisted, state became FAILED/NOT_ANCHORED, then Admin retry confirmed; duplicate retry returned 409. | RPC outage/restart recovery was tested by regression. There is no exponential backoff for persistently unavailable RPC. |
| MongoDB Atlas models/indexes/validation | PARTIALLY IMPLEMENTED | `models.js`; `.env.example` | Actual MongoDB connection and data persistence verified; unique indexes created and schema validation used. | Local MongoDB was used, not Atlas; no session transactions around event + shipment status + outbox writes. |
| Solidity AccessControl writer role; store eventId ? hash only | PARTIALLY IMPLEMENTED | `contracts/CustodyRegistry.sol` | Contract blocks unauthorized writer and duplicate anchor; actual successful event transaction inspected. | Uses owner-controlled `authorizedAnchorer` mapping, not OpenZeppelin AccessControl. Chain event also emits shipment ID/time; storage maps event ID to hash. |
| REST API to backend and simulated RFID device event flow | PARTIALLY IMPLEMENTED | Express routes and UI | Simulated scans call authenticated REST endpoint and produce Mongo/on-chain events. | No separate device-to-cloud `/iot/events` API or network protocol integration. |
| Store Mongoose transaction/receipt status | COMPLETE AND VERIFIED | `TrackingEvent`, `BlockchainTransaction`, outbox worker | Confirmed tx hash, block number, and receipt status checked against RPC and event logs. | Mongo multi-document transactions are not used. |

## Slide 11 — Scan, anchoring, and recovery flow

| PPT requirement | Status | Implementation location | Test performed and actual result | Remaining gaps |
|---|---|---|---|---|
| Scan validates active device, tag, route, operator, and progression | COMPLETE AND VERIFIED | `/api/scans`; `scripts/reliability-regression.cjs` | Unknown tag 404; bad or unknown device 401; wrong stop, duplicate scan, CANCELLED/CREATED shipment scans 409; every invalid request preserved event count. Assigned operator and valid 3-stop progression passed in browser. | Device credential is shared for the local simulator. |
| Persist tracking event with canonical hash before anchoring | COMPLETE AND VERIFIED | `/api/scans`; `TrackingEvent` model | Scan record was present in Mongo after intentionally failing anchor submission. | Hash payload canonicalization remains informal. |
| Worker anchors events and confirms only after successful receipt | COMPLETE AND VERIFIED | outbox worker | Real receipts status=1, txHash/blockNumber persisted, and chain log/hash matched. | — |
| Update shipment status and timeline after scan | COMPLETE AND VERIFIED | scan handler; shipment detail/dashboard | Shipment advanced through the requested route and reached DELIVERED; public route reflected full history. | Timeline history is read from event collection but may lack actor/operator details in public output by design. |
| Recompute event hash and compare with chain | COMPLETE AND VERIFIED | `/api/blockchain/verify/:eventId` | API MATCH verified each canonical saved event against event hash and on-chain hash. | Does not independently rebuild a normalized canonical schema; directly hashes stored `eventData`. |
| Outbox states PENDING/SUBMITTED/CONFIRMED/FAILED; retry idempotency and backend restart | COMPLETE AND VERIFIED | `processOutbox`, `recoverSubmitted`, `/api/blockchain/retry/:eventId`; `scripts/reliability-regression.cjs` | RPC-disabled process persisted event and transaction as PENDING without tx hash/block/CONFIRMED; process stopped; restarted against live RPC; worker anchored once, stored receipt/hash/block, and verification returned MATCH. UI retry after a contract rejection also passed; duplicate retry was rejected. | Crash between RPC acceptance and Mongo tx-hash write was not fault-injected; worker checks eventId/hash on chain to avoid duplicate anchor. |
| Never claim confirmation during RPC failure | COMPLETE AND VERIFIED | worker and frontend message flow; `scripts/reliability-regression.cjs` | With RPC unavailable, event and outbox remained PENDING without hash, block or CONFIRMED state; restart with RPC restored produced a real receipt before confirmation. | — |

## Slide 12 — Demonstration flow

| PPT requirement | Status | Implementation location | Test performed and actual result | Remaining gaps |
|---|---|---|---|---|
| PRD-100 / TAG-100 / TRC-100 seed data and required route | COMPLETE AND VERIFIED (seed contents) | `tracenet-api.js` seed; `scripts/seed-demo.js` | Mongo seed inspected; product/tag/shipment and three route locations exist. | Audit workflow used unique test IDs instead of scanning seeded TRC-100. |
| Scan Hyderabad, Kurnool, Bengaluru through UI | COMPLETE AND VERIFIED | RFID Simulator UI and `/api/scans` | Three stops scanned through actual frontend; Mongo sequence and delivered status verified. | Used generated audit shipment with same required route. |
| Show tx hash and block number; verify MATCH | COMPLETE AND VERIFIED | Blockchain UI/API; Mongo tx model | Every event had confirmed receipt, tx hash, block number, log event ID/hash; API MATCH. | — |
| Alter payload and show MISMATCH | COMPLETE AND VERIFIED (tamper demo) | Admin tamper demo control/API | UI button produced MISMATCH from altered in-memory payload; stored event was unchanged. | No separate DB-copy alteration tamper test was performed. |
| Public tracking displays safe shipment details | COMPLETE AND VERIFIED | `/verify`; public tracking API whitelist | Browser rendered route, stops and proofs anonymously; assertions reject RFID and operator fields. | Public page does not expose an explicit MATCH badge per event (only anchor confirmation). |

## Slide 13 — Stack

| PPT requirement | Status | Implementation location | Test performed and actual result | Remaining gaps |
|---|---|---|---|---|
| React + Vite + TypeScript | PARTIALLY IMPLEMENTED | `frontend/package.json`, Next.js App Router | UI and production build work; runtime is Next.js/React, mixed JavaScript/TypeScript. | Vite is absent; do not change stack just for cosmetic similarity. |
| Express Node + TypeScript | PARTIALLY IMPLEMENTED | `tracenet-api.js` | Running Express API verified. | JavaScript, not TS. |
| MongoDB + Mongoose | COMPLETE AND VERIFIED | `models.js`, Mongo config | Connected live to MongoDB; CRUD/persistence and indexes exercised. | Tested local server rather than Atlas deployment. |
| Solidity + EVM + Hardhat | COMPLETE AND VERIFIED | `contracts/CustodyRegistry.sol`, `hardhat.config.js` | Local Hardhat EVM served real transactions and deployed contract address; local compiler configured. | Contract uses custom owner role rather than OpenZeppelin AccessControl. |
| RFID simulator | COMPLETE AND VERIFIED | UI simulator; API scan handler | Complete 3-stop UI flow passed. | Physical ESP32/RC522 remains deferred. |
| JWT, roles, device checks | COMPLETE AND VERIFIED | auth and scan middleware; `scripts/reliability-regression.cjs`; browser audit | Admin/Operator access, denied administrative routes, bad device credentials and inactive devices were tested; public route works anonymously. | Local reader secrets are development credentials, not production provisioning. |

## Additional PPT/build-brief requirements checked

| Requirement | Status | Location | Test/result | Gap |
|---|---|---|---|---|
| Product edit, filtering, shipment edit, operator management and status transition rules | PARTIALLY IMPLEMENTED | `frontend/app/page.js`; APIs | Product search/edit, shipment status/ETA edit, operator listing/creation, and device management exercised; illegal status transition rejected. | Delete flows and richer operator assignment management are not implemented. |
| Dashboard exact required statistics and charts | COMPLETE AND VERIFIED | `/api/dashboard`; overview UI; `scripts/traceability-ui-audit.cjs` | Mongo-derived products, shipments, active, in-transit, delivered, delayed, total events, confirmed, pending and failed counts were queried; product/shipment/event values matched independent collection counts. UI displayed statistic cards and actual-data status bars. | Additional analytics/filters and separate Operator layout are future improvements. |
| Full API surface, validation, error handling, rate limits | PARTIALLY IMPLEMENTED | `tracenet-api.js` | Core APIs for auth, products, shipments, scans, blockchain, devices, public tracking, and audit; negative scan errors and authorization failures tested. | Backend remains JavaScript; Zod, rate limiting and centralized error handling are absent. |
| No SQLite dependency or hidden substitute storage | COMPLETE AND VERIFIED | `package.json`, `package-lock.json`, source tree | `npm ls sqlite3 --all` returned empty; no sqlite module found in runtime tree. Mongo connection required at API startup, with no in-memory fallback. | — |
| Contract deployment and local compiler | COMPLETE AND VERIFIED | `hardhat.config.js`; deployment artifacts; `.env` | `npx hardhat compile` reported “Nothing to compile”; health endpoint reports blockchain=true and contract address; live chain transactions verified. | Local runtime env contains dev-only Hardhat private key. Do not reuse outside local Hardhat. |
| Frontend production build | COMPLETE AND VERIFIED | `frontend/` | `npm --prefix frontend run build` succeeded after fixing offline font fetch and existing ZXing/qrcode type/import errors. | Build outputs are local. |
| Backend TypeScript build | NOT IMPLEMENTED | `tracenet-api.js` | Source is JavaScript; no backend TS compiler configuration. | Would require backend TypeScript migration. |

## Test execution summary

- **Passed:** `npm run test:reliability` (invalid RFID/tag/device, unknown/inactive device, duplicate/wrong checkpoint, invalid route progression/status transition; no invalid event writes); RPC-down pending persistence; API process stop/restart; RPC restoration; exactly one mined contract anchor with status-1 receipt/hash/block and final MATCH; Admin product/shipment creation; Admin/Operator authorization and visibility; operator assigned shipment scan; Hyderabad ? Kurnool ? Bengaluru browser scans; Mongo event persistence; retry after on-chain writer rejection; `NOT_ANCHORED`; `MISMATCH`; append-only API behavior; dashboard Mongo counts/charts; audit UI; anonymous tracking; production build; offline Hardhat compile; backend syntax and startup.
- **Not run:** physical ESP32/RC522 hardware; full seeded `TRC-100` demo (browser used generated shipment `TRC-AUDIT-96251732` with the same route); DB-privileged mutation/immutability test; failure in the narrow interval after RPC accepts a transaction but before tx hash persistence; restart while RPC remains unavailable; every form/action and viewport size.
- **Environment note:** a first frontend build attempted Google Fonts and failed under restricted network; the application was changed to use local/system fonts. Next root was scoped to the frontend project to avoid reading parent directories. Hardhat config paths use workspace-local folders. No privileged writes were attempted.

## What remains to reach full PPT alignment

1. Keep Next/React or deliberately migrate later; current app is functional but not Vite + strict TypeScript.
2. Convert Express API to TypeScript and add Zod schemas, shared error middleware, and rate limits.
3. Add hardware-specific IoT ingest protocol and production-grade per-device credential provisioning.
4. Enforce event immutability at Mongo authorization/schema level and use a formally versioned canonical event serializer.
5. Add broader analytics and richer operator assignment controls.
6. Inject a crash at the RPC-accepted/hash-not-saved boundary and test DB-privileged mutation defenses.
7. Use MongoDB Atlas if deployment requires it; current verification used local MongoDB.

## Evidence identifiers

- End-to-end test output names audit shipment `TRC-AUDIT-96251732` (generated per test run; prior audit runs created other temporary shipments).
- Contract used during the run: `0x5FbDB2315678afecb367f032d93F642f64180aa3` on local Hardhat chain.
- Mongo health: `database=mongodb`; blockchain health: `blockchain=true`.
- Main reproducible UI/chain/database test: `scripts/traceability-ui-audit.cjs`. It expects running MongoDB, Hardhat, API, frontend, and Chrome DevTools at port 9223.



