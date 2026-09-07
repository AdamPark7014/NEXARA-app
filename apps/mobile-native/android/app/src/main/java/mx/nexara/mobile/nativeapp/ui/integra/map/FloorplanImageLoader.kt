package mx.nexara.mobile.nativeapp.ui.integra.map

import android.graphics.BitmapFactory
import android.util.Base64
import androidx.compose.runtime.Composable
import androidx.compose.runtime.State
import androidx.compose.runtime.produceState
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asImageBitmap
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import mx.nexara.mobile.nativeapp.data.integra.map.FloorplanImageData
import mx.nexara.mobile.nativeapp.data.integra.map.MapViewport

/** En qué punto está la imagen del plano. */
sealed interface FloorplanImageState {
    data object Loading : FloorplanImageState

    data class Ready(
        val bitmap: ImageBitmap,
        val aspectRatio: Float,
    ) : FloorplanImageState

    /** No se puede enseñar, y se dice por qué. Nunca un recuadro en blanco. */
    data class Unavailable(val reason: String) : FloorplanImageState
}

/**
 * Decodifica el plano fuera del hilo principal.
 *
 * Tres cosas que no son opcionales aquí:
 *
 *  1. **Nada de esto puede pasar en el hilo principal.** Un plano de planta es
 *     una imagen grande dentro de un JSON: base64 a bytes y bytes a mapa de bits
 *     son decenas de milisegundos con la pantalla congelada.
 *  2. **Se mide antes de cargar.** `inJustDecodeBounds` da el tamaño real sin
 *     reservar memoria; con él se calcula el submuestreo. Un plano de un CAD
 *     exportado a 8000 px de ancho tumbaría la aplicación por falta de memoria,
 *     y el teléfono no necesita más resolución de la que la pantalla enseña.
 *  3. **Un fallo se cuenta.** Base64 corrupto o formato que Android no conoce
 *     devuelven [FloorplanImageState.Unavailable] con motivo, no `null` mudo.
 */
@Composable
fun rememberFloorplanImage(imageData: String?): State<FloorplanImageState> =
    produceState<FloorplanImageState>(initialValue = FloorplanImageState.Loading, imageData) {
        value = FloorplanImageState.Loading
        value = withContext(Dispatchers.Default) { decodeFloorplan(imageData) }
    }

/** Máximo lado que se conserva. Por encima, se submuestrea en potencias de dos. */
private const val MAX_DIMENSION = 2048

internal fun decodeFloorplan(imageData: String?): FloorplanImageState {
    if (imageData.isNullOrBlank()) {
        return FloorplanImageState.Unavailable("Este plano no tiene imagen guardada.")
    }
    if (FloorplanImageData.isRemoteUrl(imageData)) {
        return FloorplanImageState.Unavailable(
            "El plano está guardado como enlace y no como imagen incrustada. " +
                "Ábrelo en la consola web.",
        )
    }
    val payload = FloorplanImageData.parse(imageData)
        ?: return FloorplanImageState.Unavailable(
            "La imagen del plano no está en un formato que se pueda abrir aquí.",
        )

    val bytes = runCatching { Base64.decode(payload.base64, Base64.DEFAULT) }.getOrNull()
    if (bytes == null || bytes.isEmpty()) {
        return FloorplanImageState.Unavailable("La imagen del plano llegó dañada.")
    }

    val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
    BitmapFactory.decodeByteArray(bytes, 0, bytes.size, bounds)
    if (bounds.outWidth <= 0 || bounds.outHeight <= 0) {
        return FloorplanImageState.Unavailable(
            "El archivo guardado como plano no es una imagen que Android sepa leer.",
        )
    }

    val options = BitmapFactory.Options().apply {
        inSampleSize = sampleSizeFor(bounds.outWidth, bounds.outHeight)
    }
    val bitmap = runCatching { BitmapFactory.decodeByteArray(bytes, 0, bytes.size, options) }
        .getOrNull()
        ?: return FloorplanImageState.Unavailable("No hubo memoria para abrir el plano.")

    return FloorplanImageState.Ready(
        bitmap = bitmap.asImageBitmap(),
        // La proporción sale del tamaño ORIGINAL: el submuestreo la conserva,
        // pero medirla aquí evita que un redondeo corra los pines.
        aspectRatio = MapViewport.aspectRatio(bounds.outWidth, bounds.outHeight),
    )
}

/** Potencia de dos más pequeña que deja los dos lados bajo [MAX_DIMENSION]. */
internal fun sampleSizeFor(width: Int, height: Int, max: Int = MAX_DIMENSION): Int {
    if (width <= 0 || height <= 0 || max <= 0) return 1
    var sample = 1
    while (width / sample > max || height / sample > max) {
        sample *= 2
    }
    return sample
}
