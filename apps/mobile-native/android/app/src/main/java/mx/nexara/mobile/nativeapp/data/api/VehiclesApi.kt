package mx.nexara.mobile.nativeapp.data.api

import okhttp3.MultipartBody
import okhttp3.RequestBody
import okhttp3.ResponseBody
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.Multipart
import retrofit2.http.PATCH
import retrofit2.http.POST
import retrofit2.http.Part
import retrofit2.http.Path
import retrofit2.http.Query

/**
 * Vehículos de Core (`/erp/vehiculos`) — espejo de `apps/api/src/vehicles`.
 *
 * Salida y devolución se mandan como multipart con las **siete** fotos del
 * checklist (`ChecklistVehiculoRules.SLOTS`) más `meta`, `odometroKm` y
 * `combustible`. El servidor rechaza cualquier foto sin `capturedAt`: así es
 * como se niegan las subidas de galería, por eso la app solo toma fotos con
 * cámara en vivo (`LiveCameraCaptureDialog`).
 *
 * Todos los campos van anulables con valor por omisión: un null del API no
 * puede tumbar la pantalla.
 */

data class VehiculoRefDto(
    val id: Long? = null,
    val nombre: String? = null,
    val placas: String? = null,
)

data class ConductorRefDto(
    val id: Long? = null,
    val nombre: String? = null,
)

/** El trabajo al que se carga el viaje en curso. La salida directa de inventario no trae. */
data class ActividadDeViajeDto(
    val id: Long? = null,
    val folio: String? = null,
    val titulo: String? = null,
    val proyecto: String? = null,
)

/**
 * La asignación que traes encima ahora mismo. [origen] es `solicitud` (salió de
 * una solicitud aprobada) o `inventario` (salida directa de la flota); de ahí
 * depende a qué endpoint van la salida y la devolución.
 */
data class AsignacionActivaDto(
    val id: Long? = null,
    val origen: String? = null,
    val vehiculo: VehiculoRefDto? = null,
    val actividad: ActividadDeViajeDto? = null,
    val inicio: String? = null,
    val fin: String? = null,
    val odometroInicio: Int? = null,
    val combustibleInicioPct: Int? = null,
    val requiereSalida: Boolean? = null,
    val requiereDevolucion: Boolean? = null,
) {
    val esInventario: Boolean get() = origen?.trim()?.lowercase() == "inventario"
    val pideSalida: Boolean get() = requiereSalida == true
    val pideDevolucion: Boolean get() = requiereDevolucion == true
}

data class SolicitudResumenDto(
    val id: Long? = null,
    val nombreVehiculo: String? = null,
    val placasVehiculo: String? = null,
    val estatusAprobacion: String? = null,
    val entregaEstatus: String? = null,
    val fechaInicioSolicitada: String? = null,
    val fechaFinSolicitada: String? = null,
)

data class VehiculoFlotaDto(
    val id: Long? = null,
    val nombre: String? = null,
    val placas: String? = null,
    val estatus: String? = null,
    val activo: Boolean? = null,
    val disponible: Boolean? = null,
    val conductor: ConductorRefDto? = null,
    val desde: String? = null,
    val proximaDevolucion: String? = null,
    val odometroUltimo: Int? = null,
    val combustibleUltimoPct: Int? = null,
    val gpsProveedor: String? = null,
    val tieneRastreador: Boolean? = null,
)

/** `GET vehicles/mis-vehiculos`. */
data class MisVehiculosDto(
    val activa: AsignacionActivaDto? = null,
    val solicitudes: List<SolicitudResumenDto>? = null,
    val disponibles: List<VehiculoFlotaDto>? = null,
)

/** `POST vehicles` — solicitar un vehículo para una actividad. */
data class SolicitarVehiculoBody(
    val actividadId: Long,
    val vehicleId: Long,
    val motivoUso: String,
    val fechaInicioSolicitada: String,
    val fechaFinSolicitada: String,
)

/** Una fila de `GET vehicles`: quién pidió qué unidad, para qué y si ya la aprobaron. */
data class SolicitudVehiculoDto(
    val id: Long? = null,
    /** `Pendiente` · `Aprobado` · `Rechazado`. Sigue `Pendiente` mientras falten pasos de la cadena. */
    val estatusAprobacion: String? = null,
    val nombreVehiculo: String? = null,
    val placasVehiculo: String? = null,
    val motivoUso: String? = null,
    val fechaInicioSolicitada: String? = null,
    val fechaFinSolicitada: String? = null,
    val solicitante: ConductorRefDto? = null,
    val vehiculo: VehiculoRefDto? = null,
    val actividad: HerramientaActividadDto? = null,
)

/** `PATCH vehicles/:id/approve`. [action]: `approve` · `reject`. */
data class DecidirSolicitudBody(
    val action: String,
    val note: String? = null,
)

/** `POST vehicles/inventory`: una unidad nueva, `Disponible` para que cualquiera la saque. */
data class AltaUnidadBody(
    val nombre: String,
    val placas: String? = null,
    val notas: String? = null,
)

/** `POST vehicles/ficha/leer-foto` con `tipo=TABLERO`. Lo que no se pudo leer llega en null. */
data class TableroLeidoDto(
    val odometroKm: Int? = null,
    val combustible: String? = null,
    val legible: Boolean? = null,
)

/** `POST vehicles/ficha/leer-foto` con `tipo=TICKET`. [revisar]: litros × precio no da el total. */
data class TicketLeidoDto(
    val litros: Double? = null,
    val importe: Double? = null,
    val legible: Boolean? = null,
    val revisar: Boolean? = null,
)

data class OdometroFichaDto(val km: Int? = null)

/** De cada carga solo se lee lo que mide el rendimiento: el importe no se pide a propósito. */
data class CargaFichaDto(
    val odometro: Int? = null,
    val litros: Double? = null,
    val tanqueLleno: Boolean? = null,
)

data class AccesoFichaDto(val veCostos: Boolean? = null)

/** Lo que estas pantallas usan de `GET vehicles/ficha/{id}`; el resto de la ficha no se decodifica. */
data class FichaVehiculoDto(
    val odometro: OdometroFichaDto? = null,
    val cargas: List<CargaFichaDto>? = null,
    val acceso: AccesoFichaDto? = null,
)

/** `GET vehicles/flotilla`: toda la flota, con quién trae cada vehículo. */
data class FlotillaListaDto(val vehiculos: List<VehiculoFlotaDto>? = null)

data class RenglonRepartoDto(val km: Double? = null, val importe: Double? = null)

data class RepartoMesDto(
    val proyectos: RenglonRepartoDto? = null,
    val cotizaciones: RenglonRepartoDto? = null,
    val oficina: RenglonRepartoDto? = null,
    val sinLigar: RenglonRepartoDto? = null,
    val parado: Double? = null,
)

data class ResumenMesDto(
    val km: Double? = null,
    val costoMes: Double? = null,
    val porKm: Double? = null,
    val aIndirectos: Double? = null,
)

data class ProximoServicioDto(
    val km: Double? = null,
    val faltanKm: Double? = null,
    val fecha: String? = null,
    val estado: String? = null,
)

data class VehiculoDelMesDto(
    val id: Long? = null,
    val kmDelMes: Double? = null,
    val porKm: Double? = null,
    val rendimientoReal: Double? = null,
    val rendimientoOficial: Double? = null,
    val proximoServicio: ProximoServicioDto? = null,
)

data class AvisoFlotillaDto(
    val tono: String? = null,
    val titulo: String? = null,
    val texto: String? = null,
    val vehicleId: Long? = null,
)

/** `GET vehicles/ficha/flotilla`. Los importes llegan en null a quien no ve costos. */
data class FlotillaMesDto(
    val mes: String? = null,
    val vehiculos: List<VehiculoDelMesDto>? = null,
    val reparto: RepartoMesDto? = null,
    val resumen: ResumenMesDto? = null,
    val avisos: List<AvisoFlotillaDto>? = null,
    val acceso: AccesoFichaDto? = null,
)

data class RendimientoFichaDto(val usado: Double? = null, val real: Double? = null, val oficial: Double? = null)

data class CargaDireccionDto(
    val id: Long? = null,
    val fecha: String? = null,
    val odometro: Int? = null,
    val litros: Double? = null,
    val importe: Double? = null,
    val tanqueLleno: Boolean? = null,
)

data class ActividadRefDto(val id: Long? = null, val folio: String? = null, val titulo: String? = null)

data class DestinoViajeDto(val tipo: String? = null, val nombre: String? = null)

data class ViajeFichaDto(
    val id: Long? = null,
    val fecha: String? = null,
    val actividad: ActividadRefDto? = null,
    val destino: DestinoViajeDto? = null,
    val km: Double? = null,
    val importe: Double? = null,
    val sinFoto: Boolean? = null,
)

data class ServicioFichaDto(
    val id: Long? = null,
    val fecha: String? = null,
    val concepto: String? = null,
    val costo: Double? = null,
    val proveedor: String? = null,
)

data class DesgloseCostoDto(val clave: String? = null, val nombre: String? = null, val importe: Double? = null)

data class MantenimientoFichaDto(val apartado: Double? = null, val gastado: Double? = null)

data class CostosFichaDto(
    val porKm: Double? = null,
    val desglose: List<DesgloseCostoDto>? = null,
    val mantenimiento: MantenimientoFichaDto? = null,
)

/** `GET vehicles/ficha/{id}` para la vista de dirección: lo mismo que la web, con importes. */
data class FichaDireccionDto(
    val odometro: OdometroFichaDto? = null,
    val rendimiento: RendimientoFichaDto? = null,
    val cargas: List<CargaDireccionDto>? = null,
    val viajes: List<ViajeFichaDto>? = null,
    val servicios: List<ServicioFichaDto>? = null,
    val proximoServicio: ProximoServicioDto? = null,
    val costos: CostosFichaDto? = null,
)

/**
 * Ficha del vehículo, lectura de fotos y cargas de gasolina (`apps/api/src/costos/vehiculos`).
 * La IA solo la llama el servidor: aquí viaja la foto y regresa lo que entendió.
 */
interface VehiculoFichaApi {
    @GET("vehicles/ficha/{id}")
    suspend fun ficha(@Path("id") id: Long): FichaVehiculoDto

    @GET("vehicles/ficha/{id}")
    suspend fun fichaDireccion(@Path("id") id: Long): FichaDireccionDto

    @GET("vehicles/ficha/flotilla")
    suspend fun flotillaMes(@Query("mes") mes: String?): FlotillaMesDto

    @Multipart
    @POST("vehicles/ficha/leer-foto")
    suspend fun leerTablero(
        @Part("tipo") tipo: RequestBody,
        @Part("odometroPrevio") odometroPrevio: RequestBody?,
        @Part foto: MultipartBody.Part,
    ): TableroLeidoDto

    @Multipart
    @POST("vehicles/ficha/leer-foto")
    suspend fun leerTicket(
        @Part("tipo") tipo: RequestBody,
        @Part foto: MultipartBody.Part,
    ): TicketLeidoDto

    /** Devuelve la ficha completa; aquí no hace falta. */
    @Multipart
    @POST("vehicles/ficha/{id}/cargas")
    suspend fun registrarCarga(
        @Path("id") id: Long,
        @Part("odometro") odometro: RequestBody,
        @Part("litros") litros: RequestBody,
        @Part("importe") importe: RequestBody,
        @Part("tanqueLleno") tanqueLleno: RequestBody,
        @Part fotos: List<MultipartBody.Part>,
    ): ResponseBody
}

interface VehiclesApi {
    @GET("vehicles/mis-vehiculos")
    suspend fun misVehiculos(): MisVehiculosDto

    @GET("vehicles/flotilla")
    suspend fun flotilla(): FlotillaListaDto

    @POST("vehicles")
    suspend fun solicitar(@Body body: SolicitarVehiculoBody): ResponseBody

    /** Las solicitudes que el rol puede ver (`vehicles.view`). */
    @GET("vehicles")
    suspend fun solicitudes(): List<SolicitudVehiculoDto>

    /** `vehicles.review`. Contesta la solicitud ya decidida. */
    @PATCH("vehicles/{id}/approve")
    suspend fun decidirSolicitud(@Path("id") id: Long, @Body body: DecidirSolicitudBody): SolicitudVehiculoDto

    /** `vehicles.inventory`. */
    @POST("vehicles/inventory")
    suspend fun altaUnidad(@Body body: AltaUnidadBody): ResponseBody

    /** Salida de una solicitud aprobada. [fotos] trae las 7 partes del checklist. */
    @Multipart
    @POST("vehicles/{id}/start-use")
    suspend fun startUse(
        @Path("id") id: Long,
        @Part("meta") meta: RequestBody,
        @Part("odometroKm") odometroKm: RequestBody,
        @Part("combustible") combustible: RequestBody,
        @Part fotos: List<MultipartBody.Part>,
    ): ResponseBody

    /** Devolución de una solicitud: el km final no puede ser menor al inicial. */
    @Multipart
    @POST("vehicles/{id}/end-use")
    suspend fun endUse(
        @Path("id") id: Long,
        @Part("meta") meta: RequestBody,
        @Part("odometroKm") odometroKm: RequestBody,
        @Part("combustible") combustible: RequestBody,
        @Part fotos: List<MultipartBody.Part>,
    ): ResponseBody

    /** Salida directa desde inventario (sin solicitud): `{id}` es el vehículo. */
    @Multipart
    @POST("vehicles/inventory/{id}/checkout")
    suspend fun inventoryCheckout(
        @Path("id") id: Long,
        @Part("meta") meta: RequestBody,
        @Part("odometroKm") odometroKm: RequestBody,
        @Part("combustible") combustible: RequestBody,
        @Part fotos: List<MultipartBody.Part>,
    ): ResponseBody

    /** Devolución directa a inventario. */
    @Multipart
    @POST("vehicles/inventory/{id}/return")
    suspend fun inventoryReturn(
        @Path("id") id: Long,
        @Part("meta") meta: RequestBody,
        @Part("odometroKm") odometroKm: RequestBody,
        @Part("combustible") combustible: RequestBody,
        @Part fotos: List<MultipartBody.Part>,
    ): ResponseBody
}
