package mx.nexara.mobile.nativeapp.ui.integra

import mx.nexara.mobile.nativeapp.ui.enterprise.NxTone
import mx.nexara.mobile.nativeapp.ui.integra.common.AlarmSeverity
import mx.nexara.mobile.nativeapp.ui.integra.common.AlarmStatusFilter
import mx.nexara.mobile.nativeapp.ui.integra.common.DoorControl
import mx.nexara.mobile.nativeapp.ui.integra.common.EventQuickView
import mx.nexara.mobile.nativeapp.ui.integra.common.IntegraFormat
import mx.nexara.mobile.nativeapp.ui.integra.common.PeopleSort
import mx.nexara.mobile.nativeapp.ui.integra.common.ValidityState
import mx.nexara.mobile.nativeapp.ui.integra.common.VisitorStatus
import mx.nexara.mobile.nativeapp.ui.integra.common.agruparAlarmas
import mx.nexara.mobile.nativeapp.ui.integra.common.agruparPorDia
import mx.nexara.mobile.nativeapp.ui.integra.common.alarmActions
import mx.nexara.mobile.nativeapp.ui.integra.common.alarmAlcanzaSeveridad
import mx.nexara.mobile.nativeapp.ui.integra.common.alarmKindLabel
import mx.nexara.mobile.nativeapp.ui.integra.common.alarmPasaFiltro
import mx.nexara.mobile.nativeapp.ui.integra.common.alarmSourceLabel
import mx.nexara.mobile.nativeapp.ui.integra.common.alarmStatusLabel
import mx.nexara.mobile.nativeapp.ui.integra.common.credencialesLabel
import mx.nexara.mobile.nativeapp.ui.integra.common.credentialScore
import mx.nexara.mobile.nativeapp.ui.integra.common.describeValidity
import mx.nexara.mobile.nativeapp.ui.integra.common.deviceLabel
import mx.nexara.mobile.nativeapp.ui.integra.common.doorState
import mx.nexara.mobile.nativeapp.ui.integra.common.doorStateLabel
import mx.nexara.mobile.nativeapp.ui.integra.common.esKindConocido
import mx.nexara.mobile.nativeapp.ui.integra.common.eventActivo
import mx.nexara.mobile.nativeapp.ui.integra.common.eventMatches
import mx.nexara.mobile.nativeapp.ui.integra.common.eventStateLabel
import mx.nexara.mobile.nativeapp.ui.integra.common.faceOn
import mx.nexara.mobile.nativeapp.ui.integra.common.jornadaLabel
import mx.nexara.mobile.nativeapp.ui.integra.common.jornadaSinCerrar
import mx.nexara.mobile.nativeapp.ui.integra.common.jornadaTone
import mx.nexara.mobile.nativeapp.ui.integra.common.motivoValido
import mx.nexara.mobile.nativeapp.ui.integra.common.ordenarEquipos
import mx.nexara.mobile.nativeapp.ui.integra.common.ordenarPersonas
import mx.nexara.mobile.nativeapp.ui.integra.common.ordenarVisitas
import mx.nexara.mobile.nativeapp.ui.integra.common.outcomeLabel
import mx.nexara.mobile.nativeapp.ui.integra.common.outcomeTone
import mx.nexara.mobile.nativeapp.ui.integra.common.puedeCancelarVisita
import mx.nexara.mobile.nativeapp.ui.integra.common.quickViewRange
import mx.nexara.mobile.nativeapp.ui.integra.common.resumenDelDia
import mx.nexara.mobile.nativeapp.ui.integra.common.syncAge
import mx.nexara.mobile.nativeapp.ui.integra.common.validarVisitaRecurrente
import mx.nexara.mobile.nativeapp.ui.integra.common.validityRank
import mx.nexara.mobile.nativeapp.ui.integra.common.verifyModeLabel
import mx.nexara.mobile.nativeapp.ui.integra.common.visitorStatus
import mx.nexara.mobile.nativeapp.ui.integra.common.weekdaysLabel
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.Instant
import java.time.ZoneId

/**
 * Las reglas de INTEGRA en el móvil.
 *
 * Casi todas estas pruebas existen porque el comportamiento contrario ya se
 * produjo alguna vez en este proyecto: alarmas fantasma por adivinar el estado
 * del evento, jornadas cerradas con una cara no reconocida, un tipo de alarma
 * nuevo pintado como «acceso denegado», y vigencias de 2037 anunciadas como
 * «vence en 4 000 días».
 */
class IntegraRulesTest {

    private val mx: ZoneId = IntegraFormat.MexicoCity

    // ── Puertas ───────────────────────────────────────────────────────────────

    @Test
    fun `el equipo caido gana sobre el estado del espejo`() {
        // Un «cerrada» de hace tres horas en un terminal desconectado es peor
        // que decir la verdad.
        assertEquals("offline", doorState(online = false, status = "closed"))
        assertEquals("offline", doorState(online = false, status = "remain_open"))
    }

    @Test
    fun `un estado que no esta en la tabla del servidor es desconocido, no invencion`() {
        assertEquals("unknown", doorState(online = true, status = "forzada"))
        assertEquals("unknown", doorState(online = null, status = null))
        assertEquals("Sin dato", doorStateLabel("unknown"))
    }

    @Test
    fun `las dos ordenes que franquean el paso van marcadas`() {
        assertTrue(DoorControl.Abrir.franqueaPaso)
        assertTrue(DoorControl.QuedarAbierta.franqueaPaso)
        assertFalse(DoorControl.Cerrar.franqueaPaso)
        assertFalse(DoorControl.QuedarCerrada.franqueaPaso)
    }

    @Test
    fun `controlType viaja como cadena y con los codigos del servidor`() {
        assertEquals("2", DoorControl.Abrir.controlType)
        assertEquals("1", DoorControl.Cerrar.controlType)
        assertEquals("0", DoorControl.QuedarAbierta.controlType)
        assertEquals("3", DoorControl.QuedarCerrada.controlType)
    }

    @Test
    fun `el motivo se valida aqui y no en el 400 del servidor`() {
        assertFalse(motivoValido("ok"))
        assertFalse(motivoValido("   "))
        assertTrue(motivoValido("  visita autorizada  "))
    }

    // ── Eventos ───────────────────────────────────────────────────────────────

    @Test
    fun `el resultado sale de outcome, no de adivinar el minor`() {
        assertEquals(NxTone.Success, outcomeTone("granted", null))
        assertEquals(NxTone.Danger, outcomeTone("denied", null))
        assertEquals(NxTone.Neutral, outcomeTone(null, "Puerta abierta"))
    }

    @Test
    fun `sin outcome se cae a la etiqueta del servidor, sin clasificar codigos`() {
        assertEquals(NxTone.Success, outcomeTone(null, "Acceso concedido por rostro"))
        assertEquals(NxTone.Danger, outcomeTone(null, "Acceso denegado"))
        assertEquals("Latido del equipo", outcomeLabel(null, "Latido del equipo", "heartBeat"))
        assertEquals("heartBeat", outcomeLabel(null, null, "heartBeat"))
        assertEquals("Evento", outcomeLabel(null, null, null))
    }

    @Test
    fun `eventState nulo no es ni activo ni cerrado`() {
        // Los temporizadores que suplían este dato fabricaban alarmas fantasma.
        assertEquals(true, eventActivo("active"))
        assertEquals(false, eventActivo("inactive"))
        assertNull(eventActivo(null))
        assertNull(eventActivo("ACTIVO"))
        assertEquals("", eventStateLabel(null))
        assertEquals("En curso", eventStateLabel("active"))
        assertEquals("Finalizado", eventStateLabel("inactive"))
    }

    @Test
    fun `hoy arranca a medianoche local, no 24 horas atras`() {
        val ahora = Instant.parse("2026-09-07T15:00:00Z") // 09:00 en Puebla
        val (desde, hasta) = quickViewRange(EventQuickView.Hoy, ahora, mx)
        assertEquals(ahora, hasta)
        assertEquals("2026-09-07", desde.atZone(mx).toLocalDate().toString())
        assertEquals(0, desde.atZone(mx).hour)
    }

    @Test
    fun `las vistas por horas retroceden desde ahora`() {
        val ahora = Instant.parse("2026-09-07T15:00:00Z")
        val (desde, _) = quickViewRange(EventQuickView.SieteDias, ahora, mx)
        assertEquals(Instant.parse("2026-08-31T15:00:00Z"), desde)

        val (ruido, _) = quickViewRange(EventQuickView.Ruido, ahora, mx)
        assertEquals(Instant.parse("2026-09-07T09:00:00Z"), ruido)
        assertEquals("noise", EventQuickView.Ruido.scope)
        assertEquals("denied", EventQuickView.Denegados.outcome)
    }

    @Test
    fun `el equipo se identifica por nombre, y si falta por IP`() {
        assertEquals("Recepción · Puerta 1", deviceLabel("Recepción", 1, "192.168.9.20"))
        assertEquals("192.168.9.20 · Puerta 2", deviceLabel(null, 2, "192.168.9.20"))
        assertEquals("Recepción", deviceLabel("Recepción", null, null))
        assertEquals(IntegraFormat.EMPTY, deviceLabel(null, null, null))
    }

    @Test
    fun `el modo de verificacion solo se traduce si se conoce`() {
        assertEquals("Rostro", verifyModeLabel("face"))
        assertEquals("Huella", verifyModeLabel("fp"))
        // Un modo que este parque no emite se enseña crudo en vez de inventarlo.
        assertEquals("multiFactorXyz", verifyModeLabel("multiFactorXyz"))
        assertEquals("", verifyModeLabel(null))
    }

    @Test
    fun `la busqueda de eventos ignora acentos y mayusculas`() {
        val ev = mapOf<String, Any?>("personName" to "Joan Sebastián", "deviceName" to "Recepción")
        assertTrue(eventMatches(ev, "sebastian"))
        assertTrue(eventMatches(ev, "RECEPCION"))
        assertTrue(eventMatches(ev, ""))
        assertFalse(eventMatches(ev, "almacén"))
    }

    // ── Asistencia ────────────────────────────────────────────────────────────

    @Test
    fun `un solo pase es una entrada sin salida, no una jornada de cero`() {
        // ACS_EXIT_MINORS está vacía a propósito: este hardware no emite salida.
        assertEquals("Entrada sin salida registrada", jornadaLabel(minutes = null, passes = 1))
        assertEquals(NxTone.Warning, jornadaTone(minutes = null, passes = 1))
        assertTrue(jornadaSinCerrar(mapOf("minutes" to null, "passes" to 1.0)))
    }

    @Test
    fun `con dos pases si hay jornada y se dice cuanto duro`() {
        assertEquals("Jornada 8 h 12 min", jornadaLabel(minutes = 492, passes = 3))
        assertEquals(NxTone.Success, jornadaTone(minutes = 492, passes = 3))
        assertFalse(jornadaSinCerrar(mapOf("minutes" to 492.0, "passes" to 3.0)))
    }

    @Test
    fun `las jornadas se agrupan por dia conservando el orden del servidor`() {
        val filas = listOf(
            mapOf<String, Any?>("day" to "2026-09-07", "personId" to "a", "passes" to 2.0, "denied" to 0.0),
            mapOf<String, Any?>("day" to "2026-09-07", "personId" to "b", "passes" to 1.0, "denied" to 3.0),
            mapOf<String, Any?>("day" to "2026-09-06", "personId" to "a", "passes" to 4.0, "denied" to 0.0),
        )
        val dias = agruparPorDia(filas)
        assertEquals(listOf("2026-09-07", "2026-09-06"), dias.map { it.first })
        assertEquals(2, dias.first().second.size)
        assertEquals("2 persona(s) · 3 acceso(s) · 3 denegado(s)", resumenDelDia(dias.first().second))
    }

    // ── Personas ──────────────────────────────────────────────────────────────

    @Test
    fun `una vigencia de 2037 es indefinida, no cuatro mil dias`() {
        val v = describeValidity(
            validEnable = true,
            validTo = "2037-12-31T23:59:59",
            nowEpochDay = 20_700,
            validToEpochDay = 24_837,
        )
        assertEquals("Indefinida", v.label)
        assertEquals(NxTone.Success, v.tone)
    }

    @Test
    fun `la suspension gana sobre la fecha de fin`() {
        val v = describeValidity(
            validEnable = false,
            validTo = "2037-12-31T23:59:59",
            nowEpochDay = 20_700,
            validToEpochDay = 24_837,
        )
        assertEquals("Suspendida", v.label)
        assertEquals(NxTone.Danger, v.tone)
    }

    @Test
    fun `caducada, vence pronto y sin vigencia se distinguen`() {
        assertEquals(
            "Caducada",
            describeValidity(true, "2026-01-01", 20_700, 20_400).label,
        )
        assertEquals(
            "Vence en 5 día(s)",
            describeValidity(true, "2026-09-12", 20_700, 20_705).label,
        )
        assertEquals("Sin vigencia", describeValidity(true, null, 20_700, null).label)
        assertEquals("Vigencia ilegible", describeValidity(true, "ayer", 20_700, null).label)
    }

    @Test
    fun `el orden por urgencia pone delante a quien no puede entrar`() {
        // No es el orden de declaración del enum: primero lo que impide entrar
        // hoy, después lo que lo impedirá pronto, y al final lo que está bien.
        val orden = listOf(
            ValidityState.Suspendida,
            ValidityState.Caducada,
            ValidityState.VencePronto,
            ValidityState.Desconocida,
            ValidityState.Vigente,
        ).map { validityRank(it) }
        assertEquals(listOf(0, 1, 2, 3, 4), orden)
    }

    @Test
    fun `tener rostro se acepta por cualquiera de las tres senales`() {
        assertTrue(faceOn(numOfFace = 1, hasFace = null, hasLocalFace = null))
        assertTrue(faceOn(numOfFace = 0, hasFace = true, hasLocalFace = null))
        assertTrue(faceOn(numOfFace = null, hasFace = null, hasLocalFace = true))
        assertFalse(faceOn(numOfFace = 0, hasFace = false, hasLocalFace = false))
        assertFalse(faceOn(null, null, null))
    }

    @Test
    fun `sin ninguna credencial se dice, porque esa persona no abre nada`() {
        assertEquals("Sin credenciales", credencialesLabel(0, 0, 0, false))
        assertEquals(0, credentialScore(0, 0, 0, false, false, 0))
        assertEquals("1 rostro(s) · 2 tarjeta(s)", credencialesLabel(1, 2, 0, false))
        assertEquals(3, credentialScore(1, 2, 1, true, true, 0))
        // Huella guardada sólo en NEXARA también cuenta.
        assertEquals(1, credentialScore(0, 0, 0, false, false, 2))
    }

    @Test
    fun `ordenar por credenciales pone primero a las incompletas`() {
        val sinNada = mapOf<String, Any?>("name" to "Zoe")
        val completa = mapOf<String, Any?>("name" to "Ana", "numOfFace" to 1.0, "numOfCard" to 1.0)
        val vigencia = { _: Map<String, Any?> ->
            describeValidity(true, null, 20_700, null)
        }
        val score = { p: Map<String, Any?> ->
            credentialScore(
                (p["numOfFace"] as? Number)?.toInt(),
                (p["numOfCard"] as? Number)?.toInt(),
                null, null, null, 0,
            )
        }
        val orden = ordenarPersonas(listOf(completa, sinNada), PeopleSort.Credenciales, vigencia, score)
        assertEquals("Zoe", orden.first()["name"])

        val alfabetico = ordenarPersonas(listOf(sinNada, completa), PeopleSort.Nombre, vigencia, score)
        assertEquals("Ana", alfabetico.first()["name"])
    }

    // ── Alarmas ───────────────────────────────────────────────────────────────

    @Test
    fun `los estados de alarma usan las palabras de la consola`() {
        assertEquals("Nueva", alarmStatusLabel("OPEN"))
        assertEquals("Atendida", alarmStatusLabel("ACK"))
        assertEquals("Escalada a ticket", alarmStatusLabel("TICKETED"))
        assertEquals("Cerrada", alarmStatusLabel("CLEARED"))
        assertEquals("Sin estado", alarmStatusLabel(null))
    }

    @Test
    fun `no se puede atender lo ya atendido ni escalar dos veces`() {
        val nueva = alarmActions("OPEN", ticketRequestId = null)
        assertTrue(nueva.puedeAtender)
        assertTrue(nueva.puedeCerrar)
        assertTrue(nueva.puedeEscalar)

        val atendida = alarmActions("ACK", ticketRequestId = null)
        assertFalse(atendida.puedeAtender)
        assertTrue(atendida.puedeCerrar)

        val conTicket = alarmActions("TICKETED", ticketRequestId = 42)
        assertFalse(conTicket.puedeEscalar)

        val cerrada = alarmActions("CLEARED", ticketRequestId = null)
        assertFalse(cerrada.puedeCerrar)
        assertFalse(cerrada.puedeEscalar)
    }

    @Test
    fun `el filtro de severidad es un minimo, no una igualdad`() {
        assertTrue(alarmAlcanzaSeveridad("alta", AlarmSeverity.Media))
        assertTrue(alarmAlcanzaSeveridad("media", AlarmSeverity.Media))
        assertFalse(alarmAlcanzaSeveridad("baja", AlarmSeverity.Media))
        // Sin filtro pasa todo, incluida la que el servidor no clasificó.
        assertTrue(alarmAlcanzaSeveridad("loquesea", null))
        assertFalse(alarmAlcanzaSeveridad("loquesea", AlarmSeverity.Baja))
    }

    @Test
    fun `pendientes son las nuevas y las escaladas, igual que openCount`() {
        assertTrue(alarmPasaFiltro("OPEN", AlarmStatusFilter.Pendientes))
        assertTrue(alarmPasaFiltro("TICKETED", AlarmStatusFilter.Pendientes))
        assertFalse(alarmPasaFiltro("ACK", AlarmStatusFilter.Pendientes))
        assertTrue(alarmPasaFiltro("CLEARED", AlarmStatusFilter.Todas))
    }

    @Test
    fun `un kind desconocido no se pinta como acceso denegado`() {
        assertEquals("Puerta mantenida abierta", alarmKindLabel("DOOR_HELD_OPEN"))
        assertEquals("Entrada fuera de horario", alarmKindLabel(null, "acs.after_hours"))
        assertFalse(esKindConocido("CAMERA_LASER"))
        assertEquals("Camera laser", alarmKindLabel("CAMERA_LASER"))
        assertEquals("", alarmKindLabel(null, null))
    }

    @Test
    fun `el origen prefiere el nombre de la puerta a la IP`() {
        assertEquals(
            "Acceso principal",
            alarmSourceLabel(mapOf("doorName" to "Acceso principal", "deviceIp" to "192.168.9.20")),
        )
        assertEquals("Puerta 3", alarmSourceLabel(mapOf("doorNo" to 3.0)))
        assertEquals("192.168.9.20", alarmSourceLabel(mapOf("deviceIp" to "192.168.9.20")))
        assertEquals(IntegraFormat.EMPTY, alarmSourceLabel(emptyMap()))
    }

    @Test
    fun `quince repeticiones de la misma puerta son una fila`() {
        val base = 1_757_000_000_000L
        val repeticiones = (0 until 15).map { i ->
            mapOf<String, Any?>(
                "id" to "soc:$i",
                "status" to "OPEN",
                "kind" to "DOOR_FORCED",
                "doorNo" to 1.0,
                "ts" to base + i * 10_000L,
            )
        }
        val grupos = agruparAlarmas(repeticiones) { (it["ts"] as? Long) }
        assertEquals(1, grupos.size)
        assertEquals(15, grupos.first().totalOcurrencias)
        // El representante es la más reciente: es sobre la que se decide.
        assertEquals("soc:14", grupos.first().representante["id"])
    }

    @Test
    fun `dos estados distintos no se fusionan aunque coincida todo lo demas`() {
        val base = 1_757_000_000_000L
        val alarmas = listOf(
            mapOf<String, Any?>("id" to "a", "status" to "OPEN", "kind" to "DENIED", "doorNo" to 1.0, "ts" to base),
            mapOf<String, Any?>("id" to "b", "status" to "ACK", "kind" to "DENIED", "doorNo" to 1.0, "ts" to base + 1000),
        )
        assertEquals(2, agruparAlarmas(alarmas) { it["ts"] as? Long }.size)
    }

    @Test
    fun `una alarma sin hora no se agrupa con nadie`() {
        val alarmas = listOf(
            mapOf<String, Any?>("id" to "a", "status" to "OPEN", "kind" to "DENIED", "ts" to 1L),
            mapOf<String, Any?>("id" to "b", "status" to "OPEN", "kind" to "DENIED"),
        )
        assertEquals(2, agruparAlarmas(alarmas) { it["ts"] as? Long }.size)
    }

    @Test
    fun `pasada la ventana de cinco minutos empieza otro incidente`() {
        val base = 1_757_000_000_000L
        val alarmas = listOf(
            mapOf<String, Any?>("id" to "a", "status" to "OPEN", "kind" to "DENIED", "ts" to base),
            mapOf<String, Any?>("id" to "b", "status" to "OPEN", "kind" to "DENIED", "ts" to base + 6 * 60_000L),
        )
        assertEquals(2, agruparAlarmas(alarmas) { it["ts"] as? Long }.size)
    }

    // ── Equipos ───────────────────────────────────────────────────────────────

    @Test
    fun `el inventario pone delante lo que esta caido`() {
        val equipos = listOf(
            mapOf<String, Any?>("name" to "Alfa", "online" to true),
            mapOf<String, Any?>("name" to "Zeta", "online" to false),
            mapOf<String, Any?>("name" to "Beta", "online" to null),
        )
        val orden = ordenarEquipos(equipos).map { it["name"] }
        assertEquals(listOf("Zeta", "Alfa", "Beta"), orden)
    }

    // ── Visitas recurrentes ───────────────────────────────────────────────────

    @Test
    fun `lunes a viernes se dice Lun-Vie y la semana entera Todos los dias`() {
        assertEquals(
            "Lun–Vie",
            weekdaysLabel(listOf("Monday", "Tuesday", "Wednesday", "Thursday", "Friday")),
        )
        assertEquals(
            "Todos los días",
            weekdaysLabel(
                listOf("Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"),
            ),
        )
        // Se ordena por la semana, no por como llegó del servidor.
        assertEquals("Lun · Mié", weekdaysLabel(listOf("Wednesday", "Monday")))
        assertEquals(IntegraFormat.EMPTY, weekdaysLabel(emptyList()))
    }

    @Test
    fun `una visita cancelada no esta vigente aunque le queden dias`() {
        assertEquals(
            VisitorStatus.Cancelada,
            visitorStatus("CANCELLED", validToEpochDay = 20_800, nowEpochDay = 20_700),
        )
    }

    @Test
    fun `una pendiente con la vigencia pasada esta vencida, no pendiente`() {
        assertEquals(
            VisitorStatus.Vencida,
            visitorStatus("PENDING", validToEpochDay = 20_600, nowEpochDay = 20_700),
        )
        assertEquals(
            VisitorStatus.Pendiente,
            visitorStatus("PENDING", validToEpochDay = 20_800, nowEpochDay = 20_700),
        )
        assertEquals(
            VisitorStatus.EnTerminales,
            visitorStatus("SYNCED", validToEpochDay = 20_800, nowEpochDay = 20_700),
        )
    }

    @Test
    fun `solo se cancela lo que todavia puede dejar pasar a alguien`() {
        assertTrue(puedeCancelarVisita(VisitorStatus.EnTerminales))
        assertTrue(puedeCancelarVisita(VisitorStatus.Pendiente))
        assertFalse(puedeCancelarVisita(VisitorStatus.Vencida))
        assertFalse(puedeCancelarVisita(VisitorStatus.Cancelada))
    }

    @Test
    fun `las visitas vivas van primero en la tabla`() {
        val vencida = mapOf<String, Any?>("id" to "v", "status" to "EXPIRED", "validTo" to "2026-01-01")
        val viva = mapOf<String, Any?>("id" to "a", "status" to "SYNCED", "validTo" to "2026-12-01")
        val estado = { m: Map<String, Any?> ->
            visitorStatus(m["status"] as? String, validToEpochDay = null, nowEpochDay = 20_700)
        }
        assertEquals("a", ordenarVisitas(listOf(vencida, viva), estado).first()["id"])
    }

    @Test
    fun `el alta se valida antes de gastar la llamada`() {
        val ok = validarVisitaRecurrente(
            "Ana López", listOf("Monday"), "09:00", "18:00", "2026-09-07", "2026-12-07",
        )
        assertTrue(ok.ok)

        assertFalse(validarVisitaRecurrente("Al", listOf("Monday"), "09:00", "18:00", "2026-09-07", "2026-12-07").ok)
        assertFalse(validarVisitaRecurrente("Ana López", emptyList(), "09:00", "18:00", "2026-09-07", "2026-12-07").ok)
        // Entrar después de salir no es un horario.
        assertFalse(validarVisitaRecurrente("Ana López", listOf("Monday"), "18:00", "09:00", "2026-09-07", "2026-12-07").ok)
        assertFalse(validarVisitaRecurrente("Ana López", listOf("Monday"), "9:00", "18:00", "2026-09-07", "2026-12-07").ok)
        assertFalse(validarVisitaRecurrente("Ana López", listOf("Monday"), "09:00", "18:00", "07-09-2026", "2026-12-07").ok)
        assertFalse(validarVisitaRecurrente("Ana López", listOf("Monday"), "09:00", "18:00", "2026-12-07", "2026-09-07").ok)
    }

    // ── Sincronización ────────────────────────────────────────────────────────

    @Test
    fun `sin fecha de sincronizacion no se dice recien, se dice nada`() {
        // Una fecha ausente pintada como fresca es cómo se acaba operando sobre
        // un inventario de hace tres días.
        assertNull(syncAge(lastSyncMs = null, nowMs = 1_757_000_000_000L))
    }

    @Test
    fun `el espejo se marca viejo pasada una hora`() {
        val ahora = 1_757_000_000_000L
        assertEquals("hace 5 min", syncAge(ahora - 5 * 60_000L, ahora)?.label)
        assertFalse(syncAge(ahora - 5 * 60_000L, ahora)?.stale ?: true)
        assertEquals("hace 2 h", syncAge(ahora - 2 * 3_600_000L, ahora)?.label)
        assertTrue(syncAge(ahora - 2 * 3_600_000L, ahora)?.stale ?: false)
        assertEquals("hace 3 d", syncAge(ahora - 3 * 86_400_000L, ahora)?.label)
    }

    @Test
    fun `un reloj de servidor adelantado dice recien, no hace menos cuatro minutos`() {
        val ahora = 1_757_000_000_000L
        val futuro = syncAge(ahora + 4 * 60_000L, ahora)
        assertEquals("recién", futuro?.label)
        assertFalse(futuro?.stale ?: true)
    }
}
