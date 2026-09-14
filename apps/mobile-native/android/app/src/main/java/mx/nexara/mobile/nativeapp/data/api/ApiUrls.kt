package mx.nexara.mobile.nativeapp.data.api

import mx.nexara.mobile.nativeapp.BuildConfig

fun apiBaseUrl(): String = BuildConfig.API_BASE_URL.trimEnd('/')

/**
 * Backend serves assets (uploads) from server root, while API base includes `/api`.
 * Example: API_BASE_URL = https://api.nexara.com.mx/api  -> origin = https://api.nexara.com.mx
 */
fun apiAssetOrigin(): String {
    val base = apiBaseUrl()
    return if (base.endsWith("/api")) base.removeSuffix("/api") else base
}

fun toAbsoluteAssetUrl(maybeRelative: String?): String {
    val url = (maybeRelative ?: "").trim()
    if (url.isBlank()) return ""
    if (url.startsWith("http://") || url.startsWith("https://")) return url
    val origin = apiAssetOrigin().trimEnd('/')
    val path = if (url.startsWith("/")) url else "/$url"
    return origin + path
}

private val PROTECTED_UPLOAD_PATH = Regex(
    "^/(uploads|activities|evidences|activity-evidence|documents|user-docs|users|clients|vehicles)/",
    RegexOption.IGNORE_CASE,
)

/**
 * URL absoluta de un archivo protegido (fotos y PDF de evidencias).
 *
 * Espejo de `resolveAssetUrl` en apps/web/lib/evidence-display.ts. El API guarda
 * las fotos como `/activities/x.jpg` pero las sirve en `<origen>/uploads/activities/x.jpg`
 * y solo con `Authorization`; [toAbsoluteAssetUrl] no agrega `/uploads` y
 * pedía una ruta que no existe. Las URLs absolutas de otros hosts y los
 * `data:` se devuelven tal cual.
 */
fun resolveProtectedUploadUrl(raw: String?, origin: String = apiAssetOrigin()): String {
    val value = raw?.trim().orEmpty()
    if (value.isEmpty()) return ""
    if (value.startsWith("data:", ignoreCase = true) ||
        value.startsWith("blob:", ignoreCase = true) ||
        value.startsWith("//")
    ) {
        return value
    }
    if (value.startsWith("http://", ignoreCase = true) || value.startsWith("https://", ignoreCase = true)) {
        val path = runCatching { java.net.URI(value).path }.getOrNull() ?: return value
        if (!PROTECTED_UPLOAD_PATH.containsMatchIn(path)) return value
    }
    val relative = value
        .replace(Regex("\\\\+"), "/")
        .replace(Regex("^https?://[^/]+", RegexOption.IGNORE_CASE), "")
        .replace(Regex("^/api(?=/uploads/)", RegexOption.IGNORE_CASE), "")
        .replace(Regex("^/?uploads/", RegexOption.IGNORE_CASE), "")
        .replace(Regex("^/+"), "")
    val normalized = "/uploads/$relative".replace(Regex("/uploads/+", RegexOption.IGNORE_CASE), "/uploads/")
    return origin.trimEnd('/') + encodeUriPath(normalized)
}

/** `encodeURI` sin volver a codificar `%` (las rutas del API ya pueden venir codificadas). */
private fun encodeUriPath(path: String): String {
    val keep = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789;,/?:@&=+$-_.!~*'()#%"
    val out = StringBuilder(path.length)
    for (ch in path) {
        if (keep.indexOf(ch) >= 0) {
            out.append(ch)
        } else {
            ch.toString().toByteArray(Charsets.UTF_8).forEach { b ->
                out.append('%').append("%02X".format(b.toInt() and 0xFF))
            }
        }
    }
    return out.toString()
}

