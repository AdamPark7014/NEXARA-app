package mx.nexara.mobile.nativeapp.ui.console.activities

import org.junit.Assert.assertEquals
import org.junit.Test
import java.time.Instant
import java.time.LocalDate

/**
 * El DatePicker de Material entrega y espera medianoche UTC. Leerlo con la zona
 * del teléfono restaba un día en México (UTC-6): al elegir «hoy» se guardaba el
 * día anterior. El detalle de actividad tiene que convertir igual que el alta
 * Core ([CoreActivityKinds]).
 */
class ActivityDatePickerTest {

    @Test
    fun `el dia elegido sobrevive al viaje de ida y vuelta por el picker`() {
        val dia = LocalDate.of(2026, 9, 16)
        assertEquals(dia, millisToLocalDate(dia.toPickerMillis()))
    }

    @Test
    fun `medianoche UTC se lee como ese mismo dia, no como el anterior`() {
        val millis = Instant.parse("2026-09-16T00:00:00Z").toEpochMilli()
        assertEquals(LocalDate.of(2026, 9, 16), millisToLocalDate(millis))
    }

    @Test
    fun `convierte igual que el alta Core`() {
        val fecha = "2026-01-01"
        val millis = CoreActivityKinds.dateToPickerMillis(fecha)!!
        assertEquals(fecha, millisToLocalDate(millis).toString())
        assertEquals(millis, LocalDate.parse(fecha).toPickerMillis())
        assertEquals(fecha, CoreActivityKinds.pickerMillisToDate(LocalDate.parse(fecha).toPickerMillis()))
    }
}
