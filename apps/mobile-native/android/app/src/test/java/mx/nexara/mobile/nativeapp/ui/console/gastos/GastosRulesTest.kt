package mx.nexara.mobile.nativeapp.ui.console.gastos

import com.squareup.moshi.Moshi
import com.squareup.moshi.Types
import com.squareup.moshi.kotlin.reflect.KotlinJsonAdapterFactory
import java.time.LocalDate
import mx.nexara.mobile.nativeapp.data.api.GastoDto
import mx.nexara.mobile.nativeapp.data.api.GastoPersonaDto
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * En gastos lo que no puede fallar es **el dinero**, **el día** y **el estado**:
 * de ahí salen la cifra que se enseña, el filtro en el que cae cada gasto y la
 * decisión que se ofrece sobre él.
 *
 * Tres trampas concretas vigilan la mayoría de estas pruebas:
 *
 * 1. `montoSolicitado` es un `Decimal` de Prisma y el controlador devuelve la
 *    fila cruda, así que llega como número JSON o como texto. Por eso el DTO lo
 *    declara `String?`: Moshi sabe leer un número como texto y nunca al revés.
 * 2. Las fechas son instantes UTC y México va seis horas atrás: leerlas como
 *    instante corre el día uno para atrás.
 * 3. La tira de cifras no se pinta cuando no hay **filas**, que no es lo mismo
 *    que cuando las cifras dan cero (regla 7 del contrato de diseño).
 */
class GastosRulesTest {

    private fun gasto(
        id: Long = 1L,
        concepto: String? = "Renta de oficina",
        razonGasto: String? = null,
        categoria: String? = "Renta",
        monto: String? = "12500.50",
        estatus: String? = "Pendiente",
        fechaGasto: String? = "2026-09-18T12:00:00.000Z",
        fechaSolicitud: String? = "2026-09-18T12:00:00.000Z",
        esRecurrente: Boolean? = false,
        ticket: String? = "/uploads/expenses/ticket.jpg",
        ref: String? = null,
        usuario: GastoPersonaDto? = GastoPersonaDto(id = 7L, nombre = "Ana López"),
    ) = GastoDto(
        id = id,
        concepto = concepto,
        razonGasto = razonGasto,
        categoria = categoria,
        montoSolicitado = monto,
        estatusPago = estatus,
        fechaGasto = fechaGasto,
        fechaSolicitud = fechaSolicitud,
        esRecurrente = esRecurrente,
        ticketEvidenciaUrl = ticket,
        contabilidadRef = ref,
        usuario = usuario,
    )

    // ── Dinero ───────────────────────────────────────────────────────────────

    @Test
    fun `lee el importe venga como texto o como numero`() {
        assertEquals(1_250_050L, GastosRules.centavos("12500.50"))
        // Lo que Moshi entrega tras leer un número JSON sin decimales.
        assertEquals(1_250_000L, GastosRules.centavos("12500"))
        assertEquals(1_250_000L, GastosRules.centavos("12500.0"))
    }

    @Test
    fun `redondea el centavo igual que el servidor`() {
        // `Math.round(n * 100)` del servidor: HALF_UP, no HALF_EVEN.
        assertEquals(1235L, GastosRules.centavos("12.345"))
        assertEquals(1234L, GastosRules.centavos("12.344"))
        assertEquals(3L, GastosRules.centavos("0.025"))
    }

    @Test
    fun `un importe ilegible es nulo, nunca cero`() {
        assertNull(GastosRules.centavos(null))
        assertNull(GastosRules.centavos(""))
        assertNull(GastosRules.centavos("   "))
        assertNull(GastosRules.centavos("null"))
        assertNull(GastosRules.centavos("doce pesos"))
    }

    @Test
    fun `un importe ilegible se enseña como raya, no como cero`() {
        assertEquals("—", GastosRules.pesos(null))
        assertEquals("—", GastosRules.pesos("doce pesos"))
        assertEquals("$12,500.50", GastosRules.pesos("12500.50"))
        // Un gasto que de verdad vale cero sí dice cero: eso es un dato.
        assertEquals("$0.00", GastosRules.pesos("0"))
    }

    @Test
    fun `Moshi lee un numero JSON en el campo de texto del importe`() {
        val moshi: Moshi = Moshi.Builder().add(KotlinJsonAdapterFactory()).build()
        val tipo = Types.newParameterizedType(List::class.java, GastoDto::class.java)
        val filas: List<GastoDto>? = moshi.adapter<List<GastoDto>>(tipo).fromJson(
            """
            [
              {"id": 1, "concepto": "Renta", "montoSolicitado": 12500.5, "estatusPago": "Pendiente"},
              {"id": 2, "concepto": "Internet", "montoSolicitado": "899.00", "estatusPago": "Pagado"}
            ]
            """.trimIndent(),
        )
        assertNotNull(filas)
        // Ésta es la razón de declarar todo importe como `String?`.
        assertEquals(1_250_050L, GastosRules.centavos(filas!![0].montoSolicitado))
        assertEquals(89_900L, GastosRules.centavos(filas[1].montoSolicitado))
    }

    @Test
    fun `una fila sin casi nada no tumba nada`() {
        val moshi: Moshi = Moshi.Builder().add(KotlinJsonAdapterFactory()).build()
        val fila = moshi.adapter(GastoDto::class.java).fromJson("""{"id": 7}""")
        assertNotNull(fila)
        assertEquals("Gasto sin concepto", GastosRules.conceptoTexto(fila!!))
        assertEquals("—", GastosRules.montoTexto(fila))
        assertEquals("—", GastosRules.fechaTexto(fila))
        assertEquals(GastosRules.Estado.DESCONOCIDO, GastosRules.estadoDe(fila))
    }

    // ── Fechas ───────────────────────────────────────────────────────────────

    @Test
    fun `medianoche en Greenwich sigue siendo el mismo dia`() {
        // Leído como instante y convertido a hora de México sería el 17.
        assertEquals(LocalDate.of(2026, 9, 18), GastosRules.fecha("2026-09-18T00:00:00.000Z"))
        assertEquals(LocalDate.of(2026, 9, 18), GastosRules.fecha("2026-09-18T12:00:00.000Z"))
        assertEquals(LocalDate.of(2026, 9, 18), GastosRules.fecha("2026-09-18"))
    }

    @Test
    fun `una fecha que no se entiende no se inventa`() {
        assertNull(GastosRules.fecha(null))
        assertNull(GastosRules.fecha("ayer"))
        assertNull(GastosRules.fecha("2026-13-45T00:00:00.000Z"))
        assertEquals("—", GastosRules.fechaTexto(gasto(fechaGasto = null, fechaSolicitud = null)))
    }

    @Test
    fun `sin fecha de gasto se cae a la de solicitud`() {
        val row = gasto(fechaGasto = null, fechaSolicitud = "2026-09-15T23:40:00.000Z")
        assertEquals(LocalDate.of(2026, 9, 15), GastosRules.fechaDelGasto(row))
        assertTrue(GastosRules.fechaTexto(row).startsWith("15"))
    }

    @Test
    fun `los dias del alta van de hoy hacia atras`() {
        val hoy = LocalDate.of(2026, 9, 21)
        val dias = GastosRules.opcionesDeFecha(hoy)
        assertEquals(GastosRules.DIAS_DE_ALTA.toInt(), dias.size)
        assertEquals("Hoy", dias[0].etiqueta)
        assertEquals("2026-09-21", dias[0].valorApi)
        assertEquals("Ayer", dias[1].etiqueta)
        assertEquals("2026-09-20", dias[1].valorApi)
        // Del tercero en adelante se nombra el día, que «antier» ya se lee mal.
        assertTrue(dias[2].etiqueta.startsWith("19"))
        assertEquals("2026-09-18", dias[3].valorApi)
    }

    // ── Estado ───────────────────────────────────────────────────────────────

    @Test
    fun `reconoce los estados del servidor y sus sinonimos viejos`() {
        assertEquals(GastosRules.Estado.PENDIENTE, GastosRules.estado("Pendiente"))
        assertEquals(GastosRules.Estado.APROBADO, GastosRules.estado("Aprobado"))
        assertEquals(GastosRules.Estado.PAGADO, GastosRules.estado("Pagado"))
        assertEquals(GastosRules.Estado.RECHAZADO, GastosRules.estado("Rechazado"))
        // Mayúsculas viejas de la interfaz y sinónimos en inglés.
        assertEquals(GastosRules.Estado.PENDIENTE, GastosRules.estado("PENDIENTE_APROBACION"))
        assertEquals(GastosRules.Estado.APROBADO, GastosRules.estado("approved"))
        assertEquals(GastosRules.Estado.PAGADO, GastosRules.estado("PAID"))
        assertEquals(GastosRules.Estado.RECHAZADO, GastosRules.estado("cancelado"))
        assertEquals(GastosRules.Estado.DESCONOCIDO, GastosRules.estado(null))
        assertEquals(GastosRules.Estado.DESCONOCIDO, GastosRules.estado("lo que sea"))
    }

    @Test
    fun `solo lleva color el estado que pide hacer algo`() {
        assertNotNull(GastosRules.colorEstado(GastosRules.Estado.PENDIENTE))
        assertNotNull(GastosRules.colorEstado(GastosRules.Estado.PAGADO))
        assertNotNull(GastosRules.colorEstado(GastosRules.Estado.RECHAZADO))
        // «Autorizado» es el flujo normal: gris, o la lista se vuelve un semáforo.
        assertNull(GastosRules.colorEstado(GastosRules.Estado.APROBADO))
        assertNull(GastosRules.colorEstado(GastosRules.Estado.DESCONOCIDO))
    }

    @Test
    fun `cada estado ofrece solo la decision que el servidor acepta`() {
        assertTrue(GastosRules.puedeAutorizar(gasto(estatus = "Pendiente")))
        assertFalse(GastosRules.puedeAutorizar(gasto(estatus = "Aprobado")))
        assertFalse(GastosRules.puedeAutorizar(gasto(estatus = "Pagado")))

        assertTrue(GastosRules.puedePagar(gasto(estatus = "Aprobado")))
        assertFalse(GastosRules.puedePagar(gasto(estatus = "Pendiente")))
        assertFalse(GastosRules.puedePagar(gasto(estatus = "Pagado")))
    }

    // ── Comprobante ──────────────────────────────────────────────────────────

    @Test
    fun `falta comprobante solo en los que todavia cuentan`() {
        assertTrue(GastosRules.sinComprobante(gasto(ticket = null)))
        assertTrue(GastosRules.sinComprobante(gasto(ticket = "   ")))
        assertFalse(GastosRules.sinComprobante(gasto(ticket = "/uploads/expenses/t.jpg")))
        // Un rechazado ya no va a ninguna póliza: pedirle papel es ruido.
        assertFalse(GastosRules.sinComprobante(gasto(ticket = null, estatus = "Rechazado")))
    }

    // ── Filtros y búsqueda ───────────────────────────────────────────────────

    private fun lista() = listOf(
        gasto(id = 1L, estatus = "Pendiente", monto = "100.00"),
        gasto(id = 2L, estatus = "Aprobado", monto = "200.00"),
        gasto(id = 3L, estatus = "Pagado", monto = "300.00"),
        gasto(id = 4L, estatus = "Rechazado", monto = "400.00", ticket = null),
        gasto(id = 5L, estatus = "Pendiente", monto = "500.00", ticket = null),
    )

    @Test
    fun `cada filtro recoge lo que dice su nombre`() {
        val conteos = GastosRules.conteos(lista())
        assertEquals(5, conteos[GastosRules.Filtro.TODOS])
        assertEquals(2, conteos[GastosRules.Filtro.POR_AUTORIZAR])
        assertEquals(1, conteos[GastosRules.Filtro.POR_PAGAR])
        assertEquals(1, conteos[GastosRules.Filtro.PAGADOS])
        assertEquals(1, conteos[GastosRules.Filtro.RECHAZADOS])
        // El rechazado sin ticket no cuenta; el pendiente sin ticket sí.
        assertEquals(1, conteos[GastosRules.Filtro.SIN_COMPROBANTE])
    }

    @Test
    fun `la celda de la tira sabe a que filtro corresponde`() {
        GastosRules.Filtro.entries.forEach { filtro ->
            assertEquals(filtro, GastosRules.Filtro.porClave(filtro.clave))
        }
        assertNull(GastosRules.Filtro.porClave("no_existe"))
        assertNull(GastosRules.Filtro.porClave(null))
    }

    @Test
    fun `la busqueda mira concepto, categoria, persona y folio`() {
        val row = gasto(
            concepto = "Suscripción a Figma",
            categoria = "Suscripciones",
            ref = "GAS-12-2026-09-18",
            usuario = GastoPersonaDto(id = 3L, nombre = "Juan Aguilar"),
        )
        assertTrue(GastosRules.coincide(row, "figma"))
        assertTrue(GastosRules.coincide(row, "SUSCRIP"))
        assertTrue(GastosRules.coincide(row, "aguilar"))
        assertTrue(GastosRules.coincide(row, "GAS-12"))
        assertTrue(GastosRules.coincide(row, "   "))
        assertFalse(GastosRules.coincide(row, "gasolina"))
    }

    @Test
    fun `la busqueda tambien alcanza el texto libre viejo`() {
        val viejo = gasto(concepto = null, razonGasto = "Caseta de la México-Puebla")
        assertEquals("Caseta de la México-Puebla", GastosRules.conceptoTexto(viejo))
        assertTrue(GastosRules.coincide(viejo, "caseta"))
    }

    @Test
    fun `el mas reciente va primero`() {
        val ordenado = GastosRules.ordenar(
            listOf(
                gasto(id = 1L, fechaSolicitud = "2026-09-10T12:00:00.000Z"),
                gasto(id = 2L, fechaSolicitud = "2026-09-20T12:00:00.000Z"),
                gasto(id = 3L, fechaSolicitud = "2026-09-15T12:00:00.000Z"),
            ),
        )
        assertEquals(listOf(2L, 3L, 1L), ordenado.map { it.id })
    }

    @Test
    fun `sin fecha se ordena por id descendente y no se pierde ninguno`() {
        val ordenado = GastosRules.ordenar(
            listOf(
                gasto(id = 1L, fechaGasto = null, fechaSolicitud = null),
                gasto(id = 9L, fechaGasto = null, fechaSolicitud = null),
            ),
        )
        assertEquals(listOf(9L, 1L), ordenado.map { it.id })
    }

    @Test
    fun `filtrar y buscar se aplican juntos y ordenados`() {
        val visibles = GastosRules.aplicar(
            lista(),
            GastosRules.Filtro.POR_AUTORIZAR,
            "renta",
        )
        assertEquals(2, visibles.size)
        assertTrue(visibles.all { GastosRules.estadoDe(it) == GastosRules.Estado.PENDIENTE })
    }

    // ── La tira de cifras (reglas 1 y 7) ─────────────────────────────────────

    @Test
    fun `sin ninguna fila la tira no se dibuja`() {
        assertTrue(GastosRules.cifras(emptyList()).isEmpty())
    }

    @Test
    fun `un periodo que de verdad cerro en cero si se enseña`() {
        // La condición de la regla 7 es el conteo de filas, no que las cifras
        // sean cero: aquí hay un gasto, así que las cuatro celdas salen.
        val cifras = GastosRules.cifras(listOf(gasto(estatus = "Rechazado", monto = "0")))
        assertEquals(4, cifras.size)
        assertEquals("$0.00", cifras[0].valor)
    }

    @Test
    fun `las cuatro cifras suman lo que les toca`() {
        val cifras = GastosRules.cifras(lista())
        assertEquals(4, cifras.size)
        // Por autorizar: 100 + 500.
        assertEquals("$600.00", cifras[0].valor)
        assertEquals("2 gastos esperando", cifras[0].pista)
        // Por pagar: solo el autorizado.
        assertEquals("$200.00", cifras[1].valor)
        assertEquals("1 autorizado sin pagar", cifras[1].pista)
        assertEquals("$300.00", cifras[2].valor)
        // La última es un conteo, no dinero: lo que bloquea el cierre.
        assertEquals("1", cifras[3].valor)
        assertEquals("bloquean el cierre", cifras[3].pista)
    }

    @Test
    fun `la cifra solo se tiñe cuando hay algo que hacer`() {
        val conPendientes = GastosRules.cifras(lista())
        assertNotNull(conPendientes[0].color)
        assertNotNull(conPendientes[3].color)
        // «Por pagar» y «Pagado» son el flujo normal: nunca llevan color.
        assertNull(conPendientes[1].color)
        assertNull(conPendientes[2].color)

        val todoEnOrden = GastosRules.cifras(listOf(gasto(estatus = "Pagado")))
        assertNull(todoEnOrden[0].color)
        assertNull(todoEnOrden[3].color)
        assertEquals("todo comprobado", todoEnOrden[3].pista)
    }

    @Test
    fun `un importe ilegible no infla la cifra`() {
        val cifras = GastosRules.cifras(
            listOf(
                gasto(id = 1L, estatus = "Pendiente", monto = "100.00"),
                gasto(id = 2L, estatus = "Pendiente", monto = "vete a saber"),
            ),
        )
        // Antes una cifra corta que una con un cero fingido dentro.
        assertEquals("$100.00", cifras[0].valor)
        assertEquals("2 gastos esperando", cifras[0].pista)
    }

    @Test
    fun `las claves de la tira son las de los filtros`() {
        val claves = GastosRules.cifras(lista()).map { it.clave }
        assertEquals(
            listOf(
                GastosRules.Filtro.POR_AUTORIZAR.clave,
                GastosRules.Filtro.POR_PAGAR.clave,
                GastosRules.Filtro.PAGADOS.clave,
                GastosRules.Filtro.SIN_COMPROBANTE.clave,
            ),
            claves,
        )
    }

    // ── Textos de la fila ────────────────────────────────────────────────────

    @Test
    fun `el contexto de la fila dice categoria, quien y si se repite`() {
        assertEquals(
            "Renta · Ana López",
            GastosRules.contextoTexto(gasto()),
        )
        assertEquals(
            "Renta · Ana López · Recurrente",
            GastosRules.contextoTexto(gasto(esRecurrente = true)),
        )
        assertEquals(
            "Sin categoría",
            GastosRules.contextoTexto(gasto(categoria = null, usuario = null)),
        )
    }

    @Test
    fun `el folio contable no se inventa mientras el API no lo escriba`() {
        assertNull(GastosRules.referenciaTexto(gasto(ref = null)))
        assertNull(GastosRules.referenciaTexto(gasto(ref = "  ")))
        assertEquals("Ref. GAS-12", GastosRules.referenciaTexto(gasto(ref = "GAS-12")))
    }

    // ── Alta ─────────────────────────────────────────────────────────────────

    @Test
    fun `el alta dice que falta, en el orden en que se lee el formulario`() {
        assertEquals(
            "Captura cuánto se gastó",
            GastosRules.faltaParaRegistrar(concepto = "", importe = "", tieneTicket = false),
        )
        assertEquals(
            "Ese importe no se entiende",
            GastosRules.faltaParaRegistrar(concepto = "", importe = "abc", tieneTicket = false),
        )
        assertEquals(
            "El importe tiene que ser mayor que cero",
            GastosRules.faltaParaRegistrar(concepto = "", importe = "0", tieneTicket = false),
        )
        assertEquals(
            "Di en qué se gastó",
            GastosRules.faltaParaRegistrar(concepto = "  ", importe = "120", tieneTicket = false),
        )
        assertEquals(
            "Falta la foto del comprobante",
            GastosRules.faltaParaRegistrar(concepto = "Gasolina", importe = "120", tieneTicket = false),
        )
        assertNull(
            GastosRules.faltaParaRegistrar(concepto = "Gasolina", importe = "120.50", tieneTicket = true),
        )
    }

    @Test
    fun `las categorias son exactamente las que acepta el servidor`() {
        // `normalizeCategory` convierte en «Otro» lo que no reconozca, sin avisar.
        assertEquals(
            listOf(
                "Renta",
                "Servicios",
                "Suscripciones",
                "Material",
                "Publicidad",
                "Equipo",
                "Nómina",
                "Impuestos",
                "Otro",
            ),
            GastosRules.CATEGORIAS,
        )
        assertTrue(GastosRules.CATEGORIA_POR_OMISION in GastosRules.CATEGORIAS)
    }
}
