package mx.nexara.mobile.nativeapp.ui.common

import android.annotation.SuppressLint
import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.graphics.BitmapFactory
import android.webkit.WebView
import android.widget.Toast
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Description
import androidx.compose.material.icons.outlined.FileDownload
import androidx.compose.material.icons.outlined.OpenInNew
import androidx.compose.material.icons.outlined.Share
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
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
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import androidx.core.content.FileProvider
import java.io.File
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import mx.nexara.mobile.nativeapp.data.api.toUserMessage

/**
 * Un documento a pantalla completa —PDF, imagen, Excel, Word…— con **Guardar**, **Compartir**
 * y **Abrir con…**.
 *
 * Adam (07-10): «intento descargar o enviar por WhatsApp las cotizaciones y se queda trabado».
 * En Android la cotización se mandaba directo a otra app (`ACTION_VIEW`): sin un lector de PDF
 * instalado no pasaba nada, y no había forma de guardarla. Ahora se ve aquí mismo y desde aquí
 * se guarda (el selector de Android para elegir carpeta) o se comparte con su nombre y su tipo.
 *
 * PDF con `PdfRenderer`, imágenes con `BitmapFactory`; Excel/Word con la vista previa HTML que
 * arma el API (`vistaPreviaHtml`), pintada en un WebView sin JavaScript. Lo demás: tarjeta con
 * el nombre y los tres botones.
 */
@Composable
fun DocumentoDialog(
    archivo: File,
    titulo: String,
    mime: String = mimeDeArchivo(archivo.name),
    vistaPreviaHtml: (suspend () -> String?)? = null,
    onClose: () -> Unit,
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val guardar = rememberLauncherForActivityResult(ActivityResultContracts.CreateDocument(mime)) { destino ->
        if (destino == null) return@rememberLauncherForActivityResult
        // Un Excel de 25 MB no se copia en el hilo de la pantalla.
        scope.launch {
            val ok = withContext(Dispatchers.IO) {
                runCatching {
                    context.contentResolver.openOutputStream(destino)?.use { out ->
                        archivo.inputStream().use { it.copyTo(out) }
                    } ?: error("sin destino")
                }.isSuccess
            }
            Toast.makeText(context, if (ok) "Guardado" else "No se pudo guardar el archivo", Toast.LENGTH_SHORT).show()
        }
    }

    Dialog(onDismissRequest = onClose, properties = DialogProperties(usePlatformDefaultWidth = false)) {
        Surface(modifier = Modifier.fillMaxSize(), color = Color.White) {
            Column(Modifier.fillMaxSize()) {
                Row(
                    Modifier.fillMaxWidth().padding(horizontal = 4.dp, vertical = 4.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    TextButton(onClick = onClose) { Text("Cerrar") }
                    Text(
                        titulo,
                        style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.SemiBold),
                        color = Color(0xFF0F172A),
                        modifier = Modifier.weight(1f).padding(end = 12.dp),
                        maxLines = 2,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
                HorizontalDivider()
                Box(Modifier.weight(1f).fillMaxWidth()) {
                    when {
                        mime == "application/pdf" -> PdfViewer(file = archivo, modifier = Modifier.fillMaxSize())
                        mime.startsWith("image/") -> ImagenDeArchivo(archivo)
                        vistaPreviaHtml != null -> VistaPreviaHtml(archivo.absolutePath, vistaPreviaHtml)
                        else -> SinVistaPrevia(archivo, onAbrir = { abrirArchivoCon(context, archivo, mime) })
                    }
                }
                // Abajo y con letrero, al alcance del pulgar: Adam no encontraba cómo guardar ni mandar.
                HorizontalDivider()
                Row(
                    Modifier.fillMaxWidth().padding(horizontal = 4.dp, vertical = 2.dp),
                    horizontalArrangement = Arrangement.SpaceEvenly,
                ) {
                    AccionDeDocumento("Guardar", Icons.Outlined.FileDownload, Modifier.weight(1f)) {
                        guardar.launch(archivo.name)
                    }
                    AccionDeDocumento("Compartir", Icons.Outlined.Share, Modifier.weight(1f)) {
                        compartirArchivo(context, archivo, mime, titulo)
                    }
                    AccionDeDocumento("Abrir con…", Icons.Outlined.OpenInNew, Modifier.weight(1f)) {
                        abrirArchivoCon(context, archivo, mime)
                    }
                }
            }
        }
    }
}

@Composable
private fun AccionDeDocumento(
    etiqueta: String,
    icono: androidx.compose.ui.graphics.vector.ImageVector,
    modifier: Modifier = Modifier,
    onClick: () -> Unit,
) {
    TextButton(onClick = onClick, modifier = modifier) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Icon(icono, contentDescription = null, modifier = Modifier.size(22.dp))
            Text(etiqueta, style = MaterialTheme.typography.labelMedium, maxLines = 1)
        }
    }
}

/** Lado mayor con el que se pinta una foto: una de 48 MP a tamaño real tumbaría la app. */
private const val LADO_MAXIMO_IMAGEN = 2048

private fun decodificarReducida(archivo: File, ladoMaximo: Int): android.graphics.Bitmap? = runCatching {
    val medidas = BitmapFactory.Options().apply { inJustDecodeBounds = true }
    BitmapFactory.decodeFile(archivo.absolutePath, medidas)
    val lado = maxOf(medidas.outWidth, medidas.outHeight)
    var muestra = 1
    while (lado > 0 && lado / (muestra * 2) >= ladoMaximo) muestra *= 2
    BitmapFactory.decodeFile(archivo.absolutePath, BitmapFactory.Options().apply { inSampleSize = muestra })
}.getOrNull()

@Composable
private fun ImagenDeArchivo(archivo: File) {
    val context = LocalContext.current
    // `cargada` distingue «todavía no» de «no se pudo leer» (p. ej. HEIC en Android 8).
    var cargada by remember(archivo.absolutePath) { mutableStateOf(false) }
    val bitmap by produceState<android.graphics.Bitmap?>(null, archivo.absolutePath) {
        value = withContext(Dispatchers.IO) { decodificarReducida(archivo, LADO_MAXIMO_IMAGEN) }
        cargada = true
    }
    val bmp = bitmap
    if (bmp == null && !cargada) {
        Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { CircularProgressIndicator() }
    } else if (bmp == null) {
        SinVistaPrevia(archivo, onAbrir = { abrirArchivoCon(context, archivo, mimeDeArchivo(archivo.name)) })
    } else {
        Image(
            bitmap = bmp.asImageBitmap(),
            contentDescription = null,
            contentScale = ContentScale.Fit,
            modifier = Modifier.fillMaxSize(),
        )
    }
}

@SuppressLint("SetJavaScriptEnabled")
@Composable
private fun VistaPreviaHtml(clave: String, cargar: suspend () -> String?) {
    var html by remember(clave) { mutableStateOf<String?>(null) }
    var error by remember(clave) { mutableStateOf<String?>(null) }
    LaunchedEffect(clave) {
        try {
            html = cargar() ?: ""
        } catch (e: Throwable) {
            error = e.toUserMessage("No se pudo cargar la vista previa")
        }
    }
    when {
        error != null -> Text(
            error!!,
            color = MaterialTheme.colorScheme.error,
            modifier = Modifier.padding(16.dp),
        )
        html == null -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { CircularProgressIndicator() }
        html!!.isBlank() -> Text("Este archivo no tiene vista previa.", modifier = Modifier.padding(16.dp))
        else -> AndroidView(
            modifier = Modifier.fillMaxSize(),
            factory = { ctx ->
                WebView(ctx).apply {
                    // Solo HTML y estilos: sin JavaScript, sin archivos, sin red.
                    settings.javaScriptEnabled = false
                    settings.allowFileAccess = false
                    settings.allowContentAccess = false
                    settings.blockNetworkLoads = true
                    settings.builtInZoomControls = true
                    settings.displayZoomControls = false
                    settings.loadWithOverviewMode = true
                    settings.useWideViewPort = true
                }
            },
            update = { web -> web.loadDataWithBaseURL(null, html!!, "text/html", "utf-8", null) },
        )
    }
}

@Composable
private fun SinVistaPrevia(archivo: File, onAbrir: () -> Unit) {
    Column(
        Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Icon(Icons.Outlined.Description, contentDescription = null, modifier = Modifier.size(56.dp), tint = Color(0xFF64748B))
        Spacer(Modifier.height(12.dp))
        Text(archivo.name, style = MaterialTheme.typography.titleSmall, textAlign = TextAlign.Center)
        Spacer(Modifier.height(4.dp))
        Text(
            "Este tipo de archivo no se puede ver aquí. Guárdalo, compártelo o ábrelo con otra app.",
            style = MaterialTheme.typography.bodySmall,
            color = Color(0xFF64748B),
            textAlign = TextAlign.Center,
        )
        Spacer(Modifier.height(16.dp))
        OutlinedButton(onClick = onAbrir) { Text("Abrir con…") }
    }
}

// `mimeDeArchivo`, `tieneVistaPreviaHtml` y `nombreDeArchivoSeguro` viven en `DocumentoRules.kt`
// (puras, con pruebas en la JVM).

/** Escribe los bytes en la caché con su nombre real (para ver, guardar o compartir). */
fun guardarEnCache(context: Context, nombre: String, bytes: ByteArray, extensionPorOmision: String = ""): File {
    val raiz = File(context.cacheDir, "documentos")
    // Cada documento abierto deja su copia (hasta 25 MB): las de días anteriores sobran. No se
    // borra al cerrar el visor porque WhatsApp y compañía pueden leerla después de compartir.
    runCatching {
        val limite = System.currentTimeMillis() - 24L * 60 * 60 * 1000
        raiz.listFiles()?.filter { it.isDirectory && it.lastModified() < limite }?.forEach { it.deleteRecursively() }
    }
    val dir = File(raiz, "${System.nanoTime()}").apply { mkdirs() }
    val archivo = File(dir, nombreDeArchivoSeguro(nombre, extensionPorOmision))
    archivo.writeBytes(bytes)
    return archivo
}

fun compartirArchivo(context: Context, archivo: File, mime: String, titulo: String = "Compartir") {
    try {
        val uri = FileProvider.getUriForFile(context, "${context.packageName}.fileprovider", archivo)
        val intent = Intent(Intent.ACTION_SEND).apply {
            type = mime
            putExtra(Intent.EXTRA_STREAM, uri)
            putExtra(Intent.EXTRA_SUBJECT, titulo)
            clipData = android.content.ClipData.newRawUri(archivo.name, uri)
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        }
        context.startActivity(Intent.createChooser(intent, "Compartir").addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    } catch (_: Exception) {
        Toast.makeText(context, "No se pudo compartir el archivo", Toast.LENGTH_SHORT).show()
    }
}

fun abrirArchivoCon(context: Context, archivo: File, mime: String) {
    try {
        val uri = FileProvider.getUriForFile(context, "${context.packageName}.fileprovider", archivo)
        val intent = Intent(Intent.ACTION_VIEW).apply {
            setDataAndType(uri, mime)
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        context.startActivity(Intent.createChooser(intent, "Abrir con").addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    } catch (_: ActivityNotFoundException) {
        Toast.makeText(context, "No hay una app para abrir este archivo", Toast.LENGTH_SHORT).show()
    } catch (_: IllegalArgumentException) {
        Toast.makeText(context, "No se pudo abrir el archivo", Toast.LENGTH_SHORT).show()
    }
}
