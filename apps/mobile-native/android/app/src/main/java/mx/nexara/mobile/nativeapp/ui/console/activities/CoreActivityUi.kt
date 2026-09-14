package mx.nexara.mobile.nativeapp.ui.console.activities

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.TextUnit
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlin.math.roundToInt
import mx.nexara.mobile.nativeapp.ui.common.ProtectedImage
import mx.nexara.mobile.nativeapp.ui.enterprise.NxColors

/** Chip de estado con el color de la web (fondo 10 %, borde 35 %). */
@Composable
fun ToneChip(text: String, color: Long? = null, modifier: Modifier = Modifier) {
    val c = color?.let { Color(it) }
    val shape = RoundedCornerShape(999.dp)
    Box(
        modifier = modifier
            .clip(shape)
            .background(c?.copy(alpha = 0.10f) ?: Color(0xFFF8FAFC))
            .border(1.dp, c?.copy(alpha = 0.35f) ?: Color(0xFFE2E8F0), shape)
            .padding(horizontal = 10.dp, vertical = 4.dp),
    ) {
        Text(
            text,
            fontSize = 12.sp,
            fontWeight = FontWeight.SemiBold,
            color = c ?: NxColors.Muted,
            maxLines = 1,
        )
    }
}

@Composable
fun ToneChip(tone: CoreActivityRules.Tone, modifier: Modifier = Modifier) {
    ToneChip(text = tone.label, color = tone.color, modifier = modifier)
}

/** Foto protegida en círculo o iniciales. */
@Composable
fun PersonAvatar(nombre: String?, url: String?, size: Dp = 44.dp) {
    if (!url.isNullOrBlank()) {
        ProtectedImage(
            url = url,
            contentDescription = null,
            modifier = Modifier.size(size).clip(CircleShape),
        )
    } else {
        Box(
            modifier = Modifier.size(size).clip(CircleShape).background(NxColors.TealSoft),
            contentAlignment = Alignment.Center,
        ) {
            Text(
                CoreActivityRules.initials(nombre),
                color = NxColors.Teal,
                fontWeight = FontWeight.ExtraBold,
                fontSize = (size.value * 0.34f).sp,
            )
        }
    }
}

/** ★★★☆☆ en ámbar. */
@Composable
fun StarsText(valor: Double?, fontSize: TextUnit = 14.sp) {
    val v = (valor ?: 0.0).roundToInt().coerceIn(0, 5)
    Text(
        buildAnnotatedString {
            withStyle(SpanStyle(color = Color(0xFFF59E0B))) { append("★".repeat(v)) }
            withStyle(SpanStyle(color = Color(0xFFCBD5E1))) { append("★".repeat(5 - v)) }
        },
        fontSize = fontSize,
        letterSpacing = 1.sp,
    )
}

@Composable
fun ProgressWithPct(pct: Double?, modifier: Modifier = Modifier) {
    val v = (pct ?: 0.0).coerceIn(0.0, 100.0)
    Row(
        modifier = modifier,
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        LinearProgressIndicator(
            progress = { (v / 100.0).toFloat() },
            modifier = Modifier.weight(1f).height(8.dp).clip(RoundedCornerShape(999.dp)),
            color = if (v >= 100.0) Color(CoreActivityRules.VERDE) else NxColors.Teal,
            trackColor = Color(0xFFE2E8F0),
        )
        Text("${v.roundToInt()}%", fontSize = 12.sp, fontWeight = FontWeight.Bold, color = NxColors.Slate)
    }
}

/** Nota con fondo suave (indicaciones, avisos). */
@Composable
fun SoftNote(
    text: String,
    modifier: Modifier = Modifier,
    title: String? = null,
    color: Long? = null,
) {
    val c = color?.let { Color(it) }
    Column(
        modifier = modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(12.dp))
            .background(c?.copy(alpha = 0.09f) ?: Color(0xFFF1F5F9))
            .padding(horizontal = 12.dp, vertical = 10.dp),
        verticalArrangement = Arrangement.spacedBy(2.dp),
    ) {
        if (!title.isNullOrBlank()) {
            Text(title, fontSize = 13.sp, fontWeight = FontWeight.Bold, color = NxColors.Slate)
        }
        Text(text, fontSize = 13.sp, color = NxColors.Slate, lineHeight = 18.sp)
    }
}
