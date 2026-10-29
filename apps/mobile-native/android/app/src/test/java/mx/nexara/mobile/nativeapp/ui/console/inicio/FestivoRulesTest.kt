package mx.nexara.mobile.nativeapp.ui.console.inicio

import java.time.LocalDate
import mx.nexara.mobile.nativeapp.data.api.FestivoComoDto
import mx.nexara.mobile.nativeapp.data.api.FestivoDto
import mx.nexara.mobile.nativeapp.data.api.FestivoHorarioDto
import mx.nexara.mobile.nativeapp.data.api.FestivosMioDto
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class FestivoRulesTest {
    private val r = FestivoRules

    private fun festivo(
        fecha: String,
        nombre: String = "Día de la Revolución",
        origen: String = "LEY",
        trabaja: Boolean = false,
        horario: FestivoHorarioDto? = null,
        pagoDoble: Boolean = false,
    ) = FestivoDto(fecha = fecha, nombre = nombre, origen = origen, como = FestivoComoDto(trabaja, horario, pagoDoble))

    @Test
    fun estadoSaleDelServidorYSoloCuentaSiEsDeHoy() {
        assertEquals(FestivoRules.Estado.NINGUNO, r.estado(null))
        assertEquals(FestivoRules.Estado.NINGUNO, r.estado(FestivosMioDto(hoy = "2026-11-16")))
        val descansa = FestivosMioDto(hoy = "2026-11-16", festivoHoy = festivo("2026-11-16"))
        assertEquals(FestivoRules.Estado.DESCANSA, r.estado(descansa, "2026-11-16"))
        val labora = FestivosMioDto(hoy = "2026-11-16", festivoHoy = festivo("2026-11-16", trabaja = true))
        assertEquals(FestivoRules.Estado.LABORA, r.estado(labora, "2026-11-16"))
        // Lo guardado de ayer no cuenta hoy si no se pudo volver a pedir.
        assertEquals(FestivoRules.Estado.NINGUNO, r.estado(labora, "2026-11-17"))
    }

    @Test
    fun chipNombraElOrigen() {
        assertEquals("Día de la Revolución · festivo de ley", r.chip(festivo("2026-11-16"), FestivoRules.Estado.DESCANSA))
        assertEquals(
            "Aniversario · lo da la empresa",
            r.chip(festivo("2026-11-20", nombre = "Aniversario", origen = "EMPRESA"), FestivoRules.Estado.DESCANSA),
        )
        assertEquals("Día de la Revolución · festivo trabajado", r.chip(festivo("2026-11-16", trabaja = true), FestivoRules.Estado.LABORA))
    }

    @Test
    fun laboraConHorarioYPagoDoble() {
        val f = festivo("2026-11-16", trabaja = true, horario = FestivoHorarioDto("10:00", "14:00"), pagoDoble = true)
        assertEquals("Hoy te toca de 10:00 a 14:00", r.tituloLabora(f))
        assertEquals("Se paga como festivo trabajado (doble).", r.textoLabora(f))
        assertEquals(listOf("Entrada", "Salida", "Jornada"), r.cifras(f).map { it.etiqueta })
        assertEquals("10:00", r.cifras(f)[0].valor)
        assertEquals("4 h", r.cifras(f)[2].valor)
    }

    @Test
    fun laboraSinHorarioEsLaJornadaCompleta() {
        val f = festivo("2026-11-16", trabaja = true)
        assertEquals("Hoy te toca tu jornada completa", r.tituloLabora(f))
        assertNull(r.textoLabora(f))
        assertEquals(emptyList<FestivoRules.Cifra>(), r.cifras(f))
    }

    @Test
    fun siguienteDiaSeSaltaFinDeSemanaYFestivosQueNoLeTocan() {
        // Viernes 25 de diciembre descansa: el siguiente es el lunes 28.
        val navidad = FestivosMioDto(hoy = "2026-12-25", festivoHoy = festivo("2026-12-25"), proximos = listOf(festivo("2026-12-25")))
        assertEquals(LocalDate.parse("2026-12-28"), r.siguienteDiaDeTrabajo(navidad))
        // Lunes 16 descansa y el martes 17 también: vuelve el miércoles.
        val dos = FestivosMioDto(hoy = "2026-11-16", festivoHoy = festivo("2026-11-16"), proximos = listOf(festivo("2026-11-17", nombre = "Puente")))
        assertEquals(LocalDate.parse("2026-11-18"), r.siguienteDiaDeTrabajo(dos))
        // Un festivo que sí le toca no lo salta.
        val toca = FestivosMioDto(hoy = "2026-11-16", proximos = listOf(festivo("2026-11-17", trabaja = true)))
        assertEquals(LocalDate.parse("2026-11-17"), r.siguienteDiaDeTrabajo(toca))
        assertEquals("Vuelves mañana", r.vuelves(LocalDate.parse("2026-11-16"), LocalDate.parse("2026-11-17")))
        assertEquals("Vuelves el lunes", r.vuelves(LocalDate.parse("2026-12-25"), LocalDate.parse("2026-12-28")))
    }

    @Test
    fun proximosSinElDeHoyYConComoLeToca() {
        val f = FestivosMioDto(
            hoy = "2026-11-16",
            proximos = listOf(
                festivo("2026-11-16"),
                festivo("2026-12-25", nombre = "Navidad"),
                festivo("2027-01-01", nombre = "Año Nuevo", trabaja = true, horario = FestivoHorarioDto("10:00", "14:00")),
                festivo("2027-02-01", nombre = "Constitución", trabaja = true),
            ),
        )
        val p = r.proximos(f)
        assertEquals(listOf("Navidad", "Año Nuevo", "Constitución"), p.map { it.nombre })
        assertEquals("Vie 25 dic", p[0].dia)
        assertEquals(listOf("No se labora", "De 10:00 a 14:00", "Se labora"), p.map { it.como })
    }
}
