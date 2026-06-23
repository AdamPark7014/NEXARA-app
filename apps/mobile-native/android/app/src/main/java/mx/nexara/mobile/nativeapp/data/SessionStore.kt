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
    val avatarUrl: String? = null,
)

data class QuickProfile(
    val id: Long,
    val nombre: String,
    val email: String,
    val role: String,
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
            avatarUrl = prefs.getString("avatar_url", null),
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
            .putString("avatar_url", user.avatarUrl)
            .apply()

        saveQuickProfile(user)
    }

    fun loadQuickProfiles(): List<QuickProfile> {
        val raw = prefs.getString("quick_profiles_csv", "")?.trim().orEmpty()
        if (raw.isBlank()) return emptyList()

        return raw
            .split("||")
            .mapNotNull { item ->
                val parts = item.split("|", limit = 4)
                if (parts.size < 4) return@mapNotNull null
                val id = parts[0].toLongOrNull() ?: return@mapNotNull null
                QuickProfile(
                    id = id,
                    nombre = parts[1],
                    email = parts[2],
                    role = parts[3],
                )
            }
    }

    private fun saveQuickProfile(user: SessionUser) {
        val current = loadQuickProfiles().toMutableList()
        current.removeAll { it.email.equals(user.email, ignoreCase = true) }
        current.add(
            0,
            QuickProfile(
                id = user.id,
                nombre = user.nombre,
                email = user.email,
                role = user.role,
            ),
        )

        val encoded = current
            .take(5)
            .joinToString("||") {
                listOf(it.id.toString(), it.nombre, it.email, it.role)
                    .joinToString("|") { part ->
                        part.replace("|", " ").replace("||", " ")
                    }
            }

        prefs.edit().putString("quick_profiles_csv", encoded).apply()
    }

    fun clear() {
        prefs.edit()
            .remove("id")
            .remove("nombre")
            .remove("email")
            .remove("role")
            .remove("department")
            .remove("token")
            .remove("permissions_csv")
            .remove("is_super_admin")
            .remove("is_client")
            .remove("is_branch_user")
            .remove("client_id")
            .remove("branch_id")
            .apply()
    }
}

