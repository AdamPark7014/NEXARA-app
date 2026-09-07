package mx.nexara.mobile.nativeapp.data.integra.governance

import okhttp3.ResponseBody
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.PATCH
import retrofit2.http.Path
import retrofit2.http.Query

/**
 * Endpoints de gobierno de INTEGRA: bitácora, identidad ERP↔ACS y perfil.
 *
 * ── Por qué todo es nulable ──────────────────────────────────────────────────
 * Moshi con `KotlinJsonAdapterFactory` lanza `JsonDataException` si un campo
 * declarado no-nulable llega como `null`, y Retrofit propaga la excepción como
 * fallo de red: la pantalla se queda vacía con un mensaje genérico y no hay
 * forma de saber que el problema era una columna nula. En `audit_logs` casi
 * todo es opcional (`userId`, `ipAddress`, `userAgent`, `previousData`,
 * `changes`), así que aquí es nulable todo lo que la tabla permite que lo sea,
 * incluido el `id`.
 */

/** Una entrada tal y como la devuelve `GET /api/integra/audit`. */
data class AuditEntryDto(
    val id: Long? = null,
    val action: String? = null,
    /**
     * **No es el id de la cosa tocada**: `auditMut` lo rellena con el `siteId`
     * (o 0 si no se resolvió sitio). Por eso la ficha lo etiqueta «Sitio».
     */
    val entityId: Long? = null,
    val createdAt: String? = null,
    val userId: Long? = null,
    val userEmail: String? = null,
    val userName: String? = null,
    /** JSON libre: mapa, lista o escalar. Se pinta con `describirCambios`. */
    val changes: Any? = null,
    /** Los tres que `audit_logs` guardaba y `listAudit` no devolvía hasta ahora. */
    val ipAddress: String? = null,
    val userAgent: String? = null,
    val previousData: Any? = null,
)

/**
 * `total` sale de un `count` sobre el mismo filtro, no del tamaño de la página.
 * Es lo que permite paginar de verdad sobre decenas de miles de filas.
 */
data class AuditPageDto(
    val total: Int? = null,
    val limit: Int? = null,
    val skip: Int? = null,
    val items: List<AuditEntryDto>? = null,
)

data class IdentityNamedDto(
    val id: Long? = null,
    val nombre: String? = null,
    val orgRoleKey: String? = null,
)

data class IdentityUserDto(
    val id: Long? = null,
    val nombre: String? = null,
    val email: String? = null,
    val employeeNumber: String? = null,
    val companyEmployeeNumber: String? = null,
    val role: IdentityNamedDto? = null,
    val department: IdentityNamedDto? = null,
)

data class IdentityAcsPersonDto(
    val personId: String? = null,
    val personName: String? = null,
    val personCode: String? = null,
    val siteId: Long? = null,
)

/** `GET /api/integra/identity/me` — de dónde sale cada dato del perfil. */
data class IdentityMeDto(
    /** Texto del backend: «User.employeeNumber ↔ ACS employeeNo (personId)». */
    val canonicalKey: String? = null,
    /** `linked` · `erp_only` · `acs_only` · `unlinked`. */
    val status: String? = null,
    val user: IdentityUserDto? = null,
    val acsPerson: IdentityAcsPersonDto? = null,
    val howToLink: String? = null,
)

data class UserProfileFieldsDto(
    val telefono: String? = null,
    val fechaNacimiento: String? = null,
    val direccion: String? = null,
    val colonia: String? = null,
    val ciudad: String? = null,
    val estado: String? = null,
    val codigoPostal: String? = null,
    val pais: String? = null,
    val curp: String? = null,
    val rfc: String? = null,
    val ineNumero: String? = null,
    val nss: String? = null,
    val contactoEmergenciaNombre: String? = null,
    val contactoEmergenciaTelefono: String? = null,
    val estatus: String? = null,
)

/** `GET /api/users/profile/me`. */
data class UserProfileDto(
    val id: Long? = null,
    val nombre: String? = null,
    val email: String? = null,
    val employeeNumber: String? = null,
    val perfil: UserProfileFieldsDto? = null,
    val role: IdentityNamedDto? = null,
    val department: IdentityNamedDto? = null,
)

/** KPIs del día que publican los terminales (`GET /api/integra/push/events/stats`). */
data class PushEventStatsDto(
    val day: String? = null,
    val entradas: Int? = null,
    val denegados: Int? = null,
    val unicos: Int? = null,
    val enSitio: Int? = null,
)

interface IntegraGovernanceApi {

    /**
     * Bitácora con filtros y paginación de servidor.
     *
     * `q` filtra **solo el código de acción** (`action contains`, insensible a
     * mayúsculas); no busca dentro de `changes`. La pantalla lo dice con esas
     * palabras en vez de fingir una búsqueda global.
     */
    @GET("integra/audit")
    suspend fun audit(
        @Query("limit") limit: Int? = null,
        @Query("skip") skip: Int? = null,
        @Query("from") from: String? = null,
        @Query("to") to: String? = null,
        @Query("action") action: String? = null,
        @Query("userId") userId: Long? = null,
        @Query("q") q: String? = null,
        @Query("order") order: String? = null,
    ): AuditPageDto

    @GET("integra/identity/me")
    suspend fun identityMe(): IdentityMeDto

    /**
     * Ficha ACS de una persona. Devuelve `ResponseBody` a propósito: el bloque
     * `person` se arma con el `raw` del terminal y su forma cambia entre
     * modelos DS-K1T, así que se lee como mapa —igual que hace
     * `IntegraRepository`— en vez de fijar un contrato que el equipo no cumple.
     */
    @GET("integra/people/{id}")
    suspend fun person(
        @Path("id") personId: String,
        @Query("siteId") siteId: Long? = null,
    ): ResponseBody

    @GET("users/profile/me")
    suspend fun myProfile(): UserProfileDto

    @PATCH("users/profile/me")
    suspend fun updateMyProfile(
        @Body body: Map<String, @JvmSuppressWildcards String?>,
    ): ResponseBody

    @GET("integra/push/events/stats")
    suspend fun pushEventStats(
        @Query("siteId") siteId: Long? = null,
    ): PushEventStatsDto
}
