package mx.nexara.mobile.nativeapp.ui.console.more

import androidx.compose.foundation.background
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.CloudOff
import androidx.compose.material.icons.outlined.Info
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FilterChipDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import mx.nexara.mobile.nativeapp.ui.console.more.KpisEquipoRules.Semaforo
import mx.nexara.mobile.nativeapp.ui.enterprise.NxColors
import mx.nexara.mobile.nativeapp.ui.enterprise.NxDimens
import mx.nexara.mobile.nativeapp.ui.enterprise.NxStatusChip
import mx.nexara.mobile.nativeapp.ui.enterprise.NxTone
import mx.nexara.mobile.nativeapp.ui.enterprise.bg
import mx.nexara.mobile.nativeapp.ui.enterprise.fg

/**
 * Piezas que comparten las cuatro pantallas de consulta de «Más» (KPIs del
 * equipo, organigrama, proyectos y almacén). Material 3 de arriba abajo: nada de
 * calcar aquí lo que se hizo en SwiftUI.
 *
 * Los tamaños de toque salen de los propios componentes de Material: un
 * `FilterChip` se dibuja de 32 dp pero Compose le pone alrededor el área de
 * 48 dp (`minimumInteractiveComponentSize`), que es lo que el dedo necesita.
 * Los textos nunca llevan `sp` fijos ni alturas cerradas: con la letra grande
 * del sistema las tarjetas crecen en vez de cortar la frase.
 */

/** El semáforo del servidor con el tono del design system. */
fun Semaforo.tono(): NxTone = when (this) {
    Semaforo.VERDE -> NxTone.Success
    Semaforo.AMARILLO -> NxTone.Warning
    Semaforo.ROJO -> NxTone.Danger
    Semaforo.SIN_DATOS -> NxTone.Neutral
}

/**
 * Cinta de «esto que ves es de hace un momento».
 *
 * Aparece cuando un refresco falla y los datos viejos siguen en pantalla. Es lo
 * contrario de vaciar la lista: dice la verdad sin quitarle a nadie lo que
 * estaba leyendo.
 */
@Composable
fun MoreAvisoDesactualizado(
    mensaje: String,
    onCerrar: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Card(
        modifier = modifier.fillMaxWidth(),
        shape = RoundedCornerShape(NxDimens.PanelRadius),
        colors = CardDefaults.cardColors(containerColor = NxColors.WarningSoft),
    ) {
        Row(
            modifier = Modifier.fillMaxWidth().padding(start = 14.dp, top = 10.dp, bottom = 10.dp, end = 4.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            Icon(
                Icons.Default.CloudOff,
                contentDescription = null,
                tint = NxColors.Warning,
                modifier = Modifier.size(20.dp),
            )
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    "Sigues viendo lo último que se pudo cargar",
                    style = MaterialTheme.typography.bodySmall.copy(fontWeight = FontWeight.SemiBold),
                    color = NxColors.Slate,
                )
                Text(mensaje, style = MaterialTheme.typography.labelSmall, color = NxColors.Muted)
            }
            IconButton(onClick = onCerrar) {
                Icon(
                    Icons.Default.Close,
                    contentDescription = "Ocultar el aviso",
                    tint = NxColors.Muted,
                    modifier = Modifier.size(18.dp),
                )
            }
        }
    }
}

/**
 * Lo que esta pantalla NO hace, al pie y sin botón.
 *
 * Es el reemplazo del «Disponible pronto — ábrelo en la web»: aquí se dice qué
 * falta y dónde se hace, pero no se echa a nadie al navegador a volver a iniciar
 * sesión.
 */
@Composable
fun MoreNotaDeAlcance(texto: String, modifier: Modifier = Modifier) {
    Row(
        modifier = modifier.fillMaxWidth().padding(horizontal = 4.dp, vertical = 8.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        verticalAlignment = Alignment.Top,
    ) {
        Icon(
            Icons.Outlined.Info,
            contentDescription = null,
            tint = NxColors.Muted,
            modifier = Modifier.size(16.dp),
        )
        Text(
            texto,
            style = MaterialTheme.typography.labelMedium,
            color = NxColors.Muted,
            modifier = Modifier.weight(1f),
        )
    }
}

/** Una pastilla de filtro con su cuenta: «Necesitan atención · 3». */
data class MorePastilla(
    val etiqueta: String,
    val conteo: Int? = null,
    val seleccionada: Boolean = false,
    val onClick: () -> Unit,
)

/**
 * Fila de pastillas que se desplaza en horizontal. Con cuatro filtros y letra
 * grande no caben en el ancho, y partirlas en dos renglones mueve la lista hacia
 * abajo cada vez que cambia el texto.
 */
@Composable
fun MoreFilaDePastillas(
    pastillas: List<MorePastilla>,
    modifier: Modifier = Modifier,
) {
    Row(
        modifier = modifier
            .fillMaxWidth()
            .horizontalScroll(rememberScrollState())
            .padding(horizontal = 2.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        pastillas.forEach { pastilla ->
            FilterChip(
                selected = pastilla.seleccionada,
                onClick = pastilla.onClick,
                label = {
                    Text(
                        if (pastilla.conteo != null) "${pastilla.etiqueta} · ${pastilla.conteo}" else pastilla.etiqueta,
                        maxLines = 1,
                    )
                },
                colors = FilterChipDefaults.filterChipColors(
                    selectedContainerColor = NxColors.BrandSoft,
                    selectedLabelColor = NxColors.BrandDark,
                ),
            )
        }
    }
}

/**
 * Un número con su etiqueta, su pie y su color de semáforo.
 *
 * El color nunca va solo: el valor y el pie dicen lo mismo con palabras, para
 * quien no distingue el verde del rojo.
 */
@Composable
fun MoreDatoCard(
    dato: KpisEquipoRules.Dato,
    modifier: Modifier = Modifier,
) {
    val tono = dato.tono.tono()
    Card(
        modifier = modifier.semantics {
            contentDescription = "${dato.etiqueta}: ${dato.valor}. ${dato.pie}"
        },
        shape = RoundedCornerShape(NxDimens.PanelRadius),
        colors = CardDefaults.cardColors(containerColor = NxColors.Card),
        elevation = CardDefaults.cardElevation(NxDimens.PanelElevation),
    ) {
        Column(
            modifier = Modifier.padding(14.dp),
            verticalArrangement = Arrangement.spacedBy(4.dp),
        ) {
            Text(dato.etiqueta, style = MaterialTheme.typography.labelMedium, color = NxColors.Muted)
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                Box(
                    modifier = Modifier
                        .size(8.dp)
                        .clip(RoundedCornerShape(4.dp))
                        .background(tono.fg()),
                )
                Text(
                    dato.valor,
                    style = MaterialTheme.typography.headlineSmall.copy(fontWeight = FontWeight.Bold),
                    color = NxColors.Slate,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
            Text(dato.pie, style = MaterialTheme.typography.labelSmall, color = NxColors.Muted)
        }
    }
}

/** Los datos en rejilla de dos columnas: lo que cabe sin apretar en 360 dp. */
@Composable
fun MoreRejillaDeDatos(
    datos: List<KpisEquipoRules.Dato>,
    modifier: Modifier = Modifier,
    columnas: Int = 2,
) {
    Column(modifier = modifier, verticalArrangement = Arrangement.spacedBy(10.dp)) {
        datos.chunked(columnas).forEach { fila ->
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                fila.forEach { dato -> MoreDatoCard(dato, modifier = Modifier.weight(1f)) }
                repeat(columnas - fila.size) { Spacer(Modifier.weight(1f)) }
            }
        }
    }
}

/**
 * Barra de avance con su porcentaje. [progreso] `null` = desconocido, que no es
 * cero: se dibuja una barra vacía en gris y el texto lo dice.
 */
@Composable
fun MoreBarra(
    progreso: Float?,
    etiqueta: String,
    tono: NxTone = NxTone.Brand,
    modifier: Modifier = Modifier,
) {
    Column(modifier = modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(4.dp)) {
        LinearProgressIndicator(
            progress = { progreso?.coerceIn(0f, 1f) ?: 0f },
            modifier = Modifier
                .fillMaxWidth()
                .height(8.dp)
                .clip(RoundedCornerShape(4.dp))
                // El valor ya se dice con palabras en la etiqueta de abajo.
                .clearAndSetSemantics { },
            color = if (progreso == null) NxColors.Muted else tono.fg(),
            trackColor = tono.bg(),
        )
        Text(etiqueta, style = MaterialTheme.typography.labelSmall, color = NxColors.Muted)
    }
}

/** Chip de semáforo con su palabra; el color solo acompaña. */
@Composable
fun MoreChipSemaforo(semaforo: Semaforo, etiqueta: String = semaforo.etiqueta) {
    NxStatusChip(etiqueta, semaforo.tono())
}

/** Separación uniforme entre bloques de una pantalla de consulta. */
@Composable
fun MoreEspacio(alto: Int = 12) {
    Spacer(Modifier.height(alto.dp))
}

/** Cabecera de un bloque dentro de la lista, con su cuenta a la derecha. */
@Composable
fun MoreCabecera(
    titulo: String,
    subtitulo: String? = null,
    trailing: String? = null,
    modifier: Modifier = Modifier,
) {
    Row(
        modifier = modifier.fillMaxWidth().padding(horizontal = 2.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Column(modifier = Modifier.weight(1f)) {
            Text(
                titulo,
                style = MaterialTheme.typography.titleSmall.copy(fontWeight = FontWeight.Bold),
                color = NxColors.Slate,
            )
            if (!subtitulo.isNullOrBlank()) {
                Text(subtitulo, style = MaterialTheme.typography.labelSmall, color = NxColors.Muted)
            }
        }
        if (!trailing.isNullOrBlank()) {
            Text(trailing, style = MaterialTheme.typography.labelMedium, color = NxColors.Muted)
        }
    }
}

/** Tarjeta blanca estándar de estas pantallas, con o sin toque. */
@Composable
fun MoreTarjeta(
    modifier: Modifier = Modifier,
    onClick: (() -> Unit)? = null,
    contenido: @Composable ColumnScope.() -> Unit,
) {
    val shape = RoundedCornerShape(NxDimens.PanelRadius)
    val colors = CardDefaults.cardColors(containerColor = NxColors.Card)
    val elevation = CardDefaults.cardElevation(NxDimens.PanelElevation)
    if (onClick != null) {
        Card(onClick = onClick, modifier = modifier.fillMaxWidth(), shape = shape, colors = colors, elevation = elevation) {
            Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp), content = contenido)
        }
    } else {
        Card(modifier = modifier.fillMaxWidth(), shape = shape, colors = colors, elevation = elevation) {
            Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp), content = contenido)
        }
    }
}

/** Puntito de color con su palabra al lado; el color nunca informa solo. */
@Composable
fun MorePunto(color: Color, modifier: Modifier = Modifier, tamano: Int = 10) {
    Box(
        modifier = modifier
            .size(tamano.dp)
            .clip(RoundedCornerShape(tamano.dp))
            .background(color),
    )
}

/** Ancho fijo pequeño, para alinear columnas de números en una fila. */
@Composable
fun MoreAnchoFijo(ancho: Int, contenido: @Composable () -> Unit) {
    Box(modifier = Modifier.width(ancho.dp), contentAlignment = Alignment.CenterEnd) { contenido() }
}
