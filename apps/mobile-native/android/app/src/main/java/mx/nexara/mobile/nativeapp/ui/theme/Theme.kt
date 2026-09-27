package mx.nexara.mobile.nativeapp.ui.theme

import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Shapes
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.SideEffect
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.unit.dp
import androidx.core.view.WindowCompat

import mx.nexara.mobile.nativeapp.ui.enterprise.NxColors

/**
 * Esquema claro = tokens `body.light` de `apps/web/app/globals.scss`
 * (primario #2563EB, texto #0F1C2E). Sin color dinámico: la marca manda.
 */
private val LightColors = lightColorScheme(
    primary = NxColors.Brand,
    onPrimary = Color.White,
    primaryContainer = NxColors.BrandSoft,
    onPrimaryContainer = NxColors.BrandDark,
    inversePrimary = Color(0xFF93C5FD),
    secondary = NxColors.BrandDark,
    onSecondary = Color.White,
    secondaryContainer = NxColors.BrandSoft,
    onSecondaryContainer = NxColors.BrandDark,
    tertiary = Color(0xFF0891B2),
    onTertiary = Color.White,
    tertiaryContainer = Color(0xFFCFFAFE),
    onTertiaryContainer = Color(0xFF164E63),
    surfaceTint = NxColors.Brand,
    surface = NxColors.Surface,
    onSurface = NxColors.Slate,
    background = NxColors.Surface,
    onBackground = NxColors.Slate,
    onSurfaceVariant = NxColors.Muted,
    // Material 3 trae contenedores lila por defecto (barra inferior, tarjetas, campos):
    // se fijan a neutros pizarra con un toque azul para que toda la app se lea azul.
    surfaceVariant = Color(0xFFEEF2F7),
    surfaceBright = Color.White,
    surfaceDim = Color(0xFFE2E8F0),
    surfaceContainerLowest = Color.White,
    surfaceContainerLow = Color(0xFFF8FAFC),
    surfaceContainer = Color(0xFFF1F5F9),
    surfaceContainerHigh = Color(0xFFEEF2F7),
    surfaceContainerHighest = Color(0xFFE8EDF4),
    inverseSurface = NxColors.Slate,
    inverseOnSurface = Color(0xFFF1F5F9),
    outline = Color(0xFFCBD5E1),
    outlineVariant = Color(0xFFE2E8F0),
    error = NxColors.Danger,
    onError = Color.White,
    errorContainer = NxColors.DangerSoft,
    onErrorContainer = Color(0xFF7F1D1D),
    scrim = Color(0xFF020617),
)

/** Esquema oscuro = tokens `body.dark` del panel web (fondo marino #090F19). */
private val DarkColors = darkColorScheme(
    primary = Color(0xFF60A5FA),
    onPrimary = Color(0xFF0B1B33),
    primaryContainer = Color(0xFF1E3A8A),
    onPrimaryContainer = Color(0xFFDBEAFE),
    inversePrimary = NxColors.Brand,
    secondary = Color(0xFF93C5FD),
    onSecondary = Color(0xFF0B1B33),
    secondaryContainer = Color(0xFF153247),
    onSecondaryContainer = Color(0xFFDBEAFE),
    tertiary = Color(0xFF2DD8F2),
    onTertiary = Color(0xFF052E36),
    tertiaryContainer = Color(0xFF0E4552),
    onTertiaryContainer = Color(0xFFCFFAFE),
    surfaceTint = Color(0xFF60A5FA),
    background = Color(0xFF090F19),
    onBackground = Color(0xFFEAF4FF),
    surface = Color(0xFF090F19),
    onSurface = Color(0xFFEAF4FF),
    surfaceVariant = Color(0xFF152938),
    onSurfaceVariant = Color(0xFF91ACC7),
    surfaceBright = Color(0xFF1B3546),
    surfaceDim = Color(0xFF070F1E),
    surfaceContainerLowest = Color(0xFF070F1E),
    surfaceContainerLow = Color(0xFF0E1A30),
    surfaceContainer = Color(0xFF11202F),
    surfaceContainerHigh = Color(0xFF152938),
    surfaceContainerHighest = Color(0xFF1B3546),
    inverseSurface = Color(0xFFEAF4FF),
    inverseOnSurface = Color(0xFF0F1C2E),
    outline = Color(0xFF3A5873),
    outlineVariant = Color(0xFF1F3548),
    error = Color(0xFFF87171),
    onError = Color(0xFF450A0A),
    errorContainer = Color(0xFF5F1D1D),
    onErrorContainer = Color(0xFFFEE2E2),
    scrim = Color.Black,
)

/** Radios 8 / 12 / 16: controles, tarjetas y hojas. */
val NexaraShapes = Shapes(
    extraSmall = RoundedCornerShape(6.dp),
    small = RoundedCornerShape(8.dp),
    medium = RoundedCornerShape(12.dp),
    large = RoundedCornerShape(16.dp),
    extraLarge = RoundedCornerShape(24.dp),
)

/**
 * La app se pinta en claro: las pantallas usan [NxColors] (tokens claros) de
 * forma directa, así que el esquema oscuro queda listo pero no se activa hasta
 * que esas pantallas lean del tema.
 */
@Composable
fun NexaraTheme(
    darkTheme: Boolean = false,
    content: @Composable () -> Unit
) {
    val view = LocalView.current
    if (!view.isInEditMode) {
        SideEffect {
            val window = (view.context as android.app.Activity).window
            val controller = WindowCompat.getInsetsController(window, view)
            controller.isAppearanceLightStatusBars = !darkTheme
            controller.isAppearanceLightNavigationBars = !darkTheme
        }
    }

    MaterialTheme(
        colorScheme = if (darkTheme) DarkColors else LightColors,
        typography = Typography,
        shapes = NexaraShapes,
        content = content,
    )
}
