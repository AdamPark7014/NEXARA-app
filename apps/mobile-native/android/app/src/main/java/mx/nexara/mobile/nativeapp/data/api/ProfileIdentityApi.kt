package mx.nexara.mobile.nativeapp.data.api

import retrofit2.http.GET
import retrofit2.http.Query

/**
 * Identidad ACS y contraste híbrido del día para «Mi perfil» — espejo de
 * `apps/web/app/(panels)/erp/my-profile/page.tsx`, que lee
 * `GET integra/identity/me` y `GET attendance/hybrid?date=`.
 *
 * Vive aparte de `ConsoleApi` a propósito: el checador y el GPS los lleva otro
 * frente y no conviene cruzarse en el mismo archivo.
 */

data class MyIdentityUserDto(
    val employeeNumber: String? = null,
    val companyEmployeeNumber: String? = null,
)

data class MyIdentityAcsPersonDto(
    val personId: String? = null,
    val personName: String? = null,
    val personCode: String? = null,
)

/** `status`: linked | erp_only | acs_only | unlinked. */
data class MyIdentityDto(
    val status: String? = null,
    val user: MyIdentityUserDto? = null,
    val acsPerson: MyIdentityAcsPersonDto? = null,
    val howToLink: String? = null,
)

/** Checador ERP del día (fuente de nómina). */
data class HybridErpDto(
    val checkIn: String? = null,
    val checkOut: String? = null,
    val totalMinutes: Int? = null,
    val isOpen: Boolean? = null,
    val estado: String? = null,
)

/** Pases concedidos en puertas Integra; no es fichaje. */
data class HybridAcsDto(
    val personId: String? = null,
    val personName: String? = null,
    val firstAt: String? = null,
    val lastAt: String? = null,
    val passes: Int? = null,
    val denied: Int? = null,
    val firstDoor: String? = null,
)

data class HybridItemDto(
    val linkStatus: String? = null,
    val flags: List<String>? = null,
    val erp: HybridErpDto? = null,
    val acs: HybridAcsDto? = null,
)

data class HybridDayDto(
    val date: String? = null,
    val items: List<HybridItemDto>? = null,
)

interface ProfileIdentityApi {
    @GET("integra/identity/me")
    suspend fun myIdentity(): MyIdentityDto

    /** Sin permiso de gestión el servidor ya responde sólo con lo propio (`selfOnly`). */
    @GET("attendance/hybrid")
    suspend fun hybridDay(@Query("date") date: String): HybridDayDto
}
