package mx.nexara.mobile.nativeapp.data.tools

import android.content.Context
import java.time.LocalDate
import mx.nexara.mobile.nativeapp.data.AuthRepository
import mx.nexara.mobile.nativeapp.data.api.ApiClient
import mx.nexara.mobile.nativeapp.data.api.HerramientasApi
import mx.nexara.mobile.nativeapp.data.api.KitAsignacionDto
import mx.nexara.mobile.nativeapp.data.api.PedirRenovacionBody
import mx.nexara.mobile.nativeapp.data.api.PrestamoHerramientaDto
import mx.nexara.mobile.nativeapp.ui.console.herramientas.HerramientasRules

/**
 * Herramientas de Core: lo que traigo asignado (el kit) y lo que tengo prestado.
 *
 * El API sirve las dos listas por separado y ninguna depende de la otra, así que
 * [cargar] pide las tres cosas y **guarda el fallo de cada una por su lado**. Es
 * deliberado: quien no tiene kit asignado pero sí préstamos —o al revés— no
 * puede quedarse sin pantalla porque la mitad que no le toca conteste 403. Solo
 * cuando fallan las dos listas hay de verdad un error que enseñar.
 */
class HerramientasRepository(context: Context) {
    private val authRepo = AuthRepository(context)
    private val api: HerramientasApi = ApiClient.authed(
        tokenProvider = { authRepo.token() },
        companyIdProvider = { authRepo.companyId() },
    ).create(HerramientasApi::class.java)

    /**
     * Todo lo de la pantalla en una lectura.
     *
     * Una lista vacía no distingue entre «no tienes nada» y «no se pudo leer»,
     * y por eso cada mitad guarda su propio fallo: la pantalla los mira antes de
     * atreverse a decir que está vacío.
     */
    data class Datos(
        val kit: List<KitAsignacionDto> = emptyList(),
        val prestamos: List<PrestamoHerramientaDto> = emptyList(),
        val falloKit: Throwable? = null,
        val falloPrestamos: Throwable? = null,
    ) {
        /** Las dos mitades cayeron: no hay nada que enseñar y toca pantalla de error. */
        val todoFallo: Boolean get() = falloKit != null && falloPrestamos != null
    }

    suspend fun cargar(): Datos {
        val kit = runCatching { api.miKit() }
        val prestamos = runCatching { api.misPrestamos() }
        return Datos(
            kit = kit.getOrDefault(emptyList()),
            prestamos = prestamos.getOrDefault(emptyList()),
            falloKit = kit.exceptionOrNull(),
            falloPrestamos = prestamos.exceptionOrNull(),
        )
    }

    /**
     * Pide más plazo para un préstamo propio.
     *
     * Devuelve `true` cuando se quedó en la cola sin conexión, para que la
     * pantalla lo diga con esas palabras en vez de fingir que salió. Encolarla
     * es correcto: una prórroga es una petición del propio interesado que no
     * mueve nada por sí sola — el servidor la crea en `PENDING` y alguien la
     * decide después.
     */
    suspend fun pedirRenovacion(
        prestamoId: Long,
        nuevaFecha: LocalDate,
        motivo: String?,
    ): Boolean = api.pedirRenovacion(
        id = prestamoId,
        body = PedirRenovacionBody(
            newReturnDate = HerramientasRules.fechaParaApi(nuevaFecha),
            renewalReason = motivo?.trim()?.takeIf { it.isNotEmpty() },
        ),
    ).use { cuerpo -> cuerpo.string().contains("\"queued\":true") }
}
