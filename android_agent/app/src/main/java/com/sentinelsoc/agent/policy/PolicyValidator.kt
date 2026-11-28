package com.sentinelsoc.agent.policy

import com.sentinelsoc.agent.model.FirewallPolicy
import java.time.Instant

data class PolicyValidationResult(
    val valid: Boolean,
    val state: String,
    val reason: String
)

object PolicyValidator {
    private val allowedActions = setOf(
        "sync_now",
        "unenroll_agent",
        "query_status",
        "block_ip",
        "unblock_ip",
        "enable_rule",
        "disable_rule"
    )

    fun validate(
        policy: FirewallPolicy,
        currentEndpointId: String,
        now: Instant = Instant.now()
    ): PolicyValidationResult {
        if (!policy.approved) {
            return PolicyValidationResult(false, "rejected", "Policy is not approved.")
        }
        if (policy.targetEndpointId != currentEndpointId) {
            return PolicyValidationResult(false, "rejected", "Policy targetEndpointId does not match this endpoint.")
        }
        val expires = runCatching { Instant.parse(policy.expiresAtIso) }.getOrNull()
        if (expires == null || !expires.isAfter(now)) {
            return PolicyValidationResult(false, "expired", "Policy has expired.")
        }
        if (policy.action !in allowedActions) {
            return PolicyValidationResult(false, "rejected", "Action '${policy.action}' is not allowlisted.")
        }
        if (policy.action in setOf("block_ip", "unblock_ip", "enable_rule", "disable_rule")) {
            return PolicyValidationResult(
                valid = false,
                state = "rejected",
                reason = "Non-root Android OS sandbox does not allow arbitrary kernel netfilter/iptables modification without VPN/MDM."
            )
        }
        return PolicyValidationResult(true, "applied", "Valid")
    }
}
