package mx.nexara.mobile.nativeapp.data.api

import android.util.Base64
import mx.nexara.mobile.nativeapp.ui.common.GeoPhoto
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.MultipartBody
import okhttp3.RequestBody
import okhttp3.RequestBody.Companion.toRequestBody

private val TEXTO = "text/plain".toMediaType()
private val JPEG = "image/jpeg".toMediaType()

/** Un campo de texto de un multipart. */
internal fun textoMultipart(valor: String): RequestBody = valor.toRequestBody(TEXTO)

/** `data:image/jpeg;base64,…` de la cámara en vivo → la parte binaria que espera el `FilesInterceptor`. */
internal fun GeoPhoto.parteJpeg(campo: String, archivo: String): MultipartBody.Part {
    val coma = dataUrl.indexOf(',')
    val bytes = if (coma < 0) {
        ByteArray(0)
    } else {
        runCatching { Base64.decode(dataUrl.substring(coma + 1), Base64.NO_WRAP) }.getOrDefault(ByteArray(0))
    }
    return MultipartBody.Part.createFormData(campo, archivo, bytes.toRequestBody(JPEG))
}
