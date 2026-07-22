package mx.nexara.mobile.nativeapp.data.offline

import android.content.Context
import android.util.Base64
import java.io.File
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap
import java.util.regex.Matcher
import java.util.regex.Pattern

/**
 * Persiste blobs de media (data URLs) en disco para no inflar la cola JSON offline.
 * Encola referencias `nexara-media://{id}` y las reexpande al hacer replay.
 */
class OfflineMediaStore(context: Context) {
    private val dir = File(context.filesDir, "nexara_offline_media").also { it.mkdirs() }
    private val mimeById = ConcurrentHashMap<String, String>()

    fun externalizeDataUrls(body: String?): String? {
        if (body.isNullOrBlank()) return body
        if (!body.contains("data:")) return body
        val matcher = DATA_URL.matcher(body)
        val sb = StringBuffer()
        while (matcher.find()) {
            val mime = matcher.group(1) ?: "application/octet-stream"
            val b64 = matcher.group(2) ?: continue
            val id = saveBase64(b64, mime) ?: continue
            matcher.appendReplacement(sb, Matcher.quoteReplacement("nexara-media://$id"))
        }
        matcher.appendTail(sb)
        return sb.toString()
    }

    fun expandMediaRefs(body: String?): String? {
        if (body.isNullOrBlank()) return body
        if (!body.contains("nexara-media://")) return body
        val matcher = MEDIA_REF.matcher(body)
        val sb = StringBuffer()
        while (matcher.find()) {
            val id = matcher.group(1) ?: continue
            val dataUrl = loadAsDataUrl(id) ?: continue
            matcher.appendReplacement(sb, Matcher.quoteReplacement(dataUrl))
        }
        matcher.appendTail(sb)
        return sb.toString()
    }

    fun delete(id: String) {
        File(dir, id).delete()
        mimeById.remove(id)
        File(dir, "$id.mime").delete()
    }

    fun purgeRefsInBody(body: String?) {
        if (body.isNullOrBlank()) return
        val matcher = MEDIA_REF.matcher(body)
        while (matcher.find()) {
            matcher.group(1)?.let { delete(it) }
        }
    }

    private fun saveBase64(b64: String, mime: String): String? {
        return try {
            val bytes = Base64.decode(b64, Base64.DEFAULT)
            val id = UUID.randomUUID().toString()
            File(dir, id).writeBytes(bytes)
            File(dir, "$id.mime").writeText(mime)
            mimeById[id] = mime
            id
        } catch (_: Exception) {
            null
        }
    }

    private fun loadAsDataUrl(id: String): String? {
        val file = File(dir, id)
        if (!file.exists()) return null
        return try {
            val mime = mimeById[id]
                ?: File(dir, "$id.mime").takeIf { it.exists() }?.readText()?.trim()
                ?: "application/octet-stream"
            val b64 = Base64.encodeToString(file.readBytes(), Base64.NO_WRAP)
            "data:$mime;base64,$b64"
        } catch (_: Exception) {
            null
        }
    }

    companion object {
        private val DATA_URL: Pattern =
            Pattern.compile("data:([\\w/+.-]+);base64,([A-Za-z0-9+/=\\r\\n]+)")
        private val MEDIA_REF: Pattern =
            Pattern.compile("nexara-media://([0-9a-fA-F\\-]{36})")
    }
}
