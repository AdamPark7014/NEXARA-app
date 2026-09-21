package mx.nexara.mobile.nativeapp.ui.console.pagos

import com.squareup.moshi.Moshi
import com.squareup.moshi.Types
import com.squareup.moshi.kotlin.reflect.KotlinJsonAdapterFactory
import java.time.ZoneId
import mx.nexara.mobile.nativeapp.data.api.PagoEmpleadoDto
import mx.nexara.mobile.nativeapp.data.api.PagoEmpleadoPersonaDto
import mx.nexara.mobile.nativeapp.ui.console.CoreExtraModule
import mx.nexara.mobile.nativeapp.ui.console.ConsoleRoutes
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * En pagos a empleados lo que no puede fallar es **el importe** y **el periodo**.
 * De ahí salen la cifra que alguien enseña en una aclaración y las fechas que el
 * empleado compara con su recibo.
 *
 * Las dos trampas que vigilan casi todas estas pruebas:
 *
 * 1. **El importe.** `amount` es un `Decimal(12,2)` de Prisma y viaja como texto
 *    (`Decimal.toJSON()`). Un DTO que declarara `Double?` reventaría, y uno que
 *    redondeara con `toDouble()` a secas perdería centavos. Y lo que no se
 *    entienda tiene que salir como `"—"`, **nunca como cero**.
 * 2. **Las fechas.** `periodFrom`/`periodTo` son `@db.Date` a medianoche UTC —
 *    son días y se leen tal cual—, mientras que `paidAt` es un instante de
 *    verdad y sí hay que pasarlo por la zona de México. Tratarlas igual corre el
 *    periodo un día, que es justo el error que se nota en un recibo.
 */
class PagosRulesTest {

    private fun pago(
        id: Long = 1L,
        // Anulable a propósito: una fila sin `userId` es justo uno de los casos
        // que la pantalla tiene que saber contar.
        userId: Long? = 12L,
        amount: String? = "12345.67",
        status: String? = "Pagado",
        periodFrom: String? = "2026-09-01T00:00:00.000Z",
        periodTo: String? = "2026-09-15T00:00:00.000Z",
        totalMinutes: Int? = 0,
        concepto: String? = "Quincena 1 de septiembre",
        note: String? = null,
        paidAt: String? = "2026-09-16T18:30:00.000Z",
        contabilidadRef: String? = "PAG-1-2026-09-16",
        evidenceUrls: List<String>? = null,
        createdAt: String? = "2026-09-16T12:00:00.000Z",
        user: PagoEmpleadoPersonaDto? = PagoEmpleadoPersonaDto(id = 12L, nombre = "Ana López"),
    ) = PagoEmpleadoDto(
        id = id,
        userId = userId,
        amount = amount,
        status = status,
        periodFrom = periodFrom,
        periodTo = periodTo,
        totalMinutes = totalMinutes,
        concepto = concepto,
        note = note,
        paidAt = paidAt,
        contabilidadRef = contabilidadRef,
        evidenceUrls = evidenceUrls,
        createdAt = createdAt,
        user = user,
    )

    // ── Dinero: lo que más caro sale ─────────────────────────────────────────

    @Test
    fun amountsArrivingAsTextKeepTheirCents() {
        assertEquals(1_234_567L, PagosRules.centavos("12345.67"))
        assertEquals(1_234_560L, PagosRules.centavos("12345.6"))
        assertEquals(1_234_500L, PagosRules.centavos("12345"))
        // Notación científica: `Number.prototype.toString` la usa con cifras grandes.
        assertEquals(100_000_000_000L, PagosRules.centavos("1e9"))
        // Medio centavo redondea hacia arriba, igual que el `Math.round` del servidor.
        assertEquals(1_235L, PagosRules.centavos("12.345"))
        // Un decimal largo no puede perder el centavo por el camino.
        assertEquals(1_234_568L, PagosRules.centavos("12345.6789"))
    }

    /** La regla de oro de esta pantalla: lo que no se entiende NO es cero. */
    @Test
    fun anAmountThatCannotBeReadIsNeverAZero() {
        assertNull(PagosRules.centavos(null))
        assertNull(PagosRules.centavos(""))
        assertNull(PagosRules.centavos("   "))
        assertNull(PagosRules.centavos("null"))
        assertNull(PagosRules.centavos("doce mil pesos"))

        assertEquals("—", PagosRules.pesos(null))
        assertEquals("—", PagosRules.pesos("no es un número"))
        assertEquals("—", PagosRules.montoTexto(pago(amount = null)))
        assertEquals("—", PagosRules.montoTexto(pago(amount = "")))

        assertFalse(PagosRules.tieneImporteLegible(pago(amount = null)))
        assertTrue(PagosRules.tieneImporteLegible(pago(amount = "0")))
    }

    /** Un cero de verdad sí es un cero: lo que no se enseña es el cero inventado. */
    @Test
    fun arealZeroIsShownAsZero() {
        assertEquals(0L, PagosRules.centavos("0"))
        assertEquals("$0.00", PagosRules.pesos("0"))
        assertEquals("$0.00", PagosRules.pesos("0.00"))
    }

    @Test
    fun pesosUseTheSameFormatterAsTheRestOfTheApp() {
        assertEquals("$12,345.67", PagosRules.pesos("12345.67"))
        assertEquals("$1,234,567.89", PagosRules.pesos("1234567.89"))
    }

    // ── Estado ───────────────────────────────────────────────────────────────

    @Test
    fun theThreeServerStatusesAreRecognised() {
        assertEquals(PagosRules.Estado.BORRADOR, PagosRules.estado("Borrador"))
        assertEquals(PagosRules.Estado.PAGADO, PagosRules.estado("Pagado"))
        assertEquals(PagosRules.Estado.ANULADO, PagosRules.estado("Anulado"))
        // Los sinónimos que el propio servidor acepta al escribir.
        assertEquals(PagosRules.Estado.BORRADOR, PagosRules.estado("draft"))
        assertEquals(PagosRules.Estado.BORRADOR, PagosRules.estado("pendiente"))
        assertEquals(PagosRules.Estado.ANULADO, PagosRules.estado("void"))
        assertEquals(PagosRules.Estado.ANULADO, PagosRules.estado("cancelado"))
        // Y sin importar cómo venga escrito.
        assertEquals(PagosRules.Estado.PAGADO, PagosRules.estado("  PAGADO "))
    }

    /**
     * La diferencia deliberada con el servidor: `normalizeStatus` manda a
     * `Pagado` todo lo que no reconoce, porque está pensado para guardar. Al
     * leer, eso afirmaría que el dinero salió sin saberlo.
     */
    @Test
    fun anUnknownStatusIsNeverReadAsPaid() {
        listOf(null, "", "   ", "en revisión", "lo que sea").forEach { valor ->
            assertEquals(
                "«$valor» no puede leerse como Pagado",
                PagosRules.Estado.DESCONOCIDO,
                PagosRules.estado(valor),
            )
        }
        assertEquals("Estado desconocido", PagosRules.estado("???").etiqueta)
        // Y no cuenta como pagado en ninguna cifra.
        val cifras = PagosRules.cifras(listOf(pago(status = "en revisión", amount = "1000")))
        assertEquals(0, cifras.pagados)
        assertEquals(0L, cifras.pagadoCentavos)
    }

    @Test
    fun colourOnlyAppearsWhereSomethingIsAskedFor() {
        // Liquidado y anulado son el flujo normal; el borrador pide autorización
        // y el estado ilegible pide que alguien lo mire.
        assertEquals(PagosRules.VERDE, PagosRules.colorDe(PagosRules.Estado.PAGADO))
        assertEquals(PagosRules.AMBAR, PagosRules.colorDe(PagosRules.Estado.BORRADOR))
        assertEquals(PagosRules.GRIS, PagosRules.colorDe(PagosRules.Estado.ANULADO))
        assertEquals(PagosRules.AMBAR, PagosRules.colorDe(PagosRules.Estado.DESCONOCIDO))
    }

    // ── Periodos: el día que se lee tal cual ─────────────────────────────────

    /**
     * Lo que esta prueba defiende: `periodFrom`/`periodTo` son `@db.Date` a
     * medianoche UTC. `2026-09-01T00:00:00.000Z` en México son las 18:00 del 31
     * de agosto; convertir de zona correría el periodo un día hacia atrás por
     * los dos extremos.
     */
    @Test
    fun aPeriodDayIsReadAsWrittenAndNeverShiftedByTimezone() {
        assertEquals(1, PagosRules.dia("2026-09-01T00:00:00.000Z")?.dayOfMonth)
        assertEquals(9, PagosRules.dia("2026-09-01T00:00:00.000Z")?.monthValue)
        assertEquals(15, PagosRules.dia("2026-09-15T00:00:00.000Z")?.dayOfMonth)
        // También acepta la fecha pelada, por si alguna ruta la manda así.
        assertEquals(15, PagosRules.dia("2026-09-15")?.dayOfMonth)
    }

    @Test
    fun aDayThatCannotBeReadIsNull() {
        assertNull(PagosRules.dia(null))
        assertNull(PagosRules.dia(""))
        assertNull(PagosRules.dia("ayer"))
        assertNull(PagosRules.dia("2026-13-45T00:00:00.000Z"))
    }

    /**
     * Ojo con «sept»: no es un dedazo. En español, septiembre se abrevia `sept`
     * —así lo tiene CLDR, que es de donde salen los meses en la JVM y en
     * Android— y es lo que ya enseñan Cotizaciones y Herramientas, que usan el
     * mismo formato. Cambiarlo a «sep» aquí dejaría dos abreviaturas distintas
     * para el mismo mes en la misma app.
     */
    @Test
    fun thePeriodIsWrittenWithoutRepeatingItself() {
        // Mismo mes y mismo año: el mes se escribe una sola vez.
        assertEquals("1 – 15 sept 2026", PagosRules.periodoTexto(pago()))
        // Mismo año, meses distintos.
        assertEquals(
            "28 ago – 10 sept 2026",
            PagosRules.periodoTexto(
                pago(
                    periodFrom = "2026-08-28T00:00:00.000Z",
                    periodTo = "2026-09-10T00:00:00.000Z",
                ),
            ),
        )
        // Años distintos: se escriben los dos enteros.
        assertEquals(
            "20 dic 2026 – 5 ene 2027",
            PagosRules.periodoTexto(
                pago(
                    periodFrom = "2026-12-20T00:00:00.000Z",
                    periodTo = "2027-01-05T00:00:00.000Z",
                ),
            ),
        )
        // Un solo día no se escribe como un rango de un día a sí mismo.
        assertEquals(
            "15 sept 2026",
            PagosRules.periodoTexto(
                pago(
                    periodFrom = "2026-09-15T00:00:00.000Z",
                    periodTo = "2026-09-15T00:00:00.000Z",
                ),
            ),
        )
    }

    /** Medio periodo se leería como el periodo entero, así que no se enseña. */
    @Test
    fun halfAPeriodIsNotAPeriod() {
        assertNull(PagosRules.periodoTexto(pago(periodFrom = null)))
        assertNull(PagosRules.periodoTexto(pago(periodTo = null)))
        assertNull(PagosRules.periodoTexto(pago(periodFrom = "", periodTo = "")))
    }

    @Test
    fun theLengthOfThePeriodCountsBothEnds() {
        // Del 1 al 15 hay quince días, no catorce: la quincena se cobra entera.
        assertEquals(15L, PagosRules.diasDelPeriodo(pago()))
        assertEquals(
            1L,
            PagosRules.diasDelPeriodo(
                pago(
                    periodFrom = "2026-09-15T00:00:00.000Z",
                    periodTo = "2026-09-15T00:00:00.000Z",
                ),
            ),
        )
        assertNull(PagosRules.diasDelPeriodo(pago(periodTo = null)))
        // Un periodo al revés no se inventa: el servidor no lo permite al crear,
        // pero una fila vieja podría traerlo.
        assertNull(
            PagosRules.diasDelPeriodo(
                pago(
                    periodFrom = "2026-09-20T00:00:00.000Z",
                    periodTo = "2026-09-10T00:00:00.000Z",
                ),
            ),
        )
    }

    // ── Instantes: aquí SÍ hay que cambiar de zona ───────────────────────────

    /**
     * El caso contrario al del periodo: `paidAt` es un instante real. Marcado a
     * las 18:30Z del 16, en México son las 12:30 del **16**; pero a las 02:00Z
     * del 17 son las 20:00 del **16**, y cortar el texto diría 17.
     */
    @Test
    fun anInstantIsConvertedToTheDayItWasInMexico() {
        val mexico = ZoneId.of("America/Mexico_City")
        assertEquals(16, PagosRules.diaDeInstante("2026-09-16T18:30:00.000Z", mexico)?.dayOfMonth)
        // Madrugada en Greenwich, todavía la tarde anterior aquí.
        assertEquals(16, PagosRules.diaDeInstante("2026-09-17T02:00:00.000Z", mexico)?.dayOfMonth)
        // Y no al revés: mediodía en Greenwich es la mañana del mismo día.
        assertEquals(17, PagosRules.diaDeInstante("2026-09-17T12:00:00.000Z", mexico)?.dayOfMonth)
    }

    @Test
    fun anInstantThatCannotBeReadIsNull() {
        assertNull(PagosRules.diaDeInstante(null))
        assertNull(PagosRules.diaDeInstante(""))
        assertNull(PagosRules.diaDeInstante("null"))
        assertNull(PagosRules.diaDeInstante("el martes"))
    }

    @Test
    fun whenTheMoneyLeftIsOnlySaidForPaidRowsThatKnowIt() {
        assertEquals("Pagado el 16 sept 2026", PagosRules.pagadoElTexto(pago()))
        // Un borrador no tiene fecha de pago aunque traiga `paidAt` por lo que sea.
        assertNull(PagosRules.pagadoElTexto(pago(status = "Borrador")))
        // Un `Pagado` sin `paidAt` no hereda la fecha de captura: son cosas
        // distintas, y en una aclaración se pregunta justo por ésta.
        assertNull(PagosRules.pagadoElTexto(pago(paidAt = null)))
    }

    // ── Textos de la fila ────────────────────────────────────────────────────

    @Test
    fun theEmployeeFallsBackToTheIdTheSameWayTheServerDoes() {
        assertEquals("Ana López", PagosRules.empleadoTexto(pago()))
        assertEquals("Usuario #12", PagosRules.empleadoTexto(pago(user = null)))
        assertEquals(
            "Usuario #12",
            PagosRules.empleadoTexto(pago(user = PagoEmpleadoPersonaDto(nombre = "   "))),
        )
        assertEquals(
            "Empleado sin identificar",
            PagosRules.empleadoTexto(pago(user = null, userId = null)),
        )
    }

    @Test
    fun theConceptFallsBackInTheSameOrderAsTheServer() {
        assertEquals("Quincena 1 de septiembre", PagosRules.conceptoTexto(pago()))
        assertEquals("Anticipo", PagosRules.conceptoTexto(pago(concepto = null, note = "Anticipo")))
        assertEquals("Pago sin concepto", PagosRules.conceptoTexto(pago(concepto = null, note = null)))
        assertEquals("Pago sin concepto", PagosRules.conceptoTexto(pago(concepto = "  ", note = "")))
    }

    /** `totalMinutes` vale 0 por omisión: un bono no trabajó cero horas. */
    @Test
    fun zeroMinutesAreNotShownAsZeroHours() {
        assertNull(PagosRules.horasTexto(pago(totalMinutes = 0)))
        assertNull(PagosRules.horasTexto(pago(totalMinutes = null)))
        assertNull(PagosRules.horasTexto(pago(totalMinutes = -5)))
        assertEquals("45 min", PagosRules.horasTexto(pago(totalMinutes = 45)))
        assertEquals("8 h", PagosRules.horasTexto(pago(totalMinutes = 480)))
        assertEquals("12 h 30 min", PagosRules.horasTexto(pago(totalMinutes = 750)))
    }

    @Test
    fun evidenceIsOnlyMentionedWhenThereIsSome() {
        assertNull(PagosRules.comprobantesTexto(pago(evidenceUrls = null)))
        assertNull(PagosRules.comprobantesTexto(pago(evidenceUrls = emptyList())))
        assertNull(PagosRules.comprobantesTexto(pago(evidenceUrls = listOf("  "))))
        assertEquals("1 comprobante", PagosRules.comprobantesTexto(pago(evidenceUrls = listOf("/uploads/a.pdf"))))
        assertEquals(
            "2 comprobantes",
            PagosRules.comprobantesTexto(pago(evidenceUrls = listOf("/uploads/a.pdf", "/uploads/b.png"))),
        )
    }

    @Test
    fun theSecondLineJoinsWhatThereIsAndSkipsWhatThereIsNot() {
        assertEquals("1 – 15 sept 2026", PagosRules.contextoTexto(pago()))
        assertEquals(
            "1 – 15 sept 2026 · 8 h · 1 comprobante",
            PagosRules.contextoTexto(pago(totalMinutes = 480, evidenceUrls = listOf("/uploads/a.pdf"))),
        )
        assertNull(PagosRules.contextoTexto(pago(periodFrom = null, totalMinutes = 0)))
    }

    // ── Filtros, búsqueda y orden ────────────────────────────────────────────

    @Test
    fun eachFilterCatchesItsOwnStatus() {
        val pagado = pago(id = 1L, status = "Pagado")
        val borrador = pago(id = 2L, status = "Borrador")
        val anulado = pago(id = 3L, status = "Anulado")
        val raro = pago(id = 4L, status = "vaya usted a saber")
        val todos = listOf(pagado, borrador, anulado, raro)

        val conteos = PagosRules.conteos(todos)
        assertEquals(4, conteos[PagosRules.Filtro.TODOS])
        assertEquals(1, conteos[PagosRules.Filtro.PAGADOS])
        assertEquals(1, conteos[PagosRules.Filtro.BORRADORES])
        assertEquals(1, conteos[PagosRules.Filtro.ANULADOS])

        // El de estado ilegible solo aparece en «Todos»: así es imposible no verlo.
        assertTrue(PagosRules.cumple(raro, PagosRules.Filtro.TODOS))
        assertFalse(PagosRules.cumple(raro, PagosRules.Filtro.PAGADOS))
        assertFalse(PagosRules.cumple(raro, PagosRules.Filtro.BORRADORES))
        assertFalse(PagosRules.cumple(raro, PagosRules.Filtro.ANULADOS))
    }

    @Test
    fun searchLooksAtTheSameFieldsAsTheWebPlusTheAccountingFolio() {
        val fila = pago(concepto = "Quincena", note = "con bono", contabilidadRef = "PAG-77-2026-09-16")
        assertTrue(PagosRules.coincide(fila, "ana"))
        assertTrue(PagosRules.coincide(fila, "LÓPEZ"))
        assertTrue(PagosRules.coincide(fila, "quincena"))
        assertTrue(PagosRules.coincide(fila, "bono"))
        // El folio es lo único que trae impreso quien viene a preguntar.
        assertTrue(PagosRules.coincide(fila, "PAG-77"))
        assertFalse(PagosRules.coincide(fila, "zzz"))
        // Sin texto, entra todo.
        assertTrue(PagosRules.coincide(fila, "   "))
    }

    @Test
    fun theOrderIsTheServersOneNewestFirst() {
        val viejo = pago(id = 1L, createdAt = "2026-09-01T12:00:00.000Z")
        val nuevo = pago(id = 2L, createdAt = "2026-09-20T12:00:00.000Z")
        val sinFecha = pago(id = 3L, createdAt = null)
        val orden = PagosRules.ordenar(listOf(viejo, sinFecha, nuevo)).map { it.id }
        assertEquals(listOf(2L, 1L, 3L), orden)
    }

    @Test
    fun filterAndSearchComposeAndKeepTheOrder() {
        val a = pago(id = 1L, status = "Pagado", createdAt = "2026-09-01T12:00:00.000Z")
        val b = pago(id = 2L, status = "Pagado", createdAt = "2026-09-20T12:00:00.000Z")
        val c = pago(id = 3L, status = "Borrador", createdAt = "2026-09-25T12:00:00.000Z")
        val visibles = PagosRules.aplicar(listOf(a, b, c), PagosRules.Filtro.PAGADOS, "ana")
        assertEquals(listOf(2L, 1L), visibles.map { it.id })
    }

    // ── La tira de cifras (reglas 1, 6 y 7) ──────────────────────────────────

    /** Regla 7: sin una sola fila, la tira no se pinta. */
    @Test
    fun withoutASingleRowTheStripIsNotDrawn() {
        assertTrue(PagosRules.metricas(emptyList()).isEmpty())
    }

    /**
     * La otra mitad de la regla 7: la condición es el conteo de filas, **no**
     * que las cifras den cero. Un periodo que de verdad cerró sin pagar nada sí
     * se enseña, porque eso es información.
     */
    @Test
    fun aPeriodThatReallyClosedAtZeroIsStillShown() {
        val soloBorradores = listOf(pago(status = "Borrador", amount = "0"))
        val metricas = PagosRules.metricas(soloBorradores)
        assertEquals(4, metricas.size)
        val pagado = metricas.first { it.clave == PagosRules.METRICA_PAGADO }
        assertEquals("$0.00", pagado.valor)
        assertEquals("nada liquidado", pagado.pista)
        // Y en gris: cero pagado no es una alarma, es un dato.
        assertNull(pagado.color)
    }

    @Test
    fun theStripAddsUpOnlyWhatItCanRead() {
        val todos = listOf(
            pago(id = 1L, status = "Pagado", amount = "1000.00", userId = 12L),
            pago(id = 2L, status = "Pagado", amount = "500.50", userId = 13L),
            pago(id = 3L, status = "Borrador", amount = "250.25", userId = 12L),
            pago(id = 4L, status = "Anulado", amount = "9999.99", userId = 14L),
            // El que no se puede leer: no suma en ningún lado.
            pago(id = 5L, status = "Pagado", amount = null, userId = 15L),
        )
        val c = PagosRules.cifras(todos)
        assertEquals(150_050L, c.pagadoCentavos)
        assertEquals(3, c.pagados)
        assertEquals(25_025L, c.borradorCentavos)
        assertEquals(1, c.borradores)
        // Por persona, no por fila: 12 aparece dos veces y cuenta una.
        assertEquals(4, c.empleados)
        assertEquals(1, c.anulados)
        assertEquals(1, c.sinImporte)

        // Y la pantalla lo dice en voz alta en vez de disimularlo.
        val aviso = PagosRules.avisoImportesTexto(todos)
        assertNotNull(aviso)
        assertTrue(aviso!!.contains("no trae un importe"))
        assertTrue(aviso.contains("—"))
    }

    /** Un anulado sin importe legible no preocupa a nadie: nadie va a cobrarlo. */
    @Test
    fun avoidedRowsWithoutAnAmountDoNotRaiseTheAlarm() {
        val todos = listOf(pago(status = "Anulado", amount = null))
        assertEquals(0, PagosRules.cifras(todos).sinImporte)
        assertNull(PagosRules.avisoImportesTexto(todos))
    }

    @Test
    fun theWarningColourOnlyAppearsWhenSomethingIsWaiting() {
        val sinPendientes = PagosRules.metricas(listOf(pago(status = "Pagado")))
            .first { it.clave == PagosRules.METRICA_BORRADOR }
        assertNull("sin borradores la celda va en gris", sinPendientes.color)
        assertEquals("nada pendiente", sinPendientes.pista)

        val conPendientes = PagosRules.metricas(listOf(pago(status = "Borrador")))
            .first { it.clave == PagosRules.METRICA_BORRADOR }
        assertEquals(PagosRules.AMBAR, conPendientes.color)
        assertEquals("1 por autorizar", conPendientes.pista)
    }

    /** Tocar una celda filtra, y el filtro puesto marca su celda: ida y vuelta. */
    @Test
    fun theStripAndTheFilterBarAgreeWithEachOther() {
        PagosRules.Filtro.entries.forEach { filtro ->
            val clave = PagosRules.metricaDeFiltro(filtro) ?: return@forEach
            assertEquals(filtro, PagosRules.filtroDeMetrica(clave))
        }
        // «Todos» no marca ninguna celda, y la de empleados no filtra nada.
        assertNull(PagosRules.metricaDeFiltro(PagosRules.Filtro.TODOS))
        assertNull(PagosRules.filtroDeMetrica(PagosRules.METRICA_EMPLEADOS))
    }

    // ── El cableado de «Más» ─────────────────────────────────────────────────

    /**
     * Pagos a empleados estrena pantalla nativa: tiene ruta propia y ya no cae
     * en la ficha de «ábrelo en la web». El fallo que esto vigila ya pasó con
     * Vehículos, que estrenó pantalla y siguió echando a la gente al navegador.
     */
    @Test
    fun employeePaymentsOpenInsideTheApp() {
        assertTrue(ConsoleRoutes.tienePantallaNativa(CoreExtraModule.PAGOS_EMPLEADOS))
        assertEquals(
            ConsoleRoutes.PagosEmpleados,
            ConsoleRoutes.forExtra(CoreExtraModule.PAGOS_EMPLEADOS),
        )
        assertFalse(
            ConsoleRoutes.forExtra(CoreExtraModule.PAGOS_EMPLEADOS).startsWith("console/more/"),
        )
    }

    // ── El contrato con el servidor ──────────────────────────────────────────

    /** La misma configuración que `ApiClient`: Moshi reflexivo de Kotlin. */
    private val moshi: Moshi = Moshi.Builder().add(KotlinJsonAdapterFactory()).build()

    /**
     * `GET employee-payments` tal cual lo devuelve `findAll`: la fila de Prisma
     * con `user` y `createdBy` incluidos. `amount` es un `Decimal` y sale como
     * **texto**; `totalMinutes` es un entero de verdad.
     *
     * Se prueba con Moshi y no con `org.json` a propósito: en la JVM `org.json`
     * es un stub que devuelve nulos, así que una prueba escrita con él pasaría
     * sin comprobar nada.
     */
    private val listaJson = """
        [
          {
            "id": 77,
            "userId": 12,
            "periodFrom": "2026-09-01T00:00:00.000Z",
            "periodTo": "2026-09-15T00:00:00.000Z",
            "totalMinutes": 750,
            "amount": "12345.67",
            "concepto": "Quincena 1 de septiembre",
            "note": null,
            "status": "Pagado",
            "paidAt": "2026-09-16T18:30:00.000Z",
            "contabilidadRef": "PAG-77-2026-09-16",
            "journalEntryId": 901,
            "companyId": 1,
            "evidenceUrls": ["/uploads/employee-payments/recibo.pdf"],
            "createdAt": "2026-09-16T12:00:00.000Z",
            "createdById": 3,
            "deletedAt": null,
            "user": { "id": 12, "nombre": "Ana López", "email": "ana@nexara.com.mx" },
            "createdBy": { "id": 3, "nombre": "Christian" }
          }
        ]
    """.trimIndent()

    @Test
    fun theListParsesAndEveryFieldTheScreenUsesSurvives() {
        val tipo = Types.newParameterizedType(List::class.java, PagoEmpleadoDto::class.java)
        val filas: List<PagoEmpleadoDto>? = moshi.adapter<List<PagoEmpleadoDto>>(tipo).fromJson(listaJson)
        val fila = filas?.singleOrNull()
        assertNotNull(fila)
        requireNotNull(fila)

        assertEquals(77L, fila.id)
        assertEquals(12L, fila.userId)
        // Lo que esta prueba defiende: el `Decimal` entra en un `String?` y sale
        // con los centavos exactos.
        assertEquals("12345.67", fila.amount)
        assertEquals(1_234_567L, PagosRules.centavosDe(fila))
        assertEquals("$12,345.67", PagosRules.montoTexto(fila))

        assertEquals(PagosRules.Estado.PAGADO, PagosRules.estadoDe(fila))
        assertEquals("Ana López", PagosRules.empleadoTexto(fila))
        assertEquals("Quincena 1 de septiembre", PagosRules.conceptoTexto(fila))
        assertEquals("1 – 15 sept 2026", PagosRules.periodoTexto(fila))
        assertEquals(15L, PagosRules.diasDelPeriodo(fila))
        assertEquals("12 h 30 min", PagosRules.horasTexto(fila))
        assertEquals("1 comprobante", PagosRules.comprobantesTexto(fila))
        assertEquals("Pagado el 16 sept 2026", PagosRules.pagadoElTexto(fila))
        assertTrue(PagosRules.coincide(fila, "PAG-77"))
    }

    /**
     * Un `amount` que llegara como **número** JSON —si alguna ruta lo convierte
     * con `Number(...)`, como hace `cotizaciones/core`— tiene que entrar igual.
     * Moshi sabe leer un número como texto; al revés no, y por eso el DTO nunca
     * declara `Double?`.
     */
    @Test
    fun anAmountArrivingAsAJsonNumberStillParses() {
        val json = """[{ "id": 1, "userId": 2, "amount": 12345.67, "status": "Pagado" }]"""
        val tipo = Types.newParameterizedType(List::class.java, PagoEmpleadoDto::class.java)
        val fila = moshi.adapter<List<PagoEmpleadoDto>>(tipo).fromJson(json)?.singleOrNull()
        assertNotNull(fila)
        requireNotNull(fila)
        assertEquals(1_234_567L, PagosRules.centavosDe(fila))
        assertEquals("$12,345.67", PagosRules.montoTexto(fila))
    }

    /**
     * Una fila a la que el servidor le quite campos no puede tumbar la pantalla:
     * todo el DTO es anulable con valor por omisión.
     */
    @Test
    fun aRowStrippedOfAlmostEverythingStillRenders() {
        val json = """[{ "id": 5 }]"""
        val tipo = Types.newParameterizedType(List::class.java, PagoEmpleadoDto::class.java)
        val fila = moshi.adapter<List<PagoEmpleadoDto>>(tipo).fromJson(json)?.singleOrNull()
        assertNotNull(fila)
        requireNotNull(fila)

        assertEquals("—", PagosRules.montoTexto(fila))
        assertEquals(PagosRules.Estado.DESCONOCIDO, PagosRules.estadoDe(fila))
        assertEquals("Empleado sin identificar", PagosRules.empleadoTexto(fila))
        assertEquals("Pago sin concepto", PagosRules.conceptoTexto(fila))
        assertNull(PagosRules.periodoTexto(fila))
        assertNull(PagosRules.contextoTexto(fila))
        assertNull(PagosRules.pagadoElTexto(fila))
    }
}
