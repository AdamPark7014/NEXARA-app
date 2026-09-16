package mx.nexara.mobile.nativeapp.data.api

import retrofit2.http.Body
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

    @GET("ventas/clientes/{id}")
    suspend fun getClient(@Path("id") id: Long): ClientDto

    @POST("ventas/clientes")
    suspend fun createClient(@Body body: CreateClientBody): ClientDto

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
}
