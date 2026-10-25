package mx.nexara.mobile.nativeapp.ui.tickets

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.core.view.WindowCompat
import mx.nexara.mobile.nativeapp.ui.enterprise.NxColors

/**
 * Barra clara del portal: fondo blanco, texto oscuro, iconos de estado oscuros.
 * No usa [mx.nexara.mobile.nativeapp.ui.enterprise.NxBrandTopAppBarColors]: esa
 * sigue siendo la barra teal del personal.
 */
@Composable
fun PortalClearStatusBarIcons() {
    val view = LocalView.current
    if (view.isInEditMode) return
    DisposableEffect(view) {
        val window = (view.context as? android.app.Activity)?.window
        val controller = window?.let { WindowCompat.getInsetsController(it, view) }
        val previous = controller?.isAppearanceLightStatusBars
        controller?.isAppearanceLightStatusBars = true
        onDispose {
            if (controller != null && previous != null) controller.isAppearanceLightStatusBars = previous
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun portalClearTopAppBarColors() = TopAppBarDefaults.topAppBarColors(
    containerColor = Color.White,
    scrolledContainerColor = Color.White,
    titleContentColor = NxColors.Slate,
    navigationIconContentColor = NxColors.Slate,
    actionIconContentColor = NxColors.Slate,
)

/**
 * Vacío o error del portal: una frase, y «Reintentar» o una acción si hace falta.
 */
@Composable
fun PortalFrase(
    text: String,
    modifier: Modifier = Modifier,
    onRetry: (() -> Unit)? = null,
    actionLabel: String? = null,
    onAction: (() -> Unit)? = null,
) {
    Column(
        modifier = modifier
            .fillMaxWidth()
            .padding(horizontal = 24.dp, vertical = 28.dp)
            .semantics { liveRegion = LiveRegionMode.Polite },
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text(
            text,
            style = MaterialTheme.typography.bodyMedium,
            color = NxColors.Muted,
            textAlign = TextAlign.Center,
        )
        if (onRetry != null) {
            Spacer(Modifier.size(4.dp))
            TextButton(onClick = onRetry) { Text("Reintentar") }
        }
        if (actionLabel != null && onAction != null) {
            Spacer(Modifier.size(4.dp))
            TextButton(onClick = onAction) { Text(actionLabel) }
        }
    }
}

/** Un dato, una línea. */
@Composable
fun PortalLinea(
    text: String,
    modifier: Modifier = Modifier,
    emphasis: Boolean = false,
) {
    Text(
        text,
        modifier = modifier.fillMaxWidth(),
        style = if (emphasis) {
            MaterialTheme.typography.titleSmall.copy(fontWeight = FontWeight.SemiBold)
        } else {
            MaterialTheme.typography.bodySmall
        },
        color = if (emphasis) NxColors.Slate else NxColors.Muted,
        maxLines = 1,
        overflow = TextOverflow.Ellipsis,
    )
}
