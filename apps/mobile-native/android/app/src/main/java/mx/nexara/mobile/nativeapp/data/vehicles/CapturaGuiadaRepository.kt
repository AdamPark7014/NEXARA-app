package mx.nexara.mobile.nativeapp.data.vehicles

import android.content.Context
import android.util.Base64
import mx.nexara.mobile.nativeapp.data.AuthRepository
import mx.nexara.mobile.nativeapp.data.api.ActualizarIncidenciaBody
import mx.nexara.mobile.nativeapp.data.api.AnalisisDanosDto
import mx.nexara.mobile.nativeapp.data.api.ApiClient
import mx.nexara.mobile.nativeapp.data.api.CapturaGuiadaInfoDto
import mx.nexara.mobile.nativeapp.data.api.CrearIncidenciaBody
import mx.nexara.mobile.nativeapp.data.api.DecisionCobroBody
import mx.nexara.mobile.nativeapp.data.api.HallazgoDanoDto
import mx.nexara.mobile.nativeapp.data.api.IncidenciaVehiculoDto
import mx.nexara.mobile.nativeapp.data.api.RevisarDanoBody
import mx.nexara.mobile.nativeapp.data.api.VehiculosCapturaApi
import mx.nexara.mobile.nativeapp.data.api.VehiculosDeActividadDto
import mx.nexara.mobile.nativeapp.ui.common.GeoPhoto
import mx.nexara.mobile.nativeapp.ui.console.vehiculos.CapturaGuiadaRules
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.MultipartBody
import okhttp3.RequestBody.Companion.asRequestBody
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject
import retrofit2.HttpException
import java.io.File

/**
 * Captura guiada de 5 pasos, bloque «Vehículo» de la actividad, firmas, y la mesa de daños e
 * incidencias de Liz. Espejo de `apps/web/lib/vehiculos-captura.ts`.
 *
 * La salida y la devolución viajan con la cola sin señal (igual que el checklist de 7 fotos): en un
 * estacionamiento sin cobertura la captura se guarda y sale sola al volver la red. El servidor acepta
 * tomas de hasta 12 horas. Firmar, revisar daños y las incidencias van sin cola: dependen de cómo
 * estén las cosas en ese momento y la pantalla necesita la respuesta.
 */
class CapturaGuiadaRepository(context: Context) {
    private val authRepo = AuthRepository(context)

    private val api: VehiculosCapturaApi = ApiClient.authed(
        tokenProvider = { authRepo.token() },
        companyIdProvider = { authRepo.companyId() },
    ).create(VehiculosCapturaApi::class.java)

    private val apiSinCola: VehiculosCapturaApi = ApiClient.authed(
        tokenProvider = { authRepo.token() },
        companyIdProvider = { authRepo.companyId() },
        withOffline = false,
    ).create(VehiculosCapturaApi::class.java)

    private val textMedia = "text/plain".toMediaType()
    private val jpegMedia = "image/jpeg".toMediaType()
    private val pngMedia = "image/png".toMediaType()
    private val mp4Media = "video/mp4".toMediaType()

    /** A qué ruta va la captura: de una solicitud aprobada (`id` = el uso) o de inventario (`id` = la unidad). */
    enum class Destino(private val plantilla: String) {
        SALIDA("vehicles/%d/start-use"),
        DEVOLUCION("vehicles/%d/end-use"),
        SALIDA_INVENTARIO("vehicles/inventory/%d/checkout"),
        DEVOLUCION_INVENTARIO("vehicles/inventory/%d/return"),
        ;

        fun ruta(id: Long): String = plantilla.format(id)
    }

    /** Lo que la pantalla de 5 pasos entrega ya capturado. */
    class Envio(
        /** 8 cuadros de la vuelta (de [CuadrosVuelta]) + las 4 fotos, en JPEG, por slot. */
        val imagenes: Map<String, ByteArray>,
        /** Hora y GPS de cada imagen, por slot. */
        val tomas: Map<String, CapturaGuiadaRules.Toma>,
        val video: File,
        val videoMeta: CapturaGuiadaRules.Video,
        val odometroKm: Int,
        val combustible: String,
        val lecturaIa: CapturaGuiadaRules.LecturaIa? = null,
        /** Solo cuenta si quien registra revisa vehículos (Liz): el km anterior estaba mal. */
        val forzarKm: Boolean = false,
        /** Salida de inventario: a qué actividad va y quién responde. */
        val actividadId: Long? = null,
        val encargadoId: Long? = null,
    )

    /** [encolada] = sin señal, sale sola al volver la red. [usoId] sirve para firmar en seguida. */
    data class Resultado(val encolada: Boolean, val usoId: Long?)

    suspend fun info(vehiculoId: Long?): CapturaGuiadaInfoDto = api.capturaGuiada(vehiculoId)

    suspend fun porActividad(actividadId: Long): VehiculosDeActividadDto = api.porActividad(actividadId)

    /**
     * Valida con las mismas reglas que la API y manda. Lanza [IllegalArgumentException] con el texto
     * para la persona si falta algo; los errores del servidor salen como [HttpException].
     */
    suspend fun enviar(destino: Destino, id: Long, envio: Envio, kmAnterior: Int? = null): Resultado {
        val validacion = CapturaGuiadaRules.validar(
            tomas = envio.tomas.filterKeys { envio.imagenes.containsKey(it) },
            video = envio.videoMeta.copy(bytes = envio.video.takeIf { it.exists() }?.length() ?: 0L),
            odometroKm = envio.odometroKm,
            combustible = envio.combustible,
            kmAnterior = kmAnterior,
            forzarKm = envio.forzarKm,
        )
        validacion.mensaje?.let { throw IllegalArgumentException(it) }

        val respuesta = api.enviarCaptura(destino.ruta(id), partes(envio))
        if (!respuesta.isSuccessful) throw HttpException(respuesta)
        val encolada = respuesta.headers()["X-Nexara-Offline"] == "queued"
        val cuerpo = respuesta.body()?.use { it.string() }.orEmpty()
        val usoId = when {
            encolada -> null
            destino == Destino.SALIDA || destino == Destino.DEVOLUCION -> id
            else -> leerUsoId(cuerpo)
        }
        return Resultado(encolada, usoId)
    }

    internal fun partes(envio: Envio): List<MultipartBody.Part> = buildList {
        CapturaGuiadaRules.camposTexto(
            tomas = envio.tomas,
            video = envio.videoMeta,
            odometroKm = envio.odometroKm,
            combustible = envio.combustible,
            lecturaIa = envio.lecturaIa,
            forzarKm = envio.forzarKm,
            actividadId = envio.actividadId,
            encargadoId = envio.encargadoId,
        ).forEach { (campo, valor) -> add(MultipartBody.Part.createFormData(campo, valor)) }
        for (slot in CapturaGuiadaRules.SLOTS) {
            val bytes = envio.imagenes[slot] ?: continue
            add(MultipartBody.Part.createFormData(slot, "$slot.jpg", bytes.toRequestBody(jpegMedia)))
        }
        add(
            MultipartBody.Part.createFormData(
                CapturaGuiadaRules.CAMPO_VIDEO,
                "${CapturaGuiadaRules.CAMPO_VIDEO}.mp4",
                envio.video.asRequestBody(mp4Media),
            ),
        )
    }

    /** Firma de quien entrega o recibe, dibujada en el teléfono (PNG). */
    suspend fun firmar(
        usoId: Long,
        momento: String,
        rol: String,
        nombre: String,
        userId: Long?,
        firmaPng: ByteArray,
    ) {
        val limpio = nombre.trim()
        require(limpio.isNotEmpty()) { "Escribe el nombre de quien firma" }
        apiSinCola.registrarFirma(
            usoId = usoId,
            momento = momento.toRequestBody(textMedia),
            rol = rol.toRequestBody(textMedia),
            nombre = limpio.toRequestBody(textMedia),
            userId = userId?.takeIf { it > 0 }?.toString()?.toRequestBody(textMedia),
            firma = MultipartBody.Part.createFormData("firma", "firma.png", firmaPng.toRequestBody(pngMedia)),
        ).close()
    }

    // ── Liz: daños e incidencias ────────────────────────────────────────────

    suspend fun danos(estatus: String? = "PROPUESTO", usoId: Long? = null): List<HallazgoDanoDto> =
        apiSinCola.danos(estatus, usoId).hallazgos.orEmpty()

    suspend fun confirmarDano(
        id: Long,
        responsableId: Long?,
        costoEstimado: Double?,
        quienPaga: String,
        nota: String? = null,
    ) {
        apiSinCola.revisarDano(
            id,
            RevisarDanoBody(
                accion = "confirmar",
                responsableId = responsableId,
                costoEstimado = costoEstimado,
                quienPaga = quienPaga,
                nota = nota?.trim()?.takeIf { it.isNotEmpty() },
            ),
        ).close()
    }

    suspend fun descartarDano(id: Long, motivo: String, nota: String? = null) {
        apiSinCola.revisarDano(
            id,
            RevisarDanoBody(accion = "descartar", motivo = motivo, nota = nota?.trim()?.takeIf { it.isNotEmpty() }),
        ).close()
    }

    suspend fun analizarDanos(usoId: Long): AnalisisDanosDto = apiSinCola.analizarDanos(usoId)

    suspend fun incidencias(estatus: String? = null, vehiculoId: Long? = null, responsableId: Long? = null): List<IncidenciaVehiculoDto> =
        apiSinCola.incidencias(estatus, vehiculoId, responsableId).incidencias.orEmpty()

    suspend fun crearIncidencia(body: CrearIncidenciaBody): IncidenciaVehiculoDto {
        require(body.descripcion.trim().length >= 5) { "Describe qué pasó" }
        return apiSinCola.crearIncidencia(body.copy(descripcion = body.descripcion.trim()))
    }

    suspend fun actualizarIncidencia(id: Long, cambios: ActualizarIncidenciaBody): IncidenciaVehiculoDto =
        apiSinCola.actualizarIncidencia(id, cambios)

    /** Cobrar el daño al responsable: solo dirección. */
    suspend fun revisarCobro(id: Long, aprobar: Boolean): IncidenciaVehiculoDto =
        apiSinCola.revisarCobro(id, DecisionCobroBody(if (aprobar) "APROBADO" else "RECHAZADO"))

    companion object {
        /** La salida de inventario contesta la unidad con `usoId` cuando abrió un uso. */
        internal fun leerUsoId(json: String): Long? =
            runCatching { JSONObject(json).optLong("usoId", 0L).takeIf { it > 0 } }.getOrNull()

        /** Una foto de la cámara en vivo → bytes JPEG + su hora y GPS, listos para [Envio]. */
        fun desdeFoto(foto: GeoPhoto): Pair<ByteArray, CapturaGuiadaRules.Toma>? {
            val coma = foto.dataUrl.indexOf(',')
            if (coma < 0 || foto.capturedAt.isBlank()) return null
            val bytes = runCatching { Base64.decode(foto.dataUrl.substring(coma + 1), Base64.NO_WRAP) }.getOrNull()
                ?: return null
            return bytes to CapturaGuiadaRules.Toma(foto.capturedAt, foto.latitude, foto.longitude)
        }
    }
}
