package mx.nexara.mobile.nativeapp.data.console

import android.content.Context
import android.net.Uri
import android.provider.OpenableColumns
import android.webkit.MimeTypeMap
import java.io.File
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import mx.nexara.mobile.nativeapp.data.AuthRepository
import mx.nexara.mobile.nativeapp.data.api.ActividadAdjuntosApi
import mx.nexara.mobile.nativeapp.data.api.AdjuntoDto
import mx.nexara.mobile.nativeapp.data.api.ApiClient
import mx.nexara.mobile.nativeapp.ui.common.MIME_GENERICO
import mx.nexara.mobile.nativeapp.ui.common.mimeDeArchivo
import mx.nexara.mobile.nativeapp.ui.common.nombreDeArchivoSeguro
import mx.nexara.mobile.nativeapp.ui.console.activities.ActividadAdjuntosRules
import okhttp3.MediaType.Companion.toMediaTypeOrNull
import okhttp3.MultipartBody
import okhttp3.RequestBody.Companion.asRequestBody

/** Un archivo elegido, ya copiado a la caché y revisado, listo para mandarse. */
data class ArchivoPorSubir(val nombre: String, val mime: String, val archivo: File)

/** Lo que se puede subir y, aparte, el aviso de lo que no (tipo no aceptado, más de 25 MB…). */
data class PreparacionDeSubida(val listos: List<ArchivoPorSubir>, val rechazos: List<String>)

/** Lo que sí subió y, si un lote falló a la mitad, por qué. */
data class ResultadoDeSubida(val subidos: List<AdjuntoDto>, val error: Throwable?)

/**
 * Archivos de evidencia de una actividad (`activities/:id/adjuntos`).
 *
 * La lista va por el cliente de siempre (con caché offline: sin señal se ve lo último que hubo).
 * Subir, quitar, bajar y la vista previa van **sin** la capa offline: una subida encolada
 * contestaría `{"queued":true}` en vez de la lista, y la caché guardaría los bytes como texto.
 */
class ActividadAdjuntosRepository(context: Context) {
    private val appContext = context.applicationContext
    private val authRepo = AuthRepository(appContext)

    private val api: ActividadAdjuntosApi = ApiClient.authed(
        tokenProvider = { authRepo.token() },
        companyIdProvider = { authRepo.companyId() },
    ).create(ActividadAdjuntosApi::class.java)

    private val enLinea: ActividadAdjuntosApi = ApiClient.authed(
        tokenProvider = { authRepo.token() },
        companyIdProvider = { authRepo.companyId() },
        withOffline = false,
    ).create(ActividadAdjuntosApi::class.java)

    suspend fun lista(activityId: Long): List<AdjuntoDto> =
        withContext(Dispatchers.IO) { api.lista(activityId) }

    suspend fun archivo(activityId: Long, adjuntoId: Long): ByteArray =
        withContext(Dispatchers.IO) { enLinea.archivo(activityId, adjuntoId).use { it.bytes() } }

    suspend fun vistaPrevia(activityId: Long, adjuntoId: Long): String =
        withContext(Dispatchers.IO) { enLinea.vistaPrevia(activityId, adjuntoId).use { it.string() } }

    suspend fun quitar(activityId: Long, adjuntoId: Long) {
        withContext(Dispatchers.IO) { enLinea.quitar(activityId, adjuntoId).close() }
    }

    /**
     * Lee lo elegido en el selector: nombre real (`DISPLAY_NAME`, no el `document:1234` de la
     * URI), tamaño y tipo. Lo que no se puede subir se avisa antes de mandar nada; lo demás se
     * copia a la caché (así el reintento tras renovar la sesión puede volver a leerlo).
     */
    suspend fun preparar(uris: List<Uri>): PreparacionDeSubida = withContext(Dispatchers.IO) {
        val resolver = appContext.contentResolver
        val dir = File(appContext.cacheDir, "adjuntos-subida/${System.nanoTime()}").apply { mkdirs() }
        val listos = mutableListOf<ArchivoPorSubir>()
        val rechazos = mutableListOf<String>()
        uris.forEachIndexed { indice, uri ->
            var nombre: String? = null
            var tamano: Long? = null
            runCatching {
                resolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE), null, null, null)
                    ?.use { c ->
                        if (c.moveToFirst()) {
                            val iNombre = c.getColumnIndex(OpenableColumns.DISPLAY_NAME)
                            val iTamano = c.getColumnIndex(OpenableColumns.SIZE)
                            if (iNombre >= 0 && !c.isNull(iNombre)) nombre = c.getString(iNombre)
                            if (iTamano >= 0 && !c.isNull(iTamano)) tamano = c.getLong(iTamano)
                        }
                    }
            }
            val tipoUri = resolver.getType(uri)
            var limpio = nombreDeArchivoSeguro(nombre?.trim()?.ifEmpty { null } ?: "archivo-${indice + 1}")
            if (ActividadAdjuntosRules.extension(limpio).isEmpty()) {
                // Sin extensión el API no sabe qué es: se toma la del tipo que da Android.
                MimeTypeMap.getSingleton().getExtensionFromMimeType(tipoUri)?.let { limpio = "$limpio.$it" }
            }
            ActividadAdjuntosRules.motivoRechazo(limpio, tamano)?.let {
                rechazos += it
                return@forEachIndexed
            }
            val destino = File(dir, "${indice + 1}-$limpio")
            val copiado = runCatching { copiarConTope(uri, destino) }.getOrNull()
            when {
                copiado == null -> rechazos += "No se pudo leer «$limpio»."
                copiado > ActividadAdjuntosRules.MAX_BYTES -> {
                    destino.delete()
                    rechazos += ActividadAdjuntosRules.motivoRechazo(limpio, copiado).orEmpty()
                }
                else -> {
                    val mime = mimeDeArchivo(limpio).takeIf { it != MIME_GENERICO } ?: tipoUri ?: MIME_GENERICO
                    listos += ArchivoPorSubir(limpio, mime, destino)
                }
            }
        }
        if (listos.isEmpty()) dir.deleteRecursively()
        PreparacionDeSubida(listos, rechazos.filter { it.isNotBlank() })
    }

    /**
     * Copia la URI a `destino` y devuelve los bytes leídos. Se detiene al pasar el tope (más un
     * byte): si el proveedor no dijo el tamaño, no se copia entero un video de 2 GB para nada.
     */
    private fun copiarConTope(uri: Uri, destino: File): Long {
        val tope = ActividadAdjuntosRules.MAX_BYTES + 1
        var total = 0L
        val entrada = appContext.contentResolver.openInputStream(uri) ?: error("sin contenido")
        entrada.use { input ->
            destino.outputStream().use { output ->
                val buffer = ByteArray(64 * 1024)
                while (total < tope) {
                    val leidos = input.read(buffer)
                    if (leidos < 0) break
                    output.write(buffer, 0, leidos)
                    total += leidos
                }
            }
        }
        return total
    }

    /**
     * Manda los archivos en lotes de 10 (el máximo del API por envío). Si un lote falla, lo de
     * los lotes anteriores ya quedó arriba y se devuelve junto con el error.
     */
    suspend fun subir(activityId: Long, archivos: List<ArchivoPorSubir>): ResultadoDeSubida =
        withContext(Dispatchers.IO) {
            val subidos = mutableListOf<AdjuntoDto>()
            var error: Throwable? = null
            try {
                for (lote in archivos.chunked(ActividadAdjuntosRules.MAX_POR_ENVIO)) {
                    val partes = lote.map { a ->
                        MultipartBody.Part.createFormData(
                            "files",
                            a.nombre,
                            a.archivo.asRequestBody(a.mime.toMediaTypeOrNull()),
                        )
                    }
                    try {
                        subidos += enLinea.subir(activityId, partes)
                    } catch (e: Exception) {
                        if (e is CancellationException) throw e
                        error = e
                        break
                    }
                }
            } finally {
                archivos.mapNotNull { it.archivo.parentFile }.toSet().forEach { it.deleteRecursively() }
            }
            ResultadoDeSubida(subidos, error)
        }
}
