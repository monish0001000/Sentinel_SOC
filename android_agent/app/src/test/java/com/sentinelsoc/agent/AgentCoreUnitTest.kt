package com.sentinelsoc.agent

import com.sentinelsoc.agent.collector.SocketTableParser
import com.sentinelsoc.agent.model.EnrollmentBundleParser
import com.sentinelsoc.agent.model.FirewallPolicy
import com.sentinelsoc.agent.policy.PolicyValidator
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.Instant

class AgentCoreUnitTest {

    @Test
    fun parseBundle_validatesRequiredFieldsAndExpiry() {
        val future = Instant.now().plusSeconds(3600).toString()
        val json = """
            {
              "FirebaseProjectId": "monix-soc",
              "FirebaseWebApiKey": "test-api-key",
              "OwnerUid": "owner-123",
              "EnrollmentToken": "abcdef1234567890abcdef1234567890",
              "ExpiresAt": "$future"
            }
        """.trimIndent()
        val parsed = EnrollmentBundleParser.parseAndValidate(json)
        assertTrue(parsed.isSuccess)
        assertEquals("monix-soc", parsed.getOrThrow().firebaseProjectId)

        val expired = EnrollmentBundleParser.parseAndValidate(
            json.replace(future, Instant.now().minusSeconds(60).toString())
        )
        assertTrue(expired.isFailure)
    }

    @Test
    fun socketParser_decodesProcNetTcpIpv4AndIgnoresListen() {
        val line = "   0: 0A00020F:C350 327100CB:01BB 01 00000000:00000000 00:00000000 00000000 10142 0 12345"
        val sock = SocketTableParser.parseProcNetLine(line, isIpv6 = false)
        assertNotNull(sock)
        assertEquals("15.2.0.10", sock!!.localAddress)
        assertEquals(50000, sock.localPort)
        assertEquals("203.0.113.50", sock.remoteAddress)
        assertEquals(443, sock.remotePort)
        assertEquals("Established", sock.state)
        assertEquals(10142, sock.uid)

        val listenLine = "   1: 00000000:01BB 00000000:0000 0A 00000000:00000000 00:00000000 00000000 1000 0 99"
        assertNull(SocketTableParser.parseProcNetLine(listenLine, isIpv6 = false))
    }

    @Test
    fun policyValidator_handlesControlAndFirewallBoundaries() {
        val future = Instant.now().plusSeconds(600).toString()
        val sync = FirewallPolicy("p1", "ep1", "sync_now", null, "Outbound", "Sync", "owner", true, future)
        assertTrue(PolicyValidator.validate(sync, "ep1").valid)

        val unenroll = FirewallPolicy("p2", "ep1", "unenroll_agent", null, "Outbound", "Remove", "owner", true, future)
        assertTrue(PolicyValidator.validate(unenroll, "ep1").valid)

        val blockIp = FirewallPolicy("p3", "ep1", "block_ip", "203.0.113.50", "Outbound", "Block", "owner", true, future)
        val blockRes = PolicyValidator.validate(blockIp, "ep1")
        assertFalse(blockRes.valid)
        assertEquals("rejected", blockRes.state)

        val expired = sync.copy(expiresAtIso = Instant.now().minusSeconds(10).toString())
        assertEquals("expired", PolicyValidator.validate(expired, "ep1").state)
    }
}
