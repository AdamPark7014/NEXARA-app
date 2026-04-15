package mx.nexara.mobile.nativeapp.data

import android.content.Context
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey

data class SessionUser(
    val id: Long,
    val nombre: String,
    val email: String,
    val role: String,
    val department: String,
    val token: String,
    val permissions: List<String> = emptyList(),
    val isSuperAdmin: Boolean = false,
)

class SessionStore(context: Context) {
    private val masterKey = MasterKey.Builder(context)
        .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
        .build()

    private val prefs = EncryptedSharedPreferences.create(
        context,
        "nexara_session",
        masterKey,
        EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
        EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM,
    )

    fun load(): SessionUser? {
        val token = prefs.getString("token", null) ?: return null
        val id = prefs.getLong("id", 0L)
        val email = prefs.getString("email", null) ?: return null
        val nombre = prefs.getString("nombre", "") ?: ""
        val role = prefs.getString("role", "") ?: ""
        val department = prefs.getString("department", "") ?: ""
        val perms = prefs.getString("permissions_csv", "")?.split(",")?.map { it.trim() }?.filter { it.isNotBlank() } ?: emptyList()
        val isSuperAdmin = prefs.getBoolean("is_super_admin", false)
        return SessionUser(
            id = id,
            nombre = nombre,
            email = email,
            role = role,
            department = department,
            token = token,
            permissions = perms,
            isSuperAdmin = isSuperAdmin,
        )
    }

    fun save(user: SessionUser) {
        prefs.edit()
            .putLong("id", user.id)
            .putString("nombre", user.nombre)
            .putString("email", user.email)
            .putString("role", user.role)
            .putString("department", user.department)
            .putString("token", user.token)
            .putString("permissions_csv", user.permissions.joinToString(","))
            .putBoolean("is_super_admin", user.isSuperAdmin)
            .apply()
    }

    fun clear() {
        prefs.edit().clear().apply()
    }
}

