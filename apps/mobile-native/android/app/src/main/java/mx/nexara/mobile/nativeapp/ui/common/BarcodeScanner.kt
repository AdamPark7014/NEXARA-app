package mx.nexara.mobile.nativeapp.ui.common

import android.Manifest
import android.content.pm.PackageManager
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.camera.core.Camera
import androidx.camera.core.CameraSelector
import androidx.camera.core.ExperimentalGetImage
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.ImageProxy
import androidx.camera.core.Preview
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import androidx.core.content.ContextCompat
import androidx.lifecycle.compose.LocalLifecycleOwner
import com.google.mlkit.vision.barcode.BarcodeScanner
import com.google.mlkit.vision.barcode.BarcodeScannerOptions
import com.google.mlkit.vision.barcode.BarcodeScanning
import com.google.mlkit.vision.barcode.common.Barcode
import com.google.mlkit.vision.common.InputImage
import java.util.concurrent.Executors
import mx.nexara.mobile.nativeapp.ui.enterprise.NxColors

/** Qué simbologías lee el escáner: menos formatos = lectura más rápida y menos falsos. */
enum class FormatosDeEscaneo(val mlKit: IntArray) {
    /** Producto de almacén: EAN-13, EAN-8, UPC-A, UPC-E y Code 128 (SKU interno). */
    PRODUCTO(
        intArrayOf(
            Barcode.FORMAT_EAN_13,
            Barcode.FORMAT_EAN_8,
            Barcode.FORMAT_UPC_A,
            Barcode.FORMAT_UPC_E,
            Barcode.FORMAT_CODE_128,
        ),
    ),

    /** Etiqueta NEXARA de herramienta: Code 128 con la nomenclatura `PREFIJO-SERIE`. */
    ETIQUETA_HERRAMIENTA(intArrayOf(Barcode.FORMAT_CODE_128)),
}

/**
 * Campo para escribir el código a mano + botón que abre la cámara. Es la entrada
 * de los escáneres de Almacén y Herramientas: el que no tiene cámara (o la etiqueta
 * está rota) siempre puede teclearlo.
 */
@Composable
fun EscanearOEscribirCodigo(
    titulo: String,
    formatos: FormatosDeEscaneo,
    buscando: Boolean,
    onCodigo: (String) -> Unit,
    modifier: Modifier = Modifier,
    etiquetaCampo: String = "Código de barras",
    mayusculas: Boolean = false,
) {
    var manual by remember { mutableStateOf("") }
    var escaneando by remember { mutableStateOf(false) }

    fun enviar() {
        val valor = manual.trim()
        if (valor.isNotEmpty() && !buscando) onCodigo(valor)
    }

    Column(modifier = modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Button(
            onClick = { escaneando = true },
            enabled = !buscando,
            colors = ButtonDefaults.buttonColors(containerColor = NxColors.Brand),
            modifier = Modifier.fillMaxWidth().heightIn(min = 52.dp),
        ) {
            Text(if (buscando) "Buscando…" else "Escanear con la cámara", fontWeight = FontWeight.Bold)
        }
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            OutlinedTextField(
                value = manual,
                onValueChange = { manual = it.take(CodigoBarrasRules.LARGO_MAXIMO + 8) },
                label = { Text(etiquetaCampo) },
                singleLine = true,
                keyboardOptions = KeyboardOptions(
                    capitalization = if (mayusculas) KeyboardCapitalization.Characters else KeyboardCapitalization.None,
                    imeAction = ImeAction.Search,
                ),
                keyboardActions = KeyboardActions(onSearch = { enviar() }),
                modifier = Modifier.weight(1f),
            )
            OutlinedButton(
                onClick = { enviar() },
                enabled = !buscando && manual.isNotBlank(),
                modifier = Modifier.heightIn(min = 52.dp),
            ) { Text("Buscar") }
        }
    }

    if (escaneando) {
        BarcodeScannerDialog(
            titulo = titulo,
            formatos = formatos,
            onCodigo = { valor ->
                escaneando = false
                manual = valor
                onCodigo(valor)
            },
            onDismiss = { escaneando = false },
        )
    }
}

/**
 * Cámara en vivo que lee un código de barras y lo entrega una sola vez. CameraX
 * (vista previa + análisis de cuadros) con ML Kit; pide el permiso de cámara al abrir.
 * Un valor se acepta cuando sale igual en dos cuadros seguidos: así una lectura a
 * medias de un código movido no dispara la búsqueda.
 */
@Composable
fun BarcodeScannerDialog(
    titulo: String,
    formatos: FormatosDeEscaneo,
    onCodigo: (String) -> Unit,
    onDismiss: () -> Unit,
    subtitulo: String = "Apunta al código de barras y mantenlo dentro del recuadro.",
) {
    val context = LocalContext.current
    fun permitido() =
        ContextCompat.checkSelfPermission(context, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED

    var conPermiso by remember { mutableStateOf(permitido()) }
    var permisoNegado by remember { mutableStateOf(false) }
    val launcher = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { ok ->
        conPermiso = ok
        permisoNegado = !ok
    }
    LaunchedEffect(Unit) { if (!conPermiso) launcher.launch(Manifest.permission.CAMERA) }

    var listo by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var linterna by remember { mutableStateOf(false) }
    var camara by remember { mutableStateOf<Camera?>(null) }
    var entregado by remember { mutableStateOf(false) }
    var ultimo by remember { mutableStateOf<String?>(null) }

    Dialog(
        onDismissRequest = onDismiss,
        properties = DialogProperties(usePlatformDefaultWidth = false, dismissOnClickOutside = false),
    ) {
        Surface(modifier = Modifier.fillMaxSize(), color = Color(0xFF0F172A)) {
            Column(
                modifier = Modifier.fillMaxSize().padding(16.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                Text(titulo, color = Color.White, fontSize = 18.sp, fontWeight = FontWeight.Bold)
                Text(subtitulo, color = Color(0xFFCBD5E1), fontSize = 13.sp)
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .weight(1f)
                        .clip(RoundedCornerShape(14.dp))
                        .background(Color.Black),
                    contentAlignment = Alignment.Center,
                ) {
                    if (conPermiso) {
                        VistaDeEscaneo(
                            formatos = formatos,
                            onListo = { listo = it },
                            onCamara = { camara = it },
                            onError = { error = it },
                            onValor = { valor ->
                                if (entregado) return@VistaDeEscaneo
                                if (valor == ultimo) {
                                    entregado = true
                                    onCodigo(valor)
                                } else {
                                    ultimo = valor
                                }
                            },
                            modifier = Modifier.fillMaxSize(),
                        )
                        Box(
                            Modifier
                                .fillMaxWidth(0.82f)
                                .height(150.dp)
                                .border(2.dp, Color.White.copy(alpha = 0.85f), RoundedCornerShape(12.dp)),
                        )
                        if (!listo && error == null) {
                            Text("Abriendo cámara…", color = Color.White, fontSize = 14.sp)
                        }
                    } else {
                        Column(
                            horizontalAlignment = Alignment.CenterHorizontally,
                            verticalArrangement = Arrangement.spacedBy(10.dp),
                            modifier = Modifier.padding(20.dp),
                        ) {
                            Text(
                                if (permisoNegado) {
                                    "Sin permiso de cámara no se puede escanear. Dalo aquí o en Ajustes, " +
                                        "o cierra y escribe el código a mano."
                                } else {
                                    "Necesitamos permiso de cámara para leer el código."
                                },
                                color = Color.White,
                                fontSize = 14.sp,
                            )
                            Button(onClick = { launcher.launch(Manifest.permission.CAMERA) }) { Text("Dar permiso") }
                        }
                    }
                }
                error?.let { Text(it, color = Color(0xFFFCA5A5), fontSize = 13.sp) }
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    val tieneLinterna = camara?.cameraInfo?.hasFlashUnit() == true
                    if (tieneLinterna) {
                        OutlinedButton(
                            onClick = {
                                linterna = !linterna
                                camara?.cameraControl?.enableTorch(linterna)
                            },
                            modifier = Modifier.weight(1f).heightIn(min = 48.dp),
                        ) { Text(if (linterna) "Apagar luz" else "Encender luz", color = Color.White) }
                    }
                    TextButton(
                        onClick = onDismiss,
                        modifier = Modifier.weight(1f).heightIn(min = 48.dp),
                    ) { Text("Cancelar", color = Color(0xFFCBD5E1)) }
                }
            }
        }
    }
}

@Composable
private fun VistaDeEscaneo(
    formatos: FormatosDeEscaneo,
    onListo: (Boolean) -> Unit,
    onCamara: (Camera?) -> Unit,
    onError: (String) -> Unit,
    onValor: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    val context = LocalContext.current
    val lifecycleOwner = LocalLifecycleOwner.current
    val previewView = remember {
        PreviewView(context).apply {
            scaleType = PreviewView.ScaleType.FILL_CENTER
            // TextureView: dentro de un Dialog el SurfaceView puede quedar detrás de la ventana.
            implementationMode = PreviewView.ImplementationMode.COMPATIBLE
        }
    }

    DisposableEffect(formatos, lifecycleOwner) {
        onListo(false)
        val primero = formatos.mlKit.first()
        val resto = formatos.mlKit.drop(1).toIntArray()
        val scanner = BarcodeScanning.getClient(
            BarcodeScannerOptions.Builder().setBarcodeFormats(primero, *resto).build(),
        )
        val executor = Executors.newSingleThreadExecutor()
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
                val analisis = ImageAnalysis.Builder()
                    .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
                    .build()
                    .also { it.setAnalyzer(executor) { proxy -> analizarCuadro(scanner, proxy, onValor) } }
                try {
                    cameraProvider.unbindAll()
                    val camara = cameraProvider.bindToLifecycle(
                        lifecycleOwner,
                        CameraSelector.DEFAULT_BACK_CAMERA,
                        preview,
                        analisis,
                    )
                    onCamara(camara)
                    onListo(true)
                } catch (_: Exception) {
                    onError("No se pudo abrir la cámara: revisa el permiso de cámara")
                }
            },
            ContextCompat.getMainExecutor(context),
        )
        onDispose {
            runCatching { provider?.unbindAll() }
            onCamara(null)
            executor.shutdown()
            scanner.close()
        }
    }

    AndroidView(factory = { previewView }, modifier = modifier)
}

@androidx.annotation.OptIn(ExperimentalGetImage::class)
private fun analizarCuadro(scanner: BarcodeScanner, proxy: ImageProxy, onValor: (String) -> Unit) {
    val media = proxy.image
    if (media == null) {
        proxy.close()
        return
    }
    val input = InputImage.fromMediaImage(media, proxy.imageInfo.rotationDegrees)
    scanner.process(input)
        .addOnSuccessListener { codigos ->
            codigos.firstNotNullOfOrNull { it.rawValue?.takeIf { v -> v.isNotBlank() } }?.let(onValor)
        }
        .addOnCompleteListener { proxy.close() }
}
