package com.sentinelsoc.agent.collector

import android.app.ActivityManager
import android.app.KeyguardManager
import android.content.Context
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.net.TrafficStats
import android.os.Build
import android.os.Environment
import android.os.StatFs
import android.os.SystemClock
import android.provider.Settings
import com.sentinelsoc.agent.model.NetworkConnectionSummary
import com.sentinelsoc.agent.model.SecurityAlert
import com.sentinelsoc.agent.model.SystemTelemetrySnapshot
import java.io.File
import java.net.InetAddress
import java.time.Instant
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap
import kotlin.math.roundToInt

class AndroidTelemetryCollector(private val context: Context) {

    private var prevCpuTotal: Long = 0L
    private var prevCpuIdle: Long = 0L
    private var prevTxBytes: Long = -1L
    private var prevRxBytes: Long = -1L
    private var prevNetSampleMs: Long = 0L

    private val dnsCache = ConcurrentHashMap<String, String>()
    private val agentVersion: String = runCatching {
        context.packageManager.getPackageInfo(context.packageName, 0).versionName ?: "1.0.3"
    }.getOrDefault("1.0.3")

    fun collect(endpointId: String, includeConnections: Boolean = true): SystemTelemetrySnapshot {
        val now = Instant.now()

        val (memPct, memUsedMb, memTotalMb) = readMemoryInfo()
        val (diskPct, diskFreeGb, diskTotalGb) = readStorageInfo()
        val cpuPct = readRealCpuPercent()
        val (txRate, rxRate) = readNetworkRates()
        val vpnActive = isVpnActive()
        val connections = if (includeConnections) collectTcpConnections() else emptyList()

        val manufacturer = Build.MANUFACTURER.replaceFirstChar { it.uppercase() }
        val model = Build.MODEL
        val hostname = if (model.startsWith(manufacturer, ignoreCase = true)) model else "$manufacturer $model"

        return SystemTelemetrySnapshot(
            idempotencyKey = "tel_${now.epochSecond}_${UUID.randomUUID().toString().take(8)}",
            endpointId = endpointId,
            capturedAtIso = now.toString(),
            hostname = hostname.take(200),
            osVersion = "Android ${Build.VERSION.RELEASE} (API ${Build.VERSION.SDK_INT})",
            osBuild = Build.DISPLAY ?: Build.ID,
            agentVersion = agentVersion,
            agentIntegrityHash = computeApkIntegrityDigest(),
            uptimeSeconds = SystemClock.elapsedRealtime() / 1000L,
            cpuPercent = cpuPct,
            memoryPercent = memPct,
            memoryUsedMb = memUsedMb,
            memoryTotalMb = memTotalMb,
            diskPercent = diskPct,
            diskFreeGb = diskFreeGb,
            diskTotalGb = diskTotalGb,
            processCount = countVisibleProcesses(),
            firewallEnabled = vpnActive,
            activeConnections = connections,
            networkTxBytesPerSec = txRate,
            networkRxBytesPerSec = rxRate
        )
    }

    fun checkSecurityPosture(endpointId: String): List<SecurityAlert> {
        val alerts = mutableListOf<SecurityAlert>()
        val now = Instant.now()

        val adbEnabled = runCatching {
            Settings.Global.getInt(context.contentResolver, Settings.Global.ADB_ENABLED, 0) == 1
        }.getOrDefault(false)

        if (adbEnabled) {
            alerts.add(
                SecurityAlert(
                    idempotencyKey = "android_adb_${now.epochSecond / 3600}",
                    endpointId = endpointId,
                    ruleId = "ANDROID_ADB_ENABLED",
                    ruleVersion = "1.0.0",
                    severity = "medium",
                    eventTimeIso = now.toString(),
                    reason = "USB Debugging (ADB) is enabled on this Android device.",
                    confidenceNotes = "Observed directly from Android Settings.Global.ADB_ENABLED = 1.",
                    evidence = mapOf("adbEnabled" to "1", "sdkInt" to Build.VERSION.SDK_INT.toString())
                )
            )
        }

        val kg = context.getSystemService(Context.KEYGUARD_SERVICE) as? KeyguardManager
        if (kg != null && !kg.isDeviceSecure) {
            alerts.add(
                SecurityAlert(
                    idempotencyKey = "android_unsecured_lock_${now.epochSecond / 3600}",
                    endpointId = endpointId,
                    ruleId = "ANDROID_NO_DEVICE_LOCK",
                    ruleVersion = "1.0.0",
                    severity = "high",
                    eventTimeIso = now.toString(),
                    reason = "Device lock screen PIN, pattern, or password is not configured.",
                    confidenceNotes = "Observed from Android KeyguardManager.isDeviceSecure = false.",
                    evidence = mapOf("deviceSecure" to "false")
                )
            )
        }

        return alerts
    }

    fun getPostureSummary(): String {
        val kg = context.getSystemService(Context.KEYGUARD_SERVICE) as? KeyguardManager
        val secureLock = kg?.isDeviceSecure ?: false
        val adbEnabled = runCatching {
            Settings.Global.getInt(context.contentResolver, Settings.Global.ADB_ENABLED, 0) == 1
        }.getOrDefault(false)
        val vpn = isVpnActive()
        return "Android ${Build.VERSION.RELEASE} posture: LockScreenSecure=$secureLock, AdbDebugging=$adbEnabled, VpnTransport=$vpn"
    }

    private fun readMemoryInfo(): Triple<Double, Long, Long> {
        val am = context.getSystemService(Context.ACTIVITY_SERVICE) as? ActivityManager
            ?: return Triple(0.0, 0L, 0L)
        val mi = ActivityManager.MemoryInfo()
        am.getMemoryInfo(mi)
        val totalMb = mi.totalMem / (1024L * 1024L)
        val availMb = mi.availMem / (1024L * 1024L)
        val usedMb = (totalMb - availMb).coerceAtLeast(0L)
        val pct = if (totalMb > 0) ((usedMb.toDouble() / totalMb.toDouble()) * 1000.0).roundToInt() / 10.0 else 0.0
        return Triple(pct, usedMb, totalMb)
    }

    private fun readStorageInfo(): Triple<Double, Double, Double> {
        val stat = StatFs(Environment.getDataDirectory().path)
        val totalBytes = stat.totalBytes
        val availBytes = stat.availableBytes
        val usedBytes = (totalBytes - availBytes).coerceAtLeast(0L)
        val gb = 1024.0 * 1024.0 * 1024.0
        val totalGb = ((totalBytes / gb) * 10.0).roundToInt() / 10.0
        val freeGb = ((availBytes / gb) * 10.0).roundToInt() / 10.0
        val pct = if (totalBytes > 0) ((usedBytes.toDouble() / totalBytes.toDouble()) * 1000.0).roundToInt() / 10.0 else 0.0
        return Triple(pct, freeGb, totalGb)
    }

    private fun readRealCpuPercent(): Double {
        // Primary: /proc/stat delta (accessible on older Android/some OEM kernels)
        val procStat = runCatching { File("/proc/stat").readLines().firstOrNull { it.startsWith("cpu ") } }.getOrNull()
        if (procStat != null) {
            val cols = procStat.trim().split(Regex("\\s+")).drop(1).mapNotNull { it.toLongOrNull() }
            if (cols.size >= 4) {
                val idle = cols[3] + (cols.getOrNull(4) ?: 0L)
                val total = cols.sum()
                if (prevCpuTotal > 0L && total > prevCpuTotal) {
                    val dTotal = total - prevCpuTotal
                    val dIdle = (idle - prevCpuIdle).coerceAtLeast(0L)
                    prevCpuTotal = total
                    prevCpuIdle = idle
                    val busyPct = ((dTotal - dIdle).toDouble() / dTotal.toDouble()) * 100.0
                    return (busyPct.coerceIn(0.0, 100.0) * 10.0).roundToInt() / 10.0
                }
                prevCpuTotal = total
                prevCpuIdle = idle
            }
        }

        // Fallback on Android 8+ where SELinux restricts /proc/stat: current CPU freq ratio across online cores
        val cpuDir = File("/sys/devices/system/cpu")
        val ratios = mutableListOf<Double>()
        cpuDir.listFiles { _, name -> name.matches(Regex("cpu\\d+")) }?.forEach { core ->
            val cur = runCatching { File(core, "cpufreq/scaling_cur_freq").readText().trim().toDouble() }.getOrNull()
            val max = runCatching { File(core, "cpufreq/cpuinfo_max_freq").readText().trim().toDouble() }.getOrNull()
            if (cur != null && max != null && max > 0.0) {
                ratios.add((cur / max).coerceIn(0.0, 1.0) * 100.0)
            }
        }
        if (ratios.isNotEmpty()) {
            return ((ratios.average()) * 10.0).roundToInt() / 10.0
        }
        return 0.0
    }

    private fun readNetworkRates(): Pair<Long, Long> {
        val nowMs = SystemClock.elapsedRealtime()
        val tx = TrafficStats.getTotalTxBytes()
        val rx = TrafficStats.getTotalRxBytes()
        if (tx == TrafficStats.UNSUPPORTED.toLong() || rx == TrafficStats.UNSUPPORTED.toLong()) {
            return 0L to 0L
        }
        if (prevNetSampleMs > 0L && nowMs > prevNetSampleMs) {
            val elapsedSec = ((nowMs - prevNetSampleMs) / 1000.0).coerceAtLeast(0.5)
            val txRate = ((tx - prevTxBytes).coerceAtLeast(0L) / elapsedSec).toLong()
            val rxRate = ((rx - prevRxBytes).coerceAtLeast(0L) / elapsedSec).toLong()
            prevTxBytes = tx
            prevRxBytes = rx
            prevNetSampleMs = nowMs
            return txRate to rxRate
        }
        prevTxBytes = tx
        prevRxBytes = rx
        prevNetSampleMs = nowMs
        return 0L to 0L
    }

    private fun isVpnActive(): Boolean {
        val cm = context.getSystemService(Context.CONNECTIVITY_SERVICE) as? ConnectivityManager ?: return false
        val network = cm.activeNetwork ?: return false
        val caps = cm.getNetworkCapabilities(network) ?: return false
        return caps.hasTransport(NetworkCapabilities.TRANSPORT_VPN)
    }

    private fun countVisibleProcesses(): Int {
        val am = context.getSystemService(Context.ACTIVITY_SERVICE) as? ActivityManager ?: return 1
        return (am.runningAppProcesses?.size ?: 1).coerceAtLeast(1)
    }

    private fun collectTcpConnections(): List<NetworkConnectionSummary> {
        val results = mutableListOf<NetworkConnectionSummary>()
        val pm = context.packageManager

        fun scanFile(path: String, isIpv6: Boolean) {
            val file = File(path)
            if (!file.canRead()) return
            val lines = runCatching { file.readLines() }.getOrNull() ?: return
            for (line in lines.drop(1)) {
                val parsed = SocketTableParser.parseProcNetLine(line, isIpv6) ?: continue
                val pkgs = runCatching { pm.getPackagesForUid(parsed.uid) }.getOrNull()
                val procName = when {
                    !pkgs.isNullOrEmpty() -> pkgs.first()
                    parsed.uid == 1000 -> "android.system"
                    else -> "uid:${parsed.uid}"
                }
                val host = resolveHostCached(parsed.remoteAddress)
                results.add(
                    NetworkConnectionSummary(
                        protocol = parsed.protocol,
                        localAddress = parsed.localAddress,
                        localPort = parsed.localPort,
                        remoteAddress = parsed.remoteAddress,
                        remotePort = parsed.remotePort,
                        remoteHost = host,
                        state = parsed.state,
                        processId = parsed.uid,
                        processName = procName
                    )
                )
                if (results.size >= 25) break
            }
        }

        scanFile("/proc/net/tcp", isIpv6 = false)
        if (results.size < 25) scanFile("/proc/net/tcp6", isIpv6 = true)
        return results
    }

    private fun resolveHostCached(ip: String): String {
        dnsCache[ip]?.let { return it }
        val resolved = runCatching {
            val addr = InetAddress.getByName(ip)
            val host = addr.canonicalHostName
            if (host != ip) host else ""
        }.getOrDefault("")
        if (dnsCache.size < 256) {
            dnsCache[ip] = resolved
        }
        return resolved
    }

    private fun computeApkIntegrityDigest(): String {
        return runCatching {
            val apkPath = context.applicationInfo.sourceDir
            val bytes = File(apkPath).inputStream().use { input ->
                val md = java.security.MessageDigest.getInstance("SHA-256")
                val buf = ByteArray(8192)
                var read: Int
                while (input.read(buf).also { read = it } > 0) {
                    md.update(buf, 0, read)
                }
                md.digest()
            }
            bytes.joinToString("") { "%02x".format(it) }
        }.getOrDefault("")
    }
}
