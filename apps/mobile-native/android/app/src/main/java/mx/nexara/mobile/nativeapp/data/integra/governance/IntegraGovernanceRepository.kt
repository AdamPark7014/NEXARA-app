package mx.nexara.mobile.nativeapp.data.integra.governance

import android.content.Context
import com.squareup.moshi.Moshi
import com.squareup.moshi.Types
import com.squareup.moshi.kotlin.reflect.KotlinJsonAdapterFactory
import mx.nexara.mobile.nativeapp.data.AuthRepository
import mx.nexara.mobile.nativeapp.data.api.ApiClient
import okhttp3.ResponseBody
import java.lang.reflect.ParameterizedType

/**
 * Acceso a los endpoints de gobierno de INTEGRA.
 *
 * Todas las funciones son `suspend` y no tocan el hilo principal por sí mismas:
 * quien llama las envuelve en `Dispatchers.IO`, igual que hace
 * `IntegraRepository`.
 */
class IntegraGovernanceRepository(context: Context) {

    private val authRepo = AuthRepository(context.applicationContext)

    private val api: IntegraGovernanceApi = ApiClient.authed(
        tokenProvider = { authRepo.token() },
        companyIdProvider = { authRepo.companyId() },
    ).create(IntegraGovernanceApi::class.java)

    private val moshi = Moshi.Builder().add(KotlinJsonAdapterFactory()).build()

    private fun parseMap(body: ResponseBody): Map<String, Any?> {
        val raw = body.string().trim()
        if (raw.isEmpty()) return emptyMap()
        val mapType: ParameterizedType = Types.newParameterizedType(
            Map::class.java,
            String::class.java,
            Any::class.java,
        )
        return moshi.adapter<Map<String, Any?>>(mapType).fromJson(raw) ?: emptyMap()
    }

    /** Lo que la bitácora pide al servidor. Todo opcional; `null` = sin filtro. */
    data class ConsultaBitacora(
        val limit: Int = 25,
        val skip: Int = 0,
        val fromIso: String? = null,
        val toIso: String? = null,
        val action: String? = null,
        val userId: Long? = null,
        /** Filtra el **código** de acción (`action contains`), no `changes`. */
        val q: String? = null,
        val order: String = "desc",
    )

    suspend fun audit(consulta: ConsultaBitacora): AuditPageDto = api.audit(
        limit = consulta.limit,
        skip = consulta.skip,
        from = consulta.fromIso,
        to = consulta.toIso,
        action = consulta.action?.trim()?.ifBlank { null },
        userId = consulta.userId,
        q = consulta.q?.trim()?.ifBlank { null },
        order = if (consulta.order == "asc") "asc" else "desc",
    )

    suspend fun identityMe(): IdentityMeDto = api.identityMe()

    /**
     * Ficha ACS. Devuelve el nodo `person` ya desanidado; si el sitio no es
     * espejo ISAPI el backend responde `{ personId, raw }` sin `person`, y en
     * ese caso se devuelve la raíz para que la pantalla decida qué puede pintar.
     */
    suspend fun personDetail(personId: String, siteId: Long? = null): Map<String, Any?> {
        val root = parseMap(api.person(personId, siteId))
        val person = root["person"]
        if (person is Map<*, *>) {
            @Suppress("UNCHECKED_CAST")
            return person as Map<String, Any?>
        }
        return root
    }

    suspend fun myProfile(): UserProfileDto = api.myProfile()

    suspend fun updateMyProfile(campos: Map<String, String?>) {
        api.updateMyProfile(campos)
    }

    suspend fun pushEventStats(): PushEventStatsDto = api.pushEventStats()
}
