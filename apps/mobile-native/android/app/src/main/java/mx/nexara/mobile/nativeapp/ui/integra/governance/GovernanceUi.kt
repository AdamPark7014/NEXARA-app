package mx.nexara.mobile.nativeapp.ui.integra.governance

import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import mx.nexara.mobile.nativeapp.ui.enterprise.NxColors
import mx.nexara.mobile.nativeapp.ui.enterprise.NxDimens

/**
 * Piezas comunes a las tres pantallas de gobierno (bitácora, notificaciones y
 * perfil). Los equivalentes de `IntegraScreens.kt` son privados de ese archivo,
 * así que se replican aquí en vez de abrirlos: ese archivo lo lleva otro turno.
 */

/**
 * Una línea de ficha: etiqueta arriba, valor abajo.
 *
 * `fuente` es la procedencia del dato — de qué endpoint o de qué tabla sale.
 * No es decoración: en la ficha de personas de la web se comprobó que un campo
 * sin origen se lee como si el sistema lo hubiera inventado.
 */
@Composable
fun FichaLinea(
    etiqueta: String,
    valor: String?,
    fuente: String? = null,
    monoespaciado: Boolean = false,
    vacio: String = "—",
) {
    Column(Modifier.fillMaxWidth().padding(vertical = 4.dp)) {
        Text(
            etiqueta,
            style = MaterialTheme.typography.labelSmall.copy(fontWeight = FontWeight.SemiBold),
            color = NxColors.Muted,
        )
        Text(
            valor?.takeIf { it.isNotBlank() } ?: vacio,
            style = if (monoespaciado) {
                MaterialTheme.typography.bodySmall.copy(fontFamily = FontFamily.Monospace)
            } else {
                MaterialTheme.typography.bodyMedium
            },
            color = NxColors.Slate,
        )
        if (!fuente.isNullOrBlank()) {
            Text(
                fuente,
                style = MaterialTheme.typography.labelSmall,
                color = NxColors.Muted,
            )
        }
    }
}

/**
 * Bloque de JSON completo, nunca recortado.
 *
 * Va en su propio `horizontalScroll` para que una línea larga no obligue a la
 * página entera a desplazarse de lado.
 */
@Composable
fun BloqueJson(titulo: String, json: String?) {
    if (json.isNullOrBlank()) return
    Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(4.dp)) {
        Text(
            titulo,
            style = MaterialTheme.typography.labelSmall.copy(fontWeight = FontWeight.SemiBold),
            color = NxColors.Muted,
        )
        Card(
            modifier = Modifier.fillMaxWidth(),
            shape = RoundedCornerShape(NxDimens.PanelRadius),
            colors = CardDefaults.cardColors(containerColor = NxColors.Surface),
        ) {
            Row(Modifier.horizontalScroll(rememberScrollState()).padding(12.dp)) {
                Text(
                    json,
                    style = MaterialTheme.typography.bodySmall.copy(fontFamily = FontFamily.Monospace),
                    color = NxColors.Slate,
                )
            }
        }
    }
}

/** Aviso corto en gris: lo que la pantalla NO puede hacer y por qué. */
@Composable
fun NotaAclaratoria(texto: String) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(NxDimens.PanelRadius),
        colors = CardDefaults.cardColors(containerColor = NxColors.InfoSoft),
    ) {
        Text(
            texto,
            modifier = Modifier.padding(12.dp),
            style = MaterialTheme.typography.bodySmall,
            color = NxColors.Slate,
        )
    }
}
