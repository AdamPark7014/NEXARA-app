package mx.nexara.mobile.nativeapp.ui.common

import android.Manifest
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.graphics.Matrix
import android.util.Base64
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.camera.core.CameraSelector
import androidx.camera.core.ImageCapture
import androidx.camera.core.ImageCaptureException
import androidx.camera.core.ImageProxy
import androidx.camera.core.Preview
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.AccessTime
import androidx.compose.material.icons.outlined.Cameraswitch
import androidx.compose.material.icons.outlined.ErrorOutline
import androidx.compose.material.icons.outlined.LocationOn
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import androidx.core.content.ContextCompat
import androidx.lifecycle.compose.LocalLifecycleOwner
import java.io.ByteArrayOutputStream
import java.time.Instant
import java.util.Locale
import java.util.concurrent.Executors
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeoutOrNull
import mx.nexara.mobile.nativeapp.ui.enterprise.NxColors
import mx.nexara.mobile.nativeapp.ui.enterprise.NxGlyph
import mx.nexara.mobile.nativeapp.ui.enterprise.NxIconText
import mx.nexara.mobile.nativeapp.ui.enterprise.icon
import mx.nexara.mobile.nativeapp.util.DeviceCoords
import mx.nexara.mobile.nativeapp.util.DeviceLocation

/**
 * Foto tomada con la cámara en vivo, lista para mandarse como data URL con su ubicación.
 *
 * `mock` y `accuracyM` viajan con la foto porque se perdían aquí: `DeviceCoords` ya
 * sabía que la ubicación era simulada y esta clase lo tiraba, así que una obra entera
 * «hecha» con GPS falso se veía idéntica a una real.
 */
class GeoPhoto(
    val dataUrl: String,
    val preview: Bitmap,
    val latitude: Double?,
    val longitude: Double?,
    val capturedAt: String,
    /** La ubicación de esta foto venía de una app de GPS falso (ver `MockLocation`). */
    val mock: Boolean = false,
    /** Precisión del GPS en metros al tomarla. */
    val accuracyM: Float? = null,
) {
    val hasLocation: Boolean get() = latitude != null && longitude != null
}

const val GPS_REQUIRED_MESSAGE = "No se pudo obtener tu ubicación: activa el GPS y da permiso de ubicación"

/** Mismo tamaño y calidad que la web (grabFrame): lado mayor 1280 px, JPEG 0.6. */
object LivePhotoEncoding {
    const val MAX_EDGE_PX = 1280
    const val JPEG_QUALITY = 60

    fun normalize(src: Bitmap, rotationDegrees: Int, maxEdge: Int = MAX_EDGE_PX): Bitmap {
        val w = src.width
        val h = src.height
        val scale = minOf(1f, maxEdge.toFloat() / maxOf(w, h).coerceAtLeast(1))
        if (rotationDegrees % 360 == 0 && scale >= 1f) return src
        val matrix = Matrix().apply {
            postScale(scale, scale)
            postRotate(rotationDegrees.toFloat())
        }
        val out = Bitmap.createBitmap(src, 0, 0, w, h, matrix, true)
        if (out !== src) src.recycle()
        return out
    }

    fun toJpegDataUrl(bitmap: Bitmap, quality: Int = JPEG_QUALITY): String {
        val stream = ByteArrayOutputStream()
        bitmap.compress(Bitmap.CompressFormat.JPEG, quality, stream)
        return "data:image/jpeg;base64," + Base64.encodeToString(stream.toByteArray(), Base64.NO_WRAP)
    }
}

/**
 * Cámara en vivo (CameraX) para que la persona se acomode antes de tomar la
 * foto — nunca dispara sola. La ubicación se empieza a buscar al abrir la
 * cámara para tenerla lista en el disparo.
 *
 * La vista previa de la frontal sale en espejo (PreviewView lo hace solo) y la
 * foto se guarda sin espejo, igual que la web.
 */
@Composable
fun LiveCameraCaptureDialog(
    title: String,
    requireLocation: Boolean,
    onCaptured: (GeoPhoto) -> Unit,
    onDismiss: () -> Unit,
    /** false: la foto no lleva GPS y no se pide permiso de ubicación (p. ej. hora de comida). */
    captureLocation: Boolean = true,
    /** Cámara con la que abre (la comida abre con la frontal, como la web). */
    frontCamera: Boolean = false,
    subtitle: String = "Acomódate o encuadra bien y toca «Tomar foto».",
    titleIcon: ImageVector = NxGlyph.PHOTO.icon,
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()

    fun granted(permission: String) =
        ContextCompat.checkSelfPermission(context, permission) == PackageManager.PERMISSION_GRANTED

    var hasCamera by remember { mutableStateOf(granted(Manifest.permission.CAMERA)) }
    var hasLocation by remember { mutableStateOf(DeviceLocation.hasPermission(context)) }
    val permissionLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions(),
    ) {
        hasCamera = granted(Manifest.permission.CAMERA)
        hasLocation = DeviceLocation.hasPermission(context)
    }

    fun askPermissions() {
        val missing = buildList {
            if (!granted(Manifest.permission.CAMERA)) add(Manifest.permission.CAMERA)
            if (captureLocation && !DeviceLocation.hasPermission(context)) {
                add(Manifest.permission.ACCESS_FINE_LOCATION)
                add(Manifest.permission.ACCESS_COARSE_LOCATION)
            }
        }
        if (missing.isNotEmpty()) permissionLauncher.launch(missing.toTypedArray())
    }

    LaunchedEffect(Unit) { askPermissions() }

    var coords by remember { mutableStateOf<DeviceCoords?>(null) }
    var locating by remember { mutableStateOf(false) }
    LaunchedEffect(hasLocation) {
        if (!captureLocation || !hasLocation) return@LaunchedEffect
        locating = true
        val fix = withTimeoutOrNull(15_000) { DeviceLocation.current(context, highAccuracy = true) }
        if (fix != null) coords = fix
        locating = false
    }

    var lensFacing by remember {
        mutableIntStateOf(if (frontCamera) CameraSelector.LENS_FACING_FRONT else CameraSelector.LENS_FACING_BACK)
    }
    var ready by remember { mutableStateOf(false) }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    val imageCapture = remember(lensFacing) {
        ImageCapture.Builder()
            .setCaptureMode(ImageCapture.CAPTURE_MODE_MINIMIZE_LATENCY)
            .build()
    }
    val captureExecutor = remember { Executors.newSingleThreadExecutor() }
    DisposableEffect(Unit) {
        onDispose { captureExecutor.shutdown() }
    }

    fun finishCapture(bitmap: Bitmap?) {
        scope.launch {
            if (bitmap == null) {
                busy = false
                error = "No se pudo tomar la foto; intenta de nuevo"
                return@launch
            }
            val dataUrl = withContext(Dispatchers.Default) { LivePhotoEncoding.toJpegDataUrl(bitmap) }
            var geo = if (captureLocation) coords else null
            if (captureLocation && geo == null && DeviceLocation.hasPermission(context)) {
                geo = withTimeoutOrNull(10_000) { DeviceLocation.current(context, highAccuracy = true) }
                if (geo != null) coords = geo
            }
            busy = false
            if (requireLocation && geo == null) {
                error = GPS_REQUIRED_MESSAGE
                return@launch
            }
            onCaptured(
                GeoPhoto(
                    dataUrl = dataUrl,
                    preview = bitmap,
                    latitude = geo?.lat,
                    longitude = geo?.lng,
                    capturedAt = Instant.now().toString(),
                    mock = geo?.mock == true,
                    accuracyM = geo?.accuracyM,
                ),
            )
        }
    }

    fun shoot() {
        if (!ready || busy) return
        busy = true
        error = null
        imageCapture.takePicture(
            captureExecutor,
            object : ImageCapture.OnImageCapturedCallback() {
                override fun onCaptureSuccess(image: ImageProxy) {
                    val bitmap = runCatching {
                        LivePhotoEncoding.normalize(image.toBitmap(), image.imageInfo.rotationDegrees)
                    }.getOrNull()
                    image.close()
                    finishCapture(bitmap)
                }

                override fun onError(exception: ImageCaptureException) {
                    finishCapture(null)
                }
            },
        )
    }

    Dialog(
        onDismissRequest = { if (!busy) onDismiss() },
        properties = DialogProperties(usePlatformDefaultWidth = false, dismissOnClickOutside = false),
    ) {
        Surface(modifier = Modifier.fillMaxSize(), color = Color(0xFF0F172A)) {
            Column(
                modifier = Modifier.fillMaxSize().padding(16.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                NxIconText(text = title, icon = titleIcon, color = Color.White, fontSize = 18.sp, fontWeight = FontWeight.Bold)
                Text(
                    subtitle,
                    color = Color(0xFFCBD5E1),
                    fontSize = 13.sp,
                )
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .weight(1f)
                        .clip(RoundedCornerShape(14.dp))
                        .background(Color.Black),
                    contentAlignment = Alignment.Center,
                ) {
                    if (hasCamera) {
                        LiveCameraPreview(
                            lensFacing = lensFacing,
                            imageCapture = imageCapture,
                            onReady = { ready = it },
                            onError = { error = it },
                            modifier = Modifier.fillMaxSize(),
                        )
                        if (!ready && error == null) {
                            Text("Abriendo cámara…", color = Color.White, fontSize = 14.sp)
                        }
                    } else {
                        Column(
                            horizontalAlignment = Alignment.CenterHorizontally,
                            verticalArrangement = Arrangement.spacedBy(10.dp),
                            modifier = Modifier.padding(20.dp),
                        ) {
                            Text(
                                "Necesitamos permiso de cámara para tomar la foto.",
                                color = Color.White,
                                fontSize = 14.sp,
                            )
                            Button(onClick = { askPermissions() }) { Text("Dar permiso") }
                        }
                    }
                }
                val gpsIcon = if (!captureLocation) Icons.Outlined.AccessTime else Icons.Outlined.LocationOn
                val gpsLine = when {
                    !captureLocation -> "La foto se guarda con la hora en que la tomas"
                    coords != null -> "Al tomar la foto se guarda tu ubicación · GPS listo"
                    !hasLocation -> "Da permiso de ubicación: la foto se guarda con tu GPS"
                    locating -> "Al tomar la foto se guarda tu ubicación · buscando GPS…"
                    else -> "Al tomar la foto se guarda tu ubicación"
                }
                NxIconText(text = gpsLine, icon = gpsIcon, color = Color(0xFFCBD5E1), fontSize = 12.5.sp)
                error?.let {
                    NxIconText(text = it, icon = Icons.Outlined.ErrorOutline, color = Color(0xFFFCA5A5), fontSize = 13.sp)
                }
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Button(
                        onClick = { shoot() },
                        enabled = hasCamera && ready && !busy,
                        colors = ButtonDefaults.buttonColors(containerColor = NxColors.Brand),
                        modifier = Modifier.weight(1f).heightIn(min = 52.dp),
                    ) {
                        if (!busy) {
                            Icon(NxGlyph.PHOTO.icon, contentDescription = null, modifier = Modifier.size(18.dp))
                            Spacer(Modifier.size(6.dp))
                        }
                        Text(
                            when {
                                !busy -> "Tomar foto"
                                captureLocation -> "Ubicando…"
                                else -> "Procesando…"
                            },
                            fontWeight = FontWeight.Bold,
                            fontSize = 16.sp,
                        )
                    }
                    OutlinedButton(
                        onClick = {
                            error = null
                            lensFacing = if (lensFacing == CameraSelector.LENS_FACING_BACK) {
                                CameraSelector.LENS_FACING_FRONT
                            } else {
                                CameraSelector.LENS_FACING_BACK
                            }
                        },
                        enabled = !busy,
                        modifier = Modifier.weight(1f).heightIn(min = 52.dp),
                    ) {
                        Icon(Icons.Outlined.Cameraswitch, contentDescription = null, tint = Color.White, modifier = Modifier.size(18.dp))
                        Spacer(Modifier.size(6.dp))
                        Text(
                            if (lensFacing == CameraSelector.LENS_FACING_BACK) "Usar frontal" else "Usar trasera",
                            color = Color.White,
                        )
                    }
                }
                TextButton(
                    onClick = onDismiss,
                    enabled = !busy,
                    modifier = Modifier.align(Alignment.CenterHorizontally),
                ) {
                    Text("Cancelar", color = Color(0xFFCBD5E1))
                }
            }
        }
    }
}

@Composable
private fun LiveCameraPreview(
    lensFacing: Int,
    imageCapture: ImageCapture,
    onReady: (Boolean) -> Unit,
    onError: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    val context = LocalContext.current
    val lifecycleOwner = LocalLifecycleOwner.current
    val previewView = remember {
        PreviewView(context).apply {
            // FIT_CENTER: lo que se ve es lo que se guarda (sin recortes de la vista).
            scaleType = PreviewView.ScaleType.FIT_CENTER
            // TextureView: dentro de un Dialog el SurfaceView puede quedar detrás de la ventana.
            implementationMode = PreviewView.ImplementationMode.COMPATIBLE
        }
    }

    DisposableEffect(lensFacing, imageCapture, lifecycleOwner) {
        onReady(false)
        val future = ProcessCameraProvider.getInstance(context)
        var provider: ProcessCameraProvider? = null
        future.addListener(
            {
                val cameraProvider = runCatching { future.get() }.getOrNull()
                if (cameraProvider == null) {
                    onError("No se pudo abrir la cámara")
                    return@addListener
                }
                provider = cameraProvider
                val preview = Preview.Builder().build().also {
                    it.setSurfaceProvider(previewView.surfaceProvider)
                }
                val selector = CameraSelector.Builder().requireLensFacing(lensFacing).build()
                try {
                    cameraProvider.unbindAll()
                    cameraProvider.bindToLifecycle(lifecycleOwner, selector, preview, imageCapture)
                    onReady(true)
                } catch (_: Exception) {
                    onError(
                        if (lensFacing == CameraSelector.LENS_FACING_FRONT) {
                            "Este teléfono no tiene cámara frontal disponible"
                        } else {
                            "No se pudo abrir la cámara: revisa el permiso de cámara"
                        },
                    )
                }
            },
            ContextCompat.getMainExecutor(context),
        )
        onDispose {
            runCatching { provider?.unbindAll() }
        }
    }

    AndroidView(factory = { previewView }, modifier = modifier)
}

/**
 * Vista previa antes de enviar: «Tu foto de entrada / de evidencia / de salida»
 * con la ubicación capturada y las tres salidas de la web.
 */
@Composable
fun GeoPhotoPreviewDialog(
    title: String,
    photo: GeoPhoto,
    confirmLabel: String,
    sending: Boolean,
    error: String?,
    onConfirm: () -> Unit,
    onRetake: () -> Unit,
    onCancel: () -> Unit,
) {
    val context = LocalContext.current
    Dialog(
        onDismissRequest = { if (!sending) onCancel() },
        properties = DialogProperties(usePlatformDefaultWidth = false),
    ) {
        Surface(
            modifier = Modifier.fillMaxWidth().padding(16.dp),
            shape = RoundedCornerShape(18.dp),
            color = Color.White,
        ) {
            Column(
                modifier = Modifier.padding(18.dp).verticalScroll(rememberScrollState()),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                Text(title, fontSize = 17.sp, fontWeight = FontWeight.ExtraBold, color = NxColors.Slate)
                Text(
                    "¿Se ve bien? Si salió oscura o movida, toma otra.",
                    fontSize = 13.sp,
                    color = NxColors.Muted,
                )
                Image(
                    bitmap = photo.preview.asImageBitmap(),
                    contentDescription = "Foto que tomaste",
                    contentScale = ContentScale.Fit,
                    modifier = Modifier
                        .fillMaxWidth()
                        .heightIn(max = 420.dp)
                        .clip(RoundedCornerShape(12.dp))
                        .background(Color.Black),
                )
                val lat = photo.latitude
                val lng = photo.longitude
                if (lat != null && lng != null) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        NxIconText(
                            text = String.format(Locale.US, "Ubicación capturada: %.5f, %.5f · ", lat, lng),
                            icon = Icons.Outlined.LocationOn,
                            fontSize = 12.5.sp,
                            color = NxColors.Muted,
                            modifier = Modifier.weight(1f, fill = false),
                        )
                        Text(
                            "Ver en mapa",
                            fontSize = 12.5.sp,
                            color = NxColors.Brand,
                            fontWeight = FontWeight.SemiBold,
                            modifier = Modifier.clickable { openMapsAt(context, lat, lng) },
                        )
                    }
                } else {
                    NxIconText(
                        text = "Sin ubicación registrada",
                        icon = Icons.Outlined.LocationOn,
                        fontSize = 12.5.sp,
                        color = NxColors.Muted,
                    )
                }
                error?.let {
                    NxIconText(text = it, icon = Icons.Outlined.ErrorOutline, fontSize = 13.sp, color = Color(0xFFB91C1C))
                }
                Button(
                    onClick = onConfirm,
                    enabled = !sending,
                    colors = ButtonDefaults.buttonColors(containerColor = NxColors.Brand),
                    modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp),
                ) {
                    Text(if (sending) "Enviando…" else confirmLabel, fontWeight = FontWeight.Bold, fontSize = 15.sp)
                }
                Row(
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    OutlinedButton(
                        onClick = onRetake,
                        enabled = !sending,
                        modifier = Modifier.weight(1f).heightIn(min = 48.dp),
                    ) {
                        Icon(NxGlyph.PHOTO.icon, contentDescription = null, modifier = Modifier.size(18.dp))
                        Spacer(Modifier.size(6.dp))
                        Text("Tomar otra")
                    }
                    TextButton(onClick = onCancel, enabled = !sending) {
                        Text("Cancelar", color = NxColors.Muted)
                    }
                }
            }
        }
    }
}
