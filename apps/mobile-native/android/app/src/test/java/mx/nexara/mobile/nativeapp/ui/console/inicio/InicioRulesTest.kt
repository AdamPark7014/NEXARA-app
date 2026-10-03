package mx.nexara.mobile.nativeapp.ui.console.inicio

import mx.nexara.mobile.nativeapp.data.api.MyActivityItemDto
import mx.nexara.mobile.nativeapp.data.api.MyActivityRefDto
import mx.nexara.mobile.nativeapp.ui.console.inicio.InicioRules.AccionKind
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.LocalDate

class InicioRulesTest {

    private fun act(
        id: Long,
        estatus: String? = "Pendiente",
        evidenceStatus: String? = null,
        inicioRealAt: String? = null,
        enCurso: Boolean? = null,
        enPausa: Boolean? = null,
        pausaTipo: String? = null,
        pausadaPor: MyActivityRefDto? = null,
        aceptacion: String? = "PENDIENTE",
        semaforo: String? = null,
        titulo: String? = "Actividad $id",
        coreKind: String? = "tarea",
        cliente: String? = null,
        proyecto: String? = null,
        minutosPlan: Double? = null,
    ) = MyActivityItemDto(
        id = id,
        titulo = titulo,
        estatus = estatus,
        evidenceStatus = evidenceStatus,
        inicioRealAt = inicioRealAt,
        enCurso = enCurso,
        enPausa = enPausa,
        pausaTipo = pausaTipo,
        pausadaPor = pausadaPor,
        aceptacion = aceptacion,
        semaforo = semaforo,
        coreKind = coreKind,
        cliente = cliente,
        proyecto = proyecto,
        minutosPlan = minutosPlan,
    )

    @Test
    fun laDeAhoraEsLaQueTieneElRelojCorriendo() {
        val open = listOf(act(1), act(2, enCurso = true, estatus = "En Proceso"), act(3))
        assertEquals(2L, InicioRules.actividadActual(open)?.id)
        assertEquals(listOf(1L, 3L), InicioRules.siguientes(open, open[1]).map { it.id })
    }

    @Test
    fun enPausaGanaSobreLaEmpezadaYSobreLaPrimera() {
        val open = listOf(act(1, inicioRealAt = "2026-10-02T09:00:00Z"), act(2, enPausa = true, estatus = "En Proceso"))
        assertEquals(2L, InicioRules.actividadActual(open)?.id)
    }

    @Test
    fun sinNadaEmpezadoEsLaPrimeraDeLaCola() {
        val open = listOf(act(7), act(8))
        assertEquals(7L, InicioRules.actividadActual(open)?.id)
        assertNull(InicioRules.actividadActual(emptyList()))
    }

    @Test
    fun siguientesSeTopanEnTres() {
        val open = (1L..6L).map { act(it) }
        val actual = InicioRules.actividadActual(open)
        val siguientes = InicioRules.siguientes(open, actual)
        assertEquals(listOf(2L, 3L, 4L), siguientes.map { it.id })
    }

    @Test
    fun accionSegunElEstado() {
        assertEquals(AccionKind.INICIAR, InicioRules.accion(act(1)).kind)
        assertTrue(InicioRules.accion(act(1)).marcaInicio)
        assertEquals(AccionKind.REANUDAR, InicioRules.accion(act(2, enPausa = true, estatus = "En Proceso")).kind)
        assertEquals("Reanudar", InicioRules.accion(act(2, enPausa = true, estatus = "En Proceso")).label)
        assertEquals(
            AccionKind.CONTINUAR,
            InicioRules.accion(act(3, estatus = "En Proceso", evidenceStatus = "EVIDENCE_PHOTOS", inicioRealAt = "x")).kind,
        )
        assertEquals(AccionKind.CORREGIR, InicioRules.accion(act(4, estatus = "Rechazada")).kind)
        assertEquals(AccionKind.VER, InicioRules.accion(act(5, estatus = "Por Validar")).kind)
    }

    @Test
    fun elRelojMandaSobreElEstatusEnElChip() {
        assertEquals("En pausa", InicioRules.estado(act(1, enPausa = true, estatus = "En Proceso")).label)
        assertEquals(InicioRules.Tono.WARNING, InicioRules.estado(act(1, enPausa = true, estatus = "En Proceso")).tono)
        assertEquals("En curso", InicioRules.estado(act(1, enCurso = true)).label)
        assertEquals("Por empezar", InicioRules.estado(act(1)).label)
        assertEquals(InicioRules.Tono.DANGER, InicioRules.estado(act(1, estatus = "Rechazada")).tono)
    }

    @Test
    fun avanceCuentaPasosDelTipo() {
        assertNull(InicioRules.avance(act(1)))
        assertEquals(1 to 4, InicioRules.avance(act(1, evidenceStatus = "EVIDENCE_PHOTOS")))
        assertEquals(5 to 5, InicioRules.avance(act(1, coreKind = "servicio", evidenceStatus = "COMPLETED")))
    }

    @Test
    fun avisoPorOrdenDeUrgencia() {
        val devuelta = act(1, estatus = "Rechazada", titulo = "Cámaras")
        val pausadaPorJefe = act(2, enPausa = true, estatus = "En Proceso", pausaTipo = "PAUSA", pausadaPor = MyActivityRefDto(99L, "Luis Pérez"))
        val atrasada = act(3, semaforo = "rojo")
        assertEquals(1L, InicioRules.aviso(listOf(atrasada, pausadaPorJefe, devuelta), miId = 5L)?.activityId)
        assertEquals(2L, InicioRules.aviso(listOf(atrasada, pausadaPorJefe), miId = 5L)?.activityId)
        assertEquals(3L, InicioRules.aviso(listOf(atrasada), miId = 5L)?.activityId)
        // Pausada por mí mismo no es aviso.
        assertNull(InicioRules.aviso(listOf(act(4, enPausa = true, estatus = "En Proceso", pausaTipo = "PAUSA", pausadaPor = MyActivityRefDto(5L, "Yo"))), miId = 5L))
        assertNull(InicioRules.aviso(emptyList(), miId = 5L))
    }

    @Test
    fun jornadaYCifras() {
        assertEquals(InicioRules.Jornada.EN_JORNADA, InicioRules.jornada(abierta = true, hayEntrada = true, haySalida = false))
        assertEquals(InicioRules.Jornada.COMPLETADA, InicioRules.jornada(abierta = false, hayEntrada = true, haySalida = true))
        assertEquals(InicioRules.Jornada.SIN_ENTRADA, InicioRules.jornada(abierta = false, hayEntrada = false, haySalida = false))
        assertEquals("6:41", InicioRules.horasMinutos((6 * 60 + 41) * 60_000L))
        assertEquals("0:00", InicioRules.horasMinutos(-5))
    }

    @Test
    fun textosDeCabecera() {
        assertEquals("Hola, José", InicioRules.saludo("José Antonio Ramírez"))
        assertEquals("Hola", InicioRules.saludo("  "))
        assertEquals("Viernes 2 de octubre", InicioRules.fechaLarga(LocalDate.of(2026, 10, 2)))
    }

    @Test
    fun detalleDeSiguienteUsaLugarYPlan() {
        assertEquals("Farmacia San Rafael · 2 h", InicioRules.detalleSiguiente(act(1, cliente = "Farmacia San Rafael", minutosPlan = 120.0)))
        assertEquals("Tarea", InicioRules.detalleSiguiente(act(1)))
        assertEquals("Obra Norte", InicioRules.lugar(act(1, proyecto = "Obra Norte")))
    }
}
