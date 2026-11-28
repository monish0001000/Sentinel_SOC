# Sentinel SOC — Firebase Web EDR & Remote Firewall MVP

**Status:** Architecture proposal / implementation baseline  
**Branch:** `feature/firebase-web-edr-mvp`  
**Base:** `repair/sentinel-core-foundation`  
**Cost constraint:** Firebase Spark plan only. No billing account, no paid Cloud Functions, no Cloud Run, no mandatory Docker.

## 1. Product goal

Transform Sentinel SOC from a Docker-dependent local SOC stack into a Firebase-hosted web console with a small Windows endpoint agent.

The first release must prove one complete, honest workflow:

1. A user signs in to the Sentinel web dashboard.
2. The user creates a one-time endpoint enrollment.
3. A Windows agent enrolls and appears in the endpoint inventory.
4. The agent reports real host telemetry and heartbeats.
5. The agent evaluates a small set of local detection rules and uploads evidence-backed alerts.
6. An administrator creates a narrowly scoped firewall policy.
7. The agent fetches the policy, validates it, asks for/uses the configured approval mode, and applies a Sentinel-owned Windows Firewall rule.
8. The dashboard shows policy state and the agent reports the actual result.

No synthetic events, fake charts, simulated enforcement, or unverified protection claims.

## 2. Firebase-only Spark feasibility

### Allowed foundation

- **Firebase Hosting:** serve the built React/Vite single-page application.
- **Firebase Authentication:** email/password sign-in for dashboard users; anonymous authentication may be evaluated for endpoint identities.
- **Cloud Firestore:** endpoint registry, latest telemetry, alerts, desired firewall policies, command acknowledgements, and audit records.
- **Firebase Security Rules:** enforce user/tenant ownership, agent identity boundaries, allowed fields, and write permissions.
- **Firebase Local Emulator Suite:** local Auth/Firestore/Rules testing without Docker.

### Hard platform boundary

On the Spark plan, Cloud Functions and paid Google Cloud services such as Cloud Run are not available. Linking a Cloud Billing account upgrades the project to Blaze. Therefore this MVP will not depend on a Firebase server function, Cloud Run, a long-running FastAPI service, or a hosted WebSocket server.

The browser dashboard and Windows agent communicate through authenticated Firebase client/REST APIs and Firestore listeners/polling. Firestore is the shared state and command mailbox; it is not a general-purpose backend.

### Consequence

Trusted central server-side detection, arbitrary backend jobs, and high-volume streaming are not part of the Spark-only MVP. Initial detections run locally in the endpoint agent; the dashboard displays uploaded evidence. This is a deliberate boundary, not a claim that Firestore is a SIEM processing engine.

If future requirements demand server-side correlation or high-volume ingestion, stop and present a separate cost/architecture decision. Do not silently enable billing.

## 3. Proposed architecture

```text
                    Firebase Hosting (Spark)
                 React + TypeScript SOC Console
                              |
                    Firebase Authentication
                              |
                       Cloud Firestore
                 /            |             \
          Endpoints        Alerts       Desired Policies
              ^              ^               |
              |              |               v
              +-------- Windows Agent <-------+
                       HTTPS / Firestore REST
                       outbound-only traffic
                              |
                 Windows 10/11 endpoint
          telemetry + local detections + Firewall
```

### Web console

Keep the existing React/Vite/ShadCN dashboard as the starting UI. Replace local API/WebSocket dependencies page by page with a typed Firebase data layer. Do not rewrite the entire interface before the data model and rules are proven.

### Endpoint agent

Build a small Python agent and package it as a Windows executable using a Windows CI runner. The end user should not need Python, Docker, Redis, or a local database installed.

Agent responsibilities:
- Generate and persist a unique endpoint identity.
- Enroll using a short-lived, one-time pairing flow.
- Authenticate without embedding a shared admin/service-account secret in the executable.
- Send heartbeat and latest telemetry on a conservative interval.
- Collect only necessary metadata: CPU, memory, disk, uptime, process count, and optionally process metadata/network connection metadata after privacy review.
- Run deterministic local detection rules and upload evidence with each alert.
- Read only policies addressed to that endpoint.
- Validate policy schema, expiry, scope, and policy version before applying.
- Acknowledge received/applied/rejected/failed states.
- Use exponential backoff and bounded queues while offline.

### Firebase data model (initial)

- `users/{uid}`: user profile and account-level preferences.
- `users/{uid}/endpoints/{endpointId}`: endpoint metadata, owner, OS, agent version, enrollment state, lastSeen, online state, latest metrics.
- `users/{uid}/endpoints/{endpointId}/telemetry/{sampleId}`: optional low-frequency historical samples; not every raw event.
- `users/{uid}/endpoints/{endpointId}/alerts/{alertId}`: evidence-backed detections, severity, rule ID/version, timestamp, status.
- `users/{uid}/endpoints/{endpointId}/policies/{policyId}`: desired firewall policy and approval metadata.
- `users/{uid}/endpoints/{endpointId}/policyAcks/{ackId}`: actual agent acknowledgement and OS result.
- `users/{uid}/audit/{auditId}`: user actions and policy lifecycle events.

The final path structure and cross-document Security Rules must be tested in the Firebase Emulator before real endpoints are allowed to write.

## 4. Enrollment and identity

Preferred flow:
1. Signed-in user requests an enrollment from the dashboard.
2. Dashboard creates a high-entropy, one-time pairing record with a short expiry and a strict state transition.
3. Agent receives the pairing value from the user, obtains its own Firebase identity, and attempts a single-use claim.
4. Firestore Rules verify ownership, expiry, endpoint binding, and the atomic claim transition.
5. The pairing value is consumed and cannot be reused.
6. The agent stores only its own refresh credential/identity material using Windows DPAPI where practical.

Important: there is no trusted custom-token minting service on Spark-only Firebase. The exact anonymous-auth/pairing transaction and Firestore Rules must be proven in the Emulator first. If Rules cannot enforce the intended one-time claim safely, do not ship a weaker public-write workaround; use a manually provisioned agent identity for the first private demo or revisit the backend constraint with explicit approval.

Never embed a Firebase Admin service-account JSON, private key, dashboard user password, or shared fleet-wide secret in the EXE or frontend bundle.

## 5. MVP feature scope

### A. Endpoint inventory and telemetry

MVP fields:
- endpoint ID, hostname, OS version, agent version
- online/offline derived from last heartbeat
- CPU, memory, disk usage, uptime, process count
- last successful check-in and agent health/error state

Initial cadence:
- heartbeat/latest metrics: approximately every 60 seconds
- historical sample: approximately every 5 minutes, subject to measured Firestore usage
- alerts: write only when a rule actually matches
- no per-packet or per-process continuous Firestore writes

The Spark Firestore free quota is finite. Design around the current published quota (including 20,000 writes/day and 50,000 reads/day on the Spark plan), monitor usage, and avoid one document write per metric or network connection.

### B. Basic EDR detections

Start with a small, deterministic, explainable rule set, for example:
- repeated process execution from a user-writable temporary directory (metadata-only heuristic; not automatically malicious)
- suspicious parent/child process relationship from an explicitly documented allow/deny rule
- newly observed executable hash in a monitored test directory
- repeated failed local authentication events only after Windows Event Log collection is implemented and tested

Each alert must include:
- rule ID and rule version
- endpoint ID
- event time
- relevant process/file/event metadata
- reason the rule matched
- confidence/limitations
- whether the action was only detected or actually enforced

Do not call a heuristic a confirmed malware detection. No ML claims in MVP.

### C. Remote firewall (safe policy model)

The dashboard creates a desired policy; the endpoint agent is the enforcement point.

MVP-supported actions:
- add a Sentinel-owned outbound block rule for a validated public IPv4/IPv6 address
- remove only the matching Sentinel-owned rule
- query/report whether that exact rule exists

Safety requirements:
- explicit admin permission and visible confirmation before policy creation
- allowlist policy action types; never accept arbitrary shell commands
- validate IP addresses using a standard IP parser
- reject loopback, link-local, multicast, broadcast, private/LAN ranges by default unless the user explicitly configures a lab exception
- policy has creator, reason, target endpoint, createdAt, expiresAt, version, and approval state
- no blanket inbound/outbound block, no network isolation, no firewall reset, no broad port shutdown in MVP
- preserve all pre-existing Windows Firewall rules
- use Windows Firewall PowerShell COM/NetSecurity APIs or a carefully tested native interface; never construct shell commands from untrusted strings
- agent reports actual OS success/failure; dashboard must not show “blocked” before acknowledgement

Remote firewall is not a cloud firewall. It is a restricted management plane for endpoint-local Windows Firewall rules.

### D. Audit and observability

Record who created/approved/revoked a policy, what endpoint it targeted, and the agent's acknowledgement. Show agent offline, policy pending, applied, rejected, expired, and failed as distinct states.

## 6. Security baseline

- Firestore Security Rules deny by default.
- Users can read/write only their own tenant data.
- Endpoint identity can write only its own telemetry and alert documents.
- Agent identity cannot create users, change ownership, create admin users, or change policy documents.
- Dashboard admin actions require an authenticated admin role and explicit confirmation.
- Validate document schema, types, maximum sizes, timestamps, and allowed enum values in Security Rules and agent code.
- No secrets in Git, Vite environment variables, public config, or logs.
- Use HTTPS only; outbound-only endpoint connections.
- Rate-limit in the agent and keep telemetry payloads small.
- Store endpoint credentials with Windows DPAPI; rotate/revoke on endpoint removal.
- Maintain an append-only-style audit trail within the limits of client-side Firestore security (do not claim cryptographic immutability).
- Add App Check only where supported by the selected client; do not treat App Check as agent authentication.

## 7. Build phases and acceptance gates

### Phase 0 — Repository and Firebase foundation
- Preserve `main` and the existing repair branch.
- Create this feature branch for the Firebase migration.
- Inspect current UI routes, API calls, mock data, and endpoint protocol.
- Create/verify Firebase project remains on Spark.
- Add Firebase web SDK configuration through local environment variables; commit only an example file.
- Set up Hosting, Auth, Firestore, indexes, and strict Rules.
- Run Auth/Firestore/Rules tests in the Emulator.

**Gate:** dashboard can sign in, create/read only its own test records, and a second test user cannot read them.

### Phase 1 — Real telemetry vertical slice
- Build a typed Firebase repository layer in the dashboard.
- Implement agent enrollment prototype and authenticated telemetry upload.
- Show one real Windows endpoint and last-seen state.
- Add offline buffering and reconnect behaviour.
- Remove all fake telemetry from pages connected to this slice.

**Gate:** telemetry is captured from a real Windows host, stored once, visible in the dashboard, and rejected when sent by an unauthorised identity.

### Phase 2 — Basic EDR
- Add local deterministic rules.
- Upload evidence-backed alerts.
- Add alert list/detail, severity, acknowledgement, and audit history.

**Gate:** each test rule has positive and negative test cases; no fabricated alert records; rule evidence is visible.

### Phase 3 — Remote firewall
- Implement desired-policy document and agent polling.
- Add safe IP block/unblock only for Sentinel-owned rules.
- Require explicit approval and expiry.
- Report applied/rejected/failed state from the endpoint.

**Gate:** test only on a dedicated lab endpoint; verify existing Windows Firewall rules are unchanged; verify rollback/removal; test invalid, expired, duplicate, and replayed policies.

### Phase 4 — Windows EXE and Firebase Hosting release
- Package the agent on `windows-latest` CI.
- Sign the binary only if a legitimate signing certificate is available; otherwise clearly mark it unsigned.
- Publish dashboard to Firebase Hosting Spark.
- Provide a clear install/enroll/uninstall guide.
- Verify clean install, upgrade, revoke, uninstall, offline recovery, and credential deletion.

**Gate:** a fresh Windows 10/11 machine can enroll without Docker or Python installed; dashboard and agent work within Spark quotas.

## 8. Explicitly out of scope for MVP

- kernel driver / kernel-level EDR
- full packet capture, DPI, or TLS interception
- automatic malware quarantine/deletion
- arbitrary remote PowerShell, CMD, or shell execution
- one-click whole-host isolation
- central server-side ML or AI inference on Spark
- multi-tenant enterprise RBAC beyond a minimal owner/admin model
- guaranteed 24/7 uptime or unlimited free scale

## 9. Current codebase migration notes

The existing repair branch is a transitional Docker/WebSocket application, not a Firebase-ready backend. The current agent speaks a local unauthenticated WebSocket protocol and must be redesigned for authenticated Firebase communication.

The existing `c2_core/agent/capabilities.py` contains dangerous isolation behaviour, including `netsh advfirewall reset` and shell-based command execution. **Do not reuse this implementation for remote firewall.** Build a new allowlisted policy executor that touches only Sentinel-owned rules and is covered by Windows integration tests.

The current FastAPI API uses local username/password/JWT auth and localhost CORS. Do not expose it publicly or copy its auth model into the Firebase client. Replace the UI data-access layer incrementally.

## 10. Definition of done

The MVP is complete only when all of the following are demonstrated and recorded:
- Firebase project stays on Spark with no billing account linked.
- Dashboard is hosted on Firebase Hosting.
- Auth and Firestore Security Rules pass emulator tests, including cross-user denial.
- At least one real Windows endpoint enrolls and reports genuine telemetry.
- Agent reconnects after network loss and does not flood Firestore.
- EDR alerts are generated only from real test events and include evidence.
- Remote firewall policies require approval, are scoped, expire, and modify only Sentinel-owned rules.
- Dashboard reports the agent's actual enforcement result.
- No fake data, mock enforcement, shared secret in the EXE, or arbitrary remote command path remains in the MVP.
- Windows packaging and clean-machine installation are tested.

**Quality rule:** no phase is marked complete based only on code being committed. Record the exact test, environment, result, and known limitation for every gate.
