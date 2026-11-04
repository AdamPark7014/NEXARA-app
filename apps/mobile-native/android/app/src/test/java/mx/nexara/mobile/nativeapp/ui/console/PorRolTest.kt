package mx.nexara.mobile.nativeapp.ui.console

import mx.nexara.mobile.nativeapp.data.SessionUser
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Quién es quién: Adam (04-11-2026) quiere que al CEO no le salga para escanear, que Iván dé de alta
 * y que la gente solo pida. Si esto se equivoca, cada pantalla enseña lo de otra persona.
 */
class PorRolTest {

    private fun persona(
        email: String = "alguien@nexara.com.mx",
        roleKey: String? = "ing_campo",
        role: String = "",
        permisos: List<String> = emptyList(),
        isSuperAdmin: Boolean = false,
    ) = SessionUser(
        id = 1L,
        nombre = "Prueba",
        email = email,
        role = role,
        department = "",
        token = "t",
        permissions = permisos,
        isSuperAdmin = isSuperAdmin,
        roleKey = roleKey,
    )

    private val ivan = persona(
        email = "administracion.ventas@nexara.com.mx",
        permisos = listOf("tools.manage", "stock.manage", "vehicles.inventory"),
    )
    private val ceo = persona(roleKey = "ceo", permisos = listOf("tools.manage", "stock.manage", "vehicles.inventory"))
    private val personal = persona(permisos = listOf("tools.view", "tools.request"))

    @Test
    fun `direccion es el rol CEO, Christian, Claudia y el super admin`() {
        assertTrue(PorRol.esDireccion(ceo))
        assertTrue(PorRol.esDireccion(persona(email = "gerencia@nexara.com.mx", roleKey = null)))
        assertTrue(PorRol.esDireccion(persona(email = "claudia.bernal@nexara.com.mx", roleKey = null)))
        assertTrue(PorRol.esDireccion(persona(roleKey = null, isSuperAdmin = true)))
        // Una sesión vieja sin clave de rol, pero con el nombre visible.
        assertTrue(PorRol.esDireccion(persona(roleKey = null, role = "CEO")))
        assertFalse(PorRol.esDireccion(ivan))
        assertFalse(PorRol.esDireccion(personal))
        assertFalse(PorRol.esDireccion(null))
    }

    @Test
    fun `ivan administra por sus permisos, y direccion nunca aunque los traiga`() {
        assertTrue(PorRol.administraHerramientas(ivan))
        assertTrue(PorRol.operaAlmacen(ivan))
        assertTrue(PorRol.daDeAltaUnidades(ivan))

        assertFalse(PorRol.administraHerramientas(ceo))
        assertFalse(PorRol.operaAlmacen(ceo))
        assertFalse(PorRol.daDeAltaUnidades(ceo))

        assertFalse(PorRol.administraHerramientas(personal))
        assertFalse(PorRol.operaAlmacen(personal))
        assertFalse(PorRol.daDeAltaUnidades(personal))
        assertFalse(PorRol.administraHerramientas(null))
    }

    @Test
    fun `cada permiso cuenta por si solo`() {
        val soloHerramientas = persona(permisos = listOf(" TOOLS.MANAGE "))
        assertTrue(PorRol.administraHerramientas(soloHerramientas))
        assertFalse(PorRol.operaAlmacen(soloHerramientas))
        assertFalse(PorRol.daDeAltaUnidades(soloHerramientas))
    }

    @Test
    fun `a direccion el menu no le dice que solicite nada`() {
        val herramientas = PorRol.resumen(CoreExtraModule.HERRAMIENTAS, ceo)
        val vehiculos = PorRol.resumen(CoreExtraModule.VEHICULOS, ceo)
        assertFalse(herramientas.contains("Solicita"))
        assertFalse(vehiculos.contains("Solicita"))
        assertFalse(herramientas.contains("kit"))
        assertTrue(herramientas.contains("Préstamos de toda la empresa"))
        assertTrue(vehiculos.contains("por aprobar"))
    }

    @Test
    fun `el menu dice lo que cada quien hace`() {
        assertTrue(PorRol.resumen(CoreExtraModule.HERRAMIENTAS, ivan).contains("Aprueba"))
        assertTrue(PorRol.resumen(CoreExtraModule.HERRAMIENTAS, personal).contains("Pide préstamo"))

        assertTrue(PorRol.resumen(CoreExtraModule.ALMACEN, ceo).contains("quién movió"))
        assertTrue(PorRol.resumen(CoreExtraModule.ALMACEN, ivan).contains("Escanea"))
        assertTrue(PorRol.resumen(CoreExtraModule.ALMACEN, personal).contains("Consulta"))

        assertTrue(PorRol.resumen(CoreExtraModule.VEHICULOS, ivan).contains("da de alta"))
        assertTrue(PorRol.resumen(CoreExtraModule.VEHICULOS, personal).contains("Saca"))

        assertTrue(PorRol.resumen(CoreExtraModule.VIATICOS, ceo).contains("Autoriza"))
        assertTrue(PorRol.resumen(CoreExtraModule.VIATICOS, personal).contains("Pide"))
        assertTrue(PorRol.resumen(CoreExtraModule.COTIZACIONES, ceo).contains("apruébalas"))
        assertFalse(PorRol.resumen(CoreExtraModule.COTIZACIONES, personal).contains("apruébalas"))
    }

    @Test
    fun `ningun renglon del menu se queda sin texto`() {
        for (modulo in CoreExtraModule.entries) {
            for (quien in listOf(ceo, ivan, personal)) {
                assertTrue(modulo.name, PorRol.resumen(modulo, quien).isNotBlank())
            }
            // Antes de leer la sesión sale el texto de siempre.
            assertEquals(modulo.summary, PorRol.resumen(modulo, null))
        }
    }
}
