package mx.nexara.mobile.nativeapp.data.vehicles

import android.content.Context
import android.util.Base64
import mx.nexara.mobile.nativeapp.data.AuthRepository
import mx.nexara.mobile.nativeapp.data.api.ApiClient
import mx.nexara.mobile.nativeapp.data.api.FichaVehiculoDto
import mx.nexara.mobile.nativeapp.data.api.MisVehiculosDto
import mx.nexara.mobile.nativeapp.data.api.SolicitarVehiculoBody
import mx.nexara.mobile.nativeapp.data.api.TableroLeidoDto
import mx.nexara.mobile.nativeapp.data.api.TicketLeidoDto
import mx.nexara.mobile.nativeapp.data.api.VehiclesApi
import mx.nexara.mobile.nativeapp.data.api.VehiculoFichaApi
import mx.nexara.mobile.nativeapp.ui.common.GeoPhoto
import mx.nexara.mobile.nativeapp.ui.console.vehiculos.ChecklistVehiculoRules
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.MultipartBody
import okhttp3.RequestBody
import okhttp3.RequestBody.Companion.toRequestBody

/**
 * Vehículos de Core: lo mío, solicitar, y el checklist de salida/devolución.
 *
 * Las siete fotos van como partes multipart con el nombre de su casilla
 * (`frontal`, `tablero`, …) y su hora y GPS dentro de `meta`. Las fotos llegan
 * de [GeoPhoto], es decir, de la cámara en vivo: no hay galería en ningún punto
 * del flujo, y una foto sin `capturedAt` la rechaza el servidor.
 */
class VehiclesRepository(context: Context) {
    private val authRepo = AuthRepository(context)
    private val api: VehiclesApi = ApiClient.authed(
        tokenProvider = { authRepo.token() },
        companyIdProvider = { authRepo.companyId() },
    ).create(VehiclesApi::class.java)

    // Sin cola offline: leer una foto o subir un ticket no sirve sin red, y la cola contestaría
    // `{"queued":true}` a una pantalla que espera lo leído.
    private val fichaApi: VehiculoFichaApi = ApiClient.authed(
        tokenProvider = { authRepo.token() },
        companyIdProvider = { authRepo.companyId() },
        withOffline = false,
    ).create(VehiculoFichaApi::class.java)

    private val textMedia = "text/plain".toMediaType()
    private val jpegMedia = "image/jpeg".toMediaType()

    suspend fun misVehiculos(): MisVehiculosDto = api.misVehiculos()

    suspend fun solicitar(
        actividadId: Long,
        vehicleId: Long,
        motivoUso: String,
        fechaInicioSolicitada: String,
        fechaFinSolicitada: String,
    ) {
        api.solicitar(
            SolicitarVehiculoBody(
                actividadId = actividadId,
                vehicleId = vehicleId,
                motivoUso = motivoUso.trim(),
                fechaInicioSolicitada = fechaInicioSolicitada.trim(),
                fechaFinSolicitada = fechaFinSolicitada.trim(),
            ),
        ).close()
    }

    /** Salida de una solicitud aprobada (`id` = la asignación). */
    suspend fun salida(asignacionId: Long, checklist: ChecklistEnvio) {
        api.startUse(
            id = asignacionId,
            meta = checklist.metaBody(),
            odometroKm = checklist.odometroBody(),
            combustible = checklist.combustibleBody(),
            fotos = checklist.partes(),
        ).close()
    }

    /** Devolución de una solicitud (`id` = la asignación). */
    suspend fun devolucion(asignacionId: Long, checklist: ChecklistEnvio) {
        api.endUse(
            id = asignacionId,
            meta = checklist.metaBody(),
            odometroKm = checklist.odometroBody(),
            combustible = checklist.combustibleBody(),
            fotos = checklist.partes(),
        ).close()
    }

    /** Salida directa desde inventario (`id` = el vehículo). */
    suspend fun salidaInventario(vehicleId: Long, checklist: ChecklistEnvio) {
        api.inventoryCheckout(
            id = vehicleId,
            meta = checklist.metaBody(),
            odometroKm = checklist.odometroBody(),
            combustible = checklist.combustibleBody(),
            fotos = checklist.partes(),
        ).close()
    }

    /** Devolución directa a inventario (`id` = el vehículo). */
    suspend fun devolucionInventario(vehicleId: Long, checklist: ChecklistEnvio) {
        api.inventoryReturn(
            id = vehicleId,
            meta = checklist.metaBody(),
            odometroKm = checklist.odometroBody(),
            combustible = checklist.combustibleBody(),
            fotos = checklist.partes(),
        ).close()
    }

    suspend fun ficha(vehicleId: Long): FichaVehiculoDto = fichaApi.ficha(vehicleId)

    /** `odometroPrevio`: el servidor descarta una lectura menor, porque un odómetro no retrocede. */
    suspend fun leerTablero(foto: GeoPhoto, odometroPrevio: Int?): TableroLeidoDto =
        fichaApi.leerTablero(
            tipo = "TABLERO".toRequestBody(textMedia),
            odometroPrevio = odometroPrevio?.toString()?.toRequestBody(textMedia),
            foto = parteFoto("foto", foto) ?: error("Foto sin datos"),
        )

    suspend fun leerTicket(foto: GeoPhoto): TicketLeidoDto =
        fichaApi.leerTicket(
            tipo = "TICKET".toRequestBody(textMedia),
            foto = parteFoto("foto", foto) ?: error("Foto sin datos"),
        )

    /** Las dos fotos son opcionales para el servidor: si la cámara falló, la carga se guarda a mano. */
    suspend fun registrarCarga(
        vehicleId: Long,
        odometro: Int,
        litros: Double,
        importe: Double,
        tanqueLleno: Boolean,
        ticket: GeoPhoto?,
        tablero: GeoPhoto?,
    ) {
        fichaApi.registrarCarga(
            id = vehicleId,
            odometro = odometro.toString().toRequestBody(textMedia),
            litros = litros.toString().toRequestBody(textMedia),
            importe = importe.toString().toRequestBody(textMedia),
            tanqueLleno = tanqueLleno.toString().toRequestBody(textMedia),
            fotos = listOfNotNull(
                ticket?.let { parteFoto("ticket", it) },
                tablero?.let { parteFoto("tablero", it) },
            ),
        ).close()
    }

    private fun parteFoto(campo: String, foto: GeoPhoto): MultipartBody.Part? {
        val bytes = jpegBytes(foto.dataUrl) ?: return null
        return MultipartBody.Part.createFormData(campo, "$campo.jpg", bytes.toRequestBody(jpegMedia))
    }

    /** Lo que el flujo del checklist entrega ya listo para armar el multipart. */
    inner class ChecklistEnvio(
        val fotos: Map<String, GeoPhoto>,
        val odometroKm: Int,
        val combustible: String,
    ) {
        internal fun metaBody(): RequestBody =
            ChecklistVehiculoRules.metaJson(fotos.mapValues { (_, f) -> f.meta() })
                .toRequestBody(textMedia)

        internal fun odometroBody(): RequestBody = odometroKm.toString().toRequestBody(textMedia)

        internal fun combustibleBody(): RequestBody = combustible.trim().toRequestBody(textMedia)

        /** Una parte por casilla, en el orden de las reglas; sin hora no se manda. */
        internal fun partes(): List<MultipartBody.Part> =
            ChecklistVehiculoRules.SLOTS.mapNotNull { slot ->
                val foto = fotos[slot.id]?.takeIf { it.capturedAt.isNotBlank() } ?: return@mapNotNull null
                val bytes = jpegBytes(foto.dataUrl) ?: return@mapNotNull null
                MultipartBody.Part.createFormData(
                    slot.id,
                    "${slot.id}.jpg",
                    bytes.toRequestBody(jpegMedia),
                )
            }
    }

    fun checklist(
        fotos: Map<String, GeoPhoto>,
        odometroKm: Int,
        combustible: String,
    ): ChecklistEnvio = ChecklistEnvio(fotos, odometroKm, combustible)

    private companion object {
        /** `data:image/jpeg;base64,…` → bytes. Sin coma no hay foto que mandar. */
        fun jpegBytes(dataUrl: String): ByteArray? {
            val comma = dataUrl.indexOf(',')
            if (comma < 0) return null
            return runCatching { Base64.decode(dataUrl.substring(comma + 1), Base64.NO_WRAP) }.getOrNull()
        }
    }
}

/** La hora y el GPS con que se tomó la foto, tal como viajan en `meta`. */
fun GeoPhoto.meta(): ChecklistVehiculoRules.SlotMeta = ChecklistVehiculoRules.SlotMeta(
    capturedAt = capturedAt,
    lat = latitude,
    lng = longitude,
)
