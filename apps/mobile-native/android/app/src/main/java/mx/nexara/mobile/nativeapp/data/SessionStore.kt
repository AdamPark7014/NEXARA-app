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
    val isClient: Boolean = false,
    val isBranchUser: Boolean = false,
    val clientId: Long? = null,
    val branchId: Long? = null,
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
        val isClient = prefs.getBoolean("is_client", false)
        val isBranchUser = prefs.getBoolean("is_branch_user", false)
        val clientId = prefs.getLong("client_id", 0L).takeIf { it > 0L }
        val branchId = prefs.getLong("branch_id", 0L).takeIf { it > 0L }
        return SessionUser(
            id = id,
            nombre = nombre,
            email = email,
            role = role,
            department = department,
            token = token,
            permissions = perms,
            isSuperAdmin = isSuperAdmin,
            isClient = isClient,
            isBranchUser = isBranchUser,
            clientId = clientId,
            branchId = branchId,
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
            .putBoolean("is_client", user.isClient)
            .putBoolean("is_branch_user", user.isBranchUser)
            .putLong("client_id", user.clientId ?: 0L)
            .putLong("branch_id", user.branchId ?: 0L)
            .apply()
    }

    fun clear() {
        prefs.edit().clear().apply()
    }
}

