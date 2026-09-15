package mx.nexara.mobile.nativeapp.ui.console.activities

import androidx.compose.foundation.border
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import mx.nexara.mobile.nativeapp.data.api.TeamBoardUserDto

/**
 * Debajo del estado de una persona en la pizarra: con qué atraso terminó su
 * última actividad (si está libre) y los avisos de evidencia en espera o en
 * corrección. Espejo de PersonCard en apps/web/app/(panels)/erp/pizarra/page.tsx.
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun BoardStatusExtras(user: TeamBoardUserDto, centered: Boolean) {
    val fin = user.lastFinished
    val enCorreccion = user.enCorreccion ?: 0
    val enEspera = user.enEsperaAprobacion ?: 0
    if ((user.status != "libre" || fin == null) && enCorreccion <= 0 && enEspera <= 0) return

    Column(
        horizontalAlignment = if (centered) Alignment.CenterHorizontally else Alignment.Start,
        verticalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        if (user.status == "libre" && fin != null) {
            val tarde = (fin.lateMinutes ?: 0.0) > 0
            Text(
                CoreActivityRules.boardTerminoTexto(fin.finishedAt, fin.lateMinutes),
                fontSize = 11.5.sp,
                fontWeight = FontWeight.SemiBold,
                color = Color(if (tarde) CoreActivityRules.ROJO else CoreActivityRules.VERDE),
                textAlign = if (centered) TextAlign.Center else TextAlign.Start,
            )
        }
        if (enCorreccion > 0 || enEspera > 0) {
            FlowRow(
                horizontalArrangement = Arrangement.spacedBy(4.dp, if (centered) Alignment.CenterHorizontally else Alignment.Start),
                verticalArrangement = Arrangement.spacedBy(4.dp),
            ) {
                if (enCorreccion > 0) MiniChip("↩️ Corrigiendo evidencia", CoreActivityRules.NARANJA)
                if (enEspera > 0) MiniChip(CoreActivityRules.boardEnEsperaTexto(enEspera), CoreActivityRules.MORADO)
            }
        }
    }
}

@Composable
private fun MiniChip(text: String, color: Long) {
    val c = Color(color)
    val shape = RoundedCornerShape(999.dp)
    Text(
        text,
        fontSize = 10.5.sp,
        fontWeight = FontWeight.SemiBold,
        color = c,
        maxLines = 1,
        modifier = Modifier
            .clip(shape)
            .background(c.copy(alpha = 0.10f))
            .border(1.dp, c.copy(alpha = 0.30f), shape)
            .padding(horizontal = 7.dp, vertical = 2.dp),
    )
}
