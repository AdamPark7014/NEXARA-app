package mx.nexara.mobile.nativeapp.ui.common

import android.graphics.Bitmap
import android.graphics.pdf.PdfRenderer
import android.os.ParcelFileDescriptor
import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.File

/**
 * Visor PDF nativo (usa android.graphics.pdf.PdfRenderer). Renderiza todas
 * las páginas como bitmaps scrollables. Sin dependencias externas.
 */
@Composable
fun PdfViewer(
    file: File,
    modifier: Modifier = Modifier,
) {
    var pages by remember { mutableStateOf<List<Bitmap>>(emptyList()) }
    var error by remember { mutableStateOf<String?>(null) }

    LaunchedEffect(file.absolutePath) {
        try {
            pages = withContext(Dispatchers.IO) { renderPdfPages(file) }
        } catch (e: Exception) {
            error = e.message ?: "No se pudo abrir el PDF"
        }
    }

    if (error != null) {
        Text(error!!, color = MaterialTheme.colorScheme.error, modifier = Modifier.padding(16.dp))
        return
    }

    LazyColumn(
        modifier = modifier.fillMaxSize(),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        items(pages) { bmp ->
            Column(modifier = Modifier.fillMaxWidth()) {
                Image(
                    bitmap = bmp.asImageBitmap(),
                    contentDescription = null,
                    modifier = Modifier.fillMaxWidth(),
                )
            }
        }
    }
}

private fun renderPdfPages(file: File): List<Bitmap> {
    val fd = ParcelFileDescriptor.open(file, ParcelFileDescriptor.MODE_READ_ONLY)
    val renderer = PdfRenderer(fd)
    val result = mutableListOf<Bitmap>()
    try {
        val density = 2 // resolución: multiplicador sobre 72dpi
        for (i in 0 until renderer.pageCount) {
            val page = renderer.openPage(i)
            val width = page.width * density
            val height = page.height * density
            val bmp = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
            page.render(bmp, null, null, PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY)
            result.add(bmp)
            page.close()
        }
    } finally {
        renderer.close()
        fd.close()
    }
    return result
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
            verticalAlignment = androidx.compose.ui.Alignment.CenterVertically,
        ) {
            TextButton(onClick = onClose) { Text("Cerrar") }
            Text(title, style = MaterialTheme.typography.titleMedium, modifier = Modifier.weight(1f))
        }
        PdfViewer(file = file, modifier = Modifier.weight(1f))
    }
}
