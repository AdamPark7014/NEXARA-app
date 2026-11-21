package mx.nexara.mobile.nativeapp.ui.console.herramientas

import mx.nexara.mobile.nativeapp.data.api.FotoEvidenciaDto
import mx.nexara.mobile.nativeapp.data.api.HerramientaPersonaDto
import mx.nexara.mobile.nativeapp.data.api.PrestamoHerramientaDto
import mx.nexara.mobile.nativeapp.ui.console.herramientas.EvidenciaPrestamoRules.Condicion
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** La evidencia de un préstamo: qué se exige al entregar y al recibir, sin Android de por medio. */
class EvidenciaPrestamoRulesTest {

    private fun foto(url: String) = FotoEvidenciaDto(url = url)

    @Test
    fun `sin foto de como sale no se entrega`() {
        assertEquals(
            "Toma al menos una foto de cómo sale la herramienta.",
            EvidenciaPrestamoRules.faltaParaEntregar(pideCodigo = false, codigo = "", fotos = 0),
        )
        assertNull(EvidenciaPrestamoRules.faltaParaEntregar(pideCodigo = false, codigo = "", fotos = 1))
    }

    @Test
    fun `si el prestamo tiene codigo primero se pide el codigo`() {
        assertEquals(
            "Teclea el código que enseña quien la recoge.",
            EvidenciaPrestamoRules.faltaParaEntregar(pideCodigo = true, codigo = " ", fotos = 2),
        )
        assertNull(EvidenciaPrestamoRules.faltaParaEntregar(pideCodigo = true, codigo = "A3F7KD", fotos = 1))
    }

    @Test
    fun `para recibir hay que decir como volvio`() {
        assertEquals("Elige cómo volvió.", EvidenciaPrestamoRules.faltaParaRecibir(null, "", 3))
    }

    @Test
    fun `bien o con desgaste solo piden la foto`() {
        assertEquals(
            "Toma al menos una foto de cómo volvió.",
            EvidenciaPrestamoRules.faltaParaRecibir(Condicion.BIEN, "", 0),
        )
        assertNull(EvidenciaPrestamoRules.faltaParaRecibir(Condicion.BIEN, "", 1))
        assertNull(EvidenciaPrestamoRules.faltaParaRecibir(Condicion.DESGASTE, "", 1))
    }

    @Test
    fun `danada e incompleta piden explicacion y foto`() {
        assertEquals("Describe el daño.", EvidenciaPrestamoRules.faltaParaRecibir(Condicion.DANADA, " ", 1))
        assertEquals("Escribe qué le falta.", EvidenciaPrestamoRules.faltaParaRecibir(Condicion.INCOMPLETA, "", 1))
        assertEquals(
            "Toma al menos una foto de cómo volvió.",
            EvidenciaPrestamoRules.faltaParaRecibir(Condicion.DANADA, "Pantalla rota", 0),
        )
        assertNull(EvidenciaPrestamoRules.faltaParaRecibir(Condicion.DANADA, "Pantalla rota", 1))
    }

    @Test
    fun `de lo extraviado no hay foto pero si explicacion`() {
        assertFalse(Condicion.EXTRAVIADA.pideFoto)
        assertEquals(
            "Escribe qué pasó con la herramienta.",
            EvidenciaPrestamoRules.faltaParaRecibir(Condicion.EXTRAVIADA, "", 0),
        )
        assertNull(EvidenciaPrestamoRules.faltaParaRecibir(Condicion.EXTRAVIADA, "Se quedó en la obra", 0))
    }

    @Test
    fun `la condicion viaja como la espera el servidor`() {
        assertEquals(
            listOf("BIEN", "DESGASTE", "DANADA", "INCOMPLETA", "EXTRAVIADA"),
            Condicion.entries.map { it.api },
        )
        assertEquals(Condicion.INCOMPLETA, Condicion.deApi(" incompleta "))
        assertNull(Condicion.deApi("RARA"))
        assertNull(Condicion.deApi(null))
    }

    @Test
    fun `el aviso dice que le pasa a la herramienta`() {
        assertEquals("Entrada registrada.", EvidenciaPrestamoRules.avisoEntrada(Condicion.DESGASTE))
        assertTrue(EvidenciaPrestamoRules.avisoEntrada(Condicion.DANADA).contains("reparación"))
        assertTrue(EvidenciaPrestamoRules.avisoEntrada(Condicion.EXTRAVIADA).contains("baja"))
    }

    @Test
    fun `un prestamo que salio con una version vieja se marca sin foto`() {
        val enUso = PrestamoHerramientaDto(id = 1, status = "IN_USE")
        assertEquals("Salió sin foto", EvidenciaPrestamoRules.faltaEvidencia(enUso))
        val conFoto = enUso.copy(deliveryPhotos = listOf(foto("/uploads/tools/a")))
        assertNull(EvidenciaPrestamoRules.faltaEvidencia(conFoto))
    }

    @Test
    fun `lo que aun no sale no reclama evidencia`() {
        assertNull(EvidenciaPrestamoRules.faltaEvidencia(PrestamoHerramientaDto(id = 1, status = "APPROVED")))
        assertNull(EvidenciaPrestamoRules.faltaEvidencia(PrestamoHerramientaDto(id = 1, status = "PENDING")))
    }

    @Test
    fun `lo devuelto sin fotos lo dice y lo extraviado no pide foto de entrada`() {
        val devuelto = PrestamoHerramientaDto(
            id = 1,
            status = "RETURNED",
            deliveryPhotos = listOf(foto("/uploads/tools/a")),
        )
        assertEquals("Volvió sin foto", EvidenciaPrestamoRules.faltaEvidencia(devuelto))
        assertEquals(
            "Sin fotos de salida ni de entrada",
            EvidenciaPrestamoRules.faltaEvidencia(PrestamoHerramientaDto(id = 2, status = "RETURNED")),
        )
        val extraviada = devuelto.copy(status = "DAMAGED", returnCondition = "EXTRAVIADA")
        assertNull(EvidenciaPrestamoRules.faltaEvidencia(extraviada))
    }

    @Test
    fun `quien entrego y quien recibio se leen en un renglon`() {
        val prestamo = PrestamoHerramientaDto(
            id = 1,
            status = "RETURNED",
            deliveredBy = HerramientaPersonaDto(id = 2, nombre = "Iván"),
            receivedBy = HerramientaPersonaDto(id = 1, nombre = "Christian"),
            returnCondition = "DESGASTE",
        )
        assertEquals("Entregó Iván · Recibió Christian", EvidenciaPrestamoRules.quienesFirmaron(prestamo))
        assertEquals("Con desgaste", EvidenciaPrestamoRules.etiquetaCondicion(prestamo))
        assertEquals("", EvidenciaPrestamoRules.quienesFirmaron(PrestamoHerramientaDto(id = 3)))
    }

    @Test
    fun `las fotos sin direccion no cuentan`() {
        assertEquals(
            listOf("/uploads/tools/a"),
            EvidenciaPrestamoRules.urls(listOf(foto(" /uploads/tools/a "), FotoEvidenciaDto(url = " "), FotoEvidenciaDto())),
        )
        assertEquals(emptyList<String>(), EvidenciaPrestamoRules.urls(null))
    }
}
