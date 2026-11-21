package mx.nexara.mobile.nativeapp.data.vehicles

import android.graphics.Bitmap
import android.graphics.Matrix
import android.media.MediaMetadataRetriever
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import mx.nexara.mobile.nativeapp.ui.console.vehiculos.CapturaGuiadaRules
import java.io.ByteArrayOutputStream
import java.io.File

/**
 * Saca los 8 cuadros de la vuelta del video grabado en el teléfono, con los mismos tiempos que la web
 * y iOS (`CapturaGuiadaRules.tiemposCuadros`: el centro de cada octavo). Corre fuera del hilo
 * principal; un cuadro tarda unas décimas porque se decodifica el más cercano, no el keyframe.
 */
object CuadrosVuelta {

    class Resultado(
        val duracionMs: Long,
        /** JPEG por slot (`vuelta-1` … `vuelta-8`), en el orden de la vuelta. */
        val cuadros: Map<String, ByteArray>,
    ) {
        val duracionSeg: Double get() = duracionMs / 1000.0
    }

    /** Solo la duración, para el contador y para validar antes de extraer. */
    suspend fun duracionMs(video: File): Long? = withContext(Dispatchers.IO) {
        val r = MediaMetadataRetriever()
        try {
            r.setDataSource(video.absolutePath)
            r.extractMetadata(MediaMetadataRetriever.METADATA_KEY_DURATION)?.toLongOrNull()
        } catch (_: RuntimeException) {
            null
        } finally {
            runCatching { r.release() }
        }
    }

    /**
     * @param anchoMax el lado largo del cuadro; 1280 basta para ver un rayón y no infla la subida.
     * @throws IllegalStateException con el texto para la persona si el video no se puede leer.
     */
    suspend fun extraer(video: File, anchoMax: Int = 1280, calidad: Int = 85): Resultado =
        withContext(Dispatchers.Default) {
            val r = MediaMetadataRetriever()
            try {
                try {
                    r.setDataSource(video.absolutePath)
                } catch (e: RuntimeException) {
                    throw IllegalStateException("No se pudo leer el video de la vuelta; vuelve a grabarlo", e)
                }
                val duracionMs = r.extractMetadata(MediaMetadataRetriever.METADATA_KEY_DURATION)?.toLongOrNull()
                    ?: throw IllegalStateException("No se pudo leer el video de la vuelta; vuelve a grabarlo")
                val rotacion = r.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_ROTATION)?.toIntOrNull() ?: 0
                val anchoVideo = r.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_WIDTH)?.toIntOrNull() ?: 0
                val altoVideo = r.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_HEIGHT)?.toIntOrNull() ?: 0

                val tiempos = CapturaGuiadaRules.tiemposCuadrosUs(duracionMs)
                val cuadros = LinkedHashMap<String, ByteArray>()
                tiempos.forEachIndexed { i, us ->
                    val crudo = r.getFrameAtTime(us, MediaMetadataRetriever.OPTION_CLOSEST)
                        ?: r.getFrameAtTime(us, MediaMetadataRetriever.OPTION_CLOSEST_SYNC)
                        ?: throw IllegalStateException("No se pudo sacar un cuadro del video; vuelve a grabarlo")
                    val derecho = enderezar(crudo, rotacion, anchoVideo, altoVideo)
                    val chico = reducir(derecho, anchoMax)
                    cuadros[CapturaGuiadaRules.SLOTS_VUELTA[i]] = jpeg(chico, calidad)
                    if (chico !== derecho) chico.recycle()
                    if (derecho !== crudo) derecho.recycle()
                    crudo.recycle()
                }
                Resultado(duracionMs, cuadros)
            } finally {
                runCatching { r.release() }
            }
        }

    /**
     * Algunos teléfonos devuelven el cuadro sin aplicar la rotación del video (grabado en vertical
     * pero guardado en horizontal). Si el cuadro sigue con la forma del video sin rotar, se gira.
     */
    private fun enderezar(cuadro: Bitmap, rotacion: Int, anchoVideo: Int, altoVideo: Int): Bitmap {
        if (rotacion % 180 == 0 || anchoVideo <= 0 || altoVideo <= 0) return cuadro
        val sinRotar = (cuadro.width > cuadro.height) == (anchoVideo > altoVideo)
        if (!sinRotar) return cuadro
        val m = Matrix().apply { postRotate(rotacion.toFloat()) }
        return Bitmap.createBitmap(cuadro, 0, 0, cuadro.width, cuadro.height, m, true)
    }

    private fun reducir(cuadro: Bitmap, ladoMax: Int): Bitmap {
        val lado = maxOf(cuadro.width, cuadro.height)
        if (lado <= ladoMax) return cuadro
        val f = ladoMax.toFloat() / lado
        return Bitmap.createScaledBitmap(cuadro, (cuadro.width * f).toInt(), (cuadro.height * f).toInt(), true)
    }

    private fun jpeg(cuadro: Bitmap, calidad: Int): ByteArray {
        val out = ByteArrayOutputStream()
        cuadro.compress(Bitmap.CompressFormat.JPEG, calidad, out)
        return out.toByteArray()
    }
}
