package mx.nexara.mobile.nativeapp.ui.console

import mx.nexara.mobile.nativeapp.access.PlatformAccounts
import mx.nexara.mobile.nativeapp.access.RoleKeys
import mx.nexara.mobile.nativeapp.data.SessionUser

/**
 * Quién es quién en la app: dirección, quien administra (Iván) y el personal.
 *
 * Adam (04-11-2026): «al CEO le aparece para escanear una herramienta y ya eso que él debería ver todo
 * lo relacionado a lo administrativo [...] el que debe dar de alta es Iván [...] y la gente debe poder
 * solamente solicitar préstamos».
 *
 * Esto solo decide qué se enseña. Quien manda es el servidor: su 403 se enseña tal cual. Sin Android:
 * se prueba en la JVM (`PorRolTest`). Espejo: `CoreOrg.esDireccion` en iOS.
 */
object PorRol {
    private const val TOOLS_MANAGE = "tools.manage"
    private const val STOCK_MANAGE = "stock.manage"
    private const val VEHICLES_INVENTORY = "vehicles.inventory"

    fun esDireccion(user: SessionUser?): Boolean {
        if (user == null) return false
        return user.isSuperAdmin ||
            PlatformAccounts.esDireccion(user.email, user.roleKey) ||
            RoleKeys.canonicalRoleKey(user.roleKey, user.orgRoleKey, user.role) == RoleKeys.CEO
    }

    private fun tiene(user: SessionUser?, permiso: String): Boolean =
        user?.permissions.orEmpty().any { it.trim().equals(permiso, ignoreCase = true) }

    /** Iván: aprueba préstamos, entrega, recibe y da de alta herramientas. */
    fun administraHerramientas(user: SessionUser?): Boolean = !esDireccion(user) && tiene(user, TOOLS_MANAGE)

    /** Iván: escanea, da de alta artículos y registra entradas y salidas. */
    fun operaAlmacen(user: SessionUser?): Boolean = !esDireccion(user) && tiene(user, STOCK_MANAGE)

    /** Iván: además de sacar y regresar, da de alta unidades. */
    fun daDeAltaUnidades(user: SessionUser?): Boolean = !esDireccion(user) && tiene(user, VEHICLES_INVENTORY)

    /** Lo que dice cada renglón de «Más»: lo que esa persona hace ahí, no lo que hacen otros. */
    fun resumen(modulo: CoreExtraModule, user: SessionUser?): String {
        if (user == null) return modulo.summary
        val direccion = esDireccion(user)
        return when (modulo) {
            CoreExtraModule.COTIZACIONES ->
                if (direccion) "Revisa propuestas, apruébalas y abre su PDF."
                else "Propuestas: folio, PDF y marcar como enviada."
            CoreExtraModule.ALMACEN -> when {
                direccion -> "Existencias, bajo mínimo y quién movió qué."
                operaAlmacen(user) -> "Escanea, da de alta y registra entradas y salidas."
                else -> "Consulta qué hay y qué está por acabarse."
            }
            CoreExtraModule.HERRAMIENTAS -> when {
                direccion -> "Préstamos de toda la empresa e inventario."
                administraHerramientas(user) -> "Aprueba préstamos, entrega, recibe y da de alta."
                else -> "Pide préstamo, revisa tu kit y reporta daños."
            }
            CoreExtraModule.VEHICULOS -> when {
                direccion -> "Tu flotilla, lo que cuesta y solicitudes por aprobar."
                daDeAltaUnidades(user) -> "Saca, regresa, carga gasolina y da de alta unidades."
                else -> "Saca un vehículo libre, regrésalo y carga gasolina."
            }
            CoreExtraModule.GASTOS ->
                if (direccion) "Lo que falta autorizar y lo que falta pagar." else modulo.summary
            CoreExtraModule.VIATICOS ->
                if (direccion) "Autoriza y asigna viáticos, con la foto del ticket."
                else "Pide y comprueba tus viáticos, con la foto del ticket."
            CoreExtraModule.PAGOS_EMPLEADOS -> "Registra pagos al personal y márcalos pagados."
            CoreExtraModule.PROYECTOS, CoreExtraModule.KPIS_EQUIPO, CoreExtraModule.APROBACIONES -> modulo.summary
        }
    }
}
