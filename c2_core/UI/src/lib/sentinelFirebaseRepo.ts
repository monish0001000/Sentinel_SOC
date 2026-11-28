import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  limit,
  Unsubscribe,
} from "firebase/firestore";
import { db } from "./firebase";

export type EndpointComputedStatus =
  | "online"
  | "reconnecting"
  | "offline"
  | "never_connected"
  | "auth_failure"
  | "unhealthy";

export interface EndpointRecord {
  id: string;
  endpointId: string;
  hostname: string;
  osVersion: string;
  osBuild?: string;
  agentVersion: string;
  agentIntegrityHash?: string;
  lastSeenAt?: Date | null;
  uptimeSeconds?: number;
  computedStatus: EndpointComputedStatus;
  syncState?: string;
  pendingQueueCount?: number;
  firewallEnabled?: boolean;
  revoked?: boolean;
  latestMetrics?: {
    cpuPercent: number;
    memoryPercent: number;
    memoryUsedMb: number;
    memoryTotalMb: number;
    diskPercent: number;
    diskFreeGb: number;
    diskTotalGb: number;
    processCount: number;
    networkTxBytesPerSec: number;
    networkRxBytesPerSec: number;
  };
}

export interface EndpointAlertRecord {
  id: string;
  endpointId: string;
  ruleId: string;
  ruleVersion: string;
  severity: "low" | "medium" | "high" | "critical";
  eventTime: Date;
  reason: string;
  confidenceNotes?: string;
  enforced: boolean;
  status: string;
  evidence?: Record<string, string>;
}

export interface FirewallPolicyAck {
  id: string;
  policyId: string;
  endpointId: string;
  state: "received" | "applied" | "rejected" | "expired" | "failed";
  message: string;
  acknowledgedAt: Date;
}

export function deriveEndpointStatus(
  lastSeenAt: Date | null | undefined,
  healthState?: string
): EndpointComputedStatus {
  if (healthState === "auth_failure") return "auth_failure";
  if (healthState === "unhealthy") return "unhealthy";
  if (!lastSeenAt) return "never_connected";

  const ageSeconds = (Date.now() - lastSeenAt.getTime()) / 1000;
  if (ageSeconds <= 120) return "online";
  if (ageSeconds <= 300) return "reconnecting";
  return "offline";
}

async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const hashBuffer = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function generateRandomToken(byteLength = 32): string {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function createEndpointEnrollment(
  ownerUid: string,
  label = "Windows Endpoint"
): Promise<{ pairingToken: string; expiresAt: Date; ownerUid: string }> {
  if (!db) {
    throw new Error("Firebase Firestore is not configured.");
  }
  const pairingToken = generateRandomToken(24);
  const tokenHash = await sha256Hex(pairingToken);
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

  await setDoc(doc(db, "enrollments", tokenHash), {
    ownerUid,
    createdAt: serverTimestamp(),
    expiresAt: Timestamp.fromDate(expiresAt),
    used: false,
    claimedByAgentUid: null,
    claimedEndpointId: null,
    label: label.slice(0, 128),
  });

  return { pairingToken, expiresAt, ownerUid };
}

export function subscribeEndpoints(
  ownerUid: string,
  onUpdate: (endpoints: EndpointRecord[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  if (!db) {
    return () => {};
  }
  const q = collection(db, "users", ownerUid, "endpoints");
  return onSnapshot(
    q,
    (snapshot) => {
      const list: EndpointRecord[] = snapshot.docs.map((d) => {
        const data = d.data();
        const lastSeenAt = data.lastSeenAt?.toDate ? data.lastSeenAt.toDate() : null;
        return {
          id: d.id,
          endpointId: data.endpointId || d.id,
          hostname: data.hostname || "Unknown Host",
          osVersion: data.osVersion || "Windows",
          osBuild: data.osBuild,
          agentVersion: data.agentVersion || "1.0.0",
          agentIntegrityHash: data.agentIntegrityHash,
          lastSeenAt,
          uptimeSeconds: data.uptimeSeconds,
          computedStatus: deriveEndpointStatus(lastSeenAt, data.healthState),
          syncState: data.syncState || "unknown",
          pendingQueueCount: data.pendingQueueCount ?? 0,
          firewallEnabled: data.firewallEnabled,
          revoked: Boolean(data.revoked),
          latestMetrics: data.latestMetrics,
        };
      });
      onUpdate(list);
    },
    (err) => onError?.(err)
  );
}

export function subscribeEndpointAlerts(
  ownerUid: string,
  endpointId: string,
  onUpdate: (alerts: EndpointAlertRecord[]) => void
): Unsubscribe {
  if (!db) {
    return () => {};
  }
  const q = query(
    collection(db, "users", ownerUid, "endpoints", endpointId, "alerts"),
    orderBy("eventTime", "desc"),
    limit(50)
  );
  return onSnapshot(q, (snapshot) => {
    const alerts: EndpointAlertRecord[] = snapshot.docs.map((d) => {
      const data = d.data();
      return {
        id: d.id,
        endpointId: data.endpointId || endpointId,
        ruleId: data.ruleId || "UNKNOWN",
        ruleVersion: data.ruleVersion || "1.0.0",
        severity: data.severity || "medium",
        eventTime: data.eventTime?.toDate ? data.eventTime.toDate() : new Date(),
        reason: data.reason || "",
        confidenceNotes: data.confidenceNotes,
        enforced: Boolean(data.enforced),
        status: data.status || "open",
        evidence: data.evidence || {},
      };
    });
    onUpdate(alerts);
  });
}

export async function createSafeFirewallPolicy(params: {
  ownerUid: string;
  endpointId: string;
  action: "block_ip" | "unblock_ip" | "query_status";
  targetIp?: string;
  reason: string;
  ttlMinutes?: number;
}): Promise<string> {
  if (!db) {
    throw new Error("Firebase Firestore is not configured.");
  }
  const policyId = `pol_${Date.now()}_${generateRandomToken(4)}`;
  const expiresAt = new Date(Date.now() + (params.ttlMinutes ?? 60) * 60 * 1000);

  await setDoc(
    doc(db, "users", params.ownerUid, "endpoints", params.endpointId, "policies", policyId),
    {
      targetEndpointId: params.endpointId,
      action: params.action,
      targetIp: params.targetIp || null,
      direction: "Outbound",
      reason: params.reason.slice(0, 500),
      createdBy: params.ownerUid,
      approved: true,
      version: 1,
      createdAt: serverTimestamp(),
      expiresAt: Timestamp.fromDate(expiresAt),
    }
  );

  await setDoc(doc(db, "users", params.ownerUid, "audit", `aud_${policyId}`), {
    actorUid: params.ownerUid,
    targetEndpointId: params.endpointId,
    policyId,
    action: params.action,
    targetIp: params.targetIp || null,
    reason: params.reason.slice(0, 500),
    createdAt: serverTimestamp(),
  });

  return policyId;
}

export function subscribePolicyAcks(
  ownerUid: string,
  endpointId: string,
  onUpdate: (acks: FirewallPolicyAck[]) => void
): Unsubscribe {
  if (!db) {
    return () => {};
  }
  const q = query(
    collection(db, "users", ownerUid, "endpoints", endpointId, "policyAcks"),
    orderBy("acknowledgedAt", "desc"),
    limit(20)
  );
  return onSnapshot(q, (snapshot) => {
    const acks: FirewallPolicyAck[] = snapshot.docs.map((d) => {
      const data = d.data();
      return {
        id: d.id,
        policyId: data.policyId,
        endpointId: data.endpointId,
        state: data.state,
        message: data.message || "",
        acknowledgedAt: data.acknowledgedAt?.toDate ? data.acknowledgedAt.toDate() : new Date(),
      };
    });
    onUpdate(acks);
  });
}
