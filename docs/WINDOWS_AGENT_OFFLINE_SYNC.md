# Sentinel SOC — Offline Storage & Automatic Reconnection

## 1. Durable Local Queue (`queue.db`)

All unsynchronized alerts, policy acknowledgements, and historical telemetry samples are persisted in a **SQLite WAL-mode** database at `C:\ProgramData\SentinelSOC\queue.db`.

- **Survives Restarts & Reboots:** Committed SQLite WAL transactions persist across unexpected service crashes and Windows reboots.
- **Priority Ordering:**
  1. Current Heartbeat (sent directly when online)
  2. Security Alerts (`Priority = 2`)
  3. Policy Acknowledgements (`Priority = 3`)
  4. Historical Telemetry Samples (`Priority = 4`)
- **Idempotency Keys:** Every queued item has a unique `idempotency_key` (`UNIQUE` index locally, used as Firestore `documentId` remotely). Duplicate local enqueues are ignored, and Firestore `409 ALREADY_EXISTS` responses are treated as idempotent success—preventing duplicate cloud records on retry.

## 2. Bounded Storage & Corruption Recovery

- **Queue Limits:** Configurable `MaxQueueItems` (default `5,000`) and `MaxQueueSizeBytes` (default `50 MB`). When limits are reached, oldest low-priority `TelemetrySample` items are evicted first so high-priority `Alert` records are preserved.
- **Disk-Space Protection:** Checks `DriveInfo.AvailableFreeSpace >= MinFreeDiskBytes` (default `256 MB`) before queuing low-priority samples.
- **Corruption Recovery:** On startup (and on `SqliteException`), runs `PRAGMA integrity_check;`. If corruption is detected, the corrupt file is moved to `queue.db.corrupt.<timestamp>` and a clean schema is recreated automatically so the agent never crash-loops.

## 3. Reconnection & Backoff

- **Exponential Backoff + Jitter:** `BackoffPolicy` starts at `5s`, doubles on consecutive failures up to `10 minutes`, and applies randomized jitter (`±25%`) to avoid thundering-herd reconnection spikes.
- **Request Timeouts:** All Firebase HTTP calls enforce a `15s` timeout.
- **Automatic Token Refresh:** When connectivity returns, `FirebaseClient.EnsureValidIdTokenAsync` exchanges the DPAPI-protected `refreshToken` for a fresh `idToken` before draining the queue.
- **Safe Cleanup:** Items are deleted from `telemetry_queue` only after Firestore confirms receipt (`200 OK` or `409 ALREADY_EXISTS`).
