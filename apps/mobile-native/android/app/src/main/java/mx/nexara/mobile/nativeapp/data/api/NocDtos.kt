package mx.nexara.mobile.nativeapp.data.api

/** Alerta NOC — GET /noc/alerts */
data class NocAlertDto(
    val id: String = "",
    val severity: String = "",
    val deviceId: String = "",
    val deviceName: String = "",
    val title: String = "",
    val message: String = "",
    val triggeredAt: String = "",
    val ackBy: String = "",
) {
    val rowKey: String get() = "na-$id"
    val displayTitle: String get() = title.ifBlank { deviceName.ifBlank { "Alerta" } }
    val isCritical: Boolean get() = severity.equals("critical", ignoreCase = true)
    val isWarningBand: Boolean
        get() {
            val s = severity.lowercase()
            return s == "warning" || s == "high" || s == "medium"
        }

    fun toFlatMap(): Map<String, Any?> = mapOf(
        "id" to id,
        "severity" to severity,
        "deviceId" to deviceId,
        "deviceName" to deviceName,
        "title" to title,
        "message" to message,
        "triggeredAt" to triggeredAt,
        "ackBy" to ackBy,
    )

    companion object {
        fun fromRaw(row: Map<String, Any?>): NocAlertDto = NocAlertDto(
            id = ProcParse.str(row["id"]),
            severity = ProcParse.str(row["severity"]),
            deviceId = ProcParse.str(row["deviceId"]),
            deviceName = ProcParse.str(row["deviceName"], row["name"]),
            title = ProcParse.str(row["title"]),
            message = ProcParse.str(row["message"], row["description"]),
            triggeredAt = ProcParse.str(row["triggeredAt"], row["createdAt"]),
            ackBy = ProcParse.str(row["ackBy"]),
        )
    }
}

/** Dispositivo NOC — GET /noc/devices */
data class NocDeviceDto(
    val id: String = "",
    val name: String = "",
    val type: String = "",
    val status: String = "",
    val clientName: String = "",
    val clientId: Long? = null,
    val uptime: Double? = null,
    val uptimePct30d: Double? = null,
    val branch: String = "",
    val lastSeen: String = "",
) {
    val rowKey: String get() = "nd-$id"
    val displayName: String get() = name.ifBlank { "Dispositivo" }
    val displayUptime: Double? get() = uptimePct30d ?: uptime

    fun toFlatMap(): Map<String, Any?> = buildMap {
        put("id", id)
        put("name", name)
        put("type", type)
        put("status", status)
        put("clientName", clientName)
        put("clientId", clientId)
        put("uptime", displayUptime)
        put("uptimePct30d", uptimePct30d)
        put("branch", branch)
        put("lastSeen", lastSeen)
    }

    companion object {
        fun fromRaw(row: Map<String, Any?>): NocDeviceDto {
            @Suppress("UNCHECKED_CAST")
            val client = row["client"] as? Map<String, Any?>
            return NocDeviceDto(
                id = ProcParse.str(row["id"]),
                name = ProcParse.str(row["name"], row["deviceName"], row["title"]),
                type = ProcParse.str(row["type"], row["deviceType"]),
                status = ProcParse.str(row["status"], row["estado"]),
                clientName = ProcParse.str(
                    client?.get("name"), row["clientName"], row["cliente"],
                ),
                clientId = ProcParse.lng(client?.get("id"), row["clientId"]),
                uptime = ProcParse.dbl(row["uptime"], row["avgUptime"]),
                uptimePct30d = ProcParse.dbl(row["uptimePct30d"]),
                branch = ProcParse.str(row["branch"], row["branchName"]),
                lastSeen = ProcParse.str(row["lastSeen"], row["updatedAt"]),
            )
        }
    }
}
