package mx.nexara.mobile.nativeapp.ui.console.more

import mx.nexara.mobile.nativeapp.data.api.OrgNodeDto
import mx.nexara.mobile.nativeapp.data.api.OrgRefDto
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * El organigrama del teléfono se recorre por niveles, así que lo que hay que
 * probar no es un dibujo: es que desde cualquier persona se sepa quién está
 * encima, quién debajo, y que no haya forma de quedarse encerrado.
 */
class OrgchartRulesTest {

    private fun nodo(
        id: Long,
        nombre: String,
        puesto: String? = null,
        managerId: Long? = null,
        lateralDeId: Long? = null,
        rol: String? = null,
        departamento: String? = null,
        hijos: List<OrgNodeDto> = emptyList(),
    ) = OrgNodeDto(
        id = id,
        nombre = nombre,
        puesto = puesto,
        managerId = managerId,
        lateralDeId = lateralDeId,
        role = rol?.let { OrgRefDto(1L, it) },
        department = departamento?.let { OrgRefDto(2L, it) },
        children = hijos,
    )

    /**
     * Christian
     *   ├── Ana ── Luis
     *   │          └── Sofía
     *   └── Beto
     */
    private val arbol = listOf(
        nodo(
            1, "Christian", puesto = "Dirección",
            hijos = listOf(
                nodo(
                    2, "Ana", puesto = "Coordinación", managerId = 1,
                    hijos = listOf(
                        nodo(
                            4, "Luis", puesto = "Ingeniería", managerId = 2,
                            hijos = listOf(nodo(5, "Sofía", puesto = "Campo", managerId = 4)),
                        ),
                    ),
                ),
                nodo(3, "Beto", puesto = "Administración", managerId = 1),
            ),
        ),
    )

    private val indice = OrgchartRules.construir(arbol)

    @Test
    fun theWholeTreeIsFlattened() {
        assertEquals(5, indice.total)
        assertEquals(listOf(1L), indice.raices)
    }

    @Test
    fun everyoneKnowsTheirChainToTheTop() {
        assertEquals(emptyList<Long>(), indice[1L]!!.cadena)
        assertEquals(listOf(1L), indice[2L]!!.cadena)
        assertEquals(listOf(1L, 2L), indice[4L]!!.cadena)
        assertEquals(listOf(1L, 2L, 4L), indice[5L]!!.cadena)
    }

    /** El número que el lienzo de la web obliga a contar a ojo. */
    @Test
    fun theSubtreeSizeIsCounted() {
        assertEquals(4, indice[1L]!!.aCargo)
        assertEquals(2, indice[2L]!!.aCargo)
        assertEquals(1, indice[4L]!!.aCargo)
        assertEquals(0, indice[5L]!!.aCargo)
    }

    @Test
    fun withoutFocusYouSeeTheTop() {
        val vista = OrgchartRules.vista(indice, null)
        assertNull(vista.foco)
        assertTrue(vista.migas.isEmpty())
        assertEquals(listOf("Christian"), vista.equipo.map { it.nombre })
    }

    @Test
    fun focusingShowsBreadcrumbsAndDirectReports() {
        val vista = OrgchartRules.vista(indice, 2L)
        assertEquals("Ana", vista.foco?.nombre)
        assertEquals(listOf("Christian"), vista.migas.map { it.nombre })
        assertEquals(listOf("Luis"), vista.equipo.map { it.nombre })
    }

    /** Un enlace viejo a alguien que ya no está no puede dejar la pantalla en blanco. */
    @Test
    fun anUnknownFocusFallsBackToTheTop() {
        val vista = OrgchartRules.vista(indice, 999L)
        assertNull(vista.foco)
        assertEquals(listOf("Christian"), vista.equipo.map { it.nombre })
    }

    @Test
    fun goingUpWalksTheChainAndStopsAtTheTop() {
        assertEquals(4L, OrgchartRules.arriba(indice, 5L))
        assertEquals(2L, OrgchartRules.arriba(indice, 4L))
        assertEquals(1L, OrgchartRules.arriba(indice, 2L))
        // Desde una raíz se sube a la cúpula, que es «nadie enfocado».
        assertNull(OrgchartRules.arriba(indice, 1L))
        assertNull(OrgchartRules.arriba(indice, null))
    }

    @Test
    fun searchLooksAtTheWholeTreeNotJustTheLevel() {
        assertEquals(listOf("Sofía"), OrgchartRules.buscar(indice, "sof").map { it.nombre })
        // Por puesto también, que es como se busca a quien no se sabe cómo se llama.
        assertEquals(listOf("Luis"), OrgchartRules.buscar(indice, "ingenier").map { it.nombre })
        assertTrue(OrgchartRules.buscar(indice, "  ").isEmpty())
        assertTrue(OrgchartRules.buscar(indice, "zzz").isEmpty())
    }

    @Test
    fun searchResultsCarryTheirChainOfCommand() {
        val sofia = OrgchartRules.buscar(indice, "sofía").single()
        assertEquals("Christian › Ana › Luis", OrgchartRules.cadenaTexto(indice, sofia))
        assertEquals("Arriba del todo", OrgchartRules.cadenaTexto(indice, indice[1L]!!))
    }

    @Test
    fun theTeamLineReadsInSpanish() {
        assertEquals("2 directos · 4 en total", OrgchartRules.equipoTexto(indice[1L]!!))
        assertEquals("1 directo · 2 en total", OrgchartRules.equipoTexto(indice[2L]!!))
        assertEquals("1 directo", OrgchartRules.equipoTexto(indice[4L]!!))
        assertEquals("Sin equipo a su cargo", OrgchartRules.equipoTexto(indice[5L]!!))
    }

    @Test
    fun lateralPlacementIsNotHierarchy() {
        val conLateral = OrgchartRules.construir(
            listOf(
                nodo(
                    1, "Christian",
                    hijos = listOf(
                        nodo(2, "Ana", managerId = 1),
                        nodo(3, "Asesor", managerId = 1, lateralDeId = 2),
                    ),
                ),
            ),
        )
        val vista = OrgchartRules.vista(conLateral, 2L)
        assertEquals(listOf("Asesor"), vista.laterales.map { it.nombre })
        // Sigue reportando a Christian, no a Ana.
        assertEquals(listOf(1L), conLateral[3L]!!.cadena)
    }

    @Test
    fun aNodeWithoutIdIsDroppedWithItsBranch() {
        val roto = OrgchartRules.construir(
            listOf(
                nodo(1, "Christian", hijos = listOf(OrgNodeDto(id = null, nombre = "Fantasma"))),
            ),
        )
        assertEquals(1, roto.total)
        assertTrue(roto[1L]!!.esHoja)
    }

    /** Un `children` que apunta de vuelta al padre no puede colgar la app. */
    @Test
    fun aCycleDoesNotLoopForever() {
        val a = nodo(1, "A")
        val b = nodo(2, "B", managerId = 1, hijos = listOf(a))
        val conCiclo = OrgchartRules.construir(listOf(nodo(1, "A", hijos = listOf(b))))
        assertEquals(2, conCiclo.total)
        assertEquals(listOf(2L), conCiclo[1L]!!.equipoDirecto)
        // B no se queda con A de hijo: A ya estaba colocado arriba.
        assertTrue(conCiclo[2L]!!.equipoDirecto.isEmpty())
    }

    @Test
    fun anEmptyPayloadIsEmptyNotACrash() {
        val vacio = OrgchartRules.construir(null)
        assertTrue(vacio.vacio)
        assertEquals(0, vacio.total)
        val vista = OrgchartRules.vista(vacio, null)
        assertTrue(vista.sinEquipo)
        assertFalse(vista.foco != null)
    }

    @Test
    fun initialsNeverBlowUp() {
        assertEquals("CG", OrgchartRules.iniciales("Christian González"))
        assertEquals("A", OrgchartRules.iniciales("Ana"))
        assertEquals("?", OrgchartRules.iniciales("   "))
        assertEquals("JD", OrgchartRules.iniciales("juan de la cruz"))
    }

    @Test
    fun aNodeWithoutNameStillHasSomethingToShow() {
        val sinNombre = OrgchartRules.construir(listOf(OrgNodeDto(id = 9L, nombre = "  ")))
        assertEquals("Sin nombre", sinNombre[9L]!!.nombre)
    }
}
