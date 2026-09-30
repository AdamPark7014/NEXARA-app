package mx.nexara.mobile.nativeapp.ui.console.activities

import org.junit.Assert.assertEquals
import org.junit.Test

class DurationPartsTest {
    @Test
    fun fromAndToMinutesRoundTrip() {
        assertEquals(DurationParts.Parts(1, 30), DurationParts.fromMinutes(90))
        assertEquals(90, DurationParts.toMinutes(1, 30))
        assertEquals(DurationParts.Parts(0, 0), DurationParts.fromMinutes(null))
    }

    @Test
    fun labelIsReadable() {
        assertEquals("Sin tiempo", DurationParts.label(0, 0))
        assertEquals("20 min", DurationParts.label(0, 20))
        assertEquals("1 h", DurationParts.label(1, 0))
        assertEquals("2 h 15 min", DurationParts.label(2, 15))
    }
}
