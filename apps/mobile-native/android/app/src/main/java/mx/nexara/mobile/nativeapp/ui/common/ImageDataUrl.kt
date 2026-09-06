package mx.nexara.mobile.nativeapp.ui.common

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.net.Uri
import android.util.Base64
import java.io.ByteArrayOutputStream

/**
 * Comprime fotos antes de mandarlas como data URL (techo API ~5–10 MB; cámara
 * cruda suele ir a 4–8 MB y falla en 3G).
 */
object ImageDataUrl {
    private const val MAX_EDGE_PX = 1600
    private const val JPEG_QUALITY = 82

    fun fromCaptured(context: Context, media: CapturedMedia): String? {
        val mime = media.mimeType.takeIf { it.isNotBlank() } ?: "application/octet-stream"
        if (!mime.startsWith("image/", ignoreCase = true)) {
            val bytes = readBytes(context, media.uri) ?: return null
            return "data:$mime;base64,${Base64.encodeToString(bytes, Base64.NO_WRAP)}"
        }
        return fromImageUri(context, media.uri)
    }

    fun fromImageUri(context: Context, uri: Uri): String? {
        val bytes = readBytes(context, uri) ?: return null
        val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        BitmapFactory.decodeByteArray(bytes, 0, bytes.size, bounds)
        val w = bounds.outWidth
        val h = bounds.outHeight
        if (w <= 0 || h <= 0) {
            return "data:image/jpeg;base64,${Base64.encodeToString(bytes, Base64.NO_WRAP)}"
        }
        var sample = 1
        val maxEdge = maxOf(w, h)
        while (maxEdge / sample > MAX_EDGE_PX * 2) {
            sample *= 2
        }
        val opts = BitmapFactory.Options().apply { inSampleSize = sample }
        val bitmap = BitmapFactory.decodeByteArray(bytes, 0, bytes.size, opts) ?: return null
        val scaled = scaleDown(bitmap, MAX_EDGE_PX)
        if (scaled !== bitmap) bitmap.recycle()
        val out = ByteArrayOutputStream()
        scaled.compress(Bitmap.CompressFormat.JPEG, JPEG_QUALITY, out)
        scaled.recycle()
        return "data:image/jpeg;base64,${Base64.encodeToString(out.toByteArray(), Base64.NO_WRAP)}"
    }

    private fun scaleDown(src: Bitmap, maxEdge: Int): Bitmap {
        val w = src.width
        val h = src.height
        val edge = maxOf(w, h)
        if (edge <= maxEdge) return src
        val scale = maxEdge.toFloat() / edge
        return Bitmap.createScaledBitmap(src, (w * scale).toInt().coerceAtLeast(1), (h * scale).toInt().coerceAtLeast(1), true)
    }

    private fun readBytes(context: Context, uri: Uri): ByteArray? =
        runCatching { context.contentResolver.openInputStream(uri)?.use { it.readBytes() } }.getOrNull()

    /** JPEG comprimido listo para multipart (p. ej. salida/devolución vehículo). */
    fun jpegBytesFromCaptured(context: Context, media: CapturedMedia, filename: String = "photo.jpg"): Pair<String, ByteArray>? {
        val dataUrl = fromCaptured(context, media) ?: return null
        val comma = dataUrl.indexOf(',')
        if (comma < 0) return null
        val bytes = Base64.decode(dataUrl.substring(comma + 1), Base64.NO_WRAP)
        return filename to bytes
    }
}
