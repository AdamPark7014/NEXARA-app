package mx.nexara.mobile.nativeapp.ui.console.activities

import mx.nexara.mobile.nativeapp.data.api.CreateActivityRequest
import mx.nexara.mobile.nativeapp.data.api.OrigenEstandarDto
import mx.nexara.mobile.nativeapp.data.api.ReglaEstandarDto
import mx.nexara.mobile.nativeapp.data.api.TablaEstandarDto
import mx.nexara.mobile.nativeapp.data.api.UnidadEstandarDto
import mx.nexara.mobile.nativeapp.ui.console.activities.TiempoEstandar.Concepto
import mx.nexara.mobile.nativeapp.ui.console.activities.TiempoEstandar.Faltante
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Los mismos casos que apps/web/lib/tiempo-estandar.spec.ts (la misma cuenta que la API, §8) y la
 * regla del motivo al asignar a otro: nunca un estándar distinto del estimado sin motivo.
 */
class TiempoEstandarTest {
    private fun u(clave: String, singular: String, plural: String, porUnidadMin: Double, incluidas: Double? = null) =
        UnidadEstandarDto(clave, singular, plural, "¿Cuántos $plural?", porUnidadMin, incluidas)

    /** Copia de las reglas de la API que se prueban (apps/api/src/ai/estandar/tabla-estandar.ts), como llegan. */
    private val dto = TablaEstandarDto(
        topeMin = 720.0,
        origen = OrigenEstandarDto("Oficina NEXARA"),
        reglas = listOf(
            ReglaEstandarDto("comercial", "Cotización", 40.0, listOf(u("partidas", "partida", "partidas", 5.0, 10.0))),
            ReglaEstandarDto("tarea:Instalación", "Instalación", 30.0, listOf(u("dispositivos", "dispositivo", "dispositivos", 45.0))),
            ReglaEstandarDto(
                "tarea:Cableado y canalización", "Cableado y canalización", 0.0,
                listOf(u("nodos", "nodo", "nodos", 45.0), u("metros", "metro de tubería", "metros de tubería", 4.0)),
            ),
            ReglaEstandarDto(
                "tarea:Preparación de equipo", "Preparación de equipo", 0.0, emptyList(),
                porComplejidad = mapOf("BASICA" to 15.0, "ESTANDAR" to 15.0, "COMPLEJA" to 45.0, "CRITICA" to 45.0),
            ),
            ReglaEstandarDto("tarea:Recolección", "Recolección", 0.0, emptyList(), destino = true, enLugarMin = 15.0),
            ReglaEstandarDto("tarea:Junta", "Junta", 0.0, emptyList(), agenda = true),
            ReglaEstandarDto(
                "servicio:CORRECTIVO", "Servicio correctivo", 0.0, emptyList(),
                porComplejidad = mapOf("BASICA" to 60.0, "ESTANDAR" to 120.0, "COMPLEJA" to 210.0, "CRITICA" to 300.0),
                destino = true,
            ),
            ReglaEstandarDto(
                "obra", "Obra", 30.0,
                listOf(
                    u("dispositivos", "dispositivo", "dispositivos", 45.0),
                    u("nodos", "nodo", "nodos", 45.0),
                    u("metros", "metro de tubería", "metros de tubería", 4.0),
                    UnidadEstandarDto("jornadas", "jornada en sitio", "jornadas en sitio", "¿Cuántas jornadas en sitio?", 480.0, sinBase = true),
                ),
            ),
        ),
    )
    private val tabla = requireNotNull(TiempoEstandar.desde(dto))
    private fun regla(clave: String) = tabla.reglas.first { it.clave == clave }

    @Test
    fun cotizacionHasta10PartidasEn40MinY5PorCadaUnaDeMas() {
        assertEquals(40, TiempoEstandar.calcular(regla("comercial"), cantidad = 5).totalMin)
        assertEquals(
            listOf(Concepto("Base de cotización (hasta 10 partidas)", 40)),
            TiempoEstandar.calcular(regla("comercial"), cantidad = 10).desglose,
        )
        assertEquals(45, TiempoEstandar.calcular(regla("comercial"), cantidad = 11).totalMin)
        val r = TiempoEstandar.calcular(regla("comercial"), cantidad = 50)
        assertEquals(240, r.totalMin)
        assertEquals(
            listOf(Concepto("Base de cotización (hasta 10 partidas)", 40), Concepto("40 partidas más × 5 min", 200)),
            r.desglose,
        )
    }

    @Test
    fun instalacionPorDispositivoConTopeDe12h() {
        assertEquals(390, TiempoEstandar.calcular(regla("tarea:Instalación"), cantidad = 8).totalMin)
        val topado = TiempoEstandar.calcular(regla("tarea:Instalación"), cantidad = 20)
        assertEquals(720, topado.totalMin)
        assertTrue(topado.topado)
    }

    @Test
    fun jornadasEnSitioNoSumanLaBaseDelTipo() {
        // a8085bb3: 1 jornada = 480 (sin los 30 de base de Obra); 2 = 960, topadas a 720.
        val una = TiempoEstandar.calcular(regla("obra"), cantidad = 1, unidad = "jornadas")
        assertEquals(480, una.totalMin)
        assertTrue(una.desglose.none { it.concepto.startsWith("Base") })
        val dos = TiempoEstandar.calcular(regla("obra"), cantidad = 2, unidad = "jornadas")
        assertEquals(720, dos.totalMin)
        assertTrue(dos.topado)
        // La unidad por omisión sigue siendo la primera (dispositivos), con su base.
        assertEquals(30 + 45, TiempoEstandar.calcular(regla("obra"), cantidad = 1).totalMin)
    }

    @Test
    fun sinCantidadNoHayTotalYDiceQueFalta() {
        val r = TiempoEstandar.calcular(regla("tarea:Instalación"))
        assertNull(r.totalMin)
        assertEquals(listOf(Faltante.CANTIDAD), r.faltan)
        assertEquals("Para calcularlo falta la cantidad de dispositivos.", TiempoEstandar.textoFaltan(r.faltan, regla("tarea:Instalación")))
    }

    @Test
    fun cableadoPorMetrosYObraConLasMismasTarifas() {
        assertEquals(480, TiempoEstandar.calcular(regla("tarea:Cableado y canalización"), cantidad = 120, unidad = "metros").totalMin)
        assertEquals(270, TiempoEstandar.calcular(regla("obra"), cantidad = 60, unidad = "metros").totalMin)
        assertEquals(210, TiempoEstandar.calcular(regla("obra"), cantidad = 4).totalMin)
        // Una unidad que no es de la regla cuenta como la primera.
        assertEquals(210, TiempoEstandar.calcular(regla("obra"), cantidad = 4, unidad = "litros").totalMin)
    }

    @Test
    fun porComplejidadYElServicioPideElDestino() {
        assertEquals(45, TiempoEstandar.calcular(regla("tarea:Preparación de equipo"), complejidad = "COMPLEJA").totalMin)
        val r = TiempoEstandar.calcular(regla("servicio:CORRECTIVO"))
        assertEquals(listOf(Faltante.COMPLEJIDAD, Faltante.DESTINO), r.faltan)
        assertEquals("Para calcularlo falta la complejidad y el destino.", TiempoEstandar.textoFaltan(r.faltan, regla("servicio:CORRECTIVO")))
        assertEquals(
            "Sale de la complejidad: Básica 1 h · Estándar 2 h · Compleja 3 h 30 min · Crítica 5 h.",
            TiempoEstandar.textoPorComplejidad(regla("servicio:CORRECTIVO")),
        )
    }

    @Test
    fun salidasIdaVueltaYEnElLugarRedondeadoA5() {
        val r = TiempoEstandar.calcular(regla("tarea:Recolección"), traslado = TiempoEstandar.Traslado(18, 21))
        assertEquals(55, r.totalMin)
        assertEquals(listOf("Ida", "Vuelta", "En el lugar"), r.desglose.map { it.concepto })
        // En el teléfono no hay ruta: sin destino no hay total (la API lo completa al guardar).
        assertNull(TiempoEstandar.calcular(regla("tarea:Recolección")).totalMin)
    }

    @Test
    fun juntasVanPorAgendaSinEstandar() {
        val r = TiempoEstandar.calcular(regla("tarea:Junta"))
        assertNull(r.totalMin)
        assertTrue(r.faltan.isEmpty())
    }

    @Test
    fun queReglaLeTocaALoQueSeAsigna() {
        assertEquals("tarea:Instalación", TiempoEstandar.clave("tarea", "OTRO", "Instalación"))
        assertNull(TiempoEstandar.clave("tarea", "OTRO", null))
        assertEquals("servicio:CORRECTIVO", TiempoEstandar.clave("servicio", "correctivo", "correctivo"))
        assertEquals("servicio:PREVENTIVO", TiempoEstandar.clave("servicio", null, null))
        assertEquals("comercial", TiempoEstandar.clave("Comercial", "PREVENTIVO", null))
        assertNull(TiempoEstandar.clave("", null, null))
        assertEquals("tarea:Instalación", TiempoEstandar.reglaPara(tabla, "tarea:instalacion")?.clave)
        assertEquals("Obra", TiempoEstandar.reglaPara(tabla, "obra")?.nombre)
        assertNull(TiempoEstandar.reglaPara(tabla, "proyecto"))
        assertNull(TiempoEstandar.reglaPara(null, "obra"))
    }

    @Test
    fun laTablaQueLlegaSeLeeCompleta() {
        assertEquals(720, tabla.topeMin)
        assertEquals("Oficina NEXARA", tabla.origen)
        assertEquals(10, regla("comercial").unidades[0].incluidas)
        assertTrue(regla("tarea:Junta").agenda)
        assertNull(TiempoEstandar.desde(TablaEstandarDto()))
    }

    @Test
    fun cambiarElTiempoPideUnMotivoDeVerdad() {
        assertFalse(TiempoEstandar.motivoValido("ok"))
        assertFalse(TiempoEstandar.motivoValido("   hola   "))
        assertFalse(TiempoEstandar.motivoValido(null))
        assertTrue(TiempoEstandar.motivoValido("Hay que abrir muro"))
    }

    private val body = CreateActivityRequest(
        titulo = "Instalar 8 cámaras",
        tiempoEstimadoMin = 60,
        creadoPorId = 2L,
        responsableId = 7L,
        coreKind = "tarea",
    )

    private fun envioInstalacion(cantidad: Int, cambiando: Boolean = false, motivo: String = ""): TiempoEstandar.Envio? {
        val r = regla("tarea:Instalación")
        val unidad = TiempoEstandar.unidad(r, null)
        return TiempoEstandar.envio(r, TiempoEstandar.calcular(r, cantidad = cantidad, unidad = unidad?.clave), cantidad, unidad, cambiando, motivo)
    }

    @Test
    fun sinMotivoElEstimadoEsElEstandar() {
        val e = requireNotNull(envioInstalacion(8))
        assertEquals(390, e.tiempoEstandarMin)
        assertEquals(390, TiempoEstandar.minutosFijos(e))
        assertNull(e.motivo)
        // El formulario traía otro tiempo: sale el estándar (la API respondería 400).
        assertEquals(390, TiempoEstandar.ajustar(body, e).tiempoEstimadoMin)
        // Abrió «Cambiar el tiempo» pero el motivo no alcanza: sigue mandando el estándar.
        val corto = requireNotNull(envioInstalacion(8, cambiando = true, motivo = "ok"))
        assertNull(corto.motivo)
        assertEquals(390, TiempoEstandar.ajustar(body, corto).tiempoEstimadoMin)
    }

    @Test
    fun conMotivoElTiempoLoPoneQuienAsigna() {
        val e = requireNotNull(envioInstalacion(8, cambiando = true, motivo = "  Hay que abrir muro  "))
        assertEquals("Hay que abrir muro", e.motivo)
        assertNull(TiempoEstandar.minutosFijos(e))
        assertEquals(60, TiempoEstandar.ajustar(body, e).tiempoEstimadoMin)
        assertEquals("Hay que abrir muro", e.campos()["estandarCambiadoMotivo"])
    }

    @Test
    fun soloSeMandaLoQueSeCalculo() {
        // Sin regla o en agenda: nada.
        assertNull(TiempoEstandar.envio(null, null, 3, null, false, ""))
        val junta = regla("tarea:Junta")
        assertNull(TiempoEstandar.envio(junta, TiempoEstandar.calcular(junta), 0, null, false, ""))
        // Sin cantidad: nada que mandar.
        assertNull(envioInstalacion(0))
        // Va a otro lugar y no hay ruta: sin total; sin cantidad que contar tampoco se manda nada.
        val recoleccion = regla("tarea:Recolección")
        assertNull(TiempoEstandar.envio(recoleccion, TiempoEstandar.calcular(recoleccion), 0, null, false, ""))
        // Con cantidad (servicio preventivo con equipos) la cantidad sí viaja y el estándar lo completa la API.
        val sinRuta = TiempoEstandar.Envio(unidades = TiempoEstandar.Unidades("equipos", 3))
        assertEquals(mapOf("unidades" to mapOf("clave" to "equipos", "cantidad" to 3)), sinRuta.campos())
        assertNull(TiempoEstandar.minutosFijos(sinRuta))
        assertEquals(60, TiempoEstandar.ajustar(body, sinRuta).tiempoEstimadoMin)
        assertEquals(60, TiempoEstandar.ajustar(body, null).tiempoEstimadoMin)
    }

    @Test
    fun elCuerpoLlevaElAltaYLosCamposDeLaApi() {
        val e = requireNotNull(envioInstalacion(8))
        val c = TiempoEstandar.cuerpo(body, e)
        assertEquals("Instalar 8 cámaras", c["titulo"])
        assertEquals("tarea", c["coreKind"])
        assertEquals(390, (c["tiempoEstimadoMin"] as Number).toInt())
        assertEquals(2, (c["creadoPorId"] as Number).toInt())
        assertEquals(390, c["tiempoEstandarMin"])
        assertEquals(mapOf("clave" to "dispositivos", "cantidad" to 8), c["unidades"])
        assertEquals(
            listOf(
                mapOf("concepto" to "Base de instalación", "minutos" to 30),
                mapOf("concepto" to "8 dispositivos × 45 min", "minutos" to 360),
            ),
            c["estandarDesglose"],
        )
        assertFalse(c.containsKey("estandarCambiadoMotivo"))
        assertFalse(c.containsKey("destino"))
        assertFalse(c.containsKey("trasladoMin"))
        assertFalse(c.values.any { it == null })
    }
}
