package mx.nexara.mobile.nativeapp.ui.util

import android.content.Context
import android.content.Intent
import androidx.core.content.FileProvider
import mx.nexara.mobile.nativeapp.data.AuthRepository
import mx.nexara.mobile.nativeapp.data.api.toAbsoluteAssetUrl
import okhttp3.OkHttpClient
import okhttp3.Request
import java.io.File
import java.util.concurrent.TimeUnit

private fun guessMime(filenameOrUrl: String): String {
    val lower = filenameOrUrl.lowercase()
    return when {
        lower.endsWith(".pdf") -> "application/pdf"
        lower.endsWith(".png") -> "image/png"
        lower.endsWith(".jpg") || lower.endsWith(".jpeg") -> "image/jpeg"
        lower.endsWith(".webp") -> "image/webp"
        else -> "*/*"
    }
}

private fun sanitizeFilename(name: String): String =
    name.replace(Regex("[^a-zA-Z0-9._-]"), "_").ifBlank { "file" }

fun downloadAuthedToCache(context: Context, urlOrPath: String, preferredFilename: String? = null): File {
    val auth = AuthRepository(context)
    val token = auth.token()
    val abs = toAbsoluteAssetUrl(urlOrPath)
    val client = OkHttpClient.Builder()
        .connectTimeout(18, TimeUnit.SECONDS)
        .readTimeout(30, TimeUnit.SECONDS)
        .writeTimeout(30, TimeUnit.SECONDS)
        .build()

    val req = Request.Builder()
        .url(abs)
        .header("Authorization", "Bearer $token")
        .build()
    val bytes = client.newCall(req).execute().use { res ->
        if (!res.isSuccessful) throw IllegalStateException("HTTP ${res.code}")
        res.body?.bytes() ?: throw IllegalStateException("Empty body")
    }

    val filename = sanitizeFilename(preferredFilename ?: abs.substringAfterLast('/').ifBlank { "download" })
    val dir = File(context.cacheDir, "downloads").apply { mkdirs() }
    val file = File(dir, filename)
    file.writeBytes(bytes)
    return file
}

fun openFile(context: Context, file: File, mime: String? = null) {
    val uri = FileProvider.getUriForFile(context, "${context.packageName}.fileprovider", file)
    val intent = Intent(Intent.ACTION_VIEW).apply {
        setDataAndType(uri, mime ?: guessMime(file.name))
        addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    }
    context.startActivity(intent)
}

