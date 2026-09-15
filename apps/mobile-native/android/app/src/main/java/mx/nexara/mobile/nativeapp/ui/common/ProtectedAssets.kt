package mx.nexara.mobile.nativeapp.ui.common

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.util.Base64
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.BrokenImage
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import coil.ImageLoader
import coil.compose.SubcomposeAsyncImage
import coil.request.ImageRequest
import java.io.File
import java.util.concurrent.TimeUnit
import kotlin.math.abs
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import mx.nexara.mobile.nativeapp.data.AuthRepository
import mx.nexara.mobile.nativeapp.data.api.apiAssetOrigin
import mx.nexara.mobile.nativeapp.data.api.resolveProtectedUploadUrl
import mx.nexara.mobile.nativeapp.data.api.toUserMessage
import mx.nexara.mobile.nativeapp.ui.util.downloadAuthedToCache
import mx.nexara.mobile.nativeapp.ui.util.openExternalUrl
import mx.nexara.mobile.nativeapp.ui.util.openPdfFile
import mx.nexara.mobile.nativeapp.ui.util.savePdfToCache
import okhttp3.OkHttpClient

/**
 * Lo que vive bajo /uploads exige `Authorization`: una foto de evidencia pedida sin token
 * contesta 401 y en pantalla sale el ícono roto. Este cargador de Coil agrega
 * la sesión (y la empresa) solo a peticiones hacia el API, nunca a otros hosts.
 */
object ProtectedAssets {
    fun resolve(raw: String?): String = resolveProtectedUploadUrl(raw)

    @Volatile
    private var loader: ImageLoader? = null

    fun imageLoader(context: Context): ImageLoader =
        loader ?: synchronized(this) {
            loader ?: build(context.applicationContext).also { loader = it }
        }

    private fun build(context: Context): ImageLoader {
        val auth = AuthRepository(context)
        val apiHost = runCatching { java.net.URI(apiAssetOrigin()).host }.getOrNull()
        val client = OkHttpClient.Builder()
            .connectTimeout(18, TimeUnit.SECONDS)
            .readTimeout(30, TimeUnit.SECONDS)
            .addInterceptor { chain ->
                val request = chain.request()
                val token = auth.token()
                val sameHost = apiHost == null || request.url.host.equals(apiHost, ignoreCase = true)
                if (token.isNullOrBlank() || !sameHost) {
                    return@addInterceptor chain.proceed(request)
                }
                val builder = request.newBuilder().header("Authorization", "Bearer $token")
                auth.companyId()?.takeIf { it > 0L }?.let { builder.header("X-Company-Id", it.toString()) }
                chain.proceed(builder.build())
            }
            .build()
        return ImageLoader.Builder(context)
            .okHttpClient(client)
            .crossfade(true)
            .build()
    }
}

/** Imagen protegida (foto de evidencia, avatar) o `data:` recién capturada. */
@Composable
fun ProtectedImage(
    url: String?,
    contentDescription: String?,
    modifier: Modifier = Modifier,
    contentScale: ContentScale = ContentScale.Crop,
) {
    val context = LocalContext.current
    val resolved = remember(url) { ProtectedAssets.resolve(url) }
    if (resolved.startsWith("data:", ignoreCase = true)) {
        DataUrlImage(resolved, contentDescription, modifier, contentScale, maxEdgePx = 720)
        return
    }
    val request = remember(resolved) {
        ImageRequest.Builder(context)
            .data(resolved.ifBlank { null })
            .crossfade(true)
            .build()
    }
    SubcomposeAsyncImage(
        model = request,
        contentDescription = contentDescription,
        imageLoader = ProtectedAssets.imageLoader(context),
        modifier = modifier,
        contentScale = contentScale,
        loading = {
            Box(
                modifier = Modifier.fillMaxSize().background(Color(0xFFE2E8F0)),
                contentAlignment = Alignment.Center,
            ) {
                CircularProgressIndicator(modifier = Modifier.size(20.dp), strokeWidth = 2.dp)
            }
        },
        error = {
            // 404 (el archivo ya no está en el servidor) u otro fallo: se dice, no se deja un hueco.
            Column(
                modifier = Modifier.fillMaxSize().background(Color(0xFFF1F5F9)).padding(4.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.Center,
            ) {
                Icon(Icons.Default.BrokenImage, contentDescription = null, tint = Color(0xFF94A3B8))
                Text(
                    "Archivo no disponible",
                    fontSize = 10.sp,
                    color = Color(0xFF64748B),
                    textAlign = TextAlign.Center,
                    maxLines = 2,
                )
            }
        },
    )
}

/** Muestra un `data:image/...;base64` sin pasarlo por la red. */
@Composable
fun DataUrlImage(
    dataUrl: String,
    contentDescription: String?,
    modifier: Modifier = Modifier,
    contentScale: ContentScale = ContentScale.Crop,
    maxEdgePx: Int = 1280,
) {
    val bitmap by produceState<Bitmap?>(initialValue = null, dataUrl, maxEdgePx) {
        value = withContext(Dispatchers.Default) { decodeDataUrlBitmap(dataUrl, maxEdgePx) }
    }
    val bmp = bitmap
    if (bmp == null) {
        Box(modifier.background(Color(0xFFE2E8F0)))
        return
    }
    Image(
        bitmap = bmp.asImageBitmap(),
        contentDescription = contentDescription,
        modifier = modifier,
        contentScale = contentScale,
    )
}

fun decodeDataUrlBitmap(dataUrl: String, maxEdgePx: Int): Bitmap? {
    val comma = dataUrl.indexOf(',')
    if (comma < 0) return null
    return runCatching {
        val bytes = Base64.decode(dataUrl.substring(comma + 1), Base64.DEFAULT)
        val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        BitmapFactory.decodeByteArray(bytes, 0, bytes.size, bounds)
        val edge = maxOf(bounds.outWidth, bounds.outHeight)
        var sample = 1
        while (edge > 0 && edge / (sample * 2) >= maxEdgePx) sample *= 2
        BitmapFactory.decodeByteArray(
            bytes,
            0,
            bytes.size,
            BitmapFactory.Options().apply { inSampleSize = sample },
        )
    }.getOrNull()
}

fun openMapsAt(context: Context, lat: Double, lng: Double) {
    openExternalUrl(context, "https://www.google.com/maps?q=$lat,$lng")
}

/**
 * Botón que descarga un PDF protegido con la sesión y lo abre en el visor de la
 * app (no depende de que el teléfono tenga lector de PDF).
 */
@Composable
fun ProtectedPdfButton(
    url: String,
    modifier: Modifier = Modifier,
    label: String = "📄 Abrir PDF",
    title: String = "Hoja de servicio",
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var file by remember { mutableStateOf<File?>(null) }
    var loading by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }

    Column(modifier) {
        OutlinedButton(
            onClick = {
                if (loading) return@OutlinedButton
                scope.launch {
                    loading = true
                    error = null
                    try {
                        file = withContext(Dispatchers.IO) {
                            downloadAuthedToCache(
                                context,
                                ProtectedAssets.resolve(url),
                                "evidencia-${abs(url.hashCode())}.pdf",
                            )
                        }
                    } catch (e: Exception) {
                        error = if (e.message.orEmpty().contains("HTTP 404")) {
                            "El PDF ya no está en el servidor: hay que pedir que lo vuelva a subir."
                        } else {
                            e.toUserMessage("No se pudo abrir el PDF")
                        }
                    } finally {
                        loading = false
                    }
                }
            },
            enabled = !loading,
        ) {
            Text(if (loading) "Descargando…" else label)
        }
        error?.let {
            Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
        }
    }

    file?.let { pdf ->
        ProtectedPdfDialog(file = pdf, title = title, onClose = { file = null })
    }
}

@Composable
fun ProtectedPdfDialog(file: File, title: String, onClose: () -> Unit) {
    val context = LocalContext.current
    Dialog(
        onDismissRequest = onClose,
        properties = DialogProperties(usePlatformDefaultWidth = false),
    ) {
        Surface(modifier = Modifier.fillMaxSize(), color = Color.White) {
            Column(Modifier.fillMaxSize()) {
                Row(
                    Modifier.fillMaxWidth().padding(horizontal = 8.dp, vertical = 4.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(4.dp),
                ) {
                    TextButton(onClick = onClose) { Text("Cerrar") }
                    Text(
                        title,
                        style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.SemiBold),
                        modifier = Modifier.weight(1f),
                        maxLines = 1,
                    )
                    TextButton(
                        onClick = {
                            runCatching {
                                val copy = savePdfToCache(context, file.name, file.readBytes())
                                openPdfFile(context, copy)
                            }
                        },
                    ) { Text("Abrir con…") }
                }
                PdfViewer(file = file, modifier = Modifier.weight(1f))
            }
        }
    }
}
