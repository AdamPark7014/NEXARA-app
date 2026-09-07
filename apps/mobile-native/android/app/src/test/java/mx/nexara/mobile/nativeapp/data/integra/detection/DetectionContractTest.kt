package mx.nexara.mobile.nativeapp.data.integra.detection

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Red sobre las tres trampas documentadas de la detección.
 *
 * Estas pruebas no comprueban «que el parser parsea»: comprueban que **no se
 * reintroducen bugs concretos que este proyecto ya pagó una vez**. Si alguna de
 * ellas se pone roja, el fallo no es de la prueba.
 */
class DetectionContractTest {

    /* ── 1. `Number(null) === 0`: la cámara sorda ───────────────────── */

    @Test
    fun `perfil sin sensibilidad cae en 50, nunca en 0`() {
        // El bug real: en el servidor, `Number(null)` daba 0 y ese 0 acababa
        // escrito en el equipo. Una cámara con sensibilidad 0 deja de avisar.
        val raw = mapOf<String, Any?>(
            "cameraId" to "cam-1",
            "effective" to mapOf<String, Any?>(
                "alarmConfidence" to "low",
                "detectionTarget" to "human",
            ),
        )
        val p = parseProfile(raw, "cam-1")
        assertEquals(50, p.sensitivity)
    }

    @Test
    fun `sensibilidad nula explicita tampoco vale 0`() {
        val raw = mapOf<String, Any?>(
            "effective" to mapOf<String, Any?>("sensitivity" to null),
        )
        assertEquals(50, parseProfile(raw, "cam-1").sensitivity)
    }

    @Test
    fun `sensibilidad no numerica tampoco vale 0`() {
        val raw = mapOf<String, Any?>(
            "effective" to mapOf<String, Any?>("sensitivity" to "no soy un numero"),
        )
        assertEquals(50, parseProfile(raw, "cam-1").sensitivity)
    }

    @Test
    fun `si el servidor no manda limites el default sigue siendo 50`() {
        assertEquals(50, readLimits(null).sensitivityDefault)
        assertEquals(50, readLimits(mapOf<String, Any?>("maxRegions" to 4)).sensitivityDefault)
    }

    @Test
    fun `un cero explicito del servidor si se respeta`() {
        // La regla es «ausente no es cero», no «el cero no existe». Si el
        // equipo o el perfil traen 0 de verdad, se enseña 0 y se avisa en la UI.
        val raw = mapOf<String, Any?>("effective" to mapOf<String, Any?>("sensitivity" to 0))
        assertEquals(0, parseProfile(raw, "cam-1").sensitivity)
        assertEquals("Apagada", sensitivityMeaning(0).label)
    }

    @Test
    fun `el borrador nunca nace con 0 desde un perfil vacio`() {
        val p = parseProfile(emptyMap<String, Any?>(), "cam-1")
        val d = draftFromProfile(p)
        assertEquals(50, d.sensitivity)
        assertEquals(50, patchFromDraft(d)["sensitivity"])
    }

    /* ── 2. Tres estados de capacidad, no dos ───────────────────────── */

    @Test
    fun `null en un flag es NO VERIFICADO, no no soportado`() {
        val caps = parseCapabilities(
            mapOf<String, Any?>(
                "probeOk" to true,
                "flags" to mapOf<String, Any?>(
                    "fieldDetection" to true,
                    "lineDetection" to false,
                    "loitering" to null,
                ),
            ),
        )
        assertNotNull(caps)
        val byKey = caps!!.flags.toMap()
        assertEquals(CapabilityState.SUPPORTED, byKey["fieldDetection"])
        assertEquals(CapabilityState.UNSUPPORTED, byKey["lineDetection"])
        assertEquals(CapabilityState.UNVERIFIED, byKey["loitering"])
    }

    @Test
    fun `una clave que el servidor no manda es NO VERIFICADO`() {
        val caps = parseCapabilities(mapOf<String, Any?>("probeOk" to true, "flags" to emptyMap<String, Any?>()))
        val byKey = caps!!.flags.toMap()
        // Todas las conocidas siguen presentes y en el tercer estado: que el
        // equipo no las nombre no las convierte en incapacidades.
        assertEquals(CAPABILITY_LABELS.size, byKey.size)
        assertTrue(byKey.values.all { it == CapabilityState.UNVERIFIED })
    }

    @Test
    fun `los tres estados tienen etiquetas distintas`() {
        val labels = CapabilityState.entries.map(::capabilityStateLabel)
        assertEquals(3, labels.toSet().size)
        assertEquals("No verificado", capabilityStateLabel(CapabilityState.UNVERIFIED))
    }

    @Test
    fun `sin bloque de capacidades el perfil trae null, no un objeto vacio`() {
        // `null` = nunca se sondeó. Un objeto con todo en false diría otra cosa.
        assertNull(parseProfile(mapOf<String, Any?>(), "cam-1").capabilities)
    }

    /* ── 3. Lo que el móvil no edita, el móvil no lo manda ──────────── */

    @Test
    fun `el PATCH del movil no incluye regions`() {
        // El servidor solo toca la columna si el campo viene. Omitirlo conserva
        // las zonas dibujadas en la consola web; mandarlas «tal cual» sería una
        // escritura de más y una ocasión de borrarlas por accidente.
        val body = patchFromDraft(
            DetectionDraft(
                enabled = true,
                sensitivity = 50,
                alarmConfidence = "low",
                detectionTarget = "human",
                window = DEFAULT_WINDOW,
            ),
        )
        assertFalse(body.containsKey("regions"))
        assertEquals(setOf("enabled", "sensitivity", "alarmConfidence", "detectionTarget", "schedule"), body.keys)
    }

    @Test
    fun `guardar desde el movil no borra las zonas del perfil`() {
        val raw = mapOf<String, Any?>(
            "effective" to mapOf<String, Any?>(
                "sensitivity" to 60,
                "regions" to listOf(
                    listOf(
                        mapOf("x" to 0.1, "y" to 0.1),
                        mapOf("x" to 0.9, "y" to 0.1),
                        mapOf("x" to 0.5, "y" to 0.8),
                    ),
                ),
            ),
        )
        val p = parseProfile(raw, "cam-1")
        assertEquals(1, p.regions?.size)
        assertFalse(patchFromDraft(draftFromProfile(p)).containsKey("regions"))
    }

    /* ── Regiones ───────────────────────────────────────────────────── */

    @Test
    fun `sin regiones devuelve null que significa fotograma completo`() {
        assertNull(readRegions(null))
        assertNull(readRegions(emptyList<Any?>()))
    }

    @Test
    fun `un poligono de dos vertices se descarta`() {
        val v = listOf(listOf(mapOf("x" to 0.1, "y" to 0.1), mapOf("x" to 0.2, "y" to 0.2)))
        assertNull(readRegions(v))
    }

    @Test
    fun `se respeta el tope de cuatro poligonos`() {
        val poly = listOf(
            mapOf("x" to 0.1, "y" to 0.1),
            mapOf("x" to 0.9, "y" to 0.1),
            mapOf("x" to 0.5, "y" to 0.8),
        )
        val regions = readRegions(List(9) { poly })
        assertEquals(4, regions?.size)
    }

    @Test
    fun `los vertices se recortan al rango 0 a 1`() {
        val v = listOf(
            listOf(
                mapOf("x" to -3.0, "y" to 0.5),
                mapOf("x" to 7.0, "y" to 0.5),
                mapOf("x" to 0.5, "y" to 0.9),
            ),
        )
        val pts = readRegions(v)!!.first()
        assertEquals(0f, pts[0].x)
        assertEquals(1f, pts[1].x)
    }

    @Test
    fun `regionsSummary distingue fotograma completo de zonas`() {
        assertTrue(regionsSummary(null).contains("Fotograma completo"))
        val poly = listOf(DetectionPoint(0f, 0f), DetectionPoint(1f, 0f), DetectionPoint(0.5f, 1f))
        assertTrue(regionsSummary(listOf(poly)).contains("3 vértices"))
    }

    /* ── Ventana horaria ────────────────────────────────────────────── */

    @Test
    fun `una ventana sin horas validas no se lee`() {
        assertNull(readWindow(mapOf<String, Any?>("start" to "25:00", "end" to "10:00")))
        assertNull(readWindow(mapOf<String, Any?>("start" to "8:00", "end" to "10:00")))
        assertNull(readWindow("no soy un objeto"))
    }

    @Test
    fun `dias fuera de rango se descartan y el resto se ordena`() {
        val w = readWindow(mapOf<String, Any?>("start" to "08:00", "end" to "18:00", "days" to listOf(6, 9, 1, 1, -2)))
        assertEquals(listOf(1, 6), w?.days)
    }

    @Test
    fun `sin dias no se puede guardar`() {
        val d = DetectionDraft(true, 50, "low", "human", DEFAULT_WINDOW.copy(days = emptyList()))
        assertTrue(draftProblems(d).any { it.contains("Marca al menos uno") })
    }

    @Test
    fun `una ventana valida no da problemas`() {
        val d = DetectionDraft(true, 50, "low", "human", DEFAULT_WINDOW)
        assertTrue(draftProblems(d).isEmpty())
    }

    @Test
    fun `confianza u objetivo fuera del catalogo del servidor se rechazan`() {
        val limits = DetectionLimits(alarmConfidences = listOf("low"), detectionTargets = listOf("human"))
        val d = DetectionDraft(true, 50, "inventada", "marciano", DEFAULT_WINDOW)
        val problems = draftProblems(d, limits)
        assertEquals(2, problems.size)
    }

    @Test
    fun `windowSummary avisa cuando cruza la medianoche`() {
        val w = DetectionWindow("22:00", "06:00", listOf(0, 1, 2, 3, 4, 5, 6))
        assertTrue(windowSummary(w).contains("cruza la medianoche"))
        assertTrue(windowSummary(w).contains("todos los días"))
    }

    /* ── Perfil: nulos del contrato ─────────────────────────────────── */

    @Test
    fun `un perfil con todo nulo no revienta`() {
        val raw = mapOf<String, Any?>(
            "cameraId" to null,
            "cameraName" to null,
            "deviceIp" to null,
            "channel" to null,
            "stored" to null,
            "capabilities" to null,
            "lastAppliedAt" to null,
            "lastAppliedNote" to null,
            "effective" to null,
            "limits" to null,
        )
        val p = parseProfile(raw, "cam-9")
        assertEquals("cam-9", p.cameraId)
        assertNull(p.cameraName)
        assertNull(p.channel)
        assertFalse(p.hasStoredProfile)
        assertNull(p.window)
        assertEquals(50, p.sensitivity)
        assertTrue(p.enabled)
    }

    @Test
    fun `stored presente marca que la camara ya se edito`() {
        val raw = mapOf<String, Any?>(
            "stored" to mapOf<String, Any?>(
                "sensitivity" to null,
                "schedule" to mapOf<String, Any?>("start" to "07:00", "end" to "19:00", "days" to listOf(1, 2)),
            ),
        )
        val p = parseProfile(raw, "cam-1")
        assertTrue(p.hasStoredProfile)
        assertEquals("07:00", p.window?.start)
        assertEquals(listOf(1, 2), p.window?.days)
    }

    @Test
    fun `enabled solo es false si el servidor lo dice`() {
        assertTrue(parseProfile(mapOf<String, Any?>(), "c").enabled)
        assertTrue(parseProfile(mapOf<String, Any?>("enabled" to null), "c").enabled)
        assertFalse(parseProfile(mapOf<String, Any?>("enabled" to false), "c").enabled)
    }

    @Test
    fun `un valor fuera del catalogo del servidor cae en el de compatibilidad`() {
        val raw = mapOf<String, Any?>(
            "effective" to mapOf<String, Any?>(
                "alarmConfidence" to "altísima",
                "detectionTarget" to "dron",
            ),
        )
        val p = parseProfile(raw, "c")
        assertEquals("mediumHigh", p.alarmConfidence)
        assertEquals("human", p.detectionTarget)
    }

    @Test
    fun `la sensibilidad se recorta al rango que manda el servidor`() {
        val raw = mapOf<String, Any?>(
            "limits" to mapOf<String, Any?>("sensitivityMin" to 10, "sensitivityMax" to 80),
            "effective" to mapOf<String, Any?>("sensitivity" to 999),
        )
        assertEquals(80, parseProfile(raw, "c").sensitivity)
    }

    /* ── Traducciones ───────────────────────────────────────────────── */

    @Test
    fun `las cuatro confianzas tienen etiqueta y pista propias`() {
        val labels = CONFIDENCE_ORDER.map(::confidenceLabel)
        val hints = CONFIDENCE_ORDER.map(::confidenceHint)
        assertEquals(4, labels.toSet().size)
        assertEquals(4, hints.toSet().size)
        assertTrue(hints.none { it.isBlank() })
    }

    @Test
    fun `el 100 se describe como la causa del ruido`() {
        assertTrue(sensitivityMeaning(100).hint.contains("ruido"))
        assertEquals("Equilibrada", sensitivityMeaning(50).label)
    }

    @Test
    fun `los tres objetivos documentados tienen traduccion`() {
        assertEquals("Personas y vehículos", targetLabel("human,vehicle"))
        assertEquals("Solo personas", targetLabel("human"))
        assertEquals("Solo vehículos", targetLabel("vehicle"))
    }
}
