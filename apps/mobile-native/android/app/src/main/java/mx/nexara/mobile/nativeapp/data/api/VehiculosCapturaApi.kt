package mx.nexara.mobile.nativeapp.data.api

import okhttp3.MultipartBody
import okhttp3.RequestBody
import okhttp3.ResponseBody
import retrofit2.Response
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.Multipart
import retrofit2.http.PATCH
import retrofit2.http.POST
import retrofit2.http.Part
import retrofit2.http.Path
import retrofit2.http.Query

/**
 * Captura guiada de vehículo (21-11-2026) — espejo de las rutas nuevas de `apps/api/src/vehicles` y
 * de `apps/web/lib/vehiculos-captura.ts`.
 *
 * - La salida y la devolución con la captura de 5 pasos van a las mismas cuatro rutas de siempre
 *   (`start-use`, `end-use`, `inventory/{id}/checkout`, `inventory/{id}/return`) con `capturaVersion=2`,
 *   los 12 cuadros/fotos, el video `video-vuelta` y `meta`. Las partes las arma
 *   `CapturaGuiadaRules.camposTexto` + `CapturaGuiadaRepository`.
 * - El bloque «Vehículo» de la actividad, las firmas, y la mesa de daños e incidencias de Liz.
 *
 * Todo anulable con valor por omisión: un null del API no puede tumbar la pantalla.
 */

data class PasoCapturaDto(
    val paso: Int? = null,
    val id: String? = null,
    val etiqueta: String? = null,
    val instruccion: String? = null,
)

data class VistaCapturaDto(
    val slot: String? = null,
    val etiqueta: String? = null,
)

data class RangoSegDto(val min: Int? = null, val max: Int? = null)

data class UltimoRegistroKmDto(
    val km: Int? = null,
    val en: String? = null,
    val origen: String? = null,
)

/** `GET vehicles/captura-guiada?vehiculo=`. [exigida] = interruptor prendido: la salida solo entra con la captura guiada. */
data class CapturaGuiadaInfoDto(
    val exigida: Boolean? = null,
    val pasos: List<PasoCapturaDto>? = null,
    val vistasVuelta: List<VistaCapturaDto>? = null,
    val fotos: List<VistaCapturaDto>? = null,
    val campoVideo: String? = null,
    val duracionVueltaSeg: RangoSegDto? = null,
    val ultimoRegistro: UltimoRegistroKmDto? = null,
) {
    val esExigida: Boolean get() = exigida == true
}

// ── Bloque «Vehículo» de la actividad ───────────────────────────────────────

data class PersonaRefDto(val id: Long? = null, val nombre: String? = null)

data class UnidadRefDto(val id: Long? = null, val nombre: String? = null, val placas: String? = null)

data class FotoRegistradaDto(
    val slot: String? = null,
    val url: String? = null,
    val capturedAt: String? = null,
    val lat: Double? = null,
    val lng: Double? = null,
)

data class MomentoRegistradoDto(
    val en: String? = null,
    val km: Int? = null,
    val combustiblePct: Int? = null,
    val fotos: List<FotoRegistradaDto>? = null,
    val videoUrl: String? = null,
)

/** `KM_SIN_REGISTRO`, `KM_DE_MAS`, `LECTURA_CORREGIDA` o `KM_MENOR`; [mensaje] ya viene en español. */
data class AlertaKmDto(
    val tipo: String? = null,
    val km: Int? = null,
    val mensaje: String? = null,
    val en: String? = null,
)

data class FirmaDto(
    val url: String? = null,
    val nombre: String? = null,
    val userId: Long? = null,
    val firmadoEn: String? = null,
    val registradoPorId: Long? = null,
)

/** Firmas por momento (`salida`/`devolucion`) y rol (`entrega`/`recibe`). */
data class FirmasUsoDto(
    val salida: Map<String, FirmaDto>? = null,
    val devolucion: Map<String, FirmaDto>? = null,
)

data class DanosResumenDto(
    val estatus: String? = null,
    val propuestos: Int? = null,
    val confirmados: Int? = null,
)

data class IncidenciaResumenDto(
    val id: Long? = null,
    val tipo: String? = null,
    val estatus: String? = null,
    val descripcion: String? = null,
    val quienPaga: String? = null,
    val costo: Double? = null,
)

data class UsoDeActividadDto(
    val id: Long? = null,
    val estatus: String? = null,
    val aprobacion: String? = null,
    val capturaVersion: Int? = null,
    val unidad: UnidadRefDto? = null,
    val solicitante: PersonaRefDto? = null,
    val encargado: PersonaRefDto? = null,
    val regresoPrevisto: String? = null,
    val salida: MomentoRegistradoDto? = null,
    val devolucion: MomentoRegistradoDto? = null,
    val kmRecorridos: Int? = null,
    val kmEsperados: Int? = null,
    val alertasKm: List<AlertaKmDto>? = null,
    val firmas: FirmasUsoDto? = null,
    val danos: DanosResumenDto? = null,
    val incidencias: List<IncidenciaResumenDto>? = null,
    /** `null` = a este rol no le toca ver montos. */
    val costoIncidencias: Double? = null,
    /** Lo que el libro de costos cargó al viaje; solo dirección. */
    val costoViaje: Double? = null,
) {
    /** Para el aviso «devuelve la unidad» al cerrar la actividad. */
    val sigueFuera: Boolean
        get() = estatus == "En uso" || (salida != null && devolucion == null)
}

data class ActividadRefDto(
    val id: Long? = null,
    val folio: String? = null,
    val titulo: String? = null,
    val estatus: String? = null,
)

data class VehiculosDeActividadDto(
    val actividad: ActividadRefDto? = null,
    val usos: List<UsoDeActividadDto>? = null,
)

// ── Daños que propone la IA (Liz) ───────────────────────────────────────────

data class ActividadCortaDto(val id: Long? = null, val anNumber: String? = null, val titulo: String? = null)

data class ControlDeHallazgoDto(
    val id: Long? = null,
    val nombreVehiculo: String? = null,
    val placasVehiculo: String? = null,
    val fechaFin: String? = null,
    val odometroInicio: Int? = null,
    val odometroFin: Int? = null,
    val kmEsperados: Int? = null,
    val vehiculo: UnidadRefDto? = null,
    val solicitante: PersonaRefDto? = null,
    val encargado: PersonaRefDto? = null,
    val actividad: ActividadCortaDto? = null,
)

data class IncidenciaRefDto(val id: Long? = null, val estatus: String? = null)

/** [severidad] `leve` · `media` · `grave`; [estatus] `PROPUESTO` · `CONFIRMADO` · `DESCARTADO`. */
data class HallazgoDanoDto(
    val id: Long? = null,
    val controlId: Long? = null,
    val zona: String? = null,
    val etiquetaZona: String? = null,
    val descripcion: String? = null,
    val severidad: String? = null,
    val confianza: Double? = null,
    val fotoSalidaUrl: String? = null,
    val fotoDevolucionUrl: String? = null,
    val estatus: String? = null,
    val motivoDescarte: String? = null,
    val createdAt: String? = null,
    val control: ControlDeHallazgoDto? = null,
    val incidencia: IncidenciaRefDto? = null,
)

data class HallazgosDto(val hallazgos: List<HallazgoDanoDto>? = null)

/**
 * `PATCH vehicles/danos/{id}`. Confirmar: [responsableId], [costoEstimado], [quienPaga]
 * (`EMPRESA` · `RESPONSABLE` · `SEGURO`). Descartar: [motivo] (`YA_ESTABA` · `REFLEJO_O_SUCIEDAD` ·
 * `NO_ES_DANO` · `OTRO`).
 */
data class RevisarDanoBody(
    val accion: String,
    val motivo: String? = null,
    val responsableId: Long? = null,
    val costoEstimado: Double? = null,
    val quienPaga: String? = null,
    val nota: String? = null,
)

data class AnalisisDanosDto(val estatus: String? = null, val hallazgos: Int? = null)

// ── Incidencias ─────────────────────────────────────────────────────────────

data class ControlDeIncidenciaDto(val id: Long? = null, val actividad: ActividadCortaDto? = null)

/** [cobroEstatus] `PENDIENTE` · `APROBADO` · `RECHAZADO`, o null si no se le cobra a nadie. */
data class IncidenciaVehiculoDto(
    val id: Long? = null,
    val tipo: String? = null,
    val descripcion: String? = null,
    val estatus: String? = null,
    val quienPaga: String? = null,
    val cobroEstatus: String? = null,
    val costoEstimado: Double? = null,
    val costoReal: Double? = null,
    val fotos: List<String>? = null,
    val createdAt: String? = null,
    val vehiculo: UnidadRefDto? = null,
    val responsable: PersonaRefDto? = null,
    val control: ControlDeIncidenciaDto? = null,
)

data class IncidenciasDto(val incidencias: List<IncidenciaVehiculoDto>? = null)

/** [tipo] `DANO` · `MULTA` · `FALLA` · `KM_SIN_REGISTRO` · `RETRASO` · `OTRO`. */
data class CrearIncidenciaBody(
    val tipo: String,
    val descripcion: String,
    val vehicleAssetId: Long? = null,
    val controlId: Long? = null,
    val responsableId: Long? = null,
    val costoEstimado: Double? = null,
    val quienPaga: String? = null,
)

/** Solo los campos que cambian; Moshi omite los null. */
data class ActualizarIncidenciaBody(
    val estatus: String? = null,
    val costoEstimado: Double? = null,
    val costoReal: Double? = null,
    val quienPaga: String? = null,
    val responsableId: Long? = null,
)

data class DecisionCobroBody(val decision: String)

interface VehiculosCapturaApi {
    @GET("vehicles/captura-guiada")
    suspend fun capturaGuiada(@Query("vehiculo") vehiculoId: Long?): CapturaGuiadaInfoDto

    @GET("vehicles/por-actividad/{actividadId}")
    suspend fun porActividad(@Path("actividadId") actividadId: Long): VehiculosDeActividadDto

    /**
     * Las cuatro rutas de siempre con la captura guiada: [partes] trae los campos de texto
     * (`capturaVersion`, `meta`, `odometroKm`, `combustible`, …), las 12 imágenes y el video.
     * [ruta] es `vehicles/{id}/start-use`, `vehicles/{id}/end-use`,
     * `vehicles/inventory/{id}/checkout` o `vehicles/inventory/{id}/return`. Se lee la respuesta
     * completa para saber si la cola sin señal la guardó (`X-Nexara-Offline: queued`).
     */
    @Multipart
    @POST("{ruta}")
    suspend fun enviarCaptura(
        @Path(value = "ruta", encoded = true) ruta: String,
        @Part partes: List<MultipartBody.Part>,
    ): Response<ResponseBody>

    @Multipart
    @POST("vehicles/{usoId}/firmas")
    suspend fun registrarFirma(
        @Path("usoId") usoId: Long,
        @Part("momento") momento: RequestBody,
        @Part("rol") rol: RequestBody,
        @Part("nombre") nombre: RequestBody,
        @Part("userId") userId: RequestBody?,
        @Part firma: MultipartBody.Part,
    ): ResponseBody

    @GET("vehicles/danos")
    suspend fun danos(@Query("estatus") estatus: String?, @Query("uso") usoId: Long?): HallazgosDto

    @PATCH("vehicles/danos/{id}")
    suspend fun revisarDano(@Path("id") id: Long, @Body body: RevisarDanoBody): ResponseBody

    @POST("vehicles/{usoId}/analizar-danos")
    suspend fun analizarDanos(@Path("usoId") usoId: Long): AnalisisDanosDto

    @GET("vehicles/incidencias")
    suspend fun incidencias(
        @Query("estatus") estatus: String?,
        @Query("vehiculo") vehiculoId: Long?,
        @Query("responsable") responsableId: Long?,
    ): IncidenciasDto

    @POST("vehicles/incidencias")
    suspend fun crearIncidencia(@Body body: CrearIncidenciaBody): IncidenciaVehiculoDto

    @PATCH("vehicles/incidencias/{id}")
    suspend fun actualizarIncidencia(@Path("id") id: Long, @Body body: ActualizarIncidenciaBody): IncidenciaVehiculoDto

    @PATCH("vehicles/incidencias/{id}/cobro")
    suspend fun revisarCobro(@Path("id") id: Long, @Body body: DecisionCobroBody): IncidenciaVehiculoDto
}
