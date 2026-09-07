package mx.nexara.mobile.nativeapp.data.integra.map

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Lectura del plano y del inventario.
 *
 * Estas pruebas no comprueban «que el parser parsea»: fijan las decisiones que
 * este módulo tomó a propósito y que un refactor descuidado desharía —el pin sin
 * coordenadas, el pin huérfano, la cámara que no reporta y el `1.0` de Moshi—.
 */
class MapModelsTest {

    private fun pinRaw(
        id: Any? = 7.0,
        type: String? = "DOOR",
        entityId: String? = "10.0.0.5|1",
        x: Any? = 12.5,
        y: Any? = 80.0,
        label: String? = "Puerta muelle",
    ): Map<String, Any?> = mapOf(
        "id" to id,
        "entityType" to type,
        "entityId" to entityId,
        "label" to label,
        "xPct" to x,
        "yPct" to y,
    )

    /* ── Pines ───────────────────────────────────────────────────────── */

    @Test
    fun `lee un pin completo con los numeros Double de Moshi`() {
        val pin = MapPin.fromMap(pinRaw())
        assertNotNull(pin)
        assertEquals(7, pin?.id)
        assertEquals(PinKind.DOOR, pin?.kind)
        assertEquals("10.0.0.5|1", pin?.entityId)
        assertEquals(12.5f, pin?.xPct ?: 0f, 0.001f)
    }

    @Test
    fun `un pin sin coordenadas se descarta, no se dibuja en la esquina`() {
        // Pintarlo en 0,0 haría creer que la puerta está en esa esquina del plano.
        assertNull(MapPin.fromMap(pinRaw(x = null)))
        assertNull(MapPin.fromMap(pinRaw(y = null)))
    }

    @Test
    fun `un pin sin id o sin entidad se descarta`() {
        assertNull(MapPin.fromMap(pinRaw(id = null)))
        assertNull(MapPin.fromMap(pinRaw(entityId = null)))
    }

    @Test
    fun `un porcentaje pasado de rango se recorta en vez de salirse del plano`() {
        val pin = MapPin.fromMap(pinRaw(x = 140.0, y = -12.0))
        assertEquals(100f, pin?.xPct ?: -1f, 0.001f)
        assertEquals(0f, pin?.yPct ?: -1f, 0.001f)
    }

    @Test
    fun `un entityType desconocido no rompe nada`() {
        assertEquals(PinKind.OTHER, MapPin.fromMap(pinRaw(type = "SENSOR"))?.kind)
        assertEquals(PinKind.CAMERA, MapPin.fromMap(pinRaw(type = "camera"))?.kind)
    }

    /* ── Estado de cámara ────────────────────────────────────────────── */

    @Test
    fun `el status 1 de Moshi llega como 1punto0 y sigue siendo en linea`() {
        // Moshi entrega los enteros JSON como Double. Olvidar esto ya dejó una
        // vez todo el muro de vídeo en gris.
        assertEquals(true, cameraOnlineOrNull("1.0"))
        assertEquals(true, cameraOnlineOrNull("1"))
        assertEquals(true, cameraOnlineOrNull("online"))
        assertEquals(false, cameraOnlineOrNull("0"))
        assertEquals(false, cameraOnlineOrNull("offline"))
    }

    @Test
    fun `una camara que no reporta estado no es una camara caida`() {
        // Tercer estado explícito. Contarla como caída inventa una avería;
        // contarla como viva infla el «en línea». Aquí se dice que no se sabe.
        assertNull(cameraOnlineOrNull(null))
        assertNull(cameraOnlineOrNull(""))
        assertNull(cameraOnlineOrNull("null"))
        assertNull(cameraOnlineOrNull("desconocido"))
    }

    /* ── Casar pines con inventario ──────────────────────────────────── */

    private val plano = Floorplan(
        id = 1,
        name = "Planta baja",
        imageData = null,
        pins = listOf(
            MapPin(1, PinKind.DOOR, "DOOR", "d1", "Principal", 10f, 10f),
            MapPin(2, PinKind.CAMERA, "CAMERA", "c1", "Recepción", 20f, 20f),
            MapPin(3, PinKind.DOOR, "DOOR", "borrada", "Muelle viejo", 30f, 30f),
        ),
    )

    private val snapshot = MapSnapshot(
        floorplans = listOf(plano),
        doors = listOf(
            MapEntity("d1", PinKind.DOOR, "Puerta principal", "Vestíbulo", true, "closed", "closed"),
            MapEntity("d2", PinKind.DOOR, "Puerta trasera", "Patio", false, "offline", "offline"),
        ),
        cameras = listOf(
            MapEntity("c1", PinKind.CAMERA, "Cam recepción", "Vestíbulo", true, null, "1"),
        ),
    )

    @Test
    fun `una puerta y una camara con el mismo id no se confunden`() {
        // El id de cámara y el de puerta viven en espacios distintos; casar sólo
        // por id pondría el estado de una en la ficha de la otra.
        val mezcla = MapSnapshot(
            floorplans = listOf(
                Floorplan(1, "P", null, listOf(MapPin(1, PinKind.CAMERA, "CAMERA", "x1", null, 0f, 0f))),
            ),
            doors = listOf(MapEntity("x1", PinKind.DOOR, "Puerta x1", null, true, "closed", "closed")),
            cameras = emptyList(),
        )
        assertNull(mezcla.entityFor(mezcla.floorplans[0].pins[0]))
    }

    @Test
    fun `un pin que apunta a un equipo dado de baja queda marcado como huerfano`() {
        val cards = snapshot.cards(plano)
        assertEquals(3, cards.size)
        assertFalse(cards[0].orphan)
        assertTrue(cards[2].orphan)
        // Y conserva algo que enseñar en la ficha en vez de quedarse en blanco.
        assertEquals("Muelle viejo", cards[2].title)
    }

    @Test
    fun `la cobertura cuenta lo que falta por situar y los pines rotos`() {
        val c = snapshot.coverage()
        assertEquals(1, c.pinnedDoors)
        assertEquals(2, c.totalDoors)
        assertEquals(1, c.missingDoors)
        assertEquals(1, c.pinnedCameras)
        assertEquals(0, c.missingCameras)
        assertEquals(1, c.orphanPins)
        assertFalse(c.complete)
    }

    @Test
    fun `una puerta situada en otra planta no cuenta como sin situar`() {
        val dosPlantas = snapshot.copy(
            floorplans = listOf(
                plano,
                Floorplan(2, "Planta alta", null, listOf(MapPin(9, PinKind.DOOR, "DOOR", "d2", null, 5f, 5f))),
            ),
        )
        val c = dosPlantas.coverage()
        assertEquals(2, c.pinnedDoors)
        assertEquals(0, c.missingDoors)
    }

    @Test
    fun `el mismo equipo repetido en dos planos se cuenta una vez`() {
        val repetido = snapshot.copy(
            floorplans = listOf(
                plano,
                Floorplan(2, "Copia", null, listOf(MapPin(9, PinKind.DOOR, "DOOR", "d1", null, 5f, 5f))),
            ),
        )
        assertEquals(1, repetido.coverage().pinnedDoors)
    }

    @Test
    fun `un plano sin pines no rompe la cobertura`() {
        val vacio = MapSnapshot(listOf(Floorplan(1, "Vacío", null, emptyList())), emptyList(), emptyList())
        val c = vacio.coverage()
        assertEquals(0, c.orphanPins)
        assertTrue(c.complete)
    }

    /* ── Entidades ───────────────────────────────────────────────────── */

    @Test
    fun `una puerta sin campo online queda en sin dato, no en caida`() {
        val door = MapEntity.door(mapOf("id" to "d9", "name" to "Puerta 9"))
        assertNotNull(door)
        assertNull(door?.online)
    }

    @Test
    fun `una fila de inventario sin id se descarta`() {
        assertNull(MapEntity.door(mapOf("name" to "Sin id")))
        assertNull(MapEntity.camera(mapOf("name" to "Sin id")))
    }
}
