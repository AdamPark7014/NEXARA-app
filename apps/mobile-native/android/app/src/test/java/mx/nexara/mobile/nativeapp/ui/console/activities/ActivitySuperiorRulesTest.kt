package mx.nexara.mobile.nativeapp.ui.console.activities

import mx.nexara.mobile.nativeapp.data.api.ActivityAccionPersonaDto
import mx.nexara.mobile.nativeapp.data.api.ActivityAccionesDto
import mx.nexara.mobile.nativeapp.data.api.ActivityDto
import mx.nexara.mobile.nativeapp.data.api.ActivityIncumplimientoDto
import mx.nexara.mobile.nativeapp.data.api.ActivityPersonRefDto
import mx.nexara.mobile.nativeapp.data.api.AvanceAnteriorDto
import mx.nexara.mobile.nativeapp.data.api.CausaIncumplimientoDto
import mx.nexara.mobile.nativeapp.data.api.TeamBoardUserDto
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.Instant
import java.time.ZoneId

/** Cancelar, pasar, no cumplida y reprogramar: solo superiores, siempre con motivo. */
class ActivitySuperiorRulesTest {

    private val luis = ActivityAccionPersonaDto(userId = 1, nombre = "Luis Pérez", rol = "LEAD", responsable = true, ejecuta = false)
    private val ana = ActivityAccionPersonaDto(userId = 2, nombre = "Ana López", rol = "TECNICO", ejecuta = true)
    private val beto = ActivityAccionPersonaDto(userId = 3, nombre = "Beto Ruiz", rol = "APOYO", ejecuta = true)

    @Test
    fun motivoConMinimoDeLaApi() {
        val acciones = ActivityAccionesDto(motivoMinimo = 12)
        assertEquals(12, ActivitySuperiorRules.motivoMinimo(acciones))
        assertEquals(10, ActivitySuperiorRules.motivoMinimo(ActivityAccionesDto()))
        assertEquals(10, ActivitySuperiorRules.motivoMinimo(null))
        assertFalse(ActivitySuperiorRules.motivoOk("   corto   ", 10))
        // Los espacios repetidos no cuentan, igual que en el servidor.
        assertFalse(ActivitySuperiorRules.motivoOk("a          b", 10))
        assertTrue(ActivitySuperiorRules.motivoOk("El cliente pospuso", 10))
    }

    @Test
    fun sinPermisoOCerradaNoHayBotones() {
        assertFalse(ActivitySuperiorRules.muestraAcciones(null))
        assertFalse(ActivitySuperiorRules.muestraAcciones(ActivityAccionesDto(puedeCancelar = false, puedePasar = false)))
        assertFalse(ActivitySuperiorRules.muestraAcciones(ActivityAccionesDto(puedeCancelar = true, cerrada = true)))
        assertTrue(ActivitySuperiorRules.muestraAcciones(ActivityAccionesDto(puedeCancelar = true)))
        assertTrue(ActivitySuperiorRules.muestraAcciones(ActivityAccionesDto(puedePasar = true)))
    }

    @Test
    fun salenQuienesEjecutan() {
        val acciones = ActivityAccionesDto(personas = listOf(luis, ana, beto))
        assertEquals(listOf(2L, 3L), ActivitySuperiorRules.quienesSalen(acciones).map { it.userId })
        // Si nadie viene marcado como ejecutor, se ofrecen todas.
        val sinMarca = ActivityAccionesDto(personas = listOf(luis.copy(ejecuta = null)))
        assertEquals(listOf(1L), ActivitySuperiorRules.quienesSalen(sinMarca).map { it.userId })
    }

    @Test
    fun entranSoloQuienesNoEstanYa() {
        val acciones = ActivityAccionesDto(personas = listOf(luis, ana))
        val equipo = listOf(
            TeamBoardUserDto(id = 2, nombre = "Ana López"),
            TeamBoardUserDto(id = 9, nombre = "zoe Díaz"),
            TeamBoardUserDto(id = 7, nombre = "Carlos Mora"),
            TeamBoardUserDto(id = 7, nombre = "Carlos Mora"),
        )
        assertEquals(listOf(7L, 9L), ActivitySuperiorRules.quienesEntran(equipo, acciones).map { it.id })
    }

    @Test
    fun etiquetasDeQuienLaDeja() {
        assertEquals("Luis Pérez · responsable", ActivitySuperiorRules.etiquetaPersona(luis))
        assertEquals("Beto Ruiz · apoyo", ActivitySuperiorRules.etiquetaPersona(beto))
        assertEquals("Ana López", ActivitySuperiorRules.etiquetaPersona(ana))
    }

    @Test
    fun avanceAnteriorSoloLectura() {
        val av = AvanceAnteriorDto(
            nombre = "Ana López Pérez",
            titulo = "Avance anterior de Ana López",
            motivo = "Se enfermó.",
            movidaPor = "Luis Pérez",
            progressPct = 39.6,
        )
        assertEquals("Avance anterior de Ana López", ActivitySuperiorRules.tituloAvanceAnterior(av))
        assertEquals(
            "Solo lectura · 40% avanzado · Luis Pérez te la pasó · Motivo: Se enfermó. " +
                "Continúa desde aquí con tu propia foto de entrada y de salida.",
            ActivitySuperiorRules.detalleAvanceAnterior(av),
        )
        val sinDatos = AvanceAnteriorDto(nombre = "Ana López Pérez")
        assertEquals("Avance anterior de Ana López", ActivitySuperiorRules.tituloAvanceAnterior(sinDatos))
        assertEquals(
            "Solo lectura · 0% avanzado. Continúa desde aquí con tu propia foto de entrada y de salida.",
            ActivitySuperiorRules.detalleAvanceAnterior(sinDatos),
        )
    }

    @Test
    fun avisoDeCancelada() {
        val activa = ActivityDto(id = 1, estatus = "En Proceso")
        assertNull(ActivitySuperiorRules.avisoCancelada(activa))

        val cancelada = activa.copy(
            estatus = "Cancelada",
            cancelReason = "El cliente pospuso el servicio",
            cancelledAt = "2026-09-17T15:00:00.000Z",
            cancelledBy = ActivityPersonRefDto(id = 4, nombre = "Luis Pérez"),
        )
        assertEquals("Cancelada por Luis Pérez\nEl cliente pospuso el servicio", ActivitySuperiorRules.avisoCancelada(cancelada))
        assertEquals("Cancelada", ActivitySuperiorRules.avisoCancelada(activa.copy(estatus = "Cancelada")))
    }

    @Test
    fun unDatoPorRenglon() {
        // Texto viejo, a 390 px, en un solo renglón: «Cancelada por Luis Pérez · El cliente pospuso el servicio».
        val viejo = "Cancelada por Luis Pérez · El cliente pospuso el servicio"
        val cancelada = ActivityDto(
            id = 1,
            estatus = "Cancelada",
            cancelReason = "El cliente pospuso el servicio",
            cancelledAt = "2026-09-17T15:00:00.000Z",
            cancelledBy = ActivityPersonRefDto(id = 4, nombre = "Luis Pérez"),
        )
        val texto = ActivitySuperiorRules.avisoCancelada(cancelada)!!
        assertEquals("Cancelada por Luis Pérez\nEl cliente pospuso el servicio", texto)
        assertEquals(listOf("Cancelada por Luis Pérez", "El cliente pospuso el servicio"), texto.split("\n"))
        assertNotEquals(viejo, texto)
        assertFalse(texto.contains(" · "))
        // Sin motivo no queda un renglón vacío. Quién puede cancelar no cambia.
        assertEquals("Cancelada por Luis Pérez", ActivitySuperiorRules.avisoCancelada(cancelada.copy(cancelReason = " ")))
        assertEquals("Cancelada por Luis Pérez", ActivitySuperiorRules.avisoCancelada(cancelada.copy(cancelReason = null)))
        assertFalse(ActivitySuperiorRules.avisoCancelada(cancelada.copy(cancelReason = " "))!!.contains("\n"))
        val soloMotivo = cancelada.copy(cancelledBy = null)
        assertEquals("Cancelada\nEl cliente pospuso el servicio", ActivitySuperiorRules.avisoCancelada(soloMotivo))
        assertEquals(listOf(ActivitySuperiorRules.Accion.CANCELAR), ActivitySuperiorRules.botones(ActivityAccionesDto(puedeCancelar = true)))
    }

    // ── No cumplida y reprogramar ───────────────────────────────────────────

    @Test
    fun botonesEnOrdenYSoloLosQuePermiteLaApi() {
        val todo = ActivityAccionesDto(
            puedeCancelar = true,
            puedePasar = true,
            puedeRegistrarIncumplimiento = true,
        )
        assertEquals(
            listOf(ActivitySuperiorRules.Accion.PASAR, ActivitySuperiorRules.Accion.NO_CUMPLIDA, ActivitySuperiorRules.Accion.CANCELAR),
            ActivitySuperiorRules.botones(todo),
        )
        assertTrue(ActivitySuperiorRules.muestraAcciones(ActivityAccionesDto(puedeRegistrarIncumplimiento = true)))
        // API vieja: sin los campos nuevos se ve igual que antes.
        assertEquals(listOf(ActivitySuperiorRules.Accion.CANCELAR), ActivitySuperiorRules.botones(ActivityAccionesDto(puedeCancelar = true)))
    }

    @Test
    fun cerradaComoNoCumplidaSoloDejaReprogramar() {
        val noCumplida = ActivityAccionesDto(
            cerrada = true,
            estatus = "No cumplida",
            puedeCancelar = true,
            puedePasar = true,
            puedeRegistrarIncumplimiento = true,
            puedeReprogramar = true,
        )
        assertEquals(listOf(ActivitySuperiorRules.Accion.REPROGRAMAR), ActivitySuperiorRules.botones(noCumplida))
        assertTrue(ActivitySuperiorRules.muestraAcciones(noCumplida))
        assertFalse(ActivitySuperiorRules.muestraAcciones(noCumplida.copy(puedeReprogramar = false)))
    }

    @Test
    fun causasDeLaApiOElRespaldo() {
        val respaldo = ActivitySuperiorRules.causas(null)
        assertEquals(7, respaldo.size)
        assertEquals("SIN_ENTREGA", respaldo.first().clave)
        assertEquals("Otra causa", respaldo.last().etiqueta)

        val api = ActivityAccionesDto(
            causasIncumplimiento = listOf(
                CausaIncumplimientoDto("MATERIAL", "Falta de material"),
                CausaIncumplimientoDto("", "Sin clave"),
                CausaIncumplimientoDto("ACCESO", null),
                CausaIncumplimientoDto("MATERIAL", "Repetida"),
            ),
        )
        val causas = ActivitySuperiorRules.causas(api)
        assertEquals(listOf("MATERIAL", "ACCESO"), causas.map { it.clave })
        assertEquals("Falta de material", causas[0].etiqueta)
        // Sin etiqueta se usa la del catálogo local.
        assertEquals("Sin acceso al sitio o cliente no disponible", causas[1].etiqueta)
        assertEquals(respaldo, ActivitySuperiorRules.causas(ActivityAccionesDto(causasIncumplimiento = emptyList())))
    }

    @Test
    fun registroPideCausaYObservaciones() {
        assertFalse(ActivitySuperiorRules.incumplimientoListo(null, "El cliente no dio acceso", 10))
        assertFalse(ActivitySuperiorRules.incumplimientoListo("ACCESO", "corto", 10))
        assertTrue(ActivitySuperiorRules.incumplimientoListo("ACCESO", "El cliente no dio acceso", 10))
    }

    @Test
    fun reprogramarSoloAFuturo() {
        val ahora = Instant.parse("2026-10-22T18:00:00Z")
        assertTrue(ActivitySuperiorRules.fechaReprogramadaOk("2026-10-23T15:00:00Z", ahora))
        assertFalse(ActivitySuperiorRules.fechaReprogramadaOk("2026-10-22T17:59:00Z", ahora))
        assertFalse(ActivitySuperiorRules.fechaReprogramadaOk(null, ahora))
        assertFalse(ActivitySuperiorRules.fechaReprogramadaOk("mañana", ahora))
    }

    @Test
    fun avisoDeNoCumplidaPorCierreDeJornada() {
        val a = ActivityDto(
            id = 1,
            estatus = "No cumplida",
            incumplimiento = ActivityIncumplimientoDto(
                origen = "CIERRE_JORNADA",
                causa = "SIN_ENTREGA",
                causaEtiqueta = "Sin entrega al cierre de la jornada",
                registradoAt = "2026-10-23T00:00:00.000Z",
                pendientes = listOf(
                    ActivityPersonRefDto(7, "Ana López"),
                    ActivityPersonRefDto(8, " "),
                    ActivityPersonRefDto(9, "Beto Ruiz"),
                ),
            ),
        )
        val aviso = ActivitySuperiorRules.avisoNoCumplida(a)!!
        assertEquals("No cumplida · Sin entrega al cierre de la jornada", aviso.titulo)
        assertEquals("Cierre automático de la jornada", aviso.origen)
        assertEquals("2026-10-23T00:00:00.000Z", aviso.registradoAt)
        assertNull(aviso.observaciones)
        assertEquals("Pendientes de entrega: Ana López, Beto Ruiz", aviso.pendientes)
    }

    @Test
    fun avisoDeNoCumplidaRegistradaPorUnSuperior() {
        val a = ActivityDto(
            id = 1,
            estatus = "No cumplida",
            incumplimiento = ActivityIncumplimientoDto(
                origen = "MANUAL",
                causa = "MATERIAL",
                observaciones = "  No llegó el cable a tiempo.  ",
                registradoPor = ActivityPersonRefDto(5, "Luis Pérez"),
            ),
        )
        val aviso = ActivitySuperiorRules.avisoNoCumplida(a)!!
        // Sin etiqueta de la API: la del catálogo.
        assertEquals("No cumplida · Falta de material, herramienta o equipo", aviso.titulo)
        assertEquals("Registrada por Luis Pérez", aviso.origen)
        assertEquals("No llegó el cable a tiempo.", aviso.observaciones)
        assertNull(aviso.pendientes)

        // API vieja, sin registro: solo el título.
        val sinRegistro = ActivitySuperiorRules.avisoNoCumplida(ActivityDto(id = 2, estatus = "No cumplida"))!!
        assertEquals("No cumplida", sinRegistro.titulo)
    }

    @Test
    fun reprogramadaEsHistorialNoAviso() {
        val inc = ActivityIncumplimientoDto(
            origen = "CIERRE_JORNADA",
            causa = "SIN_ENTREGA",
            causaEtiqueta = "Sin entrega al cierre de la jornada",
            reprogramadaAt = "2026-10-23T15:00:00.000Z",
            reprogramadaPara = "2026-10-26T15:00:00.000Z",
            reprogramadaPor = ActivityPersonRefDto(5, "Luis Pérez"),
            motivoReprogramacion = "El cliente confirmó acceso.",
        )
        val reabierta = ActivityDto(id = 1, estatus = "Pendiente", incumplimiento = inc)
        assertNull(ActivitySuperiorRules.avisoNoCumplida(reabierta))
        val nota = ActivitySuperiorRules.notaReprogramada(reabierta, ZoneId.of("America/Mexico_City"))!!
        assertTrue(nota, nota.startsWith("Reprogramada por Luis Pérez para "))
        assertTrue(nota, nota.contains("09:00"))
        assertTrue(nota, nota.endsWith(" · no se cumplió: Sin entrega al cierre de la jornada"))

        // Mientras siga «No cumplida» no hay nota de historial.
        assertNull(ActivitySuperiorRules.notaReprogramada(reabierta.copy(estatus = "No cumplida")))
        // Sin reprogramar tampoco.
        assertNull(ActivitySuperiorRules.notaReprogramada(reabierta.copy(incumplimiento = inc.copy(reprogramadaAt = null))))
    }
}
