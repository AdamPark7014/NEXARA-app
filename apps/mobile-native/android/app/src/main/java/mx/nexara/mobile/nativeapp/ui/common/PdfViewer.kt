package mx.nexara.mobile.nativeapp.ui.common

import android.graphics.Bitmap
import android.graphics.pdf.PdfRenderer
import android.os.ParcelFileDescriptor
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.dp
import java.io.Closeable
import java.io.File
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.isActive
import kotlinx.coroutines.withContext
import mx.nexara.mobile.nativeapp.data.api.toUserMessage

/**
 * Visor PDF nativo (android.graphics.pdf.PdfRenderer), sin dependencias externas.
 *
 * Cada página se pinta cuando entra en pantalla y al ancho de la pantalla. Antes se pintaban
 * todas de golpe al doble de resolución: con una cotización de 5 páginas daba igual, pero un
 * PDF adjunto de 25 MB y 80 páginas se comía cientos de MB y cerraba la app.
 */
@Composable
fun PdfViewer(
    file: File,
    modifier: Modifier = Modifier,
) {
    var documento by remember(file.absolutePath) { mutableStateOf<PdfDocumento?>(null) }
    var error by remember(file.absolutePath) { mutableStateOf<String?>(null) }

    LaunchedEffect(file.absolutePath) {
        try {
            // Sin cancelar a medias: si la pantalla ya se fue, el PDF se cierra aquí y no queda abierto.
            val abierto = withContext(NonCancellable + Dispatchers.IO) { PdfDocumento(file) }
            if (isActive) documento = abierto else abierto.close()
        } catch (e: Exception) {
            error = e.toUserMessage("No se pudo abrir el PDF")
        }
    }
    DisposableEffect(file.absolutePath) {
        onDispose { documento?.close() }
    }

    val doc = documento
    when {
        error != null -> Text(error!!, color = MaterialTheme.colorScheme.error, modifier = Modifier.padding(16.dp))
        doc == null -> Box(modifier.fillMaxSize(), contentAlignment = Alignment.Center) { CircularProgressIndicator() }
        else -> BoxWithConstraints(modifier.fillMaxSize().background(Color(0xFFE2E8F0))) {
            val anchoPx = with(LocalDensity.current) { maxWidth.roundToPx() }.coerceIn(320, 2048)
            LazyColumn(
                modifier = Modifier.fillMaxSize(),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                items(doc.paginas) { indice ->
                    PaginaPdf(doc, indice, anchoPx)
                }
            }
        }
    }
}

@Composable
private fun PaginaPdf(doc: PdfDocumento, indice: Int, anchoPx: Int) {
    val proporcion = doc.proporcion(indice)
    val bitmap by produceState<Bitmap?>(null, doc, indice, anchoPx) {
        value = withContext(Dispatchers.IO) { runCatching { doc.pintar(indice, anchoPx) }.getOrNull() }
    }
    val bmp = bitmap
    if (bmp == null) {
        Box(
            Modifier.fillMaxWidth().aspectRatio(proporcion).background(Color.White),
            contentAlignment = Alignment.Center,
        ) {
            CircularProgressIndicator(modifier = Modifier.size(24.dp), strokeWidth = 2.dp)
        }
    } else {
        Image(
            bitmap = bmp.asImageBitmap(),
            contentDescription = "Página ${indice + 1}",
            modifier = Modifier.fillMaxWidth().aspectRatio(proporcion),
        )
    }
}

/**
 * El PDF abierto. `PdfRenderer` solo admite una página abierta a la vez y no es seguro entre
 * hilos: todo pasa por el mismo candado, y cerrar espera a que acabe la página en curso.
 */
private class PdfDocumento(file: File) : Closeable {
    private val candado = Any()
    private val descriptor = ParcelFileDescriptor.open(file, ParcelFileDescriptor.MODE_READ_ONLY)
    private val renderer: PdfRenderer = try {
        PdfRenderer(descriptor)
    } catch (e: Exception) {
        descriptor.close()
        throw e
    }
    private var cerrado = false

    val paginas: Int = renderer.pageCount

    /** Ancho / alto de cada página, para reservar su hueco antes de pintarla. */
    private val proporciones: FloatArray = FloatArray(paginas) { i ->
        synchronized(candado) {
            val pagina = renderer.openPage(i)
            try {
                if (pagina.height > 0) pagina.width.toFloat() / pagina.height else CARTA
            } finally {
                pagina.close()
            }
        }
    }

    fun proporcion(indice: Int): Float = proporciones.getOrElse(indice) { CARTA }.takeIf { it > 0f } ?: CARTA

    fun pintar(indice: Int, anchoPx: Int): Bitmap? {
        synchronized(candado) {
            if (cerrado) return null
            val pagina = renderer.openPage(indice)
            try {
                val alto = (anchoPx / proporcion(indice)).toInt().coerceAtLeast(1)
                val bmp = Bitmap.createBitmap(anchoPx, alto, Bitmap.Config.ARGB_8888)
                // Las páginas sin fondo saldrían transparentes (negras en algunos teléfonos).
                bmp.eraseColor(android.graphics.Color.WHITE)
                pagina.render(bmp, null, null, PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY)
                return bmp
            } finally {
                pagina.close()
            }
        }
    }

    override fun close() {
        synchronized(candado) {
            if (cerrado) return
            cerrado = true
            runCatching { renderer.close() }
            runCatching { descriptor.close() }
        }
    }

    private companion object {
        /** Carta vertical (612 × 792 pt). */
        const val CARTA = 612f / 792f
    }
}

@Composable
fun PdfViewerScreen(
    file: File,
    title: String,
    onClose: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Column(modifier.fillMaxSize()) {
        Row(
            Modifier.fillMaxWidth().padding(horizontal = 8.dp, vertical = 4.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            TextButton(onClick = onClose) { Text("Cerrar") }
            Text(title, style = MaterialTheme.typography.titleMedium, modifier = Modifier.weight(1f))
        }
        PdfViewer(file = file, modifier = Modifier.weight(1f))
    }
}
