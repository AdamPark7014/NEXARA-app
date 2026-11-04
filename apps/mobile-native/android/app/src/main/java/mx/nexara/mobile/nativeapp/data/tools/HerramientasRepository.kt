package mx.nexara.mobile.nativeapp.data.tools

import android.content.Context
import java.time.LocalDate
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.coroutineScope
import mx.nexara.mobile.nativeapp.data.AuthRepository
import mx.nexara.mobile.nativeapp.data.api.ApiClient
import mx.nexara.mobile.nativeapp.data.api.HerramientaActividadDto
import mx.nexara.mobile.nativeapp.data.api.HerramientasApi
import mx.nexara.mobile.nativeapp.data.api.KitAsignacionDto
import mx.nexara.mobile.nativeapp.data.api.KitPiezaDto
import mx.nexara.mobile.nativeapp.data.api.PedirPrestamoBody
import mx.nexara.mobile.nativeapp.data.api.PedirRenovacionBody
import mx.nexara.mobile.nativeapp.data.api.PrestamoHerramientaDto
import mx.nexara.mobile.nativeapp.data.api.RechazarPrestamoBody
import mx.nexara.mobile.nativeapp.data.api.RechazarRenovacionBody
import mx.nexara.mobile.nativeapp.data.api.RenovacionPendienteDto
import mx.nexara.mobile.nativeapp.data.api.ReportarDanioBody
import mx.nexara.mobile.nativeapp.data.api.parteJpeg
import mx.nexara.mobile.nativeapp.data.api.textoMultipart
import mx.nexara.mobile.nativeapp.ui.common.GeoPhoto
import mx.nexara.mobile.nativeapp.ui.console.herramientas.HerramientasRules

/**
 * Herramientas de Core: lo que traigo asignado (el kit), lo que tengo prestado y, para dirección e
 * Iván, los préstamos y el inventario de toda la empresa.
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
     * Sin cola offline: pedir, aprobar y dar de alta dependen de cómo esté el inventario en ese
     * momento, y encolados contestarían `{"queued":true}` a una pantalla que espera la decisión.
     */
    private val apiSinCola: HerramientasApi = ApiClient.authed(
        tokenProvider = { authRepo.token() },
        companyIdProvider = { authRepo.companyId() },
        withOffline = false,
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

    // ── Personal ─────────────────────────────────────────────────────────────

    /** Sin señal se queda en la cola, igual que la prórroga: `true` para que la pantalla lo diga. */
    suspend fun reportarDanio(asignacionId: Long, descripcion: String): Boolean =
        api.reportarDanio(asignacionId, ReportarDanioBody(descripcion.trim()))
            .use { cuerpo -> cuerpo.string().contains("\"queued\":true") }

    suspend fun buscarInventario(consulta: String): List<KitPiezaDto> = apiSinCola.buscarInventario(consulta.trim())

    suspend fun misActividades(): List<HerramientaActividadDto> = api.misActividades()

    suspend fun pedirPrestamo(
        piezaId: Long,
        regreso: LocalDate,
        motivo: String,
        actividadId: Long?,
        hoy: LocalDate,
    ): PrestamoHerramientaDto {
        val yo = authRepo.loadSession()?.id ?: error("Sesión expirada, inicia sesión de nuevo.")
        return apiSinCola.pedirPrestamo(
            PedirPrestamoBody(
                usuarioId = yo,
                inventoryItemId = piezaId,
                reason = motivo.trim(),
                startDate = HerramientasRules.fechaParaApi(hoy),
                expectedReturnDate = HerramientasRules.fechaParaApi(regreso),
                activityId = actividadId,
            ),
        )
    }

    // ── Dirección e Iván ─────────────────────────────────────────────────────

    /**
     * Préstamos, renovaciones, inventario y kits de la empresa.
     *
     * Cada lista guarda su fallo, como [Datos]: a quien no le contesta una (un 403 de `tools.manage`)
     * se le dice cuál, y lo demás se ve. Los kits solo adornan el inventario con quién la trae.
     */
    data class DatosEmpresa(
        val prestamos: List<PrestamoHerramientaDto> = emptyList(),
        val renovaciones: List<RenovacionPendienteDto> = emptyList(),
        val inventario: List<KitPiezaDto> = emptyList(),
        val kits: List<KitAsignacionDto> = emptyList(),
        val falloPrestamos: Throwable? = null,
        val falloRenovaciones: Throwable? = null,
        val falloInventario: Throwable? = null,
    ) {
        val todoFallo: Boolean get() = falloPrestamos != null && falloInventario != null
    }

    suspend fun cargarEmpresa(conRenovaciones: Boolean): DatosEmpresa = coroutineScope {
        val prestamos = async {
            runCatching {
                coroutineScope {
                    HerramientasRules.ESTADOS_ABIERTOS.map { estado ->
                        async { api.prestamosPorEstado(estado) }
                    }.awaitAll().flatten()
                }
            }
        }
        val renovaciones = async {
            if (conRenovaciones) runCatching { api.renovacionesPendientes() } else Result.success(emptyList())
        }
        val inventario = async { runCatching { api.inventario() } }
        val kits = async { runCatching { api.kitsDeLaEmpresa() } }
        val leidosPrestamos = prestamos.await()
        val leidasRenovaciones = renovaciones.await()
        val leidoInventario = inventario.await()
        DatosEmpresa(
            prestamos = leidosPrestamos.getOrDefault(emptyList()),
            renovaciones = leidasRenovaciones.getOrDefault(emptyList()),
            inventario = leidoInventario.getOrDefault(emptyList()),
            kits = kits.await().getOrDefault(emptyList()),
            falloPrestamos = leidosPrestamos.exceptionOrNull(),
            falloRenovaciones = leidasRenovaciones.exceptionOrNull(),
            falloInventario = leidoInventario.exceptionOrNull(),
        )
    }

    suspend fun aprobarPrestamo(id: Long) {
        apiSinCola.aprobarPrestamo(id).close()
    }

    suspend fun rechazarPrestamo(id: Long, motivo: String) {
        apiSinCola.rechazarPrestamo(id, RechazarPrestamoBody(motivo.trim())).close()
    }

    suspend fun aprobarRenovacion(id: Long) {
        apiSinCola.aprobarRenovacion(id).close()
    }

    suspend fun rechazarRenovacion(id: Long, motivo: String) {
        apiSinCola.rechazarRenovacion(id, RechazarRenovacionBody(motivo.trim())).close()
    }

    suspend fun nuevaHerramienta(
        nombre: String,
        modelo: String,
        serie: String,
        panoramica: GeoPhoto,
        fotoSerie: GeoPhoto,
    ): KitPiezaDto = apiSinCola.nuevaHerramienta(
        toolName = textoMultipart(nombre.trim()),
        model = textoMultipart(modelo.trim()),
        serialNumber = textoMultipart(serie.trim()),
        panoramicPhoto = panoramica.parteJpeg("panoramicPhoto", "herramienta-panoramica.jpg"),
        serialPhoto = fotoSerie.parteJpeg("serialPhoto", "herramienta-serie.jpg"),
    )
}
