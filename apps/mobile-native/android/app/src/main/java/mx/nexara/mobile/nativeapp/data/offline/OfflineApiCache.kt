package mx.nexara.mobile.nativeapp.data.offline

import android.content.Context
import android.util.Base64
import java.io.File
import java.security.MessageDigest

/**
 * Cache GET de API — equivalente simplificado a apps/web/lib/offline-api-cache.ts.
 */
class OfflineApiCache(context: Context) {
    private val dir = File(context.cacheDir, "nexara_api_cache").also { it.mkdirs() }

    private fun keyFor(url: String, authTag: String): String {
        val raw = "$url|$authTag"
        val digest = MessageDigest.getInstance("SHA-256").digest(raw.toByteArray())
        return Base64.encodeToString(digest, Base64.URL_SAFE or Base64.NO_WRAP)
    }

    fun put(url: String, authTag: String, body: String) {
        val f = File(dir, keyFor(url, authTag))
        f.writeText(body)
    }

    fun get(url: String, authTag: String): String? {
        val f = File(dir, keyFor(url, authTag))
        if (!f.exists()) return null
        return f.readText()
    }

    fun clear() {
        dir.listFiles()?.forEach { it.delete() }
    }
}
