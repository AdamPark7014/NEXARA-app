package mx.nexara.mobile.nativeapp.data.integra.map

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * El panorama sólo vale si sus cifras son ciertas.
 *
 * Aquí se fija exactamente eso: qué pasa con las puertas que no reportan, con
 * las cámaras sin `status`, con los conteos que la API no manda y con un
 * endpoint que falla. Todos ellos tienen una salida honesta y ninguna es un cero.
 */
class PanoramaModelsTest {

    /* ── Puertas ─────────────────────────────────────────────────────── */

    @Test
    fun `las puertas que no reportan se nombran en vez de repartirse`() {
        // 12 en el espejo, 8 dicen que sí y 1 dice que no: quedan 3 mudas.
        // Sumarlas a «en línea» inventa salud; a «caídas», una avería.
        val h = DoorHealth.of(total = 12, online = 8, offline = 1)
        assertEquals(8, h?.online)
        assertEquals(1, h?.offline)
        assertEquals(3, h?.unknown)
        assertEquals(12, h?.total)
    }

    @Test
    fun `sin total el total sale de la suma y nunca queda por debajo`() {
        val h = DoorHealth.of(total = null, online = 5, offline = 2)
        assertEquals(7, h?.total)
        assertEquals(0, h?.unknown)

        // Un total incoherente (menor que la suma) no puede producir un negativo.
        val raro = DoorHealth.of(total = 3, online = 5, offline = 2)
        assertEquals(7, raro?.total)
        assertEquals(0, raro?.unknown)
    }

    @Test
    fun `sin ningun conteo no hay salud de puertas que enseñar`() {
        assertNull(DoorHealth.of(null, null, null))
    }

    /* ── Cámaras ─────────────────────────────────────────────────────── */

    @Test
    fun `las camaras se cuentan en tres cubos porque el status puede faltar`() {
        // `GET integra/dashboard` da el total de cámaras y NADA más: no existe
        // `camerasOnline`. El desglose se cuenta, no se inventa.
        val h = CameraHealth.of(
            listOf(
                mapOf<String, Any?>("id" to "c1", "status" to 1.0),
                mapOf<String, Any?>("id" to "c2", "status" to "online"),
                mapOf<String, Any?>("id" to "c3", "status" to 0.0),
                mapOf<String, Any?>("id" to "c4"),
                mapOf<String, Any?>("id" to "c5", "status" to ""),
            ),
        )
        assertEquals(2, h.online)
        assertEquals(1, h.offline)
        assertEquals(2, h.unreported)
        assertEquals(5, h.total)
    }

    @Test
    fun `un sitio sin camaras da cero de todo sin lanzar`() {
        val h = CameraHealth.of(emptyList())
        assertEquals(0, h.total)
    }

    /* ── KPI del día ─────────────────────────────────────────────────── */

    @Test
    fun `el KPI del dia se lee por su nombre en castellano o en ingles`() {
        // El servidor manda las dos familias de claves en la misma respuesta.
        val es = PanoramaToday.fromMap(
            mapOf("day" to "2026-09-07", "entradas" to 42.0, "denegados" to 3.0, "unicos" to 18.0, "enSitio" to 7.0),
        )
        assertEquals(42, es.granted)
        assertEquals(7, es.onSite)

        val en = PanoramaToday.fromMap(
            mapOf("granted" to 42.0, "denied" to 3.0, "uniquePersons" to 18.0, "onSite" to 7.0),
        )
        assertEquals(42, en.granted)
        assertEquals(18, en.uniquePeople)
    }

    @Test
    fun `un KPI vacio no se enseña como una fila de ceros`() {
        assertTrue(PanoramaToday.fromMap(mapOf("day" to "2026-09-07")).hasAny.not())
    }

    /* ── Conteos ─────────────────────────────────────────────────────── */

    @Test
    fun `un conteo que la API no manda queda nulo, no en cero`() {
        // «0 puertas» y «no me lo han dicho» son cosas distintas y se ven igual
        // si el modelo colapsa las dos en 0.
        val c = PanoramaCounts.fromMap(mapOf("doors" to 4.0))
        assertEquals(4, c.doors)
        assertNull(c.cameras)
        assertNull(c.people)
    }

    @Test
    fun `el enlace sin campos no se da por conectado`() {
        val link = PanoramaLink.fromMap(emptyMap())
        assertEquals(false, link.connected)
        assertEquals(false, link.configured)
        assertNull(link.host)
    }

    /* ── Lo que hay que mirar ────────────────────────────────────────── */

    @Test
    fun `sin enlace configurado el aviso lo dice antes que ninguna cifra`() {
        val snap = PanoramaSnapshot.EMPTY
        val avisos = snap.attention()
        assertTrue(avisos.first().contains("no tiene enlace configurado"))
    }

    @Test
    fun `alarmas abiertas y equipos caidos suben al aviso`() {
        val snap = PanoramaSnapshot.EMPTY.copy(
            link = PanoramaLink(true, true, "10.0.0.5", "ISAPI", 1, "site"),
            openAlarms = 3,
            doorHealth = DoorHealth(online = 5, offline = 2, unknown = 0, total = 7),
            cameraHealth = CameraHealth(online = 4, offline = 1, unreported = 0, total = 5),
        )
        val avisos = snap.attention()
        assertEquals(3, avisos.size)
        assertTrue(avisos[0].contains("3 alarmas abiertas"))
        assertTrue(avisos[1].contains("2 puertas"))
        assertTrue(avisos[2].contains("1 cámara fuera de línea"))
    }

    @Test
    fun `todo en orden no genera avisos vacios`() {
        val snap = PanoramaSnapshot.EMPTY.copy(
            link = PanoramaLink(true, true, "10.0.0.5", "ISAPI", 1, "site"),
            openAlarms = 0,
            doorHealth = DoorHealth(online = 7, offline = 0, unknown = 0, total = 7),
            cameraHealth = CameraHealth(online = 5, offline = 0, unreported = 0, total = 5),
        )
        assertTrue(snap.attention().isEmpty())
    }

    @Test
    fun `un endpoint caido se apunta y se puede preguntar por el`() {
        // Es el mecanismo que separa «cero alarmas» de «la cola no respondió».
        val snap = PanoramaSnapshot.EMPTY.copy(missing = listOf(PanoramaPart.ALARMS))
        assertTrue(snap.failed(PanoramaPart.ALARMS))
        assertTrue(snap.failed(PanoramaPart.TODAY).not())
    }
}
