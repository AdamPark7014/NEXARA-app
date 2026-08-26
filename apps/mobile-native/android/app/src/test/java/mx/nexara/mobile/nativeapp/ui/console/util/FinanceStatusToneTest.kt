package mx.nexara.mobile.nativeapp.ui.console.util

import mx.nexara.mobile.nativeapp.ui.enterprise.NxTone
import org.junit.Assert.assertEquals
import org.junit.Test

class FinanceStatusToneTest {

    @Test
    fun financeStatusTone_paid_returnsSuccess() {
        assertEquals(NxTone.Success, financeStatusTone("Pagado"))
        assertEquals(NxTone.Success, financeStatusTone("APPROVED"))
    }

    @Test
    fun financeStatusTone_pending_returnsWarning() {
        assertEquals(NxTone.Warning, financeStatusTone("Pendiente"))
        assertEquals(NxTone.Warning, financeStatusTone("draft"))
    }

    @Test
    fun financeStatusTone_cancelled_returnsDanger() {
        assertEquals(NxTone.Danger, financeStatusTone("Cancelado"))
        assertEquals(NxTone.Danger, financeStatusTone("overdue"))
    }

    @Test
    fun financeStatusTone_unknown_returnsInfo() {
        assertEquals(NxTone.Info, financeStatusTone("En revisión"))
    }

    @Test
    fun financeStatusTone_null_returnsInfo() {
        assertEquals(NxTone.Info, financeStatusTone(null))
    }
}
