package mx.nexara.mobile.nativeapp.ui.enterprise

import androidx.compose.runtime.Composable
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.ReadOnlyComposable
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Color

/**
 * Paleta semántica de NEXARA que SÍ cambia con el tema.
 *
 * [NxColors] es la tabla fija en claro y la leen directamente las pantallas
 * viejas; por eso el esquema oscuro de Material no se veía. Las pantallas del
 * rediseño v2 (Inicio, detalle de actividad, barra inferior) leen de aquí vía
 * [LocalNxColors] / [NxTheme.colors], y `NexaraTheme` provee la variante clara
 * u oscura. Migrar una pantalla = cambiar `NxColors.X` por `NxTheme.colors.x`.
 */
@Immutable
data class NxPalette(
    val brand: Color,
    /** Texto de marca legible sobre [surface] y [brandSoft]. */
    val brandText: Color,
    val brandDeep: Color,
    val brandSoft: Color,
    val brandSoft2: Color,
    val brandTint: Color,
    /** Texto principal. */
    val fg: Color,
    /** Texto secundario que sí hay que leer. */
    val fg2: Color,
    /** Texto terciario (metadatos). */
    val muted: Color,
    /** Solo deshabilitado. */
    val fg4: Color,
    val surface: Color,
    val card: Color,
    /** Superficie hundida (encabezado de tabla, campo de solo lectura). */
    val sunken: Color,
    val border: Color,
    val borderSubtle: Color,
    val borderStrong: Color,
    val success: Color,
    val successSoft: Color,
    val warning: Color,
    val warningSoft: Color,
    /** Texto sobre [warningSoft]. */
    val warningText: Color,
    val danger: Color,
    val dangerSoft: Color,
    val dangerText: Color,
    val info: Color,
    val infoSoft: Color,
    val categorySky: Color,
    val categoryMagenta: Color,
    val categoryOrange: Color,
    val isDark: Boolean,
) {
    val categoryCctv: Color get() = brand
}

val NxLightPalette = NxPalette(
    brand = NxColors.Brand,
    brandText = NxColors.BrandDark,
    brandDeep = NxColors.BrandDeep,
    brandSoft = NxColors.BrandSoft,
    brandSoft2 = NxColors.BrandSoft2,
    brandTint = NxColors.BrandTint,
    fg = NxColors.Slate,
    fg2 = Color(0xFF475569),
    muted = NxColors.Muted,
    fg4 = Color(0xFF94A3B8),
    surface = NxColors.Surface,
    card = NxColors.Card,
    sunken = Color(0xFFF1F5F9),
    border = Color(0xFFE2E8F0),
    borderSubtle = Color(0xFFEEF2F6),
    borderStrong = Color(0xFFCBD5E1),
    success = NxColors.Success,
    successSoft = NxColors.SuccessSoft,
    warning = NxColors.Warning,
    warningSoft = NxColors.WarningSoft,
    warningText = Color(0xFF92400E),
    danger = NxColors.Danger,
    dangerSoft = NxColors.DangerSoft,
    dangerText = Color(0xFF991B1B),
    info = NxColors.Info,
    infoSoft = NxColors.InfoSoft,
    categorySky = NxColors.CategorySky,
    categoryMagenta = NxColors.CategoryMagenta,
    categoryOrange = NxColors.CategoryOrange,
    isDark = false,
)

/** Oscuro = fondo marino del panel web (`body.dark`) con el teal aclarado para que contraste. */
val NxDarkPalette = NxPalette(
    brand = Color(0xFF4FC4A8),
    brandText = Color(0xFF8FDCC8),
    brandDeep = Color(0xFF0F5F4F),
    brandSoft = Color(0xFF14393A),
    brandSoft2 = Color(0xFF1B4C49),
    brandTint = Color(0xFF0E2A2B),
    fg = Color(0xFFEAF4FF),
    fg2 = Color(0xFFB7C7DA),
    muted = Color(0xFF91ACC7),
    fg4 = Color(0xFF5E7791),
    surface = Color(0xFF090F19),
    card = Color(0xFF11202F),
    sunken = Color(0xFF0E1A30),
    border = Color(0xFF1F3548),
    borderSubtle = Color(0xFF172B3C),
    borderStrong = Color(0xFF3A5873),
    success = Color(0xFF34D399),
    successSoft = Color(0xFF0F3B2E),
    warning = Color(0xFFFBBF24),
    warningSoft = Color(0xFF3F2E0A),
    warningText = Color(0xFFFDE68A),
    danger = Color(0xFFF87171),
    dangerSoft = Color(0xFF4A1D1D),
    dangerText = Color(0xFFFECACA),
    info = Color(0xFF60A5FA),
    infoSoft = Color(0xFF17304F),
    categorySky = Color(0xFF5CC0DE),
    categoryMagenta = Color(0xFFC06FC0),
    categoryOrange = Color(0xFFF4A456),
    isDark = true,
)

val LocalNxColors = staticCompositionLocalOf { NxLightPalette }

/** Acceso corto: `NxTheme.colors.brand`. */
object NxTheme {
    val colors: NxPalette
        @Composable
        @ReadOnlyComposable
        get() = LocalNxColors.current
}
