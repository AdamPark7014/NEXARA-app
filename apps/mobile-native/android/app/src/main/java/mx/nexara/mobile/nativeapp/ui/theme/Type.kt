package mx.nexara.mobile.nativeapp.ui.theme

import androidx.compose.material3.Typography
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp
import mx.nexara.mobile.nativeapp.R

/**
 * Escala tipográfica NEXARA: la misma jerarquía que el panel web (títulos
 * seminegritas, cuerpo regular, etiquetas medianas) con tamaños legibles en
 * campo. La fuente es la del sistema para no cargar archivos extra.
 */
private val Base = FontFamily.Default

/**
 * Inter Tight (OFL, `res/font`) para títulos y cifras grandes, como Core en la web
 * (`--ui-font-display`). El cuerpo sigue en la fuente del sistema.
 */
val InterTight = FontFamily(
    Font(R.font.inter_tight_semibold, FontWeight.SemiBold),
    Font(R.font.inter_tight_bold, FontWeight.Bold),
)

val Typography = Typography(
    displaySmall = TextStyle(fontFamily = InterTight, fontWeight = FontWeight.Bold, fontSize = 34.sp, lineHeight = 40.sp, letterSpacing = (-0.25).sp),
    headlineLarge = TextStyle(fontFamily = InterTight, fontWeight = FontWeight.Bold, fontSize = 30.sp, lineHeight = 36.sp, letterSpacing = (-0.25).sp),
    headlineMedium = TextStyle(fontFamily = InterTight, fontWeight = FontWeight.Bold, fontSize = 26.sp, lineHeight = 32.sp, letterSpacing = (-0.2).sp),
    headlineSmall = TextStyle(fontFamily = InterTight, fontWeight = FontWeight.SemiBold, fontSize = 22.sp, lineHeight = 28.sp),
    titleLarge = TextStyle(fontFamily = InterTight, fontWeight = FontWeight.SemiBold, fontSize = 20.sp, lineHeight = 26.sp),
    titleMedium = TextStyle(fontFamily = Base, fontWeight = FontWeight.SemiBold, fontSize = 16.sp, lineHeight = 22.sp, letterSpacing = 0.1.sp),
    titleSmall = TextStyle(fontFamily = Base, fontWeight = FontWeight.SemiBold, fontSize = 14.sp, lineHeight = 20.sp, letterSpacing = 0.1.sp),
    bodyLarge = TextStyle(fontFamily = Base, fontWeight = FontWeight.Normal, fontSize = 16.sp, lineHeight = 24.sp, letterSpacing = 0.15.sp),
    bodyMedium = TextStyle(fontFamily = Base, fontWeight = FontWeight.Normal, fontSize = 14.sp, lineHeight = 20.sp, letterSpacing = 0.15.sp),
    bodySmall = TextStyle(fontFamily = Base, fontWeight = FontWeight.Normal, fontSize = 12.5.sp, lineHeight = 17.sp, letterSpacing = 0.2.sp),
    labelLarge = TextStyle(fontFamily = Base, fontWeight = FontWeight.SemiBold, fontSize = 14.sp, lineHeight = 20.sp, letterSpacing = 0.1.sp),
    labelMedium = TextStyle(fontFamily = Base, fontWeight = FontWeight.Medium, fontSize = 12.sp, lineHeight = 16.sp, letterSpacing = 0.3.sp),
    labelSmall = TextStyle(fontFamily = Base, fontWeight = FontWeight.Medium, fontSize = 11.sp, lineHeight = 16.sp, letterSpacing = 0.3.sp),
)
