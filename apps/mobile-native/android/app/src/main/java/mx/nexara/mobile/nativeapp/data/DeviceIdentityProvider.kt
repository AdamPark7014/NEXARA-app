package mx.nexara.mobile.nativeapp.data

import android.content.Context
import android.os.Build
import java.util.UUID

class DeviceIdentityProvider(
    private val context: Context,
) {
    private val prefs = context.getSharedPreferences("nexara_device", Context.MODE_PRIVATE)

    private fun getOrCreateDeviceId(): String {
        val existing = prefs.getString("device_id", null)
        if (!existing.isNullOrBlank()) return existing
        val next = UUID.randomUUID().toString()
        prefs.edit().putString("device_id", next).apply()
        return next
    }

    fun headers(): DeviceIdentityHeaders {
        val manufacturer = (Build.MANUFACTURER ?: "").trim()
        val model = (Build.MODEL ?: "").trim()
        val deviceName = listOf(manufacturer, model)
            .filter { it.isNotBlank() }
            .joinToString(" ")
            .ifBlank { "Android device" }

        return DeviceIdentityHeaders(
            deviceId = getOrCreateDeviceId(),
            deviceName = deviceName.take(120),
            deviceModel = model.take(120).ifBlank { deviceName.take(120) },
        )
    }
}

