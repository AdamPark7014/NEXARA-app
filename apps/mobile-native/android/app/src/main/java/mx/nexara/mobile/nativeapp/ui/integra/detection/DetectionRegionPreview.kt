package mx.nexara.mobile.nativeapp.ui.integra.detection

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.unit.dp
import mx.nexara.mobile.nativeapp.data.integra.detection.DetectionRegion
import mx.nexara.mobile.nativeapp.data.integra.detection.regionsSummary
import mx.nexara.mobile.nativeapp.ui.enterprise.NxColors
import mx.nexara.mobile.nativeapp.ui.enterprise.NxStatusChip
import mx.nexara.mobile.nativeapp.ui.enterprise.NxTone

/**
 * Vista previa **de solo lectura** de las zonas de detección.
 *
 * Por qué no es un editor: un polígono de detección tiene hasta 10 vértices, la
 * cámara admite 4 polígonos, y lo que se escriba acaba en el equipo de un
 * cliente. Arrastrar vértices con el dedo en una pantalla de teléfono da una
 * precisión que no alcanza para eso, y una zona mal puesta no falla ruidosa:
 * deja de vigilar la puerta y nadie se entera hasta que hace falta. Un editor
 * táctil malo aquí sería un cascarón que aparenta funcionar — justo lo que este
 * proyecto está corrigiendo.
 *
 * Así que el teléfono **enseña** las zonas —para que el operador sepa contra
 * qué está ajustando la sensibilidad— y manda a la consola web a cambiarlas.
 * Catalogado `SOLO_LECTURA`, no `NATIVO`.
 *
 * El fondo es 16:9 vacío a propósito: no se pinta un fotograma de la cámara
 * porque este módulo no trae vídeo, y un marco falso daría a entender que lo
 * que se ve dentro es la escena real.
 */
@Composable
fun DetectionRegionPreview(
    regions: List<DetectionRegion>?,
    modifier: Modifier = Modifier,
) {
    val palette = listOf(
        Color(0xFF2563EB),
        Color(0xFF0D9488),
        Color(0xFFF97316),
        Color(0xFF9333EA),
    )

    Column(modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Canvas(
            Modifier
                .fillMaxWidth()
                .aspectRatio(16f / 9f)
                .clip(RoundedCornerShape(10.dp))
                .background(Color(0xFF0F172A)),
        ) {
            val w = size.width
            val h = size.height

            // Rejilla de tercios: da referencia de encuadre sin fingir imagen.
            val guide = Color.White.copy(alpha = 0.10f)
            for (i in 1..2) {
                val x = w * i / 3f
                val y = h * i / 3f
                drawLine(guide, Offset(x, 0f), Offset(x, h), strokeWidth = 1f)
                drawLine(guide, Offset(0f, y), Offset(w, y), strokeWidth = 1f)
            }

            if (regions.isNullOrEmpty()) {
                // Fotograma completo: el borde entero es la zona, y se dibuja
                // punteado porque no es una zona elegida, es la ausencia de una.
                drawRect(
                    color = Color.White.copy(alpha = 0.45f),
                    topLeft = Offset(2f, 2f),
                    size = androidx.compose.ui.geometry.Size(w - 4f, h - 4f),
                    style = Stroke(
                        width = 3f,
                        pathEffect = PathEffect.dashPathEffect(floatArrayOf(14f, 10f)),
                    ),
                )
                return@Canvas
            }

            regions.forEachIndexed { index, region ->
                if (region.size < 3) return@forEachIndexed
                val color = palette[index % palette.size]
                val path = Path().apply {
                    moveTo(region[0].x * w, region[0].y * h)
                    for (p in region.drop(1)) lineTo(p.x * w, p.y * h)
                    close()
                }
                drawPath(path, color.copy(alpha = 0.22f))
                drawPath(path, color, style = Stroke(width = 3f))
                for (p in region) {
                    drawCircle(color, radius = 5f, center = Offset(p.x * w, p.y * h))
                }
            }
        }

        Text(
            regionsSummary(regions),
            style = MaterialTheme.typography.bodySmall,
            color = NxColors.Muted,
        )
        NxStatusChip("Zonas: solo lectura · se editan en la consola web", NxTone.Info)
        Text(
            "Dibujar polígonos con el dedo no da la precisión que necesita un equipo en " +
                "producción: una zona mal puesta deja de vigilar sin avisar. Aquí se ven " +
                "para saber contra qué estás ajustando la sensibilidad.",
            style = MaterialTheme.typography.labelSmall,
            color = NxColors.Muted,
            modifier = Modifier.padding(bottom = 2.dp),
        )
    }
}
