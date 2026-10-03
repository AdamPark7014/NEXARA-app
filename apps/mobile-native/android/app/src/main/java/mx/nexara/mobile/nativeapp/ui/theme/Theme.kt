package mx.nexara.mobile.nativeapp.ui.theme

import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Shapes
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.SideEffect
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.unit.dp
import androidx.core.view.WindowCompat

import mx.nexara.mobile.nativeapp.ui.enterprise.LocalNxColors
import mx.nexara.mobile.nativeapp.ui.enterprise.NxColors
import mx.nexara.mobile.nativeapp.ui.enterprise.NxDarkPalette
import mx.nexara.mobile.nativeapp.ui.enterprise.NxLightPalette

/**
 * Esquema claro = tokens v2 (`.ai/ui-maquetas/PLAN.md` §2): teal de marca
 * #1F9E84, texto #0F172A. Sin color dinámico: la marca manda.
 */
private val LightColors = lightColorScheme(
    primary = NxColors.Brand,
    onPrimary = Color.White,
    primaryContainer = NxColors.BrandSoft,
    onPrimaryContainer = NxColors.BrandDark,
    inversePrimary = NxDarkPalette.brand,
    secondary = NxColors.BrandDark,
    onSecondary = Color.White,
    // Pastilla de la barra inferior (NavigationBarItem usa secondaryContainer).
    secondaryContainer = NxColors.BrandSoft2,
    onSecondaryContainer = NxColors.BrandDeep,
    // Terciario = acento «cielo» del logotipo (categoría Redes).
    tertiary = NxColors.CategorySky,
    onTertiary = Color.White,
    tertiaryContainer = Color(0xFFDDF1F7),
    onTertiaryContainer = Color(0xFF0F4F61),
    surfaceTint = NxColors.Brand,
    surface = NxColors.Surface,
    onSurface = NxColors.Slate,
    background = NxColors.Surface,
    onBackground = NxColors.Slate,
    onSurfaceVariant = NxColors.Muted,
    // Material 3 trae contenedores lila por defecto (barra inferior, tarjetas, campos):
    // se fijan a neutros pizarra para que toda la app se lea con la marca.
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

/** Esquema oscuro = tokens `body.dark` del panel web (fondo marino #090F19) con el teal aclarado. */
private val DarkColors = darkColorScheme(
    primary = NxDarkPalette.brand,
    onPrimary = Color(0xFF063A2F),
    primaryContainer = NxDarkPalette.brandSoft2,
    onPrimaryContainer = Color(0xFFCFECE4),
    inversePrimary = NxColors.Brand,
    secondary = NxDarkPalette.brandText,
    onSecondary = Color(0xFF063A2F),
    secondaryContainer = NxDarkPalette.brandSoft2,
    onSecondaryContainer = Color(0xFFCFECE4),
    tertiary = NxDarkPalette.categorySky,
    onTertiary = Color(0xFF052E36),
    tertiaryContainer = Color(0xFF0E4552),
    onTertiaryContainer = Color(0xFFCFFAFE),
    surfaceTint = NxDarkPalette.brand,
    background = NxDarkPalette.surface,
    onBackground = NxDarkPalette.fg,
    surface = NxDarkPalette.surface,
    onSurface = NxDarkPalette.fg,
    surfaceVariant = Color(0xFF152938),
    onSurfaceVariant = NxDarkPalette.muted,
    surfaceBright = Color(0xFF1B3546),
    surfaceDim = Color(0xFF070F1E),
    surfaceContainerLowest = Color(0xFF070F1E),
    surfaceContainerLow = Color(0xFF0E1A30),
    surfaceContainer = NxDarkPalette.card,
    surfaceContainerHigh = Color(0xFF152938),
    surfaceContainerHighest = Color(0xFF1B3546),
    inverseSurface = NxDarkPalette.fg,
    inverseOnSurface = Color(0xFF0F1C2E),
    outline = NxDarkPalette.borderStrong,
    outlineVariant = NxDarkPalette.border,
    error = NxDarkPalette.danger,
    onError = Color(0xFF450A0A),
    errorContainer = NxDarkPalette.dangerSoft,
    onErrorContainer = NxDarkPalette.dangerText,
    scrim = Color.Black,
)

/** Radios v2: 8 controles chicos · 12 controles · 16 tarjetas · 20 hojas. */
val NexaraShapes = Shapes(
    extraSmall = RoundedCornerShape(6.dp),
    small = RoundedCornerShape(8.dp),
    medium = RoundedCornerShape(12.dp),
    large = RoundedCornerShape(16.dp),
    extraLarge = RoundedCornerShape(20.dp),
)

/**
 * La app se pinta en claro por omisión. Las pantallas del rediseño v2 leen
 * [LocalNxColors] y `MaterialTheme.colorScheme`, así que con `darkTheme = true`
 * ya se ven en oscuro; las que todavía leen [NxColors] directo siguen en claro.
 * Cuando todas migren, aquí basta `darkTheme = isSystemInDarkTheme()`.
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

    CompositionLocalProvider(LocalNxColors provides if (darkTheme) NxDarkPalette else NxLightPalette) {
        MaterialTheme(
            colorScheme = if (darkTheme) DarkColors else LightColors,
            typography = Typography,
            shapes = NexaraShapes,
            content = content,
        )
    }
}
