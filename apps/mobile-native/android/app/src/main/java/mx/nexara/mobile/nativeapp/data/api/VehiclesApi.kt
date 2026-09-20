package mx.nexara.mobile.nativeapp.data.api

import okhttp3.MultipartBody
import okhttp3.RequestBody
import okhttp3.ResponseBody
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.Multipart
import retrofit2.http.POST
import retrofit2.http.Part
import retrofit2.http.Path

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

/**
 * La asignación que traes encima ahora mismo. [origen] es `solicitud` (salió de
 * una solicitud aprobada) o `inventario` (salida directa de la flota); de ahí
 * depende a qué endpoint van la salida y la devolución.
 */
data class AsignacionActivaDto(
    val id: Long? = null,
    val origen: String? = null,
    val vehiculo: VehiculoRefDto? = null,
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

interface VehiclesApi {
    @GET("vehicles/mis-vehiculos")
    suspend fun misVehiculos(): MisVehiculosDto

    @POST("vehicles")
    suspend fun solicitar(@Body body: SolicitarVehiculoBody): ResponseBody

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
