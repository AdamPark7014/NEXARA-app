package mx.nexara.mobile.nativeapp.ui.enterprise

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.CloudOff
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.core.view.WindowCompat
import mx.nexara.mobile.nativeapp.ui.console.viaticos.Dinero
import java.time.Instant
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.OffsetDateTime
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.time.format.DateTimeFormatterBuilder
import java.time.temporal.ChronoField
import java.util.Locale

/** Espaciado en múltiplos de 4 dp; los márgenes de pantalla son [ScreenH]. */
object NxSpacing {
    val Xxs = 2.dp
    val Xs = 4.dp
    val S = 8.dp
    val M = 12.dp
    val L = 16.dp
    val Xl = 20.dp
    val Xxl = 24.dp
    val Xxxl = 32.dp

    /** Margen lateral de todas las pantallas. */
    val ScreenH = 16.dp

    /** Separación entre tarjetas de una lista. */
    val ListGap = 10.dp

    /** Zona táctil mínima (Material): botones, filas tocables, iconos. */
    val TouchTarget = 48.dp

    /** Relleno estándar de una lista de pantalla completa. */
    val ListPadding = PaddingValues(horizontal = 16.dp, vertical = 12.dp)
}

object NxElevation {
    val None = 0.dp
    val Low = 1.dp
    val Card = 2.dp
    val Raised = 6.dp
}

/**
 * Las barras superiores de la app son azul marca: los iconos de la barra de
 * estado tienen que ser claros mientras esa barra está en pantalla.
 */
@Composable
fun NxLightStatusBarIcons() {
    val view = LocalView.current
    if (view.isInEditMode) return
    DisposableEffect(view) {
        val window = (view.context as? android.app.Activity)?.window
        val controller = window?.let { WindowCompat.getInsetsController(it, view) }
        val previous = controller?.isAppearanceLightStatusBars
        controller?.isAppearanceLightStatusBars = false
        onDispose {
            if (controller != null && previous != null) controller.isAppearanceLightStatusBars = previous
        }
    }
}

// ── Botones ─────────────────────────────────────────────────────────────────

/** Acción principal de la pantalla: 48 dp de alto, ancho completo por omisión. */
@Composable
fun NxPrimaryButton(
    text: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier.fillMaxWidth(),
    enabled: Boolean = true,
    loading: Boolean = false,
    icon: ImageVector? = null,
    containerColor: Color = NxColors.Brand,
) {
    Button(
        onClick = onClick,
        enabled = enabled && !loading,
        modifier = modifier.heightIn(min = NxSpacing.TouchTarget),
        shape = RoundedCornerShape(NxUi.RadiusLg),
        colors = ButtonDefaults.buttonColors(containerColor = containerColor, contentColor = Color.White),
        contentPadding = PaddingValues(horizontal = 20.dp, vertical = 12.dp),
    ) {
        NxButtonContent(text = text, loading = loading, icon = icon, progressColor = Color.White)
    }
}

/** Acción secundaria: contorno, misma altura que [NxPrimaryButton]. */
@Composable
fun NxSecondaryButton(
    text: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    loading: Boolean = false,
    icon: ImageVector? = null,
    contentColor: Color = NxColors.Brand,
) {
    OutlinedButton(
        onClick = onClick,
        enabled = enabled && !loading,
        modifier = modifier.heightIn(min = NxSpacing.TouchTarget),
        shape = RoundedCornerShape(NxUi.RadiusLg),
        colors = ButtonDefaults.outlinedButtonColors(contentColor = contentColor),
        contentPadding = PaddingValues(horizontal = 18.dp, vertical = 12.dp),
    ) {
        NxButtonContent(text = text, loading = loading, icon = icon, progressColor = contentColor)
    }
}

@Composable
private fun NxButtonContent(text: String, loading: Boolean, icon: ImageVector?, progressColor: Color) {
    if (loading) {
        CircularProgressIndicator(
            modifier = Modifier.size(18.dp),
            strokeWidth = 2.dp,
            color = progressColor,
        )
        Spacer(Modifier.width(10.dp))
    } else if (icon != null) {
        Icon(icon, contentDescription = null, modifier = Modifier.size(18.dp))
        Spacer(Modifier.width(8.dp))
    }
    Text(text, style = MaterialTheme.typography.labelLarge, maxLines = 1)
}

// ── Estados de pantalla ─────────────────────────────────────────────────────

/**
 * La carga falló y no hay nada que enseñar: icono, qué pasó y «Reintentar».
 * Si ya había datos, usar [NxRefreshErrorBanner] encima de la lista.
 */
@Composable
fun NxErrorState(
    message: String?,
    modifier: Modifier = Modifier,
    title: String = "No se pudo cargar",
    onRetry: (() -> Unit)? = null,
) {
    Column(
        modifier = modifier
            .fillMaxWidth()
            .padding(horizontal = 24.dp, vertical = 40.dp)
            .semantics { liveRegion = LiveRegionMode.Polite },
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Box(
            modifier = Modifier
                .size(56.dp)
                .background(NxColors.DangerSoft, CircleShape),
            contentAlignment = Alignment.Center,
        ) {
            Icon(Icons.Default.CloudOff, contentDescription = null, tint = NxColors.Danger, modifier = Modifier.size(26.dp))
        }
        Text(
            title,
            style = MaterialTheme.typography.titleMedium,
            color = NxColors.Slate,
            textAlign = TextAlign.Center,
        )
        Text(
            nxFriendlyError(message),
            style = MaterialTheme.typography.bodyMedium,
            color = NxColors.Muted,
            textAlign = TextAlign.Center,
        )
        if (onRetry != null) {
            Spacer(Modifier.size(4.dp))
            NxPrimaryButton(
                text = "Reintentar",
                onClick = onRetry,
                icon = Icons.Default.Refresh,
                modifier = Modifier,
            )
        }
    }
}

/**
 * Falló una recarga pero la pantalla ya tiene datos: se avisa sin borrarlos.
 */
@Composable
fun NxRefreshErrorBanner(
    message: String?,
    modifier: Modifier = Modifier,
    onRetry: (() -> Unit)? = null,
    onDismiss: (() -> Unit)? = null,
) {
    Surface(
        modifier = modifier
            .fillMaxWidth()
            .semantics { liveRegion = LiveRegionMode.Polite },
        color = NxColors.WarningSoft,
        shape = RoundedCornerShape(NxUi.RadiusLg),
    ) {
        Row(
            modifier = Modifier.padding(start = 14.dp, end = 4.dp, top = 4.dp, bottom = 4.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Icon(Icons.Default.CloudOff, contentDescription = null, tint = Color(0xFFB45309), modifier = Modifier.size(18.dp))
            Spacer(Modifier.width(10.dp))
            Text(
                "No se pudo actualizar. ${nxFriendlyError(message)}",
                style = MaterialTheme.typography.bodySmall,
                color = Color(0xFF78350F),
                modifier = Modifier.weight(1f).padding(vertical = 8.dp),
            )
            if (onRetry != null) {
                TextButton(onClick = onRetry) {
                    Text("Reintentar", fontWeight = FontWeight.Bold, color = Color(0xFFB45309))
                }
            }
            if (onDismiss != null) {
                IconButton(onClick = onDismiss) {
                    Icon(Icons.Default.Close, contentDescription = "Cerrar aviso", tint = Color(0xFF78350F))
                }
            }
        }
    }
}

/** Mensajes técnicos de red → frase que entiende un técnico en campo. */
fun nxFriendlyError(raw: String?): String {
    val msg = raw?.trim().orEmpty()
    if (msg.isEmpty()) return "Revisa tu conexión e inténtalo de nuevo."
    val lower = msg.lowercase(Locale.ROOT)
    return when {
        "unable to resolve host" in lower || "failed to connect" in lower ||
            "no address associated" in lower || "network is unreachable" in lower ->
            "Sin conexión a internet. Revisa tus datos o Wi‑Fi."
        "timeout" in lower || "timed out" in lower -> "El servidor tardó demasiado. Inténtalo de nuevo."
        "http 401" in lower || "unauthorized" in lower -> "Tu sesión expiró. Vuelve a iniciar sesión."
        "http 403" in lower || "forbidden" in lower -> "No tienes permiso para ver esto."
        "http 404" in lower -> "No se encontró la información."
        lower.startsWith("http 5") || "internal server error" in lower -> "El servidor tuvo un problema. Inténtalo en un momento."
        else -> msg
    }
}

// ── Formatos es-MX ──────────────────────────────────────────────────────────

object NxFormat {
    private val ES_MX: Locale = Locale.forLanguageTag("es-MX")

    /*
     * Abreviaturas fijas: `MMM`/`EEE` de la JVM y de Android salen de CLDR, y cada
     * versión (JDK 17 vs 21, Android 8 vs 14) da «sep», «sept» o «sep.». La misma
     * fecha no puede verse distinto según el teléfono ni tumbar pruebas en CI.
     */
    private val MESES_CORTOS: Map<Long, String> = listOf(
        "ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sept", "oct", "nov", "dic",
    ).mapIndexed { i, mes -> (i + 1).toLong() to mes }.toMap()
    private val DIAS_CORTOS: Map<Long, String> = listOf(
        "lun", "mar", "mié", "jue", "vie", "sáb", "dom",
    ).mapIndexed { i, dia -> (i + 1).toLong() to dia }.toMap()
    private val TOKEN_CORTO = Regex("(?<![ML])MMM(?!M)|(?<!E)EEE(?!E)")

    /**
     * Igual que `DateTimeFormatter.ofPattern(pattern, es-MX)`, pero `MMM` y `EEE`
     * usan las abreviaturas fijas de arriba. Úsalo en todo formato con mes o día corto.
     */
    fun patron(pattern: String): DateTimeFormatter {
        val builder = DateTimeFormatterBuilder()
        var desde = 0
        for (token in TOKEN_CORTO.findAll(pattern)) {
            if (token.range.first > desde) builder.appendPattern(pattern.substring(desde, token.range.first))
            if (token.value == "MMM") {
                builder.appendText(ChronoField.MONTH_OF_YEAR, MESES_CORTOS)
            } else {
                builder.appendText(ChronoField.DAY_OF_WEEK, DIAS_CORTOS)
            }
            desde = token.range.last + 1
        }
        if (desde < pattern.length) builder.appendPattern(pattern.substring(desde))
        return builder.toFormatter(ES_MX)
    }

    private val DIA: DateTimeFormatter = patron("d MMM yyyy")
    private val DIA_HORA: DateTimeFormatter = patron("d MMM yyyy, HH:mm")

    /** `1234.5` → `$1,234.50`; con otra moneda la agrega al final (`$10.00 USD`). */
    fun money(amount: Any?, currency: String? = "MXN"): String {
        val value = when (amount) {
            null -> return "—"
            is Number -> amount.toDouble()
            else -> amount.toString().trim().replace(",", "").toDoubleOrNull() ?: return "—"
        }
        if (!value.isFinite()) return "—"
        val text = Dinero.pesos(Dinero.deApi(value))
        val cur = currency?.trim()?.uppercase(Locale.ROOT)
        return if (cur.isNullOrEmpty() || cur == "MXN") text else "$text $cur"
    }

    /** ISO (`2026-09-26` o con hora) → `26 sep 2026`; texto no reconocido se devuelve igual. */
    fun date(raw: Any?): String {
        val s = raw?.toString()?.trim().orEmpty()
        if (s.isEmpty() || s == "null") return "—"
        return parseLocal(s)?.format(DIA) ?: s
    }

    /** ISO con hora → `26 sep 2026, 14:30` en la zona del teléfono. */
    fun dateTime(raw: Any?): String {
        val s = raw?.toString()?.trim().orEmpty()
        if (s.isEmpty() || s == "null") return "—"
        if (s.length <= 10) return date(s)
        return parseLocal(s)?.format(DIA_HORA) ?: s
    }

    private fun parseLocal(s: String): LocalDateTime? {
        val zone = ZoneId.systemDefault()
        return runCatching { Instant.parse(s).atZone(zone).toLocalDateTime() }.getOrNull()
            ?: runCatching { OffsetDateTime.parse(s).atZoneSameInstant(zone).toLocalDateTime() }.getOrNull()
            ?: runCatching { LocalDateTime.parse(s) }.getOrNull()
            ?: runCatching { LocalDate.parse(s.take(10)).atStartOfDay() }.getOrNull()
    }
}

// ── Estatus del API → etiqueta en español ───────────────────────────────────

/**
 * Traduce los estatus genéricos del API (`PENDING`, `IN_PROGRESS`, `PAID`…)
 * para no enseñar nunca un enum crudo. Lo que no reconoce lo devuelve legible.
 */
object NxStatusLabels {
    private val LABELS: Map<String, String> = mapOf(
        "DRAFT" to "Borrador",
        "BORRADOR" to "Borrador",
        "PENDING" to "Pendiente",
        "PENDIENTE" to "Pendiente",
        "OPEN" to "Abierto",
        "ABIERTO" to "Abierto",
        "NEW" to "Nuevo",
        "NUEVO" to "Nuevo",
        "ASSIGNED" to "Asignado",
        "IN_PROGRESS" to "En curso",
        "EN_PROCESO" to "En curso",
        "EN_CURSO" to "En curso",
        "ACTIVE" to "Activo",
        "ACTIVO" to "Activo",
        "ON_HOLD" to "En pausa",
        "PAUSED" to "En pausa",
        "INACTIVE" to "Inactivo",
        "INACTIVO" to "Inactivo",
        "PLANNING" to "En planeación",
        "SENT" to "Enviada",
        "ENVIADA" to "Enviada",
        "ISSUED" to "Emitida",
        "STAMPED" to "Timbrada",
        "ACCEPTED" to "Aceptada",
        "APPROVED" to "Aprobado",
        "APROBADO" to "Aprobado",
        "AUTORIZADO" to "Autorizado",
        "REJECTED" to "Rechazado",
        "RECHAZADO" to "Rechazado",
        "PAID" to "Pagada",
        "PAGADO" to "Pagado",
        "PARTIALLY_PAID" to "Pago parcial",
        "PARTIAL" to "Parcial",
        "OVERDUE" to "Vencida",
        "VENCIDO" to "Vencido",
        "EXPIRED" to "Vencida",
        "RESOLVED" to "Resuelto",
        "RESUELTO" to "Resuelto",
        "DONE" to "Terminado",
        "COMPLETED" to "Terminado",
        "FINISHED" to "Terminado",
        "TERMINADO" to "Terminado",
        "FINALIZADO" to "Terminado",
        "CLOSED" to "Cerrado",
        "CERRADO" to "Cerrado",
        "CANCELLED" to "Cancelado",
        "CANCELED" to "Cancelado",
        "CANCELADO" to "Cancelado",
        "VOID" to "Anulada",
        "SCHEDULED" to "Programada",
        "PROGRAMADO" to "Programado",
        "CONFIRMED" to "Confirmada",
        "WAITING_CLIENT" to "Esperando al cliente",
        "WAITING" to "En espera",
    )

    fun label(raw: String?): String {
        val s = raw?.trim().orEmpty()
        if (s.isEmpty() || s == "null") return "Sin estatus"
        val key = s.uppercase(Locale.ROOT).replace(' ', '_').replace('-', '_')
        LABELS[key]?.let { return it }
        val human = s.replace('_', ' ').lowercase(Locale.forLanguageTag("es-MX"))
        return human.replaceFirstChar { it.titlecase(Locale.forLanguageTag("es-MX")) }
    }

    /** `HIGH` / `ALTA` → «Alta»; `null` si no hay prioridad. */
    fun priority(raw: String?): String? {
        val key = raw?.trim()?.uppercase(Locale.ROOT).orEmpty()
        return when (key) {
            "", "—", "NULL" -> null
            "LOW", "BAJA" -> "Baja"
            "MEDIUM", "NORMAL", "MEDIA" -> "Media"
            "HIGH", "ALTA" -> "Alta"
            "URGENT", "URGENTE", "CRITICAL", "CRITICA", "CRÍTICA" -> "Urgente"
            else -> label(raw)
        }
    }

    fun tone(raw: String?): NxTone {
        val key = raw?.trim()?.uppercase(Locale.ROOT)?.replace(' ', '_')?.replace('-', '_').orEmpty()
        return when (key) {
            "PAID", "PAGADO", "APPROVED", "APROBADO", "AUTORIZADO", "ACCEPTED", "DONE", "COMPLETED",
            "FINISHED", "TERMINADO", "FINALIZADO", "RESOLVED", "RESUELTO", "ACTIVE", "ACTIVO",
            "STAMPED", "CONFIRMED" -> NxTone.Success
            "REJECTED", "RECHAZADO", "OVERDUE", "VENCIDO", "EXPIRED", "CANCELLED", "CANCELED",
            "CANCELADO", "VOID" -> NxTone.Danger
            "PENDING", "PENDIENTE", "ON_HOLD", "PAUSED", "WAITING", "WAITING_CLIENT",
            "PARTIALLY_PAID", "PARTIAL" -> NxTone.Warning
            "IN_PROGRESS", "EN_PROCESO", "EN_CURSO", "OPEN", "ABIERTO", "ASSIGNED", "SENT",
            "ENVIADA", "ISSUED", "SCHEDULED", "PROGRAMADO", "NEW", "NUEVO", "PLANNING" -> NxTone.Info
            else -> NxTone.Neutral
        }
    }
}
