package mx.nexara.mobile.nativeapp.ui.integra.vehicles

import androidx.navigation.NavGraphBuilder
import androidx.navigation.compose.composable

/**
 * Contrato de cableado de los módulos VEHÍCULOS y ANPR.
 *
 * Este fichero existe para que enganchar las dos pantallas en
 * `ui/integra/IntegraNavHost.kt` sea una línea, sin que quien lo haga tenga que
 * adivinar nombres de ruta ni de composable.
 *
 * En `IntegraNavHost`:
 *   · dentro del `NavHost { … }` → `integraVehiclesGraph()`
 *   · en `integraRouteForKey`    → `IntegraVehiclesRoutes.routeParaClave(key)`
 *   · en `topBarTitle`           → `IntegraVehiclesRoutes.tituloDe(currentRoute)`
 *
 * Y en `access/ModulePanelMap.kt` hacen falta las claves `integra-vehicles` e
 * `integra-anpr`, que hoy NO están en la lista de INTEGRA: sin ellas
 * `allowedIntegraKeys()` las deja fuera y las tarjetas nunca se pintan, aunque
 * las rutas existan. Las claves ya están en `apps/web/lib/access-matrix.ts`.
 */
object IntegraVehiclesRoutes {

    /** Espejo de `/integra/vehicles` en la web. */
    const val VEHICLES = "integra/vehicles"

    /** Espejo de `/integra/anpr` en la web. */
    const val ANPR = "integra/anpr"

    /** Clave de módulo, igual que en `apps/web/lib/access-matrix.ts`. */
    const val KEY_VEHICLES = "integra-vehicles"
    const val KEY_ANPR = "integra-anpr"

    const val TITULO_VEHICLES = "Vehículos y placas"
    const val TITULO_ANPR = "ANPR / lectura de placas"

    /** Título de barra superior, o `null` si la ruta no es de este módulo. */
    fun tituloDe(route: String?): String? = when (route) {
        VEHICLES -> TITULO_VEHICLES
        ANPR -> TITULO_ANPR
        else -> null
    }

    /**
     * Ruta para una clave de módulo o un enlace profundo. Devuelve `null` si la
     * clave no es de aquí, para que el `when` del NavHost siga cayendo a `Home`.
     */
    fun routeParaClave(key: String): String? = when (key.lowercase()) {
        KEY_VEHICLES, "vehicles", "vehiculos", "vehículos", "placas" -> VEHICLES
        KEY_ANPR, "anpr", "lpr", "cross-records" -> ANPR
        else -> null
    }
}

/** Registra las dos pantallas. Llamar dentro del `NavHost` de INTEGRA. */
fun NavGraphBuilder.integraVehiclesGraph() {
    composable(IntegraVehiclesRoutes.VEHICLES) { IntegraVehiclesScreen() }
    composable(IntegraVehiclesRoutes.ANPR) { IntegraAnprScreen() }
}
