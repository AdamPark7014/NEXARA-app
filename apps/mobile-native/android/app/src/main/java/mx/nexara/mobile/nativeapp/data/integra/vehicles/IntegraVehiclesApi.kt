package mx.nexara.mobile.nativeapp.data.integra.vehicles

import retrofit2.http.Body
import retrofit2.http.DELETE
import retrofit2.http.GET
import retrofit2.http.PATCH
import retrofit2.http.POST
import retrofit2.http.Path
import retrofit2.http.Query

/**
 * Endpoints de vehículos y ANPR.
 *
 * Va aparte de `data/api/IntegraApi.kt` porque ese fichero es propiedad de otro
 * turno y no se toca. Comparte base URL (`…/api/`) y el mismo `ApiClient.authed`,
 * así que hereda token, `X-Company-Id` y reintentos.
 *
 * Todas las rutas están verificadas contra
 * `apps/api/src/integra/integra.controller.ts` el 2026-09-06.
 */
interface IntegraVehiclesApi {

    /** `GET integra/vehicles` — controller:1259. `live=1` fuerza lectura de plataforma. */
    @GET("integra/vehicles")
    suspend fun listVehicles(
        @Query("live") live: String? = null,
        @Query("siteId") siteId: Int? = null,
    ): VehiculosResponse

    /** `POST integra/vehicles` — controller:1272. Ojo: en la rama ISAPI es un `upsert`. */
    @POST("integra/vehicles")
    suspend fun addVehicle(
        @Body body: VehiculoWriteRequest,
        @Query("siteId") siteId: Int? = null,
    ): VehiculoMutacionResponse

    /** `PATCH integra/vehicles/:id` — controller:1288. */
    @PATCH("integra/vehicles/{id}")
    suspend fun updateVehicle(
        @Path("id") vehicleId: String,
        @Body body: VehiculoWriteRequest,
        @Query("siteId") siteId: Int? = null,
    ): VehiculoMutacionResponse

    /** `DELETE integra/vehicles/:id` — controller:1304. */
    @DELETE("integra/vehicles/{id}")
    suspend fun deleteVehicle(
        @Path("id") vehicleId: String,
        @Query("siteId") siteId: Int? = null,
    ): VehiculoMutacionResponse

    /** `GET integra/people` — padrón para asignar dueño. */
    @GET("integra/people")
    suspend fun listPeople(
        @Query("live") live: String? = null,
        @Query("siteId") siteId: Int? = null,
    ): PersonasResponse

    /** `GET integra/cameras` — controller:566. Da nombre legible al `cameraIndexCode`. */
    @GET("integra/cameras")
    suspend fun listCameras(
        @Query("live") live: String? = null,
        @Query("siteId") siteId: Int? = null,
    ): CamarasResponse

    /**
     * `POST integra/anpr/cross-records` — controller:2303.
     *
     * Solo responde en sitios con proveedor ARTEMIS. En ISAPI el servidor lanza
     * `BadRequestException` («Operación Artemis no disponible en sitio ISAPI»),
     * que llega como HTTP 400. No se simula nada en su lugar.
     */
    @POST("integra/anpr/cross-records")
    suspend fun anprCrossRecords(
        @Body body: AnprQueryRequest,
        @Query("siteId") siteId: Int? = null,
    ): AnprPageResponse
}
