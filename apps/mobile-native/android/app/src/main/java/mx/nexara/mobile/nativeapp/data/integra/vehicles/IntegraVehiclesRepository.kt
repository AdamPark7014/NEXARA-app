package mx.nexara.mobile.nativeapp.data.integra.vehicles

import android.content.Context
import mx.nexara.mobile.nativeapp.data.AuthRepository
import mx.nexara.mobile.nativeapp.data.api.ApiClient
import retrofit2.HttpException

/**
 * Acceso a vehículos y ANPR de INTEGRA.
 *
 * Sigue el patrón de `data/integra/IntegraRepository.kt` (mismo `ApiClient.authed`,
 * mismas suspensiones), pero devuelve tipos en vez de `Map<String, Any?>`: aquí
 * hay un formulario que valida y un contrato de manual que respetar, y un mapa
 * suelto esconde justo los campos que faltan.
 */
class IntegraVehiclesRepository(context: Context) {

    private val authRepo = AuthRepository(context.applicationContext)

    private val api: IntegraVehiclesApi = ApiClient.authed(
        tokenProvider = { authRepo.token() },
        companyIdProvider = { authRepo.companyId() },
    ).create(IntegraVehiclesApi::class.java)

    // ── Vehículos ────────────────────────────────────────────────────────────

    data class Inventario(
        val items: List<Vehiculo>,
        /**
         * La nota del servidor («las placas no se empujan al equipo»). Es una
         * limitación real de la instalación, así que se enseña tal cual.
         */
        val syncNote: String?,
        /** `mirror` = espejo NEXARA · `live` = leído de la plataforma. */
        val source: String?,
    )

    suspend fun vehiculos(live: Boolean = false, siteId: Int? = null): Inventario {
        val r = api.listVehicles(live = if (live) "1" else null, siteId = siteId)
        return Inventario(
            items = r.items.orEmpty().mapNotNull { it.aDominio() },
            syncNote = r.syncNote?.trim()?.ifBlank { null },
            source = r.source?.trim()?.ifBlank { null },
        )
    }

    suspend fun personas(siteId: Int? = null): List<PersonaResumen> =
        api.listPeople(siteId = siteId).items.orEmpty().mapNotNull { it.aDominio() }

    /**
     * Alta. `personId` se omite si va vacío, igual que hace la web: en `POST` el
     * servidor ya trata la ausencia como «sin dueño».
     *
     * Quien llame a esto DEBE haber comprobado [placaDuplicada] antes. El
     * servidor hace `upsert` sobre la placa normalizada y una placa repetida
     * borra la ficha anterior, dueño incluido, sin devolver ningún error.
     */
    suspend fun altaVehiculo(
        placaNormalizada: String,
        personId: String?,
        siteId: Int? = null,
    ): VehiculoMutacionResponse = api.addVehicle(
        body = VehiculoWriteRequest(
            plateNo = placaNormalizada,
            personId = personId?.trim()?.ifBlank { null },
        ),
        siteId = siteId,
    )

    /**
     * Edición. Aquí `personId` viaja SIEMPRE, aunque sea cadena vacía: es la
     * única forma de decirle al servidor «quita al dueño» (`personId || null`).
     * Mandar `null` lo omitiría del JSON y el dueño se quedaría como estaba.
     */
    suspend fun editarVehiculo(
        vehicleId: String,
        placaNormalizada: String,
        personId: String?,
        siteId: Int? = null,
    ): VehiculoMutacionResponse = api.updateVehicle(
        vehicleId = vehicleId,
        body = VehiculoWriteRequest(
            plateNo = placaNormalizada,
            personId = personId?.trim().orEmpty(),
        ),
        siteId = siteId,
    )

    suspend fun borrarVehiculo(
        vehicleId: String,
        siteId: Int? = null,
    ): VehiculoMutacionResponse = api.deleteVehicle(vehicleId = vehicleId, siteId = siteId)

    // ── ANPR ─────────────────────────────────────────────────────────────────

    suspend fun camaras(siteId: Int? = null): List<CamaraOpcion> =
        api.listCameras(siteId = siteId).items.orEmpty().mapNotNull { c ->
            val id = c.id?.trim().orEmpty()
            if (id.isEmpty()) return@mapNotNull null
            CamaraOpcion(
                id = id,
                name = c.name?.trim()?.ifBlank { null } ?: id,
                anprCapable = c.anprCapable,
            )
        }

    data class PaginaAnpr(
        val registros: List<AnprRecordDto>,
        /** `null` = la plataforma no dijo cuántos hay en total. */
        val total: Int?,
    )

    suspend fun anpr(query: AnprQueryRequest, siteId: Int? = null): PaginaAnpr {
        val r = api.anprCrossRecords(body = query, siteId = siteId)
        return PaginaAnpr(registros = r.list.orEmpty(), total = r.total)
    }

    /**
     * Qué pasó de verdad, en una sola lectura.
     *
     * `noDisponible` distingue el rechazo estructural del fallo transitorio:
     * `IntegraArtemisService.client()` lanza `BadRequestException` («Operación
     * Artemis no disponible en sitio ISAPI…») cuando el sitio no habla Artemis,
     * y eso llega como HTTP 400. Ahí no hay nada que reintentar: esta
     * instalación no tiene ANPR y hay que decirlo, no dejar la lista vacía.
     */
    data class Diagnostico(
        val mensaje: String,
        val noDisponible: Boolean,
    )

    companion object {
        /**
         * El cuerpo de error de OkHttp se puede leer UNA vez: por eso esto se
         * llama una sola vez por excepción y devuelve todo lo que hace falta.
         *
         * Retrofit solo deja `HTTP 400 Bad Request` en `message`, que no le dice
         * nada a nadie; el motivo real viene en el cuerpo de NestJS
         * (`{"message": "...", "statusCode": 400}`).
         */
        fun diagnosticar(e: Throwable, fallback: String): Diagnostico {
            val http = e as? HttpException
                ?: return Diagnostico(mensaje = mensajeCorto(e, fallback), noDisponible = false)

            val cuerpo = try {
                http.response()?.errorBody()?.string()
            } catch (_: Exception) {
                null
            }
            val delServidor = cuerpo?.let(::extraerMensaje)
            val noDisponible = http.code() == 400 && delServidor != null &&
                (
                    delServidor.contains("Artemis no disponible", ignoreCase = true) ||
                        delServidor.contains("provider a ARTEMIS", ignoreCase = true)
                    )

            val mensaje = when {
                delServidor != null -> delServidor
                http.code() == 401 -> "Sesión expirada. Inicia sesión de nuevo."
                http.code() == 403 -> "Sin permisos para esta acción."
                http.code() == 404 -> "Recurso no encontrado."
                http.code() >= 500 -> "Error del servidor. Intenta más tarde."
                else -> fallback
            }
            return Diagnostico(mensaje = mensaje, noDisponible = noDisponible)
        }

        private fun mensajeCorto(e: Throwable, fallback: String): String =
            if (e is java.io.IOException) {
                "Sin conexión. Revisa tu red e intenta de nuevo."
            } else {
                e.message?.takeIf { it.isNotBlank() } ?: fallback
            }

        /** `message` puede ser texto o un array de textos (`class-validator`). */
        internal fun extraerMensaje(crudo: String): String? {
            LISTA_JSON.find(crudo)?.let { m ->
                val partes = TEXTO_SUELTO.findAll(m.groupValues[1])
                    .map { desescapar(it.groupValues[1]) }
                    .filter { it.isNotBlank() }
                    .toList()
                if (partes.isNotEmpty()) return partes.joinToString(" · ")
            }
            MENSAJE_JSON.find(crudo)?.let { m ->
                return desescapar(m.groupValues[1]).ifBlank { null }
            }
            return crudo.trim().take(300).ifBlank { null }
        }

        private fun desescapar(s: String): String =
            s.replace("\\\"", "\"").replace("\\n", " ").replace("\\\\", "\\").trim()

        private val MENSAJE_JSON = Regex("\"message\"\\s*:\\s*\"((?:[^\"\\\\]|\\\\.)*)\"")
        private val LISTA_JSON = Regex("\"message\"\\s*:\\s*\\[([^\\]]*)\\]")
        private val TEXTO_SUELTO = Regex("\"((?:[^\"\\\\]|\\\\.)*)\"")
    }
}
