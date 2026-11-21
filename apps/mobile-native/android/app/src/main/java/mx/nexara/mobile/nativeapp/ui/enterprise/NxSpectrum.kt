package mx.nexara.mobile.nativeapp.ui.enterprise

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp

/**
 * Firma NEXARA v3 (21-11-2026): el espectro del logotipo (teal → cielo → magenta → naranja),
 * el mismo `--ui-spectrum` de la web. Va como hilo fino bajo la barra superior y arriba de la
 * banda de Inicio. Es adorno: nunca lleva significado de estado.
 */
object NxSpectrum {
    val Teal = Color(0xFF1FB89A)
    val Sky = Color(0xFF3AA9CC)
    val Magenta = Color(0xFFA64CA6)
    val Orange = Color(0xFFEE8A2A)

    val colors: List<Color> = listOf(Teal, Sky, Magenta, Orange)

    val horizontal: Brush = Brush.horizontalGradient(colors)

    /** Marino de la NAS para bandas de noche (antes #0D0F12). */
    val Night = Color(0xFF070B12)
}

/** Hilo del espectro a todo lo ancho. */
@Composable
fun NxSpectrumLine(modifier: Modifier = Modifier, height: Dp = 2.dp) {
    Box(
        modifier
            .fillMaxWidth()
            .height(height)
            .background(NxSpectrum.horizontal),
    )
}
