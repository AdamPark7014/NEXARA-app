package mx.nexara.mobile.nativeapp.ui.enterprise

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.Assignment
import androidx.compose.material.icons.automirrored.outlined.Chat
import androidx.compose.material.icons.automirrored.outlined.Login
import androidx.compose.material.icons.automirrored.outlined.Logout
import androidx.compose.material.icons.automirrored.outlined.Send
import androidx.compose.material.icons.automirrored.outlined.Undo
import androidx.compose.material.icons.outlined.Apartment
import androidx.compose.material.icons.outlined.Architecture
import androidx.compose.material.icons.outlined.AssignmentInd
import androidx.compose.material.icons.outlined.Build
import androidx.compose.material.icons.outlined.CalendarMonth
import androidx.compose.material.icons.outlined.Check
import androidx.compose.material.icons.outlined.Construction
import androidx.compose.material.icons.outlined.Description
import androidx.compose.material.icons.outlined.Edit
import androidx.compose.material.icons.outlined.EditNote
import androidx.compose.material.icons.outlined.Engineering
import androidx.compose.material.icons.outlined.EventAvailable
import androidx.compose.material.icons.outlined.Folder
import androidx.compose.material.icons.outlined.Groups
import androidx.compose.material.icons.outlined.Handshake
import androidx.compose.material.icons.outlined.Handyman
import androidx.compose.material.icons.outlined.HighlightOff
import androidx.compose.material.icons.outlined.HourglassTop
import androidx.compose.material.icons.outlined.Inventory2
import androidx.compose.material.icons.outlined.LocalShipping
import androidx.compose.material.icons.outlined.Notifications
import androidx.compose.material.icons.outlined.Person
import androidx.compose.material.icons.outlined.PhotoCamera
import androidx.compose.material.icons.outlined.PushPin
import androidx.compose.material.icons.outlined.RateReview
import androidx.compose.material.icons.outlined.Replay
import androidx.compose.material.icons.outlined.Restaurant
import androidx.compose.material.icons.outlined.School
import androidx.compose.material.icons.outlined.ShoppingCart
import androidx.compose.material.icons.outlined.TaskAlt
import androidx.compose.material.icons.outlined.Work
import androidx.compose.material3.Icon
import androidx.compose.material3.LocalContentColor
import androidx.compose.material3.LocalTextStyle
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.graphics.takeOrElse
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.TextUnit
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.isSpecified
import androidx.compose.ui.unit.sp
import androidx.compose.ui.unit.takeOrElse

/**
 * Íconos semánticos de NEXARA (Material Symbols), en lugar de emojis.
 *
 * Las reglas puras (probadas en JVM: CoreActivityRules, CoreActivityKinds,
 * ComidasRules, ClientSectors) guardan un [NxGlyph]; la UI lo pinta con [icon].
 * Los textos nunca empiezan con emoji: el ícono va aparte.
 */
enum class NxGlyph {
    // Tipos de actividad
    TASK, PROJECT, WORKSITE, SERVICE, COMMERCIAL, ACTIVITY,

    // Subtipos de tarea
    SURVEY, PICKUP, DELIVERY, MEETING, PURCHASE, EQUIPMENT_PREP, PROCEDURE, TRAINING, DOCUMENTATION, OTHER,

    // Estados y flujo de evidencias
    APPROVED, DONE, IN_PROGRESS, WAITING, TO_REVIEW, RETURNED, CORRECTION, REJECTED,
    DISPATCH, SUPPORT, EXECUTES, ENTRY, EXIT, PHOTO,

    // Comidas, clientes y módulos
    MEAL, CORPORATE, CLIENT, CHAT, ATTENDANCE, PERSON, NOTIFICATIONS,
}

val NxGlyph.icon: ImageVector
    get() = when (this) {
        NxGlyph.TASK -> Icons.Outlined.TaskAlt
        NxGlyph.PROJECT -> Icons.Outlined.Folder
        NxGlyph.WORKSITE -> Icons.Outlined.Construction
        NxGlyph.SERVICE -> Icons.Outlined.Handyman
        NxGlyph.COMMERCIAL -> Icons.Outlined.Work
        NxGlyph.ACTIVITY -> Icons.Outlined.PushPin
        NxGlyph.SURVEY -> Icons.Outlined.Architecture
        NxGlyph.PICKUP -> Icons.Outlined.Inventory2
        NxGlyph.DELIVERY -> Icons.Outlined.LocalShipping
        NxGlyph.MEETING -> Icons.Outlined.Groups
        NxGlyph.PURCHASE -> Icons.Outlined.ShoppingCart
        NxGlyph.EQUIPMENT_PREP -> Icons.Outlined.Build
        NxGlyph.PROCEDURE -> Icons.Outlined.Description
        NxGlyph.TRAINING -> Icons.Outlined.School
        NxGlyph.DOCUMENTATION -> Icons.Outlined.EditNote
        NxGlyph.OTHER -> Icons.Outlined.Edit
        NxGlyph.APPROVED -> Icons.Outlined.TaskAlt
        NxGlyph.DONE -> Icons.Outlined.Check
        NxGlyph.IN_PROGRESS -> Icons.Outlined.HourglassTop
        NxGlyph.WAITING -> Icons.Outlined.HourglassTop
        NxGlyph.TO_REVIEW -> Icons.Outlined.RateReview
        NxGlyph.RETURNED -> Icons.AutoMirrored.Outlined.Undo
        NxGlyph.CORRECTION -> Icons.Outlined.Replay
        NxGlyph.REJECTED -> Icons.Outlined.HighlightOff
        NxGlyph.DISPATCH -> Icons.AutoMirrored.Outlined.Send
        NxGlyph.SUPPORT -> Icons.Outlined.Handshake
        NxGlyph.EXECUTES -> Icons.Outlined.Engineering
        NxGlyph.ENTRY -> Icons.AutoMirrored.Outlined.Login
        NxGlyph.EXIT -> Icons.AutoMirrored.Outlined.Logout
        NxGlyph.PHOTO -> Icons.Outlined.PhotoCamera
        NxGlyph.MEAL -> Icons.Outlined.Restaurant
        NxGlyph.CORPORATE -> Icons.Outlined.Apartment
        NxGlyph.CLIENT -> Icons.Outlined.Handshake
        NxGlyph.CHAT -> Icons.AutoMirrored.Outlined.Chat
        NxGlyph.ATTENDANCE -> Icons.Outlined.EventAvailable
        NxGlyph.PERSON -> Icons.Outlined.Person
        NxGlyph.NOTIFICATIONS -> Icons.Outlined.Notifications
    }

/** Íconos que no dependen de un glifo de reglas (p. ej. filas de calendario). */
object NxIcons {
    val Calendar: ImageVector get() = Icons.Outlined.CalendarMonth
    val Assignment: ImageVector get() = Icons.AutoMirrored.Outlined.Assignment
}

/**
 * Ícono Material dentro de un círculo (o la forma que se pida) con fondo suave:
 * el reemplazo «pro» de los emojis grandes en tarjetas, estados vacíos y encabezados.
 */
@Composable
fun NxIconBadge(
    icon: ImageVector,
    modifier: Modifier = Modifier,
    tint: Color = NxColors.Brand,
    background: Color = NxColors.BrandSoft,
    size: Dp = 40.dp,
    shape: Shape = CircleShape,
    contentDescription: String? = null,
) {
    Box(
        modifier = modifier
            .size(size)
            .background(background, shape),
        contentAlignment = Alignment.Center,
    ) {
        Icon(
            imageVector = icon,
            contentDescription = contentDescription,
            tint = tint,
            modifier = Modifier.size(size * 0.55f),
        )
    }
}

/**
 * Ícono + texto en una fila (chips, botones, renglones de metadatos). Sin color
 * explícito hereda el de su contenedor (p. ej. el contenido de un Button).
 */
@Composable
fun NxIconText(
    text: String,
    icon: ImageVector?,
    modifier: Modifier = Modifier,
    color: Color = Color.Unspecified,
    iconTint: Color = Color.Unspecified,
    fontSize: TextUnit = TextUnit.Unspecified,
    fontWeight: FontWeight? = null,
    style: TextStyle = LocalTextStyle.current,
    iconSize: Dp = Dp.Unspecified,
    spacing: Dp = 6.dp,
    maxLines: Int = Int.MAX_VALUE,
    overflow: TextOverflow = TextOverflow.Clip,
    lineHeight: TextUnit = TextUnit.Unspecified,
    verticalAlignment: Alignment.Vertical = Alignment.CenterVertically,
    trailingIcon: ImageVector? = null,
) {
    val textColor = color.takeOrElse { style.color.takeOrElse { LocalContentColor.current } }
    val resolvedSize = when {
        fontSize.isSpecified -> fontSize
        style.fontSize.isSpecified -> style.fontSize
        else -> 14.sp
    }
    Row(
        modifier = modifier,
        verticalAlignment = verticalAlignment,
        horizontalArrangement = Arrangement.spacedBy(spacing),
    ) {
        val glyphSize = iconSize.takeOrElse { (resolvedSize.value * 1.25f).dp }
        if (icon != null) {
            Icon(
                imageVector = icon,
                contentDescription = null,
                tint = iconTint.takeOrElse { textColor },
                modifier = Modifier.size(glyphSize),
            )
        }
        Text(
            text,
            color = textColor,
            fontSize = fontSize,
            fontWeight = fontWeight,
            style = style,
            maxLines = maxLines,
            overflow = overflow,
            lineHeight = lineHeight,
            modifier = if (trailingIcon != null) Modifier.weight(1f, fill = false) else Modifier,
        )
        if (trailingIcon != null) {
            Icon(
                imageVector = trailingIcon,
                contentDescription = null,
                tint = iconTint.takeOrElse { textColor },
                modifier = Modifier.size(glyphSize),
            )
        }
    }
}
