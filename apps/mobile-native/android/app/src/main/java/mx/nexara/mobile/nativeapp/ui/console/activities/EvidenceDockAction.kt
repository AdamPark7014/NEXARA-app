package mx.nexara.mobile.nativeapp.ui.console.activities

import androidx.compose.ui.graphics.vector.ImageVector

/**
 * El botón grande del dock inferior mientras el flujo de captura está en
 * pantalla (pestaña Evidencias). Lo publica `EvidenceCaptureFlow` con los
 * mismos cierres que usan sus botones de siempre —cámara, galería, PDF,
 * formulario— y el detalle lo pinta al alcance del pulgar. Así la lógica de
 * captura sigue en un solo sitio y el dock solo la repite donde se toca mejor.
 */
class EvidenceDockAction(
    val label: String,
    val enabled: Boolean,
    val icon: ImageVector?,
    /** Una línea bajo el dock: qué falta o qué pasa al tocar. */
    val hint: String?,
    val onPrimary: () -> Unit,
    /** Acción secundaria opcional (p. ej. «Adjuntar»). */
    val secondaryLabel: String? = null,
    val secondaryIcon: ImageVector? = null,
    val onSecondary: (() -> Unit)? = null,
) {
    /** Mismo texto, estado y ayuda: no hace falta volver a pintar el dock. */
    fun sameLook(other: EvidenceDockAction?): Boolean =
        other != null &&
            label == other.label &&
            enabled == other.enabled &&
            hint == other.hint &&
            secondaryLabel == other.secondaryLabel &&
            (onSecondary == null) == (other.onSecondary == null)
}
