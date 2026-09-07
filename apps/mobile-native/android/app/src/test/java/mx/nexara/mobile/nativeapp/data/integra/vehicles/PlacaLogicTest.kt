package mx.nexara.mobile.nativeapp.data.integra.vehicles

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Por qué existen estas pruebas.
 *
 * El alta de vehículos del servidor es un `upsert` sobre la placa despojada de
 * todo lo que no sea letra o número. Es decir: guardar «ABC-123» cuando ya
 * existe «ABC 123» no da error, **pisa la ficha anterior en silencio**. Toda la
 * validación de la pantalla de placas existe para que eso no llegue a pasar, así
 * que si se rompe no se rompe con un error: se rompe perdiendo datos.
 *
 * Espejo 1:1 de `apps/web/app/(panels)/integra/vehicles/_placas.spec.ts`. Si una
 * de las dos suites cambia sin la otra, la app y la web dejan de normalizar
 * igual y el duplicado que una detecta la otra lo deja pasar.
 */
class PlacaLogicTest {

    private fun v(
        id: String,
        plate: String = "ABC1234",
        personId: String? = null,
        personName: String? = null,
    ) = Vehiculo(id = id, plate = plate, personId = personId, personName = personName)

    // ── Normalización · lo mismo que hace el servidor antes de guardar ───────

    @Test
    fun `recorta, colapsa espacios y sube a mayusculas`() {
        assertEquals("ABC 123", normalizarPlaca("  abc 123  "))
        assertEquals("ABC 123", normalizarPlaca("abc   123"))
        assertEquals("", normalizarPlaca(""))
    }

    @Test
    fun `colapsa tabuladores y saltos de linea como la web`() {
        // El regex de la web es `\s+`, no solo el espacio.
        assertEquals("ABC 123", normalizarPlaca("abc\t\n123"))
    }

    @Test
    fun `la clave del servidor se queda solo con letras y numeros`() {
        // apps/api → addVehicle: `local-${plate.replace(/[^A-Z0-9]/gi, '')}`
        assertEquals("ABC123", claveDePlaca("ABC-123"))
        assertEquals("ABC123", claveDePlaca("abc 123"))
        assertEquals("ABC123", claveDePlaca("A-B-C 1 2 3"))
        assertEquals("", claveDePlaca("---"))
    }

    @Test
    fun `las mayusculas no dependen del idioma del telefono`() {
        // Con la regla turca, «i» sube a «İ» y la placa dejaría de coincidir con
        // la que guardó el servidor. `uppercase()` sin Locale usa la invariante.
        val previo = java.util.Locale.getDefault()
        try {
            java.util.Locale.setDefault(java.util.Locale.forLanguageTag("tr-TR"))
            assertEquals("ABCI123", claveDePlaca("abci123"))
        } finally {
            java.util.Locale.setDefault(previo)
        }
    }

    // ── Validación · bloquear solo lo que de verdad se rompe ────────────────

    @Test
    fun `una placa vacia no se manda`() {
        assertFalse(validarPlaca("   ").valida)
        assertEquals("Escribe una placa.", validarPlaca("").error)
    }

    @Test
    fun `rechaza pasarse del ancho de la columna`() {
        val larga = "A".repeat(PlacaLimites.MAX + 1)
        val r = validarPlaca(larga)
        assertFalse(r.valida)
        assertTrue(r.error.orEmpty().contains(PlacaLimites.MAX.toString()))
        // Justo en el límite sí entra.
        assertTrue(validarPlaca("A".repeat(PlacaLimites.MAX)).valida)
    }

    @Test
    fun `rechaza caracteres que no son de una placa`() {
        assertFalse(validarPlaca("ABC*123").valida)
        assertTrue(
            validarPlaca("ABC/123").error.orEmpty()
                .contains("letras, números, espacios y guiones"),
        )
        assertTrue(validarPlaca("ABC-123").valida)
        assertTrue(validarPlaca("ABC 123").valida)
    }

    @Test
    fun `rechaza una placa sin ningun alfanumerico porque todas colisionarian en local-`() {
        val r = validarPlaca("---")
        assertFalse(r.valida)
        assertTrue(r.error.orEmpty().contains("identificador"))
    }

    @Test
    fun `una placa corta avisa pero NO bloquea porque el servidor la acepta`() {
        val r = validarPlaca("AB1")
        assertTrue(r.valida)
        assertNull(r.error)
        assertTrue(r.aviso.orEmpty().contains("3 caracteres útiles"))
    }

    @Test
    fun `una placa normal no avisa de nada`() {
        val r = validarPlaca("abc-1234")
        assertTrue(r.valida)
        assertNull(r.aviso)
        assertEquals("ABC-1234", r.normalizada)
    }

    // ── Duplicados · el upsert que pisa fichas ──────────────────────────────

    private val inventario = listOf(
        v(id = "local-ABC123", plate = "ABC-123"),
        v(id = "x", plate = "XYZ999"),
    )

    @Test
    fun `detecta la misma placa aunque se escriba distinto`() {
        assertEquals("local-ABC123", placaDuplicada("abc 123", inventario)?.id)
        assertEquals("local-ABC123", placaDuplicada("ABC123", inventario)?.id)
    }

    @Test
    fun `una placa nueva no es duplicado`() {
        assertNull(placaDuplicada("QQQ111", inventario))
    }

    @Test
    fun `editando una ficha ella misma no cuenta como duplicado`() {
        assertNull(placaDuplicada("ABC-123", inventario, "local-ABC123"))
        // Pero sí choca con OTRA ficha existente.
        assertEquals("x", placaDuplicada("XYZ-999", inventario, "local-ABC123")?.id)
    }

    @Test
    fun `una placa sin alfanumericos no colisiona con nada por accidente`() {
        assertNull(placaDuplicada("---", inventario))
    }

    @Test
    fun `el aviso de duplicado dice que el servidor sobrescribe`() {
        val choque = placaDuplicada("abc 123", inventario)
        requireNotNull(choque)
        val texto = avisoDuplicado(choque)
        assertTrue(texto.contains("ABC-123"))
        assertTrue(texto.contains("sobrescribiría"))
        assertTrue(texto.contains("dueño"))
    }

    // ── Filtros del inventario ──────────────────────────────────────────────

    private val conDuenos = listOf(
        v(id = "1", plate = "ABC-123", personId = "1001", personName = "Ada Lovelace"),
        v(id = "2", plate = "XYZ999"),
        v(id = "3", plate = "JKL-456", personId = "1002", personName = "Grace Hopper"),
    )

    @Test
    fun `sin filtros devuelve todo`() {
        assertEquals(3, filtrarVehiculos(conDuenos, FiltrosVehiculos()).size)
    }

    @Test
    fun `busca una placa aunque el guion no coincida`() {
        // Escribir «ABC123» tiene que encontrar «ABC-123».
        assertEquals(
            listOf("1"),
            filtrarVehiculos(conDuenos, FiltrosVehiculos(q = "ABC123")).map { it.id },
        )
        assertEquals(
            listOf("1"),
            filtrarVehiculos(conDuenos, FiltrosVehiculos(q = "abc-1")).map { it.id },
        )
    }

    @Test
    fun `busca por persona sin distinguir mayusculas`() {
        assertEquals(
            listOf("3"),
            filtrarVehiculos(conDuenos, FiltrosVehiculos(q = "hopper")).map { it.id },
        )
        assertEquals(
            listOf("1"),
            filtrarVehiculos(conDuenos, FiltrosVehiculos(q = "1001")).map { it.id },
        )
    }

    @Test
    fun `separa las que tienen dueno de las que no`() {
        assertEquals(
            listOf("2"),
            filtrarVehiculos(conDuenos, FiltrosVehiculos(dueno = FiltroDueno.SIN)).map { it.id },
        )
        assertEquals(
            listOf("1", "3"),
            filtrarVehiculos(conDuenos, FiltrosVehiculos(dueno = FiltroDueno.CON)).map { it.id },
        )
    }

    @Test
    fun `combina busqueda y dueno`() {
        assertEquals(
            emptyList<String>(),
            filtrarVehiculos(
                conDuenos,
                FiltrosVehiculos(q = "9", dueno = FiltroDueno.CON),
            ).map { it.id },
        )
    }

    @Test
    fun `un filtro de solo espacios no cuenta como filtro`() {
        assertFalse(hayFiltroVehiculos(FiltrosVehiculos()))
        assertFalse(hayFiltroVehiculos(FiltrosVehiculos(q = "  ")))
        assertTrue(hayFiltroVehiculos(FiltrosVehiculos(dueno = FiltroDueno.SIN)))
    }

    @Test
    fun `solo acepta valores conocidos de dueno porque el estado puede traer basura`() {
        assertTrue(esFiltroDueno(""))
        assertTrue(esFiltroDueno("con"))
        assertTrue(esFiltroDueno("sin"))
        assertFalse(esFiltroDueno("cualquiera"))
        assertFalse(esFiltroDueno(null))
        assertEquals(FiltroDueno.TODAS, filtroDuenoDe("cualquiera"))
        assertEquals(FiltroDueno.SIN, filtroDuenoDe("sin"))
    }

    @Test
    fun `cuenta las placas sin dueno`() {
        assertEquals(1, contarSinDueno(conDuenos))
        assertFalse(tieneDueno(conDuenos[1]))
    }

    @Test
    fun `un dueno con id en blanco no cuenta como dueno`() {
        // El DTO ya normaliza "" a null, pero la lógica no puede depender de eso.
        assertFalse(tieneDueno(v(id = "1", personId = "   ", personName = "  ")))
    }

    // ── Dueño · el nombre guardado es una foto, no un vínculo vivo ──────────

    private val padron = listOf(
        PersonaResumen(id = "1001", name = "Ada Lovelace", code = "E-01", orgName = "Ingeniería"),
        PersonaResumen(id = "1002", name = "Grace Hopper"),
    )

    @Test
    fun `resuelve contra el padron cuando la persona sigue existiendo`() {
        val d = resolverDueno(v(id = "1", personId = "1001", personName = "Ada L."), padron)
        assertTrue(d is Dueno.Conocido)
        // Gana el nombre vivo del padrón, no la foto guardada en el vehículo.
        assertEquals("Ada Lovelace", (d as Dueno.Conocido).nombre)
    }

    @Test
    fun `marca como ausente a quien ya no esta en el padron`() {
        val d = resolverDueno(v(id = "1", personId = "9999", personName = "Fulanito"), padron)
        assertTrue(d is Dueno.Ausente)
        d as Dueno.Ausente
        assertEquals("9999", d.id)
        assertEquals("Fulanito", d.nombre)
    }

    @Test
    fun `sin personId ni nombre es sencillamente sin dueno`() {
        assertEquals(Dueno.SinDueno, resolverDueno(v(id = "1"), padron))
        assertEquals(Dueno.SinDueno, resolverDueno(v(id = "1", personId = "  "), padron))
    }

    @Test
    fun `un nombre suelto sin id no se pierde y se ensena como ausente`() {
        val d = resolverDueno(
            v(id = "1", personName = "Alguien de la plataforma"),
            padron,
        )
        assertTrue(d is Dueno.Ausente)
        assertEquals("Alguien de la plataforma", (d as Dueno.Ausente).nombre)
    }

    @Test
    fun `desambigua a dos personas que se llaman igual`() {
        assertEquals("Ada Lovelace (E-01 · Ingeniería)", etiquetaPersona(padron[0]))
        assertEquals("Grace Hopper", etiquetaPersona(padron[1]))
    }

    // ── DTO → dominio · el nulo que reventaba la deserialización ────────────

    @Test
    fun `el DTO acepta todos los campos nulos sin romperse`() {
        val dto = VehiculoDto(id = "local-ABC123", plate = null, personId = null, personName = null)
        val dominio = dto.aDominio()
        requireNotNull(dominio)
        assertEquals("local-ABC123", dominio.id)
        assertEquals("", dominio.plate)
        assertNull(dominio.personId)
    }

    @Test
    fun `una ficha sin identificador se descarta en vez de pintar botones que fallan`() {
        assertNull(VehiculoDto(id = null, plate = "ABC123").aDominio())
        assertNull(VehiculoDto(id = "   ", plate = "ABC123").aDominio())
    }

    @Test
    fun `el DTO convierte cadenas vacias de dueno en nulo`() {
        val d = VehiculoDto(id = "x", plate = "ABC", personId = "  ", personName = "").aDominio()
        requireNotNull(d)
        assertNull(d.personId)
        assertNull(d.personName)
        assertFalse(tieneDueno(d))
    }

    @Test
    fun `una persona sin nombre se ensena por su id y no como hueco`() {
        val p = PersonaDto(id = "1001", name = null).aDominio()
        requireNotNull(p)
        assertEquals("Persona 1001", p.name)
    }

    @Test
    fun `la persona acepta los alias personId y personName de la API`() {
        val p = PersonaDto(personId = "77", personName = "Ada", personCode = "E-9").aDominio()
        requireNotNull(p)
        assertEquals("77", p.id)
        assertEquals("Ada", p.name)
        assertEquals("E-9", p.code)
    }
}
