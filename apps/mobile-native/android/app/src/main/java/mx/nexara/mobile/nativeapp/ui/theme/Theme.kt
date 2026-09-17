package mx.nexara.mobile.nativeapp.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.SideEffect
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalView
import androidx.core.view.WindowCompat

import mx.nexara.mobile.nativeapp.ui.enterprise.NxColors
import mx.nexara.mobile.nativeapp.ui.theme.Typography

private val LightColors = lightColorScheme(
    primary = NxColors.Brand,
    onPrimary = Color.White,
    primaryContainer = NxColors.BrandSoft,
    onPrimaryContainer = NxColors.BrandDark,
    secondary = NxColors.BrandDark,
    secondaryContainer = NxColors.BrandSoft,
    onSecondaryContainer = NxColors.BrandDark,
    tertiary = NxColors.Accent,
    surfaceTint = NxColors.Brand,
    surface = NxColors.Surface,
    background = NxColors.Surface,
    error = NxColors.Danger,
)

private val DarkColors = darkColorScheme(
    primary = Color(0xFF60A5FA),
    onPrimary = NxColors.Slate,
    secondary = Color(0xFF93C5FD),
    tertiary = Color(0xFF38BDF8),
    surface = NxColors.Slate,
    background = NxColors.Slate,
    error = NxColors.Danger,
)

@Composable
fun NexaraTheme(
    darkTheme: Boolean = false,
    content: @Composable () -> Unit
) {
    val view = LocalView.current
    if (!view.isInEditMode) {
        SideEffect {
            val window = (view.context as android.app.Activity).window
            WindowCompat.getInsetsController(window, view).isAppearanceLightStatusBars = !darkTheme
        }
    }

    MaterialTheme(
        colorScheme = if (darkTheme) DarkColors else LightColors,
        typography = Typography,
        content = content,
    )
}

