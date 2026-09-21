package mx.nexara.mobile.nativeapp.ui.console.herramientas

import java.time.Instant
import java.time.LocalDate
import mx.nexara.mobile.nativeapp.data.api.KitAsignacionDto
import mx.nexara.mobile.nativeapp.data.api.KitEventoDto
import mx.nexara.mobile.nativeapp.data.api.KitPiezaDto
import mx.nexara.mobile.nativeapp.data.api.PrestamoHerramientaDto
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Las cuentas de Herramientas, sin Android de por medio.
 *
 * El grueso de lo que se vigila aquí son fechas: el API manda instantes UTC y la
 * pantalla habla de días («vence mañana»). Ahí es donde se cuelan los errores de
 * un día que en campo se traducen en una herramienta entregada tarde.
 */
class HerramientasRulesTest {

    private val hoy = LocalDate.of(2026, 9, 21)

    private fun prestamo(
        id: Long = 1L,
        status: String? = "IN_USE",
        expectedReturnDate: String? = null,
        pickupCode: String? = null,
        pickupExpiresAt: String? = null,
        pickedUpAt: String? = null,
        toolName: String? = "Taladro",
        model: String? = null,
        serialNumber: String? = null,
        reason: String? = null,
        requestDate: String? = null,
    ) = PrestamoHerramientaDto(
        id = id,
        status = status,
        expectedReturnDate = expectedReturnDate,
        pickupCode = pickupCode,
        pickupExpiresAt = pickupExpiresAt,
        pickedUpAt = pickedUpAt,
        toolName = toolName,
        model = model,
        serialNumber = serialNumber,
        reason = reason,
        requestDate = requestDate,
    )

    private fun asignacion(
        id: Long = 1L,
        toolName: String? = "Multímetro",
        codigoInterno: String? = null,
        model: String? = null,
        serialNumber: String? = null,
        estadoPieza: String? = "ASSIGNED",
        proximaInspeccion: String? = null,
        isActive: Boolean? = true,
        returnedAt: String? = null,
        eventos: List<KitEventoDto> = emptyList(),
    ) = KitAsignacionDto(
        id = id,
        isActive = isActive,
        returnedAt = returnedAt,
        proximaInspeccion = proximaInspeccion,
        inventoryItem = KitPiezaDto(
            toolName = toolName,
            codigoInterno = codigoInterno,
            model = model,
            serialNumber = serialNumber,
            status = estadoPieza,
        ),
        events = eventos,
    )

    // ── Fechas ───────────────────────────────────────────────────────────────

    /**
     * El caso por el que existe [HerramientasRules.fecha]: Prisma manda
     * medianoche UTC, y convertir ese instante a la hora de México daría el día
     * anterior. Una fecha de devolución es un día, no un instante.
     */
    @Test
    fun midnightUtcKeepsItsOwnDay() {
        assertEquals(LocalDate.of(2026, 9, 30), HerramientasRules.fecha("2026-09-30T00:00:00.000Z"))
        assertEquals(LocalDate.of(2026, 9, 30), HerramientasRules.fecha("2026-09-30"))
    }

    @Test
    fun rubbishDatesBecomeNullNotToday() {
        assertNull(HerramientasRules.fecha(null))
        assertNull(HerramientasRules.fecha(""))
        assertNull(HerramientasRules.fecha("mañana"))
        assertNull(HerramientasRules.fecha("2026-13-45T00:00:00Z"))
        assertEquals("", HerramientasRules.fechaCorta(null))
    }

    @Test
    fun theDeadlineIsSaidInWords() {
        assertEquals("Vence hoy", HerramientasRules.textoPlazo("2026-09-21T00:00:00.000Z", hoy))
        assertEquals("Vence mañana", HerramientasRules.textoPlazo("2026-09-22T00:00:00.000Z", hoy))
        assertEquals("Faltan 5 días", HerramientasRules.textoPlazo("2026-09-26T00:00:00.000Z", hoy))
        assertEquals("Venció ayer", HerramientasRules.textoPlazo("2026-09-20T00:00:00.000Z", hoy))
        assertEquals("Venció hace 3 días", HerramientasRules.textoPlazo("2026-09-18T00:00:00.000Z", hoy))
        assertNull(HerramientasRules.textoPlazo(null, hoy))
    }

    /** El color acompaña al texto: rojo pasado el plazo, ámbar en la recta final. */
    @Test
    fun theDeadlineToneWarnsBeforeItIsTooLate() {
        assertEquals(HerramientasRules.Tono.PELIGRO, HerramientasRules.tonoPlazo("2026-09-20", hoy))
        assertEquals(HerramientasRules.Tono.AVISO, HerramientasRules.tonoPlazo("2026-09-21", hoy))
        assertEquals(HerramientasRules.Tono.AVISO, HerramientasRules.tonoPlazo("2026-09-24", hoy))
        assertEquals(HerramientasRules.Tono.NEUTRO, HerramientasRules.tonoPlazo("2026-09-25", hoy))
        assertEquals(HerramientasRules.Tono.NEUTRO, HerramientasRules.tonoPlazo(null, hoy))
    }

    // ── Estados ──────────────────────────────────────────────────────────────

    @Test
    fun serverStatusesAreTranslatedToFieldSpanish() {
        assertEquals("Por aprobar", HerramientasRules.etiquetaEstado("PENDING"))
        assertEquals("Lista para recoger", HerramientasRules.etiquetaEstado("APPROVED"))
        assertEquals("La traes tú", HerramientasRules.etiquetaEstado("IN_USE"))
        assertEquals("Devuelta", HerramientasRules.etiquetaEstado("RETURNED"))
        assertEquals("Devuelta con daño", HerramientasRules.etiquetaEstado("DAMAGED"))
        assertEquals("Rechazada", HerramientasRules.etiquetaEstado("REJECTED"))
        // Un estado que el servidor estrene mañana no debe dejar la tarjeta muda.
        assertEquals("Sin estado", HerramientasRules.etiquetaEstado("LO_QUE_SEA"))
        assertEquals("Sin estado", HerramientasRules.etiquetaEstado(null))
        // El servidor los manda en mayúsculas, pero no se confía en ello.
        assertEquals("La traes tú", HerramientasRules.etiquetaEstado(" in_use "))
    }

    @Test
    fun onlyOpenLoansCount() {
        assertTrue(HerramientasRules.estaAbierto(prestamo(status = "PENDING")))
        assertTrue(HerramientasRules.estaAbierto(prestamo(status = "APPROVED")))
        assertTrue(HerramientasRules.estaAbierto(prestamo(status = "IN_USE")))
        assertFalse(HerramientasRules.estaAbierto(prestamo(status = "RETURNED")))
        assertFalse(HerramientasRules.estaAbierto(prestamo(status = "DAMAGED")))
        assertFalse(HerramientasRules.estaAbierto(prestamo(status = "REJECTED")))
    }

    /**
     * Pedir prórroga de algo que todavía no aprueban dejaría una petición
     * colgando de un préstamo que quizá se rechace.
     */
    @Test
    fun youOnlyExtendWhatYouAlreadyHave() {
        assertTrue(HerramientasRules.sePuedeRenovar(prestamo(status = "APPROVED")))
        assertTrue(HerramientasRules.sePuedeRenovar(prestamo(status = "IN_USE")))
        assertFalse(HerramientasRules.sePuedeRenovar(prestamo(status = "PENDING")))
        assertFalse(HerramientasRules.sePuedeRenovar(prestamo(status = "RETURNED")))
    }

    @Test
    fun onlyAnOpenLoanCanBeOverdue() {
        assertTrue(HerramientasRules.estaVencido(prestamo(status = "IN_USE", expectedReturnDate = "2026-09-20"), hoy))
        assertFalse(HerramientasRules.estaVencido(prestamo(status = "IN_USE", expectedReturnDate = "2026-09-21"), hoy))
        // Devuelta tarde ya no urge: se devolvió.
        assertFalse(HerramientasRules.estaVencido(prestamo(status = "RETURNED", expectedReturnDate = "2026-01-01"), hoy))
        // Sin fecha no se puede decir que llegue tarde.
        assertFalse(HerramientasRules.estaVencido(prestamo(status = "IN_USE"), hoy))
    }

    // ── Código de recolección ────────────────────────────────────────────────

    private val ahora: Instant = Instant.parse("2026-09-21T15:00:00Z")

    @Test
    fun thePickupCodeShowsWhileItIsWorth() {
        assertTrue(
            HerramientasRules.codigoVigente(
                prestamo(pickupCode = "A1B2C3", pickupExpiresAt = "2026-09-22T00:00:00Z"),
                ahora,
            ),
        )
        // Caducado.
        assertFalse(
            HerramientasRules.codigoVigente(
                prestamo(pickupCode = "A1B2C3", pickupExpiresAt = "2026-09-21T09:00:00Z"),
                ahora,
            ),
        )
        // Ya recogida: el código no sirve para nada.
        assertFalse(
            HerramientasRules.codigoVigente(
                prestamo(pickupCode = "A1B2C3", pickupExpiresAt = "2026-09-30T00:00:00Z", pickedUpAt = "2026-09-21T10:00:00Z"),
                ahora,
            ),
        )
        assertFalse(HerramientasRules.codigoVigente(prestamo(pickupCode = null), ahora))
    }

    /**
     * Sin caducidad se da por bueno: esconder el código por un dato que falta
     * dejaría a alguien parado en la ventanilla sin nada que enseñar.
     */
    @Test
    fun aCodeWithoutExpiryStillShows() {
        assertTrue(HerramientasRules.codigoVigente(prestamo(pickupCode = "A1B2C3"), ahora))
    }

    // ── Kit ──────────────────────────────────────────────────────────────────

    @Test
    fun theActiveKitLeavesOutWhatWasGivenBack() {
        val kit = listOf(
            asignacion(id = 1L),
            asignacion(id = 2L, isActive = false),
            asignacion(id = 3L, returnedAt = "2026-09-01T00:00:00Z"),
        )
        assertEquals(listOf(1L), HerramientasRules.kitActivo(kit).map { it.id })
    }

    /** Un parte sin resolver cuenta aunque el servidor no haya puesto `resolution`. */
    @Test
    fun openDamageReportsAreCounted() {
        val kit = asignacion(
            eventos = listOf(
                KitEventoDto(id = 1L, resolution = "PENDING", resolvedAt = null),
                KitEventoDto(id = 2L, resolution = null, resolvedAt = null),
                KitEventoDto(id = 3L, resolution = "USER_MISUSE", resolvedAt = "2026-09-10T00:00:00Z"),
            ),
        )
        assertEquals(2, HerramientasRules.eventosAbiertos(kit))
        assertEquals(0, HerramientasRules.eventosAbiertos(asignacion()))
    }

    /** Sin revisión programada no hay nada que vencer: no se inventa una obligación. */
    @Test
    fun noScheduledCheckMeansNothingOverdue() {
        assertFalse(HerramientasRules.revisionVencida(asignacion(), hoy))
        assertFalse(HerramientasRules.revisionVencida(asignacion(proximaInspeccion = "2026-09-21"), hoy))
        assertTrue(HerramientasRules.revisionVencida(asignacion(proximaInspeccion = "2026-09-20"), hoy))
    }

    @Test
    fun aToolWithoutDataStillHasAName() {
        assertEquals("Multímetro", HerramientasRules.tituloPieza(asignacion()))
        assertEquals("Fluke 117", HerramientasRules.tituloPieza(asignacion(toolName = " ", model = "Fluke 117")))
        assertEquals("Herramienta sin nombre", HerramientasRules.tituloPieza(KitAsignacionDto(id = 1L)))
        assertEquals(
            "Sin identificación registrada",
            HerramientasRules.identificacionPieza(KitAsignacionDto(id = 1L)),
        )
        assertEquals(
            "MUL-12345 · Fluke 117 · Serie 4419B",
            HerramientasRules.identificacionPieza(
                asignacion(codigoInterno = "MUL-12345", model = "Fluke 117", serialNumber = "4419B"),
            ),
        )
    }

    // ── Orden, filtros y búsqueda ────────────────────────────────────────────

    /** Primero lo vencido, después lo abierto por fecha, y el historial al final. */
    @Test
    fun theListOpensWithWhatIsUrgent() {
        val lista = listOf(
            prestamo(id = 1L, status = "RETURNED", expectedReturnDate = "2026-08-01"),
            prestamo(id = 2L, status = "IN_USE", expectedReturnDate = "2026-10-15"),
            prestamo(id = 3L, status = "IN_USE", expectedReturnDate = "2026-09-15"),
            prestamo(id = 4L, status = "APPROVED", expectedReturnDate = "2026-09-25"),
        )
        assertEquals(
            listOf(3L, 4L, 2L, 1L),
            HerramientasRules.ordenarPrestamos(lista, hoy).map { it.id },
        )
    }

    /** Un préstamo abierto sin fecha va detrás de los fechados: nadie dijo que urgiera. */
    @Test
    fun anUndatedLoanDoesNotJumpTheQueue() {
        val lista = listOf(
            prestamo(id = 1L, status = "IN_USE", expectedReturnDate = null),
            prestamo(id = 2L, status = "IN_USE", expectedReturnDate = "2026-10-01"),
        )
        assertEquals(listOf(2L, 1L), HerramientasRules.ordenarPrestamos(lista, hoy).map { it.id })
    }

    @Test
    fun theKitOpensWithWhatNeedsAttention() {
        val kit = listOf(
            asignacion(id = 1L, toolName = "Alicates"),
            asignacion(id = 2L, toolName = "Zapapico", proximaInspeccion = "2026-09-01"),
            asignacion(
                id = 3L,
                toolName = "Taladro",
                eventos = listOf(KitEventoDto(id = 9L, resolution = "PENDING")),
            ),
        )
        assertEquals(listOf(3L, 2L, 1L), HerramientasRules.ordenarKit(kit, hoy).map { it.id })
    }

    @Test
    fun theOpenFilterHidesHistory() {
        val lista = listOf(
            prestamo(id = 1L, status = "IN_USE"),
            prestamo(id = 2L, status = "RETURNED"),
        )
        assertEquals(
            listOf(1L),
            HerramientasRules.filtrarPrestamos(lista, HerramientasRules.FiltroPrestamo.ABIERTOS).map { it.id },
        )
        assertEquals(
            listOf(1L, 2L),
            HerramientasRules.filtrarPrestamos(lista, HerramientasRules.FiltroPrestamo.TODOS).map { it.id },
        )
    }

    @Test
    fun searchingLooksAtNameModelAndSerial() {
        val lista = listOf(
            prestamo(id = 1L, toolName = "Taladro", model = "HP1640"),
            prestamo(id = 2L, toolName = "Multímetro", serialNumber = "4419B"),
            prestamo(id = 3L, toolName = "Escalera", reason = "Cambio de luminarias"),
        )
        assertEquals(listOf(1L), HerramientasRules.buscarPrestamos(lista, "hp16").map { it.id })
        assertEquals(listOf(2L), HerramientasRules.buscarPrestamos(lista, "4419b").map { it.id })
        assertEquals(listOf(3L), HerramientasRules.buscarPrestamos(lista, "LUMINARIAS").map { it.id })
        assertEquals(3, HerramientasRules.buscarPrestamos(lista, "   ").size)
    }

    // ── Resúmenes ────────────────────────────────────────────────────────────

    @Test
    fun theSummarySeparatesOverdueFromOpen() {
        val lista = listOf(
            prestamo(id = 1L, status = "IN_USE", expectedReturnDate = "2026-09-01"),
            prestamo(id = 2L, status = "IN_USE", expectedReturnDate = "2026-09-10"),
            prestamo(id = 3L, status = "APPROVED", expectedReturnDate = "2026-10-01"),
            prestamo(id = 4L, status = "RETURNED"),
        )
        assertEquals("2 vencidas · 1 abierta", HerramientasRules.resumenPrestamos(lista, hoy))
        // Sin nada abierto no hay resumen que enseñar: se calla en vez de decir «0».
        assertNull(HerramientasRules.resumenPrestamos(listOf(prestamo(status = "RETURNED")), hoy))
        assertNull(HerramientasRules.resumenPrestamos(emptyList(), hoy))
    }

    @Test
    fun theKitSummaryOnlyTalksWhenSomethingIsWrong() {
        assertNull(HerramientasRules.resumenKit(listOf(asignacion()), hoy))
        assertEquals(
            "1 con daño sin cerrar · 1 con revisión vencida",
            HerramientasRules.resumenKit(
                listOf(
                    asignacion(id = 1L, eventos = listOf(KitEventoDto(id = 9L, resolution = "PENDING"))),
                    asignacion(id = 2L, proximaInspeccion = "2026-09-01"),
                ),
                hoy,
            ),
        )
        // Lo devuelto no cuenta: ya no es responsabilidad de nadie.
        assertNull(
            HerramientasRules.resumenKit(
                listOf(asignacion(id = 1L, isActive = false, eventos = listOf(KitEventoDto(id = 9L)))),
                hoy,
            ),
        )
    }

    // ── Renovación ───────────────────────────────────────────────────────────

    /** Los plazos se cuentan desde la fecha que hoy tiene el préstamo. */
    @Test
    fun extensionsCountFromTheCurrentDeadline() {
        val opciones = HerramientasRules.fechasSugeridas(
            prestamo(expectedReturnDate = "2026-09-30T00:00:00.000Z"),
            hoy,
        )
        assertEquals(listOf("+7 días", "+15 días", "+30 días"), opciones.map { it.first })
        assertEquals(LocalDate.of(2026, 10, 7), opciones[0].second)
        assertEquals(LocalDate.of(2026, 10, 30), opciones[2].second)
    }

    /**
     * El caso que importa: ampliar una fecha ya pasada daría un plazo que nace
     * vencido, así que se cuenta desde hoy.
     */
    @Test
    fun anExpiredLoanIsExtendedFromToday() {
        val opciones = HerramientasRules.fechasSugeridas(
            prestamo(expectedReturnDate = "2026-09-01T00:00:00.000Z"),
            hoy,
        )
        assertEquals(LocalDate.of(2026, 9, 28), opciones[0].second)
    }

    @Test
    fun aLoanWithoutDeadlineIsExtendedFromToday() {
        val opciones = HerramientasRules.fechasSugeridas(prestamo(expectedReturnDate = null), hoy)
        assertEquals(LocalDate.of(2026, 9, 28), opciones[0].second)
    }

    /**
     * Mediodía UTC, no medianoche: con `T00:00:00Z` el servidor guardaría una
     * fecha que en México se lee como el día anterior — el bug de «pedí hasta el
     * 30 y me dieron hasta el 29».
     */
    @Test
    fun theDateTravelsAtNoonSoItDoesNotSlipADay() {
        val texto = HerramientasRules.fechaParaApi(LocalDate.of(2026, 10, 7))
        assertEquals("2026-10-07T12:00:00.000Z", texto)
        // Y vuelve a leerse como el mismo día.
        assertEquals(LocalDate.of(2026, 10, 7), HerramientasRules.fecha(texto))
    }
}
