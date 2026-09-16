package mx.nexara.mobile.nativeapp.push

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.PorterDuff
import android.graphics.PorterDuffXfermode
import android.graphics.Rect
import android.graphics.RectF
import android.graphics.Typeface
import android.util.Log
import mx.nexara.mobile.nativeapp.data.AuthRepository
import mx.nexara.mobile.nativeapp.data.api.apiAssetOrigin
import mx.nexara.mobile.nativeapp.data.api.resolveProtectedUploadUrl
import okhttp3.OkHttpClient
import okhttp3.Request
import java.io.ByteArrayOutputStream
import java.io.File
import java.io.FileOutputStream
import java.io.InputStream
import java.security.MessageDigest
import java.util.concurrent.TimeUnit

/**
 * Avatares circulares para notificaciones: foto del remitente (con la sesión si
 * vive en el API, porque /uploads exige `Authorization`) o, si no hay foto o no
 * baja en ~3 s, un círculo teal con sus iniciales.
 *
 * Todo es bloqueante: se llama desde el hilo de FCM, nunca desde el principal.
 */
internal object NotificationAvatars {
    private const val TAG = "NexaraPushAvatar"
    private const val SIZE_PX = 192
    private const val MAX_BYTES = 4 * 1024 * 1024
    private const val CACHE_TTL_MS = 24L * 60L * 60L * 1000L
    private const val CACHE_DIR = "nx_push_avatars"

    private val client: OkHttpClient by lazy {
        OkHttpClient.Builder()
            .connectTimeout(3, TimeUnit.SECONDS)
            .readTimeout(3, TimeUnit.SECONDS)
            .callTimeout(3500, TimeUnit.MILLISECONDS)
            .build()
    }

    /**
     * Avatar de [name]. Con [allowNetwork] en false solo usa la caché de disco
     * (mensajes viejos de la conversación: no se vuelve a descargar nada).
     */
    fun forPerson(context: Context, name: String, avatarUrl: String, allowNetwork: Boolean): Bitmap {
        if (avatarUrl.isNotBlank()) {
            try {
                load(context.applicationContext, avatarUrl, allowNetwork)?.let { return it }
            } catch (e: Exception) {
                Log.d(TAG, "Avatar no disponible: ${e.message}")
            }
        }
        return initials(name)
    }

    private fun load(context: Context, raw: String, allowNetwork: Boolean): Bitmap? {
        val url = resolveProtectedUploadUrl(raw)
        if (!url.startsWith("http://", ignoreCase = true) && !url.startsWith("https://", ignoreCase = true)) return null
        val file = File(File(context.cacheDir, CACHE_DIR), cacheName(url))
        val cached = file.takeIf { it.isFile && it.length() > 0L }
        val fresh = cached != null && System.currentTimeMillis() - cached.lastModified() < CACHE_TTL_MS
        if (cached != null && (fresh || !allowNetwork)) {
            BitmapFactory.decodeFile(cached.path)?.let { return it }
        }
        if (!allowNetwork) return null
        val downloaded = download(context, url)
            ?: return cached?.let { BitmapFactory.decodeFile(it.path) }
        runCatching {
            file.parentFile?.mkdirs()
            FileOutputStream(file).use { downloaded.compress(Bitmap.CompressFormat.PNG, 100, it) }
        }
        return downloaded
    }

    private fun download(context: Context, url: String): Bitmap? {
        val builder = Request.Builder().url(url).header("Accept", "image/*")
        val apiHost = runCatching { java.net.URI(apiAssetOrigin()).host }.getOrNull()
        val host = runCatching { java.net.URI(url).host }.getOrNull()
        if (apiHost != null && host != null && host.equals(apiHost, ignoreCase = true)) {
            val auth = AuthRepository(context)
            auth.token()?.takeIf { it.isNotBlank() }?.let { builder.header("Authorization", "Bearer $it") }
            auth.companyId()?.takeIf { it > 0L }?.let { builder.header("X-Company-Id", it.toString()) }
        }
        client.newCall(builder.build()).execute().use { response ->
            if (!response.isSuccessful) return null
            val body = response.body ?: return null
            if (body.contentLength() > MAX_BYTES) return null
            val bytes = body.byteStream().use { readLimited(it) } ?: return null
            return decodeCircle(bytes)
        }
    }

    private fun readLimited(input: InputStream): ByteArray? {
        val out = ByteArrayOutputStream()
        val buffer = ByteArray(16 * 1024)
        var total = 0
        while (true) {
            val n = input.read(buffer)
            if (n < 0) break
            total += n
            if (total > MAX_BYTES) return null
            out.write(buffer, 0, n)
        }
        return out.toByteArray()
    }

    private fun decodeCircle(bytes: ByteArray): Bitmap? {
        val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        BitmapFactory.decodeByteArray(bytes, 0, bytes.size, bounds)
        if (bounds.outWidth <= 0 || bounds.outHeight <= 0) return null
        var sample = 1
        while (bounds.outWidth / (sample * 2) >= SIZE_PX && bounds.outHeight / (sample * 2) >= SIZE_PX) {
            sample *= 2
        }
        val src = BitmapFactory.decodeByteArray(
            bytes,
            0,
            bytes.size,
            BitmapFactory.Options().apply { inSampleSize = sample },
        ) ?: return null
        return circle(src)
    }

    private fun circle(src: Bitmap): Bitmap {
        val out = Bitmap.createBitmap(SIZE_PX, SIZE_PX, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(out)
        val paint = Paint(Paint.ANTI_ALIAS_FLAG or Paint.FILTER_BITMAP_FLAG)
        val half = SIZE_PX / 2f
        canvas.drawCircle(half, half, half, paint)
        paint.xfermode = PorterDuffXfermode(PorterDuff.Mode.SRC_IN)
        val side = minOf(src.width, src.height)
        val left = (src.width - side) / 2
        val top = (src.height - side) / 2
        canvas.drawBitmap(
            src,
            Rect(left, top, left + side, top + side),
            RectF(0f, 0f, SIZE_PX.toFloat(), SIZE_PX.toFloat()),
            paint,
        )
        return out
    }

    /** Círculo teal con las iniciales (máx. 2) en blanco. */
    fun initials(name: String): Bitmap {
        val letters = name.trim()
            .split(Regex("\\s+"))
            .mapNotNull { word -> word.firstOrNull { it.isLetterOrDigit() }?.uppercaseChar() }
            .take(2)
            .joinToString("")
            .ifBlank { "N" }
        val out = Bitmap.createBitmap(SIZE_PX, SIZE_PX, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(out)
        val half = SIZE_PX / 2f
        canvas.drawCircle(
            half,
            half,
            half,
            Paint(Paint.ANTI_ALIAS_FLAG).apply { color = NexaraNotifications.ACCENT_COLOR },
        )
        val text = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = Color.WHITE
            textAlign = Paint.Align.CENTER
            typeface = Typeface.create(Typeface.SANS_SERIF, Typeface.BOLD)
            textSize = SIZE_PX * if (letters.length > 1) 0.38f else 0.46f
            letterSpacing = 0.02f
        }
        canvas.drawText(letters, half, half - (text.descent() + text.ascent()) / 2f, text)
        return out
    }

    private fun cacheName(url: String): String {
        val digest = MessageDigest.getInstance("SHA-1").digest(url.toByteArray(Charsets.UTF_8))
        return digest.joinToString("") { "%02x".format(it.toInt() and 0xFF) } + ".png"
    }
}
