package mx.nexara.mobile.nativeapp.ui.console.cotizaciones

import android.app.Activity
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.ui.platform.LocalView
import androidx.core.view.WindowCompat
import mx.nexara.mobile.nativeapp.ui.enterprise.NxColors

/**
 * Barra de cotizaciones: fondo del lienzo, título y flecha en tinta.
 * La pinta el shell; aquí solo están los colores, para no teñir el resto.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun NxBarraClaraCotizaciones() = TopAppBarDefaults.topAppBarColors(
    containerColor = NxColors.Surface,
    scrolledContainerColor = NxColors.Card,
    titleContentColor = NxColors.Slate,
    navigationIconContentColor = NxColors.Slate,
    actionIconContentColor = NxColors.Slate,
)

/**
 * Hora y batería en tinta. Gemela de [mx.nexara.mobile.nativeapp.ui.enterprise.NxLightStatusBarIcons],
 * que las deja blancas sobre la barra teal.
 */
@Composable
fun NxInkStatusBarIcons() {
    val view = LocalView.current
    if (view.isInEditMode) return
    DisposableEffect(view) {
        val window = (view.context as? Activity)?.window
        val controller = window?.let { WindowCompat.getInsetsController(it, view) }
        val previous = controller?.isAppearanceLightStatusBars
        controller?.isAppearanceLightStatusBars = true
        onDispose {
            if (controller != null && previous != null) controller.isAppearanceLightStatusBars = previous
        }
    }
}
