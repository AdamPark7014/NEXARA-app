package mx.nexara.mobile.nativeapp.ui.console.activities

import mx.nexara.mobile.nativeapp.data.api.ActivityAssigneeRefDto
import mx.nexara.mobile.nativeapp.data.api.ActivityDestinoDto
import mx.nexara.mobile.nativeapp.data.api.ActivityDto
import mx.nexara.mobile.nativeapp.data.api.DesgloseTiempoDto
import mx.nexara.mobile.nativeapp.ui.console.activities.ActividadTiempoRules.Estado
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** Tarjeta «Tiempo» y renglón «Tiempo estándar»: las mismas cuentas que la web. */
class ActividadTiempoRulesTest {

    @Test
    fun formatoComoLaWeb() {
        assertEquals("0 min", ActividadTiempoRules.formatoMinutos(0.0))
        assertEquals("45 min", ActividadTiempoRules.formatoMinutos(45.0))
        assertEquals("2 h", ActividadTiempoRules.formatoMinutos(120.0))
        assertEquals("2 h 35 min", ActividadTiempoRules.formatoMinutos(154.6))
        assertNull(ActividadTiempoRules.formatoMinutos(null as Double?))
        assertNull(ActividadTiempoRules.formatoMinutos(-1.0))
    }

    @Test
    fun enTiempoMientrasNoPasaElPlan() {
        val m = ActividadTiempoRules.medidor(minutosPlan = 120.0, minutosReales = 60.0, tiempoMaximoMin = null)
        assertEquals(Estado.EN_TIEMPO, m.estado)
        assertEquals("va en tiempo", m.texto)
        assertEquals(150, m.tope) // plan + 25 %
        assertEquals(0.5f, m.avance!!, 0.0001f)
        assertEquals("1 h", ActividadTiempoRules.realTexto(m))
        assertEquals("de 2 h planeadas", ActividadTiempoRules.contraTexto(m))
        assertEquals("Tope: 2 h 30 min (plan + 25 %)", ActividadTiempoRules.pieTope(m, null))
        // Justo en el plan sigue en tiempo.
        assertEquals(Estado.EN_TIEMPO, ActividadTiempoRules.medidor(120.0, 120.0, null).estado)
    }

    @Test
    fun cercaCuandoPasaElPlanSinLlegarAlTope() {
        val m = ActividadTiempoRules.medidor(minutosPlan = 120.0, minutosReales = 130.0, tiempoMaximoMin = null)
        assertEquals(Estado.CERCA, m.estado)
        assertEquals("le quedan 20 min para el tope", m.texto)
        // El anillo no da más de una vuelta.
        assertEquals(1f, m.avance!!, 0.0001f)
    }

    @Test
    fun excedidaAlPasarElTope() {
        val m = ActividadTiempoRules.medidor(minutosPlan = 120.0, minutosReales = 175.0, tiempoMaximoMin = null)
        assertEquals(Estado.EXCEDIDA, m.estado)
        assertEquals("se pasó 25 min del tope", m.texto)
    }

    @Test
    fun conTiempoMaximoElTopeEsEseYSinPlanMasVeinticinco() {
        val m = ActividadTiempoRules.medidor(minutosPlan = 60.0, minutosReales = 70.0, tiempoMaximoMin = 90.0)
        assertEquals(90, m.tope)
        assertEquals(Estado.CERCA, m.estado)
        assertEquals("le quedan 20 min para el tope", m.texto)
        assertEquals("Tope: 1 h 30 min", ActividadTiempoRules.pieTope(m, 90.0))
        assertEquals(Estado.EXCEDIDA, ActividadTiempoRules.medidor(60.0, 95.0, 90.0).estado)
    }

    @Test
    fun sinPlan() {
        val vacio = ActividadTiempoRules.medidor(null, null, null)
        assertEquals(Estado.SIN_PLAN, vacio.estado)
        assertEquals("aún sin tiempo", vacio.texto)
        assertFalse(ActividadTiempoRules.visible(vacio))
        assertNull(vacio.avance)
        assertNull(ActividadTiempoRules.pieTope(vacio, null))

        val trabajado = ActividadTiempoRules.medidor(0.0, 40.0, null)
        assertEquals(Estado.SIN_PLAN, trabajado.estado)
        assertEquals("sin tiempo planeado", trabajado.texto)
        assertTrue(ActividadTiempoRules.visible(trabajado))
        assertEquals("trabajadas", ActividadTiempoRules.contraTexto(trabajado))
        assertEquals("sin tiempo planeado", ActividadTiempoRules.etiquetaAccesible(trabajado))
    }

    @Test
    fun pieDelEstandar() {
        val m = ActividadTiempoRules.medidor(120.0, 60.0, null)
        assertEquals("Estándar: 4 h · lleva el 25 % del estándar", ActividadTiempoRules.pieEstandar(240.0, m))
        assertEquals("Estándar: 4 h", ActividadTiempoRules.pieEstandar(240.0, ActividadTiempoRules.medidor(120.0, 0.0, null)))
        assertNull(ActividadTiempoRules.pieEstandar(null, m))
        assertNull(ActividadTiempoRules.pieEstandar(0.0, m))
    }

    @Test
    fun usaLaFilaDeQuienMiraYSiNoElResumen() {
        val detalle = ActivityDto(id = 1, estatus = "En Proceso", minutosPlan = 120.0, minutosReales = 30.0, tiempoMaximoMin = 200)
        val mia = ActivityAssigneeRefDto(id = 9, minutosPlan = 60.0, minutosReales = 50.0)
        val conFila = ActividadTiempoRules.medidorDe(detalle, mia)
        assertEquals(60, conFila.plan)
        assertEquals(50, conFila.real)
        assertEquals(200, conFila.tope)
        val jefe = ActividadTiempoRules.medidorDe(detalle, null)
        assertEquals(120, jefe.plan)
        assertEquals(30, jefe.real)
        // Mi fila sin plan propio: cae al de la actividad.
        val sinPlan = ActividadTiempoRules.medidorDe(detalle, ActivityAssigneeRefDto(id = 9, minutosReales = 10.0))
        assertEquals(120, sinPlan.plan)
        assertEquals(10, sinPlan.real)
    }

    @Test
    fun enCursoConCualquieraDelEquipo() {
        val corriendo = ActivityAssigneeRefDto(id = 2, sesionAbiertaDesde = "2026-10-29T15:00:00Z")
        val parado = ActivityAssigneeRefDto(id = 3)
        val retirado = ActivityAssigneeRefDto(id = 4, retiradoAt = "2026-10-29T16:00:00Z", sesionAbiertaDesde = "2026-10-29T15:00:00Z")
        assertTrue(ActividadTiempoRules.enCurso(listOf(parado, corriendo)))
        assertFalse(ActividadTiempoRules.enCurso(listOf(parado, retirado)))
        assertFalse(ActividadTiempoRules.enCurso(null))
    }

    @Test
    fun resumenDelEstandar() {
        val r = ActividadTiempoRules.resumenEstandar(
            tiempoEstandarMin = 240.0,
            desglose = listOf(
                DesgloseTiempoDto("Base de cotización (hasta 10 partidas)", 40.0),
                DesgloseTiempoDto("50 partidas más × 4 min", 200.0),
                DesgloseTiempoDto("Supuesto: una sola visita", 0.0),
                DesgloseTiempoDto("  ", 10.0),
            ),
            destinoDireccion = "Av. Juárez 100, Puebla",
            trasladoModo = "TRANSPORTE",
            motivoCambio = "El cliente pidió dos visitas",
        )!!
        assertEquals("4 h", r.valor)
        assertEquals(
            "Base de cotización (hasta 10 partidas) 40 min · 50 partidas más × 4 min 3 h 20 min · " +
                "Supuesto: una sola visita · Destino: Av. Juárez 100, Puebla (en transporte) · " +
                "Se cambió el tiempo: El cliente pidió dos visitas",
            r.detalle,
        )
    }

    @Test
    fun resumenDelEstandarDesdeLaActividad() {
        val a = ActivityDto(
            id = 1,
            estatus = "Pendiente",
            tiempoEstandarMin = 90.0,
            destino = ActivityDestinoDto(direccion = "Oficina central", lat = 19.0, lng = -98.2),
            trasladoModo = "AUTO",
        )
        val r = ActividadTiempoRules.resumenEstandar(a)!!
        assertEquals("1 h 30 min", r.valor)
        assertEquals("Destino: Oficina central", r.detalle)
        // Sin tiempo estándar guardado no hay renglón; sin partes, sin nota.
        assertNull(ActividadTiempoRules.resumenEstandar(ActivityDto(id = 2, estatus = "Pendiente")))
        assertNull(ActividadTiempoRules.resumenEstandar(ActivityDto(id = 3, estatus = "Pendiente", tiempoEstandarMin = 30.0))!!.detalle)
    }
}
