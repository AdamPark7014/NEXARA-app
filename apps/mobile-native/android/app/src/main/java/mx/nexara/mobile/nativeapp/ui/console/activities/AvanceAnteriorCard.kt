package mx.nexara.mobile.nativeapp.ui.console.activities

import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.SwapHoriz
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import mx.nexara.mobile.nativeapp.data.api.AvanceAnteriorDto
import mx.nexara.mobile.nativeapp.data.api.TeamEvidenceDto
import mx.nexara.mobile.nativeapp.ui.common.ProtectedImage
import mx.nexara.mobile.nativeapp.ui.common.ProtectedPdfButton
import mx.nexara.mobile.nativeapp.ui.enterprise.NxColors
import mx.nexara.mobile.nativeapp.ui.enterprise.NxIconText

/**
 * «Avance anterior de X» en la captura de quien recibió la actividad: fotos, hoja y
 * formulario que dejó la persona anterior. Solo lectura (paridad con
 * `ActivityEvidenceFlow.tsx`).
 */
@Composable
internal fun AvanceAnteriorCard(
    av: AvanceAnteriorDto,
    coreKind: String?,
    onOpenVisor: (List<CoreActivityRules.EvidencePhoto>, Int) -> Unit,
) {
    val ev = av.evidence ?: TeamEvidenceDto()
    val fotos = remember(av) { CoreActivityRules.fotosDe(ev, av.nombre).fotos }
    val campos = remember(av, coreKind) {
        CoreActivityRules.formEntries(ev.serviceSheetData, coreKind).take(12)
    }
    val azul = Color(CoreActivityRules.AZUL)

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(12.dp))
            .border(1.dp, azul.copy(alpha = 0.30f), RoundedCornerShape(12.dp))
            .padding(12.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        NxIconText(
            text = ActivitySuperiorRules.tituloAvanceAnterior(av),
            icon = Icons.Outlined.SwapHoriz,
            iconTint = azul,
            fontSize = 14.sp,
            fontWeight = FontWeight.Bold,
            color = NxColors.Slate,
        )
        Text(ActivitySuperiorRules.detalleAvanceAnterior(av), fontSize = 12.5.sp, color = NxColors.Muted)

        if (fotos.isEmpty()) {
            Text("No alcanzó a subir fotos.", fontSize = 12.5.sp, color = NxColors.Muted)
        } else {
            Row(
                Modifier.horizontalScroll(rememberScrollState()),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                fotos.forEachIndexed { i, foto ->
                    ProtectedImage(
                        url = foto.url,
                        contentDescription = foto.titulo,
                        modifier = Modifier
                            .size(72.dp)
                            .clip(RoundedCornerShape(8.dp))
                            .border(1.dp, Color(0xFFE5E7EB), RoundedCornerShape(8.dp))
                            .clickable { onOpenVisor(fotos, i) },
                    )
                }
            }
        }

        ev.serviceSheetPdfUrl?.takeIf { it.isNotBlank() }?.let { url ->
            ProtectedPdfButton(url = url, label = "Ver hoja de servicio que subió")
        }

        campos.forEach { (label, valor) ->
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                Text(label, fontSize = 12.5.sp, color = NxColors.Muted, modifier = Modifier.weight(0.4f))
                Text(valor, fontSize = 12.5.sp, color = NxColors.Slate, modifier = Modifier.weight(0.6f))
            }
        }
    }
}
