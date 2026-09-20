package mx.nexara.mobile.nativeapp.ui.console.activities

import mx.nexara.mobile.nativeapp.data.api.HerramientaCheckDto
import mx.nexara.mobile.nativeapp.data.api.HerramientaRequisitoDto
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * El checklist de herramientas decide lo mismo que el API: mientras quede un renglón
 * sin palomear, `iniciar` se niega. Espejo de
 * apps/api/src/activities/tools/herramientas-checklist.spec.ts.
 */
class HerramientasChecklistRulesTest {

    private fun requisito(
        id: Long,
        descripcion: String,
        ok: Boolean? = null,
    ) = HerramientaRequisitoDto(
        id = id,
        descripcion = descripcion,
        cantidad = 1.0,
        check = ok?.let { HerramientaCheckDto(ok = it, at = "2026-09-19T10:00:00.000Z") },
    )

    // ── Estado ──────────────────────────────────────────────────────────────

    @Test
    fun anOtWithoutRequisitosIsComplete() {
        assertTrue(HerramientasChecklistRules.completo(emptyList()))
        assertTrue(HerramientasChecklistRules.completo(null))
        assertEquals(emptyList<String>(), HerramientasChecklistRules.pendientes(emptyList()))
        assertEquals(0, HerramientasChecklistRules.listos(emptyList()))
    }

    @Test
    fun aRequisitoWithoutCheckIsPending() {
        val items = listOf(requisito(1, "Escalera"))
        assertEquals(listOf("Escalera"), HerramientasChecklistRules.pendientes(items))
        assertEquals(0, HerramientasChecklistRules.listos(items))
        assertFalse(HerramientasChecklistRules.completo(items))
    }

    @Test
    fun markedAsMissingStillCountsAsPending() {
        val items = listOf(
            requisito(1, "Escalera", ok = true),
            requisito(2, "Taladro", ok = false),
        )
        assertEquals(listOf("Taladro"), HerramientasChecklistRules.pendientes(items))
        assertEquals(1, HerramientasChecklistRules.listos(items))
        assertFalse(HerramientasChecklistRules.completo(items))
    }

    @Test
    fun everythingCheckedIsComplete() {
        val items = listOf(
            requisito(1, "Escalera", ok = true),
            requisito(2, "Taladro", ok = true),
        )
        assertTrue(HerramientasChecklistRules.completo(items))
        assertEquals(2, HerramientasChecklistRules.listos(items))
        assertEquals("2 de 2 listas", HerramientasChecklistRules.progresoTexto(items))
    }

    @Test
    fun progressCountsOnlyTheOnesBrought() {
        val items = listOf(
            requisito(1, "Escalera", ok = true),
            requisito(2, "Taladro", ok = false),
            requisito(3, "Multímetro"),
        )
        assertEquals("1 de 3 listas", HerramientasChecklistRules.progresoTexto(items))
    }

    // ── Mensaje (mismo texto que el 400 del API) ────────────────────────────

    @Test
    fun emptyMessageWhenNothingIsPending() {
        assertEquals("", HerramientasChecklistRules.mensajePendiente(emptyList()))
    }

    @Test
    fun singularMessage() {
        assertEquals(
            "Falta palomear el checklist de herramientas antes de iniciar: Escalera. " +
                "Si algo no lo traes o está dañado, márcalo y avisa a tu supervisor.",
            HerramientasChecklistRules.mensajePendiente(listOf("Escalera")),
        )
    }

    @Test
    fun pluralMessage() {
        assertEquals(
            "Faltan palomear el checklist de herramientas antes de iniciar: Escalera, Taladro. " +
                "Si algo no lo traes o está dañado, márcalo y avisa a tu supervisor.",
            HerramientasChecklistRules.mensajePendiente(listOf("Escalera", "Taladro")),
        )
    }

    @Test
    fun longListIsTruncatedWithHowManyAreLeft() {
        val pendientes = listOf("A", "B", "C", "D", "E", "F")
        assertEquals(
            "Faltan palomear el checklist de herramientas antes de iniciar: A, B, C, D y 2 más. " +
                "Si algo no lo traes o está dañado, márcalo y avisa a tu supervisor.",
            HerramientasChecklistRules.mensajePendiente(pendientes),
        )
    }

    @Test
    fun exactlyFourNamesAreNotTruncated() {
        val mensaje = HerramientasChecklistRules.mensajePendiente(listOf("A", "B", "C", "D"))
        assertFalse(mensaje.contains("más"))
        assertTrue(mensaje.contains("A, B, C, D."))
    }

    @Test
    fun theMessageMatchesWhatTheChecklistSays() {
        val items = listOf(
            requisito(1, "Escalera", ok = true),
            requisito(2, "Taladro", ok = false),
            requisito(3, "Multímetro"),
        )
        val mensaje = HerramientasChecklistRules.mensajePendiente(
            HerramientasChecklistRules.pendientes(items),
        )
        assertTrue(mensaje.startsWith("Faltan palomear el checklist"))
        assertTrue(mensaje.contains("Taladro, Multímetro"))
    }
}
