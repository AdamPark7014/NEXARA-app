package mx.nexara.mobile.nativeapp.data.api

import okhttp3.ResponseBody
import retrofit2.http.Body
import retrofit2.http.DELETE
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.Path
import retrofit2.http.Query

/**
 * Padrón de clientes de Core (`/erp/clientes`) — espejo de
 * `apps/web/app/(panels)/erp/clientes` sobre el controlador `ventas/clientes`.
 *
 * Un padrón, tres sectores (PROYECTO · CORPORATIVO · COMERCIAL). Los proyectos
 * del cliente cuelgan de `operational-projects`, filtrados por el puente
 * `serviceClientId`.
 */

data class ClientOwnerDto(
    val id: Long? = null,
    val nombre: String? = null,
    val email: String? = null,
)

data class ClientDto(
    val id: Long,
    val name: String? = null,
    val legalName: String? = null,
    val taxId: String? = null,
    val fiscalAddress: String? = null,
    val fiscalZipCode: String? = null,
    val fiscalRegime: String? = null,
    val billingEmail: String? = null,
    val billingPhone: String? = null,
    val notes: String? = null,
    val status: String? = null,
    /** Puente al cliente de servicio: es el id que usan proyectos y actividades. */
    val serviceClientId: Long? = null,
    /** `[{id, sector}]` en la API; se lee con [sectorNames]. */
    val sectors: List<Any?>? = null,
    val owner: ClientOwnerDto? = null,
) {
    val sectorNames: List<String>
        get() = sectors.orEmpty().mapNotNull { s ->
            when (s) {
                is String -> s
                is Map<*, *> -> s["sector"]?.toString()
                else -> null
            }
        }
}

/**
 * `GET ventas/clientes/permisos`. Agregar y editar: jefes con gente a cargo,
 * administración y dirección. Desactivar, reactivar y eliminar: solo Christian.
 * Sin respuesta, todo en `false`: el servidor vuelve a decidir con un 403.
 */
data class ClientPermissionsDto(
    val puedeAgregar: Boolean = false,
    val puedeEditar: Boolean = false,
    val puedeDesactivar: Boolean = false,
    val puedeEliminar: Boolean = false,
)

data class CreateClientBody(
    val name: String,
    val legalName: String? = null,
    val taxId: String? = null,
    val fiscalAddress: String? = null,
    val fiscalZipCode: String? = null,
    val fiscalRegime: String? = null,
    val billingEmail: String? = null,
    val billingPhone: String? = null,
    val notes: String? = null,
    val status: String? = "Activo",
    val sectors: List<String>? = null,
)

data class AddClientSectorBody(
    val sector: String,
)

data class FiscalValidationDto(
    val rfc: String? = null,
    val valid: Boolean? = null,
    val type: String? = null,
    val errors: List<String>? = null,
)

data class FiscalRegimeDto(
    val code: String? = null,
    val name: String? = null,
)

/** `GET ventas/clientes/fiscal-lookup?rfc=` — valida el RFC y sugiere régimen. */
data class FiscalLookupDto(
    val validation: FiscalValidationDto? = null,
    val regimes: List<FiscalRegimeDto>? = null,
    val suggestedRegime: String? = null,
    val legalName: String? = null,
    val fiscalZipCode: String? = null,
    val message: String? = null,
)

/** Proyecto operativo del cliente (`operational-projects`). */
data class ClientProjectDto(
    val id: Long,
    val title: String? = null,
    val status: String? = null,
    val startDate: String? = null,
)

data class CreateClientProjectBody(
    val title: String,
    val clientId: Long,
    val vendorId: Long,
    val startDate: String,
    val projectType: String = "OTRO",
)

interface ClientsApi {
    @GET("ventas/clientes")
    suspend fun listBySector(@Query("sector") sector: String): List<ClientDto>

    /** Ruta literal: el servidor la declara antes de `:id`. */
    @GET("ventas/clientes/permisos")
    suspend fun permissions(): ClientPermissionsDto

    @GET("ventas/clientes/{id}")
    suspend fun getClient(@Path("id") id: Long): ClientDto

    @POST("ventas/clientes")
    suspend fun createClient(@Body body: CreateClientBody): ClientDto

    /** Deja el cliente «Inactivo». Solo Christian; los demás reciben 403 con mensaje. */
    @POST("ventas/clientes/{id}/desactivar")
    suspend fun deactivateClient(@Path("id") id: Long): ResponseBody

    /** Lo regresa a «Activo». Solo Christian. */
    @POST("ventas/clientes/{id}/reactivar")
    suspend fun reactivateClient(@Path("id") id: Long): ResponseBody

    /** Elimina del padrón; no se puede deshacer. Solo Christian. */
    @DELETE("ventas/clientes/{id}")
    suspend fun deleteClient(@Path("id") id: Long): ResponseBody

    @POST("ventas/clientes/{id}/sectors")
    suspend fun addSector(
        @Path("id") id: Long,
        @Body body: AddClientSectorBody,
    ): ClientDto

    @GET("ventas/clientes/fiscal-lookup")
    suspend fun fiscalLookup(@Query("rfc") rfc: String): FiscalLookupDto

    @GET("operational-projects")
    suspend fun clientProjects(@Query("clientId") clientId: Long): List<ClientProjectDto>

    @POST("operational-projects")
    suspend fun createProject(@Body body: CreateClientProjectBody): ClientProjectDto

    /** Deja el proyecto `ON_HOLD` («Inactivo» en la app). Solo Christian. */
    @POST("operational-projects/{id}/desactivar")
    suspend fun deactivateProject(@Path("id") id: Long): ResponseBody

    /** Lo regresa a `ACTIVE`. Solo Christian. */
    @POST("operational-projects/{id}/reactivar")
    suspend fun reactivateProject(@Path("id") id: Long): ResponseBody

    /** Borrado lógico (`{ok:true}`): desaparece de las listas. Solo Christian. */
    @DELETE("operational-projects/{id}")
    suspend fun deleteProject(@Path("id") id: Long): ResponseBody
}
