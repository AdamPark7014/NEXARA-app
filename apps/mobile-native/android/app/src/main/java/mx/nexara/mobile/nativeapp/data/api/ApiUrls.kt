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

