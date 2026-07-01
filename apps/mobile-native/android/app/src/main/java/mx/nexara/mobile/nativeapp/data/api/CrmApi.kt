package mx.nexara.mobile.nativeapp.data.api

import retrofit2.http.GET
import retrofit2.http.Query

/**
 * Endpoints CRM / Ventas — paridad con web CRM vía API ventas.
 */
interface CrmApi {
    @GET("ventas/cotizaciones")
    suspend fun listCotizacionesRaw(): okhttp3.ResponseBody

    @GET("ventas/oportunidades")
    suspend fun listOportunidadesRaw(): okhttp3.ResponseBody

    @GET("ventas/clientes")
    suspend fun listClientesRaw(): okhttp3.ResponseBody

    @GET("ventas/leads")
    suspend fun listLeadsRaw(): okhttp3.ResponseBody

    @GET("ventas/proyectos")
    suspend fun listProyectosRaw(): okhttp3.ResponseBody

    @GET("catalog/products")
    suspend fun listProductsRaw(
        @Query("search") search: String? = null,
    ): okhttp3.ResponseBody

    @GET("calendar/events")
    suspend fun listCalendarEventsRaw(): okhttp3.ResponseBody

    @GET("tenders")
    suspend fun listTendersRaw(): okhttp3.ResponseBody

    @GET("sales-targets")
    suspend fun listSalesTargetsRaw(): okhttp3.ResponseBody

    @GET("ventas/reportes/vendedores")
    suspend fun listSalesTeamRaw(): okhttp3.ResponseBody
}
