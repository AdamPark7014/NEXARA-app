package mx.nexara.mobile.nativeapp.ui.console.aprobaciones

import com.squareup.moshi.Moshi
import com.squareup.moshi.Types
import com.squareup.moshi.kotlin.reflect.KotlinJsonAdapterFactory
import java.time.Instant
import java.time.ZoneId
import mx.nexara.mobile.nativeapp.data.api.AprobacionPendienteDto
import mx.nexara.mobile.nativeapp.data.api.DecisionRespuestaDto
import mx.nexara.mobile.nativeapp.ui.console.ConsoleRoutes
import mx.nexara.mobile.nativeapp.ui.console.CoreExtraModule
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Las reglas de Aprobaciones, con la respuesta real del API.
 *
 * Los JSON se leen con **Moshi**, el mismo adaptador que corre en el teléfono.
 * `org.json` está prohibido aquí: en el sourceSet `test` de Android es un stub
 * que devuelve nulos en vez de fallar, así que una prueba escrita con él daría
 * verde sin haber comprobado nada.
 *
 * La zona se inyecta fija (`GMT-06:00`) en vez de usar la tzdata del sistema:
 * México suprimió el horario de verano en 2022, y una JVM con la base vieja
 * pondría a septiembre en `-05:00` y tumbaría las pruebas de fecha por un
 * motivo que no tiene nada que ver con el código.
 */
class AprobacionesRulesTest {

    private val zonaMx: ZoneId = ZoneId.of("GMT-06:00")
    private val ahora: Instant = Instant.parse("2026-09-21T18:00:00Z")

    private val moshi: Moshi = Moshi.Builder().add(KotlinJsonAdapterFactory()).build()

    private fun parsear(json: String): List<AprobacionPendienteDto> {
        val tipo = Types.newParameterizedType(List::class.java, AprobacionPendienteDto::class.java)
        return moshi.adapter<List<AprobacionPendienteDto>>(tipo).fromJson(json) ?: emptyList()
    }

    private fun filas(json: String) = AprobacionesRules.ordenadas(parsear(json), ahora, zonaMx)

    /** Recorte fiel de `GET workflow/my-pending`: gasto #482, paso 2 de 3. */
    private val jsonBandeja = """
    [
      {
        "id": 91,
        "stepId": 12,
        "status": "PENDING",
        "comments": null,
        "createdAt": "2026-09-19T15:00:00.000Z",
        "step": {
          "id": 12,
          "stepNumber": 2,
          "name": "Autorización Dirección",
          "approverRoleId": 4,
          "approverRole": { "nombre": "Dirección" },
          "approverUser": null
        },
        "instance": {
          "id": 55,
          "entityId": 482,
          "entityType": "EXPENSE",
          "currentStep": 2,
          "isComplete": false,
          "isCancelled": false,
          "startedAt": "2026-09-19T14:55:00.000Z",
          "workflow": {
            "name": "Autorización de gastos",
            "entityType": "EXPENSE",
            "steps": [
              { "id": 11, "stepNumber": 1, "name": "Revisión contable", "approverRole": { "nombre": "Contabilidad" } },
              { "id": 12, "stepNumber": 2, "name": "Autorización Dirección", "approverRole": { "nombre": "Dirección" } },
              { "id": 13, "stepNumber": 3, "name": "Visto bueno CEO", "approverUser": { "nombre": "Adam" } }
            ]
          },
          "startedBy": { "id": 7, "nombre": "Ana López", "role": { "nombre": "Compras" } },
          "approvals": [
            { "id": 90, "stepId": 11, "status": "APPROVED", "decidedAt": "2026-09-19T14:58:00.000Z", "decidedBy": { "id": 3, "nombre": "Rosa Vela" } },
            { "id": 91, "stepId": 12, "status": "PENDING" }
          ]
        }
      }
    ]
    """.trimIndent()

    // ── Dinero ───────────────────────────────────────────────────────────────

    @Test
    fun `el importe se redondea a centavo con HALF_UP`() {
        assertEquals(1248000L, AprobacionesRules.centavos("12480.00"))
        assertEquals(1248050L, AprobacionesRules.centavos("12480.5"))
        assertEquals(123457L, AprobacionesRules.centavos("1234.565")) // .565 -> .57
        assertEquals(-50000L, AprobacionesRules.centavos("-500"))
    }

    @Test
    fun `un importe ilegible es raya y nunca cero`() {
        // Un importe desconocido y un importe de cero pesos no son lo mismo.
        // Confundirlos en un módulo donde se autoriza gasto es el error caro.
        assertNull(AprobacionesRules.centavos(null))
        assertNull(AprobacionesRules.centavos(""))
        assertNull(AprobacionesRules.centavos("   "))
        assertNull(AprobacionesRules.centavos("null"))
        assertNull(AprobacionesRules.centavos("pendiente"))
        assertEquals(AprobacionesRules.SIN_DATO, AprobacionesRules.pesos(null))
        assertEquals(AprobacionesRules.SIN_DATO, AprobacionesRules.pesos("N/D"))
        // Y un cero de verdad sí se enseña como cero.
        assertEquals("$0.00", AprobacionesRules.pesos("0"))
    }

    @Test
    fun `el importe se lee aunque el JSON lo mande como numero`() {
        // Moshi sabe leer un NUMBER dentro de un campo String, y nunca al revés:
        // por eso todos los importes del DTO se declaran `String?`.
        val json = jsonBandeja.replace(
            "\"currentStep\": 2,",
            "\"currentStep\": 2,\n          \"amount\": 12480.5,",
        )
        val fila = filas(json).single()
        assertEquals(1248050L, fila.importeCentavos)
        assertEquals("$12,480.50", fila.importe)
    }

    @Test
    fun `el total sirve de respaldo cuando no hay amount`() {
        // `amount` lo usan gastos y viáticos; `total`, cotizaciones.
        val json = jsonBandeja.replace(
            "\"currentStep\": 2,",
            "\"currentStep\": 2,\n          \"total\": \"98000.00\",",
        )
        assertEquals(9800000L, filas(json).single().importeCentavos)
    }

    // ── Fechas ───────────────────────────────────────────────────────────────

    @Test
    fun `medianoche en Greenwich es el dia anterior en Mexico`() {
        // 2026-09-21T00:30Z son las 18:30 del 20 de septiembre aquí. Quedarse
        // con el texto del API diría «21 sep»: un día de más en la bandeja.
        val ahoraTemprano = Instant.parse("2026-09-21T00:45:00Z")
        assertEquals(
            "Hoy 18:30",
            AprobacionesRules.recibidaTexto("2026-09-21T00:30:00.000Z", ahoraTemprano, zonaMx),
        )
        // Y desde la tarde del 21 en México, ese mismo instante ya es «Ayer».
        assertEquals(
            "Ayer 18:30",
            AprobacionesRules.recibidaTexto("2026-09-21T00:30:00.000Z", ahora, zonaMx),
        )
    }

    /**
     * «sept» no es un dedazo: en español septiembre se abrevia así, y es lo que
     * devuelve el CLDR con el que corre esta prueba. El resto del árbol
     * (`PagosRulesTest`) fija lo mismo; escribir «sep» aquí dejaría dos
     * abreviaturas distintas en la misma app.
     */
    @Test
    fun `una fecha lejana lleva dia mes y hora`() {
        assertEquals(
            "14 sept 09:15",
            AprobacionesRules.recibidaTexto("2026-09-14T15:15:00.000Z", ahora, zonaMx),
        )
    }

    @Test
    fun `una fecha ilegible sale como raya y no se inventa`() {
        assertEquals(AprobacionesRules.SIN_DATO, AprobacionesRules.recibidaTexto(null, ahora, zonaMx))
        assertEquals(
            AprobacionesRules.SIN_DATO,
            AprobacionesRules.recibidaTexto("ayer por la tarde", ahora, zonaMx),
        )
    }

    @Test
    fun `se admite el instante con desfase explicito`() {
        assertEquals(
            AprobacionesRules.instante("2026-09-20T23:30:00.000Z"),
            AprobacionesRules.instante("2026-09-20T17:30:00.000-06:00"),
        )
    }

    @Test
    fun `la espera se mide en horas reales`() {
        assertEquals(0L, AprobacionesRules.horasEsperando("2026-09-21T17:30:00Z", ahora))
        assertEquals(5L, AprobacionesRules.horasEsperando("2026-09-21T13:00:00Z", ahora))
        assertEquals(48L, AprobacionesRules.horasEsperando("2026-09-19T18:00:00Z", ahora))
        // Un reloj adelantado no produce esperas negativas.
        assertEquals(0L, AprobacionesRules.horasEsperando("2026-09-22T10:00:00Z", ahora))
        assertNull(AprobacionesRules.horasEsperando(null, ahora))

        assertFalse(AprobacionesRules.estaAtrasada(47L))
        assertTrue(AprobacionesRules.estaAtrasada(48L))
        assertFalse(AprobacionesRules.estaAtrasada(null))

        assertEquals("Llegó hace un momento", AprobacionesRules.esperaTexto(0L))
        assertEquals("Lleva 1 h parada", AprobacionesRules.esperaTexto(1L))
        assertEquals("Lleva 5 h parada", AprobacionesRules.esperaTexto(5L))
        assertEquals("Lleva 1 día parada", AprobacionesRules.esperaTexto(30L))
        assertEquals("Lleva 3 días parada", AprobacionesRules.esperaTexto(73L))
        assertEquals("Sin fecha de solicitud", AprobacionesRules.esperaTexto(null))
    }

    // ── Etiquetas ────────────────────────────────────────────────────────────

    @Test
    fun `traduce el tipo de entidad y no esconde lo desconocido`() {
        assertEquals("Gasto", AprobacionesRules.etiquetaTipo("EXPENSE"))
        assertEquals("Viático", AprobacionesRules.etiquetaTipo("viatic"))
        assertEquals("Orden de compra", AprobacionesRules.etiquetaTipo("PURCHASE_ORDER"))
        assertEquals("Cotización", AprobacionesRules.etiquetaTipo("COTIZACION"))
        assertEquals("Solicitud", AprobacionesRules.etiquetaTipo(null))
        // Lo que no se conoce se capitaliza: feo, pero dice de qué se trata.
        assertEquals("Something_new", AprobacionesRules.etiquetaTipo("SOMETHING_NEW"))
    }

    // ── Qué es, de quién y cuánto ────────────────────────────────────────────

    @Test
    fun `la ficha contesta que es de quien y cuanto`() {
        val fila = filas(jsonBandeja).single()

        assertEquals(91L, fila.aprobacionId)
        assertEquals(55L, fila.instanciaId)
        // QUÉ
        assertEquals("Gasto", fila.tipo)
        assertEquals("Gasto #482", fila.titulo)
        assertEquals("Autorización de gastos", fila.flujo)
        assertEquals("Paso 2 de 3 · Autorización Dirección", fila.paso)
        // DE QUIÉN
        assertEquals("Ana López", fila.solicita)
        assertEquals("Compras", fila.solicitaRol)
        // CUÁNTO: `my-pending` no manda importe hoy, así que «—», nunca «$0.00».
        assertEquals(AprobacionesRules.SIN_DATO, fila.importe)
        assertNull(fila.importeCentavos)
        // Firmar aquí NO cierra el flujo: todavía falta el CEO.
        assertFalse(fila.cierraElFlujo)
        assertEquals(51L, fila.horasEsperando)
        assertTrue(fila.atrasada)
        assertEquals("19 sept 09:00", fila.recibida)
    }

    @Test
    fun `sin solicitante y sin rol se dice, no se deja en blanco`() {
        val json = """
        [{ "id": 1, "createdAt": "2026-09-21T10:00:00Z",
           "instance": { "id": 1, "entityId": 9, "entityType": "HIRING" } }]
        """.trimIndent()
        val fila = filas(json).single()
        assertEquals("Contratación #9", fila.titulo)
        assertEquals("Sin solicitante", fila.solicita)
        assertEquals(AprobacionesRules.SIN_DATO, fila.solicitaRol)
    }

    // ── La cadena de firmas ──────────────────────────────────────────────────

    @Test
    fun `la cadena marca lo firmado lo tuyo y lo que aun no empieza`() {
        val fila = filas(jsonBandeja).single()

        assertEquals(3, fila.cadena.size)
        assertEquals(AprobacionesRules.EstadoPaso.APROBADO, fila.cadena[0].estado)
        assertEquals("Contabilidad", fila.cadena[0].aprobador)
        assertEquals("Rosa Vela", fila.cadena[0].decidioNombre)
        assertFalse(fila.cadena[0].esElTuyo)

        assertEquals(AprobacionesRules.EstadoPaso.PENDIENTE, fila.cadena[1].estado)
        assertTrue(fila.cadena[1].esElTuyo)

        // El tercer paso todavía no existe como aprobación: el servidor las crea
        // de una en una según avanza el flujo.
        assertEquals(AprobacionesRules.EstadoPaso.EN_ESPERA, fila.cadena[2].estado)
        assertEquals("Adam", fila.cadena[2].aprobador)
        assertFalse(fila.cadena[2].esElTuyo)
    }

    @Test
    fun `el ultimo paso avisa de que cierra el flujo`() {
        val json = """
        [
          {
            "id": 93,
            "stepId": 13,
            "status": "PENDING",
            "createdAt": "2026-09-21T14:00:00.000Z",
            "step": { "id": 13, "stepNumber": 3, "name": "Visto bueno CEO", "approverUser": { "nombre": "Adam" } },
            "instance": {
              "id": 55,
              "entityId": 482,
              "entityType": "EXPENSE",
              "currentStep": 3,
              "workflow": {
                "name": "Autorización de gastos",
                "entityType": "EXPENSE",
                "steps": [
                  { "id": 11, "stepNumber": 1, "name": "Revisión contable", "approverRole": { "nombre": "Contabilidad" } },
                  { "id": 12, "stepNumber": 2, "name": "Autorización Dirección", "approverRole": { "nombre": "Dirección" } },
                  { "id": 13, "stepNumber": 3, "name": "Visto bueno CEO", "approverUser": { "nombre": "Adam" } }
                ]
              },
              "startedBy": { "id": 7, "nombre": "Ana López", "role": { "nombre": "Compras" } },
              "approvals": [
                { "id": 90, "stepId": 11, "status": "APPROVED" },
                { "id": 92, "stepId": 12, "status": "APPROVED" },
                { "id": 93, "stepId": 13, "status": "PENDING" }
              ]
            }
          }
        ]
        """.trimIndent()
        val fila = filas(json).single()
        assertTrue(fila.cierraElFlujo)
        assertEquals("Paso 3 de 3 · Visto bueno CEO", fila.paso)
        assertTrue(fila.cadena[2].esElTuyo)
    }

    @Test
    fun `sin definicion de pasos no se promete que cierras el flujo`() {
        // Afirmar «tu firma cierra esto» sin saber cuántos pasos hay sería
        // justo la promesa que no se puede sostener.
        val json = """
        [{ "id": 5, "createdAt": "2026-09-21T10:00:00Z", "step": { "id": 1, "stepNumber": 1, "name": "Único" },
           "instance": { "id": 2, "entityId": 3, "entityType": "EXPENSE" } }]
        """.trimIndent()
        val fila = filas(json).single()
        assertFalse(fila.cierraElFlujo)
        assertEquals("Paso 1 · Único", fila.paso)
        assertTrue(fila.cadena.isEmpty())
    }

    // ── Orden ────────────────────────────────────────────────────────────────

    @Test
    fun `lo mas viejo primero y lo sin fecha al final`() {
        val json = """
        [
          { "id": 1, "createdAt": "2026-09-21T10:00:00Z", "instance": { "id": 1, "entityId": 1, "entityType": "EXPENSE" } },
          { "id": 2, "createdAt": null, "instance": { "id": 2, "entityId": 2, "entityType": "EXPENSE" } },
          { "id": 3, "createdAt": "2026-09-15T10:00:00Z", "instance": { "id": 3, "entityId": 3, "entityType": "EXPENSE" } }
        ]
        """.trimIndent()
        assertEquals(listOf(3L, 1L, 2L), filas(json).map { it.aprobacionId })
    }

    // ── Filtros y tira de cifras ─────────────────────────────────────────────

    @Test
    fun `los filtros separan lo atrasado de lo que cierra contigo`() {
        val fila = filas(jsonBandeja)
        assertEquals(1, AprobacionesRules.aplicar(fila, AprobacionesRules.Filtro.TODAS).size)
        assertEquals(1, AprobacionesRules.aplicar(fila, AprobacionesRules.Filtro.ATRASADAS).size)
        assertEquals(0, AprobacionesRules.aplicar(fila, AprobacionesRules.Filtro.CIERRAN).size)

        val conteos = AprobacionesRules.conteos(fila)
        assertEquals(1, conteos[AprobacionesRules.Filtro.ATRASADAS])
        assertEquals(0, conteos[AprobacionesRules.Filtro.CIERRAN])
    }

    @Test
    fun `la tira no se pinta por el conteo de filas, no porque las cifras sean cero`() {
        // Regla 7. Sin filas no hay tira: cuatro ceros encima de un «no hay nada
        // esperándote» ocupan el sitio de la única frase que ayuda ahí.
        assertTrue(AprobacionesRules.metricas(emptyList()).isEmpty())

        // Con filas SÍ se pinta, aunque haya contadores en cero: «0 cierran
        // contigo» es información, y es justo lo que alguien quiere confirmar.
        val metricas = AprobacionesRules.metricas(filas(jsonBandeja))
        val porClave = metricas.associateBy { it.clave }
        assertEquals("1", porClave[AprobacionesRules.METRICA_PENDIENTES]?.valor)
        assertEquals("0", porClave[AprobacionesRules.METRICA_CIERRAN]?.valor)
        assertEquals("1", porClave[AprobacionesRules.METRICA_ATRASADAS]?.valor)
        // El color solo aparece donde pide acción (regla 6).
        assertNull(porClave[AprobacionesRules.METRICA_CIERRAN]?.color)
        assertEquals(AprobacionesRules.ROJO, porClave[AprobacionesRules.METRICA_ATRASADAS]?.color)
        // Y sin importes no se dibuja una celda que siempre diría «—».
        assertNull(porClave[AprobacionesRules.METRICA_IMPORTE])
    }

    @Test
    fun `la celda de importe aparece solo cuando alguna fila trae cifra`() {
        val json = jsonBandeja.replace(
            "\"currentStep\": 2,",
            "\"currentStep\": 2,\n          \"amount\": \"1000.25\",",
        )
        val celda = AprobacionesRules.metricas(filas(json))
            .first { it.clave == AprobacionesRules.METRICA_IMPORTE }
        assertEquals("$1,000.25", celda.valor)
        assertEquals("suma de todas", celda.pista)
    }

    @Test
    fun `tocar una celda de la tira pone su filtro y al reves`() {
        assertEquals(
            AprobacionesRules.Filtro.ATRASADAS,
            AprobacionesRules.filtroDeMetrica(AprobacionesRules.METRICA_ATRASADAS),
        )
        assertEquals(
            AprobacionesRules.Filtro.CIERRAN,
            AprobacionesRules.filtroDeMetrica(AprobacionesRules.METRICA_CIERRAN),
        )
        // «Pendientes» e «Importe» no filtran nada: son totales.
        assertNull(AprobacionesRules.filtroDeMetrica(AprobacionesRules.METRICA_PENDIENTES))
        assertNull(AprobacionesRules.filtroDeMetrica(AprobacionesRules.METRICA_IMPORTE))
        assertEquals(
            AprobacionesRules.METRICA_ATRASADAS,
            AprobacionesRules.metricaDeFiltro(AprobacionesRules.Filtro.ATRASADAS),
        )
        assertNull(AprobacionesRules.metricaDeFiltro(AprobacionesRules.Filtro.TODAS))
    }

    // ── Decidir ──────────────────────────────────────────────────────────────

    @Test
    fun `rechazar exige motivo`() {
        // Un «no» sin explicación obliga al solicitante a ir a preguntar, y la
        // notificación que manda el backend llega vacía.
        assertFalse(AprobacionesRules.motivoValido(null))
        assertFalse(AprobacionesRules.motivoValido(""))
        assertFalse(AprobacionesRules.motivoValido("   "))
        assertFalse(AprobacionesRules.motivoValido("no"))
        assertTrue(AprobacionesRules.motivoValido("falta factura"))
    }

    @Test
    fun `la confirmacion dice lo que el servidor hizo de verdad`() {
        assertEquals(
            "Aprobada. Pasa al paso 3.",
            AprobacionesRules.mensajeDeDecision(
                true,
                DecisionRespuestaDto(decided = true, complete = false, nextStep = 3),
            ),
        )
        assertEquals(
            "Aprobada. El flujo queda cerrado.",
            AprobacionesRules.mensajeDeDecision(true, DecisionRespuestaDto(decided = true, complete = true)),
        )
        assertEquals(
            "Rechazada. La solicitud queda cancelada y el solicitante ya fue avisado.",
            AprobacionesRules.mensajeDeDecision(
                false,
                DecisionRespuestaDto(decided = true, complete = true, cancelled = true),
            ),
        )
    }

    @Test
    fun `manda la respuesta del servidor sobre la intencion`() {
        // Si se pidió aprobar y el servidor contesta `cancelled`, mandó él: es
        // quien acaba de escribir en la base.
        assertEquals(
            "Rechazada. La solicitud queda cancelada y el solicitante ya fue avisado.",
            AprobacionesRules.mensajeDeDecision(
                aprobado = true,
                respuesta = DecisionRespuestaDto(decided = true, complete = true, cancelled = true),
            ),
        )
    }

    // ── Cableado ─────────────────────────────────────────────────────────────

    /**
     * Aprobaciones estrenó pantalla nativa: ruta propia y fuera de la ficha de
     * «ábrelo en la web». Es el fallo que ya pasó con Vehículos —pantalla nueva
     * y enrutado viejo—, y un enlace entrante seguía sacando a la gente de la app.
     */
    @Test
    fun `aprobaciones se abre dentro de la app`() {
        assertTrue(ConsoleRoutes.tienePantallaNativa(CoreExtraModule.APROBACIONES))
        assertEquals(
            ConsoleRoutes.Aprobaciones,
            ConsoleRoutes.forExtra(CoreExtraModule.APROBACIONES),
        )
        assertFalse(
            ConsoleRoutes.forExtra(CoreExtraModule.APROBACIONES).startsWith("console/more/"),
        )
    }
}
