package mx.nexara.mobile.nativeapp.ui.integra

import mx.nexara.mobile.nativeapp.ui.integra.common.bool
import mx.nexara.mobile.nativeapp.ui.integra.common.int
import mx.nexara.mobile.nativeapp.ui.integra.common.mapList
import mx.nexara.mobile.nativeapp.ui.integra.common.matchesQuery
import mx.nexara.mobile.nativeapp.ui.integra.common.nestedPerson
import mx.nexara.mobile.nativeapp.ui.integra.common.normalizeForSearch
import mx.nexara.mobile.nativeapp.ui.integra.common.str
import mx.nexara.mobile.nativeapp.ui.integra.common.strOrNull
import mx.nexara.mobile.nativeapp.ui.integra.common.stringList
import mx.nexara.mobile.nativeapp.ui.integra.common.subMap
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Lectura tolerante del JSON de INTEGRA.
 *
 * La API mezcla tres familias de payload que no comparten nombres (espejo
 * Prisma, crudo del fabricante, DTO de push) y **muchos campos llegan
 * `undefined`, no `null`**: la clave simplemente no está. Nada de esto puede
 * reventar una pantalla.
 */
class IntegraJsonTest {

    @Test
    fun `los numeros de Moshi no se pintan como 12 punto 0`() {
        // Moshi entrega Double: un conteo de 12 puertas no es «12.0».
        assertEquals("12", str(mapOf("doors" to 12.0), "doors"))
        assertEquals("1.5", str(mapOf("factor" to 1.5), "factor"))
    }

    @Test
    fun `se prueba alias por alias hasta encontrar algo`() {
        val fila = mapOf<String, Any?>("doorName" to "Recepción")
        assertEquals("Recepción", str(fila, "name", "doorName"))
        assertEquals("", str(fila, "name", "location"))
        assertNull(strOrNull(fila, "name", "location"))
    }

    @Test
    fun `la cadena null del servidor no es un valor`() {
        val fila = mapOf<String, Any?>("a" to "null", "b" to "undefined", "c" to "  ", "d" to "real")
        assertEquals("real", str(fila, "a", "b", "c", "d"))
    }

    @Test
    fun `un objeto anidado se resume por su nombre`() {
        val fila = mapOf<String, Any?>("erpUser" to mapOf("nombre" to "Ana", "email" to "a@b.mx"))
        assertEquals("Ana", str(fila, "erpUser"))
    }

    @Test
    fun `bool acepta las formas en que llega un si`() {
        assertEquals(true, bool(mapOf("v" to true), "v"))
        assertEquals(true, bool(mapOf("v" to 1.0), "v"))
        assertEquals(true, bool(mapOf("v" to "true"), "v"))
        assertEquals(true, bool(mapOf("v" to "sí"), "v"))
        assertEquals(false, bool(mapOf("v" to false), "v"))
        assertEquals(false, bool(mapOf("v" to 0.0), "v"))
        // Ausente es `null`, y `null` no es `false`: es «no vino».
        assertNull(bool(emptyMap(), "v"))
    }

    @Test
    fun `int lee numeros venga como venga`() {
        assertEquals(3, int(mapOf("n" to 3.0), "n"))
        assertEquals(3, int(mapOf("n" to "3"), "n"))
        assertNull(int(mapOf("n" to "tres"), "n"))
        assertNull(int(emptyMap(), "n"))
    }

    @Test
    fun `las listas de cadenas aguantan objetos y numeros`() {
        assertEquals(listOf("A", "B"), stringList(mapOf("doorNames" to listOf("A", "B")), "doorNames"))
        assertEquals(
            listOf("Recepción"),
            stringList(mapOf("doors" to listOf(mapOf("name" to "Recepción"))), "doors"),
        )
        assertEquals(listOf("7"), stringList(mapOf("ids" to listOf(7.0)), "ids"))
        assertEquals(emptyList<String>(), stringList(emptyMap(), "doorNames"))
    }

    @Test
    fun `subMap y mapList devuelven vacio en vez de reventar`() {
        assertNull(subMap(mapOf("a" to "texto"), "a"))
        assertEquals(emptyList<Map<String, Any?>>(), mapList(mapOf("a" to "texto"), "a"))
        assertEquals(1, mapList(mapOf("items" to listOf(mapOf("id" to 1.0))), "items").size)
    }

    @Test
    fun `la ficha de persona llega envuelta o plana`() {
        val isapi = mapOf<String, Any?>("person" to mapOf("name" to "Ana"))
        val artemis = mapOf<String, Any?>("name" to "Ana")
        assertEquals("Ana", str(nestedPerson(isapi), "name"))
        assertEquals("Ana", str(nestedPerson(artemis), "name"))
    }

    @Test
    fun `buscar sebastian encuentra a Sebastian con acento`() {
        assertEquals("joan sebastian", normalizeForSearch("Joan Sebastián"))
        assertEquals("nino", normalizeForSearch("Niño"))
        val fila = mapOf<String, Any?>("personName" to "Joan Sebastián")
        assertTrue(matchesQuery(fila, "sebastian", "personName"))
        assertTrue(matchesQuery(fila, "SEBASTIÁN", "personName"))
        assertFalse(matchesQuery(fila, "pedro", "personName"))
    }

    @Test
    fun `una consulta vacia deja pasar todo`() {
        assertTrue(matchesQuery(mapOf("a" to "x"), "", "a"))
        assertTrue(matchesQuery(mapOf("a" to "x"), "   ", "a"))
    }
}
