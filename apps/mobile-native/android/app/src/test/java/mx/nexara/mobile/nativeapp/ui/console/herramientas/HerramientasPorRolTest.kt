package mx.nexara.mobile.nativeapp.ui.console.herramientas

import com.squareup.moshi.Moshi
import com.squareup.moshi.Types
import com.squareup.moshi.kotlin.reflect.KotlinJsonAdapterFactory
import java.time.Instant
import java.time.LocalDate
import mx.nexara.mobile.nativeapp.data.api.HerramientaPersonaDto
import mx.nexara.mobile.nativeapp.data.api.KitAsignacionDto
import mx.nexara.mobile.nativeapp.data.api.KitPiezaDto
import mx.nexara.mobile.nativeapp.data.api.PrestamoHerramientaDto
import mx.nexara.mobile.nativeapp.data.api.RenovacionPendienteDto
import mx.nexara.mobile.nativeapp.ui.console.herramientas.HerramientasRules.AccionAlmacen
import mx.nexara.mobile.nativeapp.ui.console.herramientas.HerramientasRules.BotonPrincipal
import mx.nexara.mobile.nativeapp.ui.console.herramientas.HerramientasRules.FiltroEmpresa
import mx.nexara.mobile.nativeapp.ui.console.herramientas.HerramientasRules.Perfil
import mx.nexara.mobile.nativeapp.ui.console.herramientas.HerramientasRules.Vista
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** Qué le toca a cada quien en Herramientas: dirección lee, Iván opera y la gente pide. */
class HerramientasPorRolTest {

    private val hoy = LocalDate.of(2026, 11, 4)
    private val ahora = Instant.parse("2026-11-04T18:00:00Z")

    private fun prestamo(
        id: Long,
        status: String,
        regreso: String? = "2026-11-20T12:00:00.000Z",
        persona: String? = "Ana López",
        pieza: Long? = null,
        codigo: String? = null,
        caduca: String? = null,
        pedida: String? = null,
    ) = PrestamoHerramientaDto(
        id = id,
        toolName = "Taladro",
        status = status,
        expectedReturnDate = regreso,
        usuario = persona?.let { HerramientaPersonaDto(id = 9L, nombre = it) },
        inventoryItemId = pieza,
        pickupCode = codigo,
        pickupExpiresAt = caduca,
        requestDate = pedida,
    )

    private fun pieza(id: Long, status: String = "AVAILABLE", nombre: String = "Taladro") =
        KitPiezaDto(id = id, toolName = nombre, model = "HP1640", serialNumber = "S$id", codigoInterno = "TAL-$id", status = status)

    // ── Quién ve qué ─────────────────────────────────────────────────────────

    @Test
    fun `direccion gana aunque traiga el permiso de administrar`() {
        assertEquals(Perfil.DIRECCION, HerramientasRules.perfil(esDireccion = true, administra = true))
        assertEquals(Perfil.ADMINISTRA, HerramientasRules.perfil(esDireccion = false, administra = true))
        assertEquals(Perfil.PERSONAL, HerramientasRules.perfil(esDireccion = false, administra = false))
    }

    @Test
    fun `cada quien abre lo suyo`() {
        assertEquals(listOf(Vista.EMPRESA, Vista.INVENTARIO), HerramientasRules.vistas(Perfil.DIRECCION))
        assertEquals(
            listOf(Vista.POR_APROBAR, Vista.EMPRESA, Vista.INVENTARIO, Vista.KIT, Vista.PRESTAMOS),
            HerramientasRules.vistas(Perfil.ADMINISTRA),
        )
        assertEquals(listOf(Vista.KIT, Vista.PRESTAMOS), HerramientasRules.vistas(Perfil.PERSONAL))
    }

    @Test
    fun `el escaner solo le sale a quien entrega y recibe`() {
        assertTrue(HerramientasRules.muestraEscaner(Perfil.ADMINISTRA))
        assertFalse(HerramientasRules.muestraEscaner(Perfil.DIRECCION))
        assertFalse(HerramientasRules.muestraEscaner(Perfil.PERSONAL))
    }

    @Test
    fun `un solo boton principal por pestana, y direccion no tiene ninguno`() {
        Vista.entries.forEach { assertNull(HerramientasRules.botonPrincipal(Perfil.DIRECCION, it)) }

        assertEquals(BotonPrincipal.PEDIR_PRESTAMO, HerramientasRules.botonPrincipal(Perfil.PERSONAL, Vista.KIT))
        assertEquals(BotonPrincipal.PEDIR_PRESTAMO, HerramientasRules.botonPrincipal(Perfil.PERSONAL, Vista.PRESTAMOS))

        assertEquals(BotonPrincipal.NUEVA_HERRAMIENTA, HerramientasRules.botonPrincipal(Perfil.ADMINISTRA, Vista.INVENTARIO))
        assertEquals(BotonPrincipal.PEDIR_PRESTAMO, HerramientasRules.botonPrincipal(Perfil.ADMINISTRA, Vista.PRESTAMOS))
        assertNull(HerramientasRules.botonPrincipal(Perfil.ADMINISTRA, Vista.POR_APROBAR))
        assertNull(HerramientasRules.botonPrincipal(Perfil.ADMINISTRA, Vista.EMPRESA))
    }

    @Test
    fun `solo ivan opera`() {
        assertTrue(HerramientasRules.puedeOperar(Perfil.ADMINISTRA))
        assertFalse(HerramientasRules.puedeOperar(Perfil.DIRECCION))
        assertFalse(HerramientasRules.puedeOperar(Perfil.PERSONAL))
    }

    @Test
    fun `visto desde fuera nadie la trae tu`() {
        assertEquals("La traes tú", HerramientasRules.etiquetaEstado("IN_USE"))
        assertEquals("Prestada", HerramientasRules.etiquetaEstadoEmpresa("IN_USE"))
        assertEquals("Por entregar", HerramientasRules.etiquetaEstadoEmpresa("APPROVED"))
        assertEquals("Por aprobar", HerramientasRules.etiquetaEstadoEmpresa("PENDING"))
    }

    // ── Toda la empresa ──────────────────────────────────────────────────────

    @Test
    fun `abiertos y vencidos`() {
        val vencido = prestamo(1, "IN_USE", regreso = "2026-11-01T12:00:00.000Z")
        val aTiempo = prestamo(2, "IN_USE")
        val devuelto = prestamo(3, "RETURNED", regreso = "2026-10-01T12:00:00.000Z")
        val lista = listOf(vencido, aTiempo, devuelto)

        assertEquals(listOf(1L, 2L), HerramientasRules.filtrarEmpresa(lista, FiltroEmpresa.ABIERTOS, hoy).map { it.id })
        assertEquals(listOf(1L), HerramientasRules.filtrarEmpresa(lista, FiltroEmpresa.VENCIDOS, hoy).map { it.id })
    }

    @Test
    fun `lo que espera a ivan va de lo mas viejo a lo mas nuevo`() {
        val lista = listOf(
            prestamo(1, "PENDING", pedida = "2026-11-03T10:00:00Z"),
            prestamo(2, "APPROVED"),
            prestamo(3, "PENDING", pedida = "2026-11-01T10:00:00Z"),
            prestamo(4, "IN_USE"),
            prestamo(5, "REJECTED"),
        )
        assertEquals(listOf(3L, 1L), HerramientasRules.porAprobar(lista).map { it.id })
        assertEquals(listOf(2L, 4L), HerramientasRules.porOperar(lista).map { it.id })
    }

    @Test
    fun `buscar tambien encuentra por la persona`() {
        val lista = listOf(prestamo(1, "IN_USE", persona = "Ana López"), prestamo(2, "IN_USE", persona = "Joan"))
        assertEquals(listOf(1L), HerramientasRules.buscarPrestamos(lista, "ana").map { it.id })
    }

    @Test
    fun `sin persona se dice, no se inventa`() {
        assertEquals("Sin persona registrada", HerramientasRules.personaDe(prestamo(1, "IN_USE", persona = null)))
        assertEquals("Ana López", HerramientasRules.personaDe(prestamo(1, "IN_USE")))
    }

    @Test
    fun `la accion de almacen depende del estado`() {
        val conCodigo = prestamo(1, "APPROVED", codigo = "ABC123", caduca = "2026-11-05T18:00:00Z")
        assertEquals(AccionAlmacen.ENTREGAR, HerramientasRules.accionAlmacen(conCodigo, ahora))
        assertEquals(AccionAlmacen.RECIBIR, HerramientasRules.accionAlmacen(prestamo(2, "IN_USE"), ahora))
        assertNull(HerramientasRules.accionAlmacen(prestamo(3, "PENDING"), ahora))
        assertNull(HerramientasRules.accionAlmacen(prestamo(4, "RETURNED"), ahora))
        assertNull(HerramientasRules.accionAlmacen(prestamo(5, "REJECTED"), ahora))
    }

    @Test
    fun `con el codigo vencido no se ofrece entregar sino generar otro`() {
        val vencido = prestamo(1, "APPROVED", codigo = "ABC123", caduca = "2026-11-04T17:59:59Z")
        assertTrue(HerramientasRules.codigoVencido(vencido, ahora))
        assertEquals(AccionAlmacen.NUEVO_CODIGO, HerramientasRules.accionAlmacen(vencido, ahora))
    }

    @Test
    fun `un prestamo viejo sin codigo se entrega sin teclear nada`() {
        val sinCodigo = prestamo(1, "APPROVED")
        assertFalse(HerramientasRules.codigoVencido(sinCodigo, ahora))
        assertFalse(HerramientasRules.pideCodigo(sinCodigo))
        assertEquals(AccionAlmacen.ENTREGAR, HerramientasRules.accionAlmacen(sinCodigo, ahora))
        assertTrue(HerramientasRules.pideCodigo(prestamo(2, "APPROVED", codigo = "ABC123")))
    }

    @Test
    fun `una prorroga dice de quien es y de que`() {
        val r = RenovacionPendienteDto(id = 1L, toolRequest = prestamo(9, "IN_USE"))
        assertEquals("Taladro", HerramientasRules.nombreRenovacion(r))
        assertEquals("Ana López", HerramientasRules.quienPideRenovacion(r))
        assertEquals("Herramienta sin nombre", HerramientasRules.nombreRenovacion(RenovacionPendienteDto(id = 2L)))
        assertEquals("Sin persona registrada", HerramientasRules.quienPideRenovacion(RenovacionPendienteDto(id = 2L)))
    }

    // ── Inventario ───────────────────────────────────────────────────────────

    @Test
    fun `quien la trae sale de los prestamos y los kits`() {
        val prestada = pieza(1, "AVAILABLE")
        val prestamos = listOf(prestamo(10, "IN_USE", persona = "Ana", pieza = 1), prestamo(11, "APPROVED", persona = "Joan", pieza = 2))
        val kits = listOf(
            KitAsignacionDto(id = 20, inventoryItemId = 3, user = HerramientaPersonaDto(nombre = "Iván")),
            // Ya la devolvió: no cuenta.
            KitAsignacionDto(id = 21, inventoryItemId = 4, returnedAt = "2026-10-01", user = HerramientaPersonaDto(nombre = "Luis")),
        )
        assertEquals("La trae Ana", HerramientasRules.quienLaTrae(prestada, prestamos, kits))
        assertEquals("Por entregar a Joan", HerramientasRules.quienLaTrae(pieza(2), prestamos, kits))
        assertEquals("En el kit de Iván", HerramientasRules.quienLaTrae(pieza(3, "ASSIGNED"), prestamos, kits))
        assertEquals("Asignada; falta saber a quién", HerramientasRules.quienLaTrae(pieza(4, "ASSIGNED"), prestamos, kits))
    }

    @Test
    fun `sin nadie que la traiga se dice donde esta`() {
        assertEquals("En almacén", HerramientasRules.quienLaTrae(pieza(1), emptyList(), emptyList()))
        assertEquals("En reparación", HerramientasRules.quienLaTrae(pieza(2, "IN_REPAIR"), emptyList(), emptyList()))
        assertEquals("Dada de baja", HerramientasRules.quienLaTrae(pieza(3, "RETIRED"), emptyList(), emptyList()))
    }

    @Test
    fun `el inventario va en orden y se busca por lo que trae la etiqueta`() {
        val lista = listOf(pieza(1, nombre = "Taladro"), pieza(2, nombre = "Amoladora"))
        assertEquals(listOf(2L, 1L), HerramientasRules.buscarInventario(lista, "").map { it.id })
        assertEquals(listOf(1L), HerramientasRules.buscarInventario(lista, "tal-1").map { it.id })
        assertEquals(listOf(2L), HerramientasRules.buscarInventario(lista, "s2").map { it.id })
        assertTrue(HerramientasRules.buscarInventario(lista, "nada").isEmpty())
    }

    // ── Formularios ──────────────────────────────────────────────────────────

    @Test
    fun `pedir prestamo dice que falta`() {
        val manana = hoy.plusDays(1)
        assertEquals("Elige la herramienta.", HerramientasRules.faltaParaPedir(null, manana, "obra", hoy))
        assertEquals("Di cuándo la regresas.", HerramientasRules.faltaParaPedir(1L, null, "obra", hoy))
        assertEquals("La fecha de regreso ya pasó.", HerramientasRules.faltaParaPedir(1L, hoy.minusDays(1), "obra", hoy))
        assertEquals("Escribe para qué la necesitas.", HerramientasRules.faltaParaPedir(1L, manana, "  ", hoy))
        assertNull(HerramientasRules.faltaParaPedir(1L, manana, "obra", hoy))
        // Regresarla el mismo día es válido.
        assertNull(HerramientasRules.faltaParaPedir(1L, hoy, "obra", hoy))
    }

    @Test
    fun `dar de alta exige lo que exige el servidor`() {
        assertEquals("Escribe el nombre.", HerramientasRules.faltaParaAlta(" ", "m", "s", true, true))
        assertEquals("Escribe el modelo.", HerramientasRules.faltaParaAlta("n", "", "s", true, true))
        assertEquals("Escribe el número de serie.", HerramientasRules.faltaParaAlta("n", "m", "", true, true))
        assertEquals("Falta la foto de la herramienta completa.", HerramientasRules.faltaParaAlta("n", "m", "s", false, true))
        assertEquals("Falta la foto del número de serie.", HerramientasRules.faltaParaAlta("n", "m", "s", true, false))
        assertNull(HerramientasRules.faltaParaAlta("n", "m", "s", true, true))
    }

    @Test
    fun `un rechazo o un dano piden decir algo`() {
        assertFalse(HerramientasRules.motivoValido("  no  "))
        assertTrue(HerramientasRules.motivoValido("Se rompió la broca"))
    }

    // ── Vacíos ───────────────────────────────────────────────────────────────

    @Test
    fun `buscar y no encontrar no parece un error`() {
        val vacio = HerramientasRules.vacioDeBusqueda(" taladro ")
        assertTrue(vacio.titulo.contains("Todavía no hay herramientas dadas de alta"))
        assertTrue(vacio.texto.contains("«taladro»"))
        assertTrue(vacio.texto.contains("Iván"))
        assertFalse(vacio.titulo.contains("rror"))
        assertFalse(vacio.texto.contains("rror"))
    }

    @Test
    fun `el inventario vacio dice que sigue segun quien mira`() {
        assertEquals("Todavía no hay herramientas dadas de alta", HerramientasRules.vacioInventario(Perfil.DIRECCION).titulo)
        assertTrue(HerramientasRules.vacioInventario(Perfil.DIRECCION).texto.contains("Iván"))
        assertTrue(HerramientasRules.vacioInventario(Perfil.ADMINISTRA).texto.contains("Da de alta la primera"))
    }

    @Test
    fun `sin vencidos no es lo mismo que sin prestamos`() {
        assertEquals(
            "Ningún préstamo vencido",
            HerramientasRules.vacioPrestamosEmpresa(Perfil.DIRECCION, FiltroEmpresa.VENCIDOS, total = 3).titulo,
        )
        assertEquals(
            "Sin préstamos abiertos",
            HerramientasRules.vacioPrestamosEmpresa(Perfil.DIRECCION, FiltroEmpresa.VENCIDOS, total = 0).titulo,
        )
        assertEquals(
            "Nada por entregar ni por recibir",
            HerramientasRules.vacioPrestamosEmpresa(Perfil.ADMINISTRA, FiltroEmpresa.ABIERTOS, total = 0).titulo,
        )
    }

    @Test
    fun `el pie dice lo que hace cada quien`() {
        assertTrue(HerramientasRules.limite(Perfil.DIRECCION).startsWith("Solo lectura"))
        assertTrue(HerramientasRules.limite(Perfil.PERSONAL).contains("pides"))
        assertTrue(HerramientasRules.limite(Perfil.ADMINISTRA).contains("computadora"))
        assertFalse(HerramientasRules.limite(Perfil.PERSONAL).contains("computadora"))
    }

    // ── Lo que manda el servidor ─────────────────────────────────────────────

    private val moshi = Moshi.Builder().add(KotlinJsonAdapterFactory()).build()

    @Test
    fun `un prestamo de la empresa trae a su persona y su pieza`() {
        val tipo = Types.newParameterizedType(List::class.java, PrestamoHerramientaDto::class.java)
        val lista = moshi.adapter<List<PrestamoHerramientaDto>>(tipo).fromJson(
            """[{"id":7,"status":"IN_USE","toolName":"Taladro","inventoryItemId":12,
                "usuario":{"id":3,"nombre":"Ana López","email":"a@b.c"},"approver":null,"campoNuevo":1}]""",
        ).orEmpty()
        assertEquals(12L, lista.single().inventoryItemId)
        assertEquals("Ana López", HerramientasRules.personaDe(lista.single()))
    }

    @Test
    fun `una prorroga trae el prestamo adentro`() {
        val tipo = Types.newParameterizedType(List::class.java, RenovacionPendienteDto::class.java)
        val lista = moshi.adapter<List<RenovacionPendienteDto>>(tipo).fromJson(
            """[{"id":5,"toolRequestId":7,"newReturnDate":"2026-12-01T12:00:00.000Z","renewalReason":"Se alargó",
                "toolRequest":{"id":7,"toolName":"Taladro","usuario":{"id":3,"nombre":"Ana"}},"approver":null}]""",
        ).orEmpty()
        assertEquals("Taladro", HerramientasRules.nombreRenovacion(lista.single()))
        assertEquals("Ana", HerramientasRules.quienPideRenovacion(lista.single()))
    }
}
