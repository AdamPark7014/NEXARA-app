package mx.nexara.mobile.nativeapp.ui.console.activities

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class EvidenciaLibreColaTest {
    @Test
    fun simularAplicaAgregarYQuitarEnOrden() {
        val servidor = listOf(EvidenciaLibreCola.Foto("/a.jpg", null))
        val ops = listOf(
            EvidenciaLibreCola.Op.Agregar("c1"),
            EvidenciaLibreCola.Op.Quitar("c2", 0),
        )
        val estado = EvidenciaLibreCola.simular(servidor, ops) { id ->
            if (id == "c1") EvidenciaLibreCola.Foto("data:img", null) else null
        }
        assertEquals(1, estado.fotos.size)
        assertEquals("data:img", estado.fotos[0].url)
        assertTrue(estado.fotos[0].enCola)
    }

    @Test
    fun comoQuitarDistingueColaYServidor() {
        val estado = EvidenciaLibreCola.Estado(
            fotos = listOf(
                EvidenciaLibreCola.Foto("/a.jpg", null),
                EvidenciaLibreCola.Foto("data:b", null, colaId = "c1"),
            ),
            envioEnCola = false,
            pendientes = listOf(EvidenciaLibreCola.Op.Agregar("c1")),
        )
        assertEquals(
            EvidenciaLibreCola.Quitar.DeLaCola("c1"),
            EvidenciaLibreCola.comoQuitar(estado, 1, enLinea = true),
        )
        assertEquals(
            EvidenciaLibreCola.Quitar.Esperar,
            EvidenciaLibreCola.comoQuitar(estado, 0, enLinea = true),
        )
        assertEquals(
            EvidenciaLibreCola.Quitar.EnServidor(0),
            EvidenciaLibreCola.comoQuitar(estado, 0, enLinea = false),
        )
    }
}
