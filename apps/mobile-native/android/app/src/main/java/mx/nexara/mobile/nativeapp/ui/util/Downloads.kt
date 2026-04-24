package mx.nexara.mobile.nativeapp.ui.util

import android.content.ContentValues
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import android.widget.Toast
import androidx.core.content.FileProvider
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import mx.nexara.mobile.nativeapp.data.AuthRepository
import okhttp3.OkHttpClient
import okhttp3.Request
import java.io.File
import java.util.concurrent.TimeUnit

/**
 * Descarga desde el API con Bearer token y la guarda en:
 *   - Android 10+ : MediaStore (carpeta Download/NEXARA)
 *   - Android 9-  : Environment.DIRECTORY_DOWNLOADS
 *
 * Nunca bloquea el hilo principal y nunca crashea si falla. Devuelve el Uri
 * final y un MIME detectado para abrir después con [openDownloaded].
 */
object Downloads {
    data class Saved(val uri: Uri, val mimeType: String, val displayName: String)

    suspend fun download(
        context: Context,
        url: String,
        displayName: String,
        mimeType: String,
    ): Saved = withContext(Dispatchers.IO) {
        val client = OkHttpClient.Builder()
            .connectTimeout(25, TimeUnit.SECONDS)
            .readTimeout(90, TimeUnit.SECONDS)
            .build()
        val token = AuthRepository(context).token()
        val req = Request.Builder().url(url).apply {
            if (!token.isNullOrBlank()) header("Authorization", "Bearer $token")
        }.build()

        client.newCall(req).execute().use { resp ->
            if (!resp.isSuccessful) error("HTTP ${resp.code}")
            val bytes = resp.body?.bytes() ?: error("Respuesta vacía")
            val finalMime = resp.header("Content-Type")?.substringBefore(';')?.trim()?.ifBlank { null }
                ?: mimeType

            val safeName = displayName.replace(Regex("[^A-Za-z0-9._\\- ]"), "_")
            val uri = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                val values = ContentValues().apply {
                    put(MediaStore.Downloads.DISPLAY_NAME, safeName)
                    put(MediaStore.Downloads.MIME_TYPE, finalMime)
                    put(MediaStore.Downloads.RELATIVE_PATH, "${Environment.DIRECTORY_DOWNLOADS}/NEXARA")
                }
                val cr = context.contentResolver
                val target = cr.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values)
                    ?: error("No se pudo crear archivo en Descargas")
                cr.openOutputStream(target)?.use { out -> out.write(bytes) }
                target
            } else {
                val downloads = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS)
                val dir = File(downloads, "NEXARA").apply { mkdirs() }
                val file = File(dir, safeName)
                file.writeBytes(bytes)
                FileProvider.getUriForFile(
                    context,
                    "${context.packageName}.fileprovider",
                    file,
                )
            }
            Saved(uri = uri, mimeType = finalMime, displayName = safeName)
        }
    }

    fun openDownloaded(context: Context, saved: Saved) {
        val intent = Intent(Intent.ACTION_VIEW).apply {
            setDataAndType(saved.uri, saved.mimeType)
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        try {
            context.startActivity(Intent.createChooser(intent, "Abrir ${saved.displayName}"))
        } catch (_: Exception) {
            Toast.makeText(context, "No hay app para abrir ${saved.mimeType}", Toast.LENGTH_LONG).show()
        }
    }
}
