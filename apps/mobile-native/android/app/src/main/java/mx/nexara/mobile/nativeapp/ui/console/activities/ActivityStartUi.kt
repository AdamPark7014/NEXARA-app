package mx.nexara.mobile.nativeapp.ui.console.activities

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import mx.nexara.mobile.nativeapp.ui.enterprise.NxColors

/**
 * «Iniciar actividad» en el detalle (ahí cae el push de «actividad nueva»).
 *
 * Regla del dueño (18-09): quien recibe una actividad no la acepta ni la rechaza,
 * únicamente la inicia. Hay una sola acción, que marca la hora real de inicio; si
 * no puede hacerla, lo habla con su jefe, que es quien la reasigna. Quién lo ve lo
 * decide [ActivitySemaforo.puedeIniciar].
 */
@Composable
fun IniciarActividadBanner(
    onIniciar: () -> Unit,
    guardando: Boolean,
    modifier: Modifier = Modifier,
    error: String? = null,
) {
    Column(
        modifier = modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(14.dp))
            .background(Color(CoreActivityRules.AZUL).copy(alpha = 0.07f))
            .border(1.dp, Color(CoreActivityRules.AZUL).copy(alpha = 0.3f), RoundedCornerShape(14.dp))
            .padding(12.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Text(
            "Te asignaron esta actividad",
            fontSize = 13.5.sp,
            fontWeight = FontWeight.ExtraBold,
            color = NxColors.Slate,
        )
        Text(
            "Iníciala cuando empieces: queda registrada tu hora real de inicio. " +
                "Si no puedes hacerla, habla con tu jefe para que la reasigne.",
            fontSize = 12.5.sp,
            color = NxColors.Muted,
        )
        error?.let { Text(it, fontSize = 12.5.sp, color = Color(CoreActivityRules.ROJO)) }
        Button(
            onClick = onIniciar,
            enabled = !guardando,
            colors = ButtonDefaults.buttonColors(containerColor = Color(CoreActivityRules.VERDE)),
            modifier = Modifier.heightIn(min = 48.dp),
        ) {
            Text(
                if (guardando) "Iniciando…" else ActivitySemaforo.ACCION_INICIAR,
                fontWeight = FontWeight.Bold,
            )
        }
    }
}
