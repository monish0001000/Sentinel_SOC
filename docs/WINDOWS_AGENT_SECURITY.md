# Sentinel SOC — Windows Agent Security Model

## 1. Zero Embedded Secrets

- **No Firebase Admin SDK / Service Account JSON:** Never embedded in the EXE or web UI.
- **No Shared Fleet Secret:** Each endpoint obtains its own unique **Firebase Anonymous Auth** UID (`agentUid`) and refresh token.
- **No Public API Key as Auth:** The Firebase Web API Key only identifies the project; all Firestore Security Rules require `request.auth != null` and bind writes to `endpointDoc.data.agentUid == request.auth.uid`.

## 2. Single-Use Enrollment & Ownership Binding

1. The authenticated dashboard operator (`ownerUid`) generates a 24-byte random `pairingToken` and writes `enrollments/{SHA256(pairingToken)}` with a 15-minute expiry and `used: false`.
2. The Windows agent signs in anonymously to obtain its own `agentUid`.
3. The agent atomically updates `enrollments/{tokenHash}` (`used: true`, `claimedByAgentUid: agentUid`, `claimedEndpointId: endpointId`). Firestore Rules enforce that `used` was `false` and `request.time < expiresAt`.
4. The agent creates `users/{ownerUid}/endpoints/{endpointId}`. Firestore Rules verify the corresponding `enrollments/{tokenHash}` document exists, is `used == true`, and matches `ownerUid`, `claimedByAgentUid`, and `claimedEndpointId`.
5. Once enrolled, the agent scrubs `EnrollmentToken` from `config.json` and stores its `AgentIdentity` (`refreshToken`, `agentUid`, `endpointId`, `ownerUid`) encrypted with **Windows DPAPI (`DataProtectionScope.LocalMachine`)** in `C:\ProgramData\SentinelSOC\identity.dpapi`.

## 3. Firestore Security Rules Enforcement

- **Default Deny:** All paths deny read/write by default.
- **Cross-Endpoint Isolation:** Endpoint A (`agentUid_A`) cannot read or write Endpoint B's documents, telemetry, alerts, or policies.
- **Agent Write Restrictions:** Agents can only update heartbeat/metric fields on their own endpoint doc and create (`create`-only, no `update`/`delete`) `telemetry`, `alerts`, and `policyAcks` documents.
- **Policy Protection:** Only the human `ownerUid` can create/update `policies` or `audit` records.

## 4. Safe Remote Firewall Control (Allowlisted)

Remote firewall control is **disabled by default** (`EnableRemoteFirewallControl: false`). When enabled:
- **No Shell Execution:** Never invokes `cmd.exe`, `powershell.exe`, or arbitrary executables. Uses `netsh.exe` directly via `ProcessStartInfo.ArgumentList` (no shell interpolation).
- **Allowlisted Actions Only:** `block_ip`, `unblock_ip`, `enable_rule`, `disable_rule`, `query_status`.
- **Strict IP Validation:** Rejects `0.0.0.0`, `::`, loopback, link-local, multicast, broadcast, and RFC1918 private ranges (unless `AllowLabPrivateIpExceptions` is explicitly enabled).
- **Scoped Ownership:** Only creates/modifies/deletes rules prefixed with `SentinelSOC_Managed_`. Pre-existing Windows Firewall rules are never modified or reset.
- **Expiration & Audit:** Expired or unapproved policies are rejected and logged via `policyAcks`.

## 5. Transport & Local Hardening

- **TLS:** Enforces TLS 1.2 / TLS 1.3 with system certificate validation. No certificate-bypass callbacks exist.
- **Directory ACLs:** `C:\ProgramData\SentinelSOC` is restricted to `NT AUTHORITY\SYSTEM`, `BUILTIN\Administrators`, and `NT AUTHORITY\LOCAL SERVICE`.
- **No Stealth / Tampering:** Agent never disables Windows Defender, SmartScreen, Firewall, or UAC.
