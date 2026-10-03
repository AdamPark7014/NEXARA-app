package mx.nexara.mobile.nativeapp.ui.console.activities

import mx.nexara.mobile.nativeapp.data.api.EvidenceFlowDto
import mx.nexara.mobile.nativeapp.ui.console.activities.ActivityDockRules.Kind
import mx.nexara.mobile.nativeapp.ui.console.activities.ActivityDockRules.PasoEstado
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class ActivityDockRulesTest {

    private fun dock(
        puedeIniciar: Boolean = false,
        sesion: SesionActividad? = null,
        despachador: Boolean = false,
        estatus: String? = "En Proceso",
        captura: Boolean = true,
        flow: EvidenceFlowDto? = null,
        coreKind: String? = "tarea",
        fotosRequeridas: Int = 4,
    ) = ActivityDockRules.principal(puedeIniciar, sesion, despachador, estatus, captura, flow, coreKind, fotosRequeridas)

    @Test
    fun cerradaNoTieneDock() {
        assertNull(dock(estatus = "Finalizada", puedeIniciar = true))
        assertNull(dock(estatus = "Cancelada"))
    }

    @Test
    fun iniciarVaPrimero() {
        val d = dock(puedeIniciar = true)
        assertEquals(Kind.INICIAR, d?.kind)
        assertEquals("Iniciar actividad", d?.label)
    }

    @Test
    fun enPausaOfreceReanudar() {
        val d = dock(sesion = SesionActividad(enPausa = true, pausaTipo = "SALIDA"))
        assertEquals(Kind.REANUDAR, d?.kind)
        assertEquals("Se detuvo al marcar tu salida.", d?.hint)
        assertFalse(d!!.pausable)
    }

    @Test
    fun quienNoCapturaNoTieneDock() {
        assertNull(dock(captura = false))
    }

    @Test
    fun sinFlujoEsLaFotoDeEntrada() {
        val d = dock()
        assertEquals(Kind.EVIDENCIAS, d?.kind)
        assertEquals("Tomar foto de entrada", d?.label)
        assertEquals("Paso 1 de 4", d?.hint)
        assertEquals("Tomar foto de inicio", dock(coreKind = "comercial")?.label)
    }

    @Test
    fun fotosEnSitioCuentaLasQueFaltan() {
        val flow = EvidenceFlowDto(status = "EVIDENCE_PHOTOS", entryPhotoUrl = "u", evidencePhotos = listOf("a", "b"))
        val d = dock(flow = flow)
        assertEquals("Tomar fotos · 2 de 4", d?.label)
        assertEquals("Faltan 2 fotos para seguir.", d?.hint)
        val listo = dock(flow = flow.copy(evidencePhotos = listOf("a", "b", "c", "d")))
        assertEquals("Enviar fotos · 4 de 4", listo?.label)
    }

    @Test
    fun salidaYEnviadaYCorreccion() {
        val salida = dock(flow = EvidenceFlowDto(status = "EXIT_PHOTO", entryPhotoUrl = "u", evidencePhotos = listOf("a")))
        assertEquals("Tomar foto de salida", salida?.label)
        val enviada = dock(flow = EvidenceFlowDto(status = "COMPLETED", completedAt = "x"))
        assertEquals(Kind.VER, enviada?.kind)
        val correccion = dock(flow = EvidenceFlowDto(status = "EXIT_PHOTO", reviewStatus = "REJECTED", rejectedStep = "EXIT_PHOTO"))
        assertTrue(correccion!!.label.startsWith("Corregir · "))
    }

    @Test
    fun pausarSoloConElRelojCorriendo() {
        assertTrue(dock(sesion = SesionActividad(enCurso = true))!!.pausable)
        assertFalse(dock(sesion = SesionActividad(enCurso = true), despachador = true, captura = true)!!.pausable)
        assertFalse(dock(sesion = null)!!.pausable)
    }

    @Test
    fun pasosHechoActualPendiente() {
        val flow = EvidenceFlowDto(status = "EVIDENCE_PHOTOS", entryPhotoUrl = "u", evidencePhotos = listOf("a"))
        val pasos = ActivityDockRules.pasos(flow, "tarea", 4)
        assertEquals(4, pasos.size)
        assertEquals(PasoEstado.HECHO, pasos[0].estado)
        assertEquals(PasoEstado.ACTUAL, pasos[1].estado)
        assertEquals("1 de 4 fotos", pasos[1].detalle)
        assertEquals(PasoEstado.PENDIENTE, pasos[2].estado)
        assertEquals(1, ActivityDockRules.hechos(pasos))
    }

    @Test
    fun sinFlujoTodoPendienteSalvoElPrimero() {
        val pasos = ActivityDockRules.pasos(null, "servicio", 4)
        assertEquals(5, pasos.size)
        assertEquals(PasoEstado.ACTUAL, pasos[0].estado)
        assertTrue(pasos.drop(1).all { it.estado == PasoEstado.PENDIENTE })
    }

    @Test
    fun enviadaMarcaTodoHecho() {
        val pasos = ActivityDockRules.pasos(EvidenceFlowDto(status = "COMPLETED", completedAt = "x"), "tarea", 4)
        assertTrue(pasos.all { it.estado == PasoEstado.HECHO })
        assertEquals("Enviada a revisión", pasos.last().detalle)
    }
}
