package mx.nexara.mobile.nativeapp.ui.common

import android.content.ContentValues
import android.content.Context
import android.net.Uri
import android.provider.MediaStore
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

data class CapturedMedia(val uri: Uri, val mimeType: String)

private fun freshCameraOutputUri(context: Context): Uri {
    val timestamp = SimpleDateFormat("yyyyMMdd_HHmmss", Locale.US).format(Date())
    val values = ContentValues().apply {
        put(MediaStore.Images.Media.DISPLAY_NAME, "NEXARA_$timestamp.jpg")
        put(MediaStore.Images.Media.MIME_TYPE, "image/jpeg")
        put(MediaStore.Images.Media.RELATIVE_PATH, "Pictures/NEXARA")
    }
    return context.contentResolver.insert(
        MediaStore.Images.Media.EXTERNAL_CONTENT_URI,
        values,
    ) ?: Uri.EMPTY
}

/**
 * Botonera para capturar/adjuntar evidencias: cámara, fotos, o documentos (PDF/Excel).
 * Devuelve una lista de URIs seleccionadas.
 */
@Composable
fun MediaPickerBar(
    onPicked: (List<CapturedMedia>) -> Unit,
    modifier: Modifier = Modifier,
    allowDocuments: Boolean = true,
) {
    val context = LocalContext.current
    var pendingCameraUri by remember { mutableStateOf<Uri?>(null) }

    val cameraLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.TakePicture()
    ) { success: Boolean ->
        val uri = pendingCameraUri
        if (success && uri != null) onPicked(listOf(CapturedMedia(uri, "image/jpeg")))
    }

    val photoPicker = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.PickMultipleVisualMedia()
    ) { uris: List<Uri> ->
        val resolver = context.contentResolver
        val results = uris.map { CapturedMedia(it, resolver.getType(it) ?: "image/*") }
        if (results.isNotEmpty()) onPicked(results)
    }

    val docPicker = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.OpenMultipleDocuments()
    ) { uris: List<Uri> ->
        val resolver = context.contentResolver
        val results = uris.map {
            CapturedMedia(it, resolver.getType(it) ?: "application/octet-stream")
        }
        if (results.isNotEmpty()) onPicked(results)
    }

    Row(
        modifier = modifier.fillMaxWidth().padding(vertical = 4.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        OutlinedButton(
            onClick = {
                val uri = freshCameraOutputUri(context)
                if (uri != Uri.EMPTY) {
                    pendingCameraUri = uri
                    cameraLauncher.launch(uri)
                }
            },
        ) { Text("📷 Cámara") }

        OutlinedButton(
            onClick = {
                photoPicker.launch(
                    androidx.activity.result.PickVisualMediaRequest(
                        ActivityResultContracts.PickVisualMedia.ImageAndVideo
                    )
                )
            },
        ) { Text("🖼 Galería") }

        if (allowDocuments) {
            OutlinedButton(
                onClick = {
                    docPicker.launch(
                        arrayOf(
                            "application/pdf",
                            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                            "application/vnd.ms-excel",
                            "application/msword",
                            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                            "image/*",
                        )
                    )
                },
            ) { Text("📎 Archivo") }
        }
    }
}
