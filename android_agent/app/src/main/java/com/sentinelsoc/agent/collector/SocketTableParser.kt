package com.sentinelsoc.agent.collector

import java.net.InetAddress

data class ParsedProcSocket(
    val protocol: String,
    val localAddress: String,
    val localPort: Int,
    val remoteAddress: String,
    val remotePort: Int,
    val state: String,
    val uid: Int
)

object SocketTableParser {
    private val tcpStates = mapOf(
        "01" to "Established",
        "02" to "SynSent",
        "03" to "SynRcvd",
        "04" to "FinWait1",
        "05" to "FinWait2",
        "06" to "TimeWait",
        "07" to "Closed",
        "08" to "CloseWait",
        "09" to "LastAck",
        "0A" to "Listen",
        "0B" to "Closing"
    )

    fun decodeLittleEndianIpv4Hex(hex: String): String {
        if (hex.length != 8) return hex
        val b0 = hex.substring(6, 8).toIntOrNull(16) ?: return hex
        val b1 = hex.substring(4, 6).toIntOrNull(16) ?: return hex
        val b2 = hex.substring(2, 4).toIntOrNull(16) ?: return hex
        val b3 = hex.substring(0, 2).toIntOrNull(16) ?: return hex
        return "$b0.$b1.$b2.$b3"
    }

    fun decodeIpv6Hex(hex: String): String {
        if (hex.length != 32) return hex
        return runCatching {
            val bytes = ByteArray(16)
            for (word in 0 until 4) {
                val offset = word * 8
                // Each 32-bit word in /proc/net/tcp6 is little-endian on ARM/x86 Linux
                bytes[word * 4 + 0] = hex.substring(offset + 6, offset + 8).toInt(16).toByte()
                bytes[word * 4 + 1] = hex.substring(offset + 4, offset + 6).toInt(16).toByte()
                bytes[word * 4 + 2] = hex.substring(offset + 2, offset + 4).toInt(16).toByte()
                bytes[word * 4 + 3] = hex.substring(offset + 0, offset + 2).toInt(16).toByte()
            }
            InetAddress.getByAddress(bytes).hostAddress ?: hex
        }.getOrDefault(hex)
    }

    fun parseProcNetLine(line: String, isIpv6: Boolean): ParsedProcSocket? {
        val parts = line.trim().split(Regex("\\s+"))
        if (parts.size < 8) return null
        val localParts = parts[1].split(":")
        val remoteParts = parts[2].split(":")
        if (localParts.size != 2 || remoteParts.size != 2) return null

        val stateCode = parts[3].uppercase()
        val stateName = tcpStates[stateCode] ?: "Unknown"
        if (stateName == "Listen") return null

        val localIp = if (isIpv6) decodeIpv6Hex(localParts[0]) else decodeLittleEndianIpv4Hex(localParts[0])
        val remoteIp = if (isIpv6) decodeIpv6Hex(remoteParts[0]) else decodeLittleEndianIpv4Hex(remoteParts[0])
        if (remoteIp == "0.0.0.0" || remoteIp == "::") return null

        val localPort = localParts[1].toIntOrNull(16) ?: return null
        val remotePort = remoteParts[1].toIntOrNull(16) ?: return null
        val uid = parts[7].toIntOrNull() ?: 0

        return ParsedProcSocket(
            protocol = if (isIpv6) "TCPv6" else "TCP",
            localAddress = localIp,
            localPort = localPort,
            remoteAddress = remoteIp,
            remotePort = remotePort,
            state = stateName,
            uid = uid
        )
    }
}
