package mx.nexara.mobile.nativeapp.data.api

import retrofit2.http.Body
import retrofit2.http.DELETE
import retrofit2.http.GET
import retrofit2.http.Multipart
import retrofit2.http.PATCH
import retrofit2.http.POST
import retrofit2.http.Part
import retrofit2.http.Path
import retrofit2.http.Query
import okhttp3.MultipartBody

/**
 * Endpoints CRM / Ventas — paridad con web CRM vía API ventas.
 */
interface CrmApi {
    @GET("ventas/cotizaciones")
    suspend fun listCotizacionesRaw(
        @Query("clientName") clientName: String? = null,
        @Query("status") status: String? = null,
    ): okhttp3.ResponseBody

    @GET("ventas/oportunidades")
    suspend fun listOportunidadesRaw(): okhttp3.ResponseBody

    @GET("ventas/oportunidades/{id}")
    suspend fun getOpportunityRaw(@Path("id") id: Long): okhttp3.ResponseBody

    @POST("ventas/oportunidades/{id}/notas")
    suspend fun addOpportunityNoteRaw(
        @Path("id") id: Long,
        @Body body: Map<String, String>,
    ): okhttp3.ResponseBody

    @Multipart
    @POST("ventas/oportunidades/{id}/evidencias")
    suspend fun addOpportunityEvidencesRaw(
        @Path("id") id: Long,
        @Part files: List<MultipartBody.Part>,
    ): okhttp3.ResponseBody

    @POST("ventas/oportunidades")
    suspend fun createOpportunityRaw(
        @Body body: Map<String, @JvmSuppressWildcards Any?>,
    ): okhttp3.ResponseBody

    @PATCH("ventas/oportunidades/{id}")
    suspend fun updateOpportunityRaw(
        @Path("id") id: Long,
        @Body body: Map<String, @JvmSuppressWildcards Any?>,
    ): okhttp3.ResponseBody

    @DELETE("ventas/oportunidades/{id}")
    suspend fun deleteOpportunityRaw(@Path("id") id: Long): okhttp3.ResponseBody

    @GET("ventas/clientes")
    suspend fun listClientesRaw(): okhttp3.ResponseBody

    @GET("ventas/clientes/{id}")
    suspend fun getClientRaw(@Path("id") id: Long): okhttp3.ResponseBody

    @GET("ventas/clientes/{id}/snapshot")
    suspend fun getClientSnapshotRaw(@Path("id") id: Long): okhttp3.ResponseBody

    @GET("ventas/leads")
    suspend fun listLeadsRaw(): okhttp3.ResponseBody

    @GET("ventas/leads/{id}")
    suspend fun getLeadRaw(@Path("id") id: Long): okhttp3.ResponseBody

    @POST("ventas/leads")
    suspend fun createLeadRaw(@Body body: Map<String, @JvmSuppressWildcards Any?>): okhttp3.ResponseBody

    @PATCH("ventas/leads/{id}")
    suspend fun updateLeadRaw(
        @Path("id") id: Long,
        @Body body: Map<String, @JvmSuppressWildcards Any?>,
    ): okhttp3.ResponseBody

    @DELETE("ventas/leads/{id}")
    suspend fun deleteLeadRaw(@Path("id") id: Long): okhttp3.ResponseBody

    @POST("ventas/clientes")
    suspend fun createClientRaw(@Body body: Map<String, @JvmSuppressWildcards Any?>): okhttp3.ResponseBody

    @PATCH("ventas/clientes/{id}")
    suspend fun updateClientRaw(
        @Path("id") id: Long,
        @Body body: Map<String, @JvmSuppressWildcards Any?>,
    ): okhttp3.ResponseBody

    @POST("ventas/clientes/{id}/provision-service-client")
    suspend fun provisionServiceClientRaw(@Path("id") id: Long): okhttp3.ResponseBody

    @GET("ventas/proyectos")
    suspend fun listProyectosRaw(): okhttp3.ResponseBody

    @GET("ventas/proyectos/{id}/resumen")
    suspend fun getProjectSummaryRaw(@Path("id") id: Long): okhttp3.ResponseBody

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
    suspend fun listSalesTeamRaw(
        @Query("period") period: String? = null,
    ): okhttp3.ResponseBody

    @GET("ventas/reportes/metricas")
    suspend fun getSalesMetricsRaw(
        @Query("period") period: String = "month",
    ): okhttp3.ResponseBody

    @GET("ventas/order-templates")
    suspend fun listOrderTemplatesRaw(): okhttp3.ResponseBody

    @POST("ventas/order-templates")
    suspend fun createOrderTemplateRaw(
        @Body body: Map<String, @JvmSuppressWildcards Any?>,
    ): okhttp3.ResponseBody

    @POST("ventas/order-templates/{id}/set-default")
    suspend fun setOrderTemplateDefaultRaw(@Path("id") id: Long): okhttp3.ResponseBody

    @DELETE("ventas/order-templates/{id}")
    suspend fun deleteOrderTemplateRaw(@Path("id") id: Long): okhttp3.ResponseBody

    @GET("ventas/cotizaciones/{id}")
    suspend fun getCotizacionDetailRaw(@Path("id") id: Long): okhttp3.ResponseBody

    @GET("cotizaciones/{id}/pdf")
    suspend fun downloadCotizacionPdfRaw(@Path("id") id: Long): okhttp3.ResponseBody

    @GET("cotizaciones/{id}/pdf/internal")
    suspend fun downloadCotizacionInternalPdfRaw(@Path("id") id: Long): okhttp3.ResponseBody

    @POST("cotizaciones/{id}/send")
    suspend fun sendCotizacionRaw(
        @Path("id") id: Long,
        @Body body: Map<String, String>,
    ): okhttp3.ResponseBody

    @GET("crm-activities")
    suspend fun listCrmActivitiesRaw(
        @Query("opportunityId") opportunityId: Long? = null,
        @Query("status") status: String? = null,
    ): okhttp3.ResponseBody

    @GET("crm-activities/my-agenda")
    suspend fun myAgendaRaw(): okhttp3.ResponseBody

    @PATCH("crm-activities/{id}/complete")
    suspend fun completeCrmActivityRaw(
        @Path("id") id: Long,
        @Body body: Map<String, String?>,
    ): okhttp3.ResponseBody
}
