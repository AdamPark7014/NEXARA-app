package mx.nexara.mobile.nativeapp.data

data class DeviceIdentityHeaders(
    val deviceId: String,
    val deviceName: String,
    val deviceModel: String,
) {
    fun asHeaders(): Map<String, String> = mapOf(
        "X-Device-Id" to deviceId,
        "X-Device-Name" to deviceName,
        "X-Device-Model" to deviceModel,
    )
}

