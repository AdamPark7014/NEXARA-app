package mx.nexara.mobile.nativeapp.ui.console.more

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Test

/**
 * A 390 px la clave iba en el mismo renglón que el código y el almacén junto a la
 * cantidad. El vacío y el aviso del catálogo eran dos frases. Esta prueba cita
 * ese texto viejo: si vuelve, falla.
 */
class AlmacenEscaneoTextoTest {
    @Test
    fun unDatoPorRenglonYElVacioYElAvisoEnUnaFrase() {
        val claveVieja = "Clave ABC-1 · EAN-13 7501234567890"
        val clave = AlmacenEscaneoTexto.claveYCodigo("ABC-1", "7501234567890", "EAN-13")
        assertEquals("Clave ABC-1\nEAN-13 7501234567890", clave)
        assertNotEquals(claveVieja, clave)
        assertFalse(clave.contains(" · "))
        assertEquals("EAN-13 7501234567890", AlmacenEscaneoTexto.claveYCodigo("  ", "7501234567890", "EAN-13"))
        assertEquals("Clave ABC-1", AlmacenEscaneoTexto.claveYCodigo("ABC-1", null, "EAN-13"))

        // El nombre iba junto a «14 (4 apartado)».
        val juntoViejo = "Bodega central 14 (4 apartado)"
        val existencia = AlmacenEscaneoTexto.existencia("Bodega central", 14.0, 4.0)
        assertEquals("Bodega central", existencia.almacen)
        assertEquals("14 (4 apartado)", existencia.cantidad)
        assertNotEquals(juntoViejo, "${existencia.almacen}\n${existencia.cantidad}")
        val sinApartado = AlmacenEscaneoTexto.existencia("Obra", 3.0, 0.0)
        assertEquals("Obra", sinApartado.almacen)
        assertEquals("3", sinApartado.cantidad)
        val sinNombre = AlmacenEscaneoTexto.existencia(null, null, null)
        assertEquals("Almacén", sinNombre.almacen)
        assertEquals("—", sinNombre.cantidad)

        val vacioPrimera = "No hay producto con el código «7501234567890»."
        val vacioSegunda = "Si es un producto nuevo, puedes darlo de alta con este código."
        val vacio = AlmacenEscaneoTexto.vacio("7501234567890")
        assertEquals(
            "No hay producto con el código «7501234567890»: si es un producto nuevo, puedes darlo de alta con este código.",
            vacio,
        )
        assertNotEquals("$vacioPrimera $vacioSegunda", vacio)
        assertFalse(vacio.contains(vacioPrimera))
        assertFalse(vacio.contains(vacioSegunda))
        assertEquals(1, vacio.count { it == '.' })

        val avisoViejo = "Datos sugeridos del catálogo internacional. Revísalos antes de guardar."
        assertEquals(
            "Datos sugeridos del catálogo internacional: revísalos antes de guardar.",
            AlmacenEscaneoTexto.AVISO_CATALOGO,
        )
        assertNotEquals(avisoViejo, AlmacenEscaneoTexto.AVISO_CATALOGO)
        assertEquals(1, AlmacenEscaneoTexto.AVISO_CATALOGO.count { it == '.' })
    }
}
