package mx.nexara.mobile.nativeapp.ui.util

import android.content.Context
import android.content.Intent
import androidx.core.content.FileProvider
import java.io.File

fun savePdfToCache(context: Context, filename: String, bytes: ByteArray): File {
    val safe = filename.replace(Regex("[^a-zA-Z0-9._-]"), "_")
    val dir = File(context.cacheDir, "pdfs").apply { mkdirs() }
    val file = File(dir, safe)
    file.writeBytes(bytes)
    return file
}

fun openPdfFile(context: Context, file: File) {
    val uri = FileProvider.getUriForFile(context, "${context.packageName}.fileprovider", file)
    val intent = Intent(Intent.ACTION_VIEW).apply {
        setDataAndType(uri, "application/pdf")
        addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    }
    context.startActivity(intent)
}

