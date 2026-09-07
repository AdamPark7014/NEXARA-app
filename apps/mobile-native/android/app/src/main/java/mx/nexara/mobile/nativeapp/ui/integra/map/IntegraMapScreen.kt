package mx.nexara.mobile.nativeapp.ui.integra.map

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.gestures.detectTransformGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clipToBounds
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import mx.nexara.mobile.nativeapp.data.integra.map.MapViewport
import mx.nexara.mobile.nativeapp.data.integra.map.Pan
import mx.nexara.mobile.nativeapp.data.integra.map.PinCard
import mx.nexara.mobile.nativeapp.data.integra.map.PinKind
import mx.nexara.mobile.nativeapp.ui.enterprise.NxColors
import mx.nexara.mobile.nativeapp.ui.enterprise.NxDimens
import mx.nexara.mobile.nativeapp.ui.enterprise.NxEmptyState
import mx.nexara.mobile.nativeapp.ui.enterprise.NxErrorBlock
import mx.nexara.mobile.nativeapp.ui.enterprise.NxLoadingBlock
import mx.nexara.mobile.nativeapp.ui.enterprise.NxPanelShell
import mx.nexara.mobile.nativeapp.ui.enterprise.NxStatusChip
import mx.nexara.mobile.nativeapp.ui.enterprise.NxTone
import mx.nexara.mobile.nativeapp.ui.integra.common.IntegraDetailLine
import mx.nexara.mobile.nativeapp.ui.integra.common.IntegraSitesCache
import mx.nexara.mobile.nativeapp.ui.integra.common.IntegraSiteBar
import mx.nexara.mobile.nativeapp.ui.integra.common.doorState
import mx.nexara.mobile.nativeapp.ui.integra.common.doorStateLabel
import mx.nexara.mobile.nativeapp.ui.integra.common.doorStateTone
import kotlin.math.roundToInt

/**
 * PLANO del sitio — **vista de solo lectura, y lo dice**.
 *
 * Qué hace: enseña la planta con sus cámaras y puertas situadas, se acerca con
 * dos dedos o doble toque, se arrastra, filtra, y al **tocar un pin abre su
 * ficha** con el estado de ese equipo ahora mismo.
 *
 * Qué NO hace, a propósito: colocar, mover y quitar pines, y subir planos. Eso
 * se queda en la consola web. Dos razones, y ninguna es que faltara tiempo:
 *
 *  - Situar un equipo sobre una planta es trabajo de precisión sobre una imagen
 *    grande. Con el dedo, en cinco pulgadas y con el plano al 40 %, el resultado
 *    es un pin mal puesto que además pisa el bueno (el servidor hace `upsert`
 *    por `entityType + entityId`).
 *  - En la consola web, hasta hace poco, **tocar un pin lo borraba en el acto y
 *    sin preguntar**, y el texto de ayuda lo anunciaba como si fuera una
 *    función. En un teléfono el toque accidental es la norma. Repetir eso aquí
 *    sería peor que no traer el módulo.
 *
 * Así que aquí tocar abre. No hay ningún gesto que borre nada, porque no hay
 * nada que borrar: este módulo no escribe. El catálogo lo marca `SOLO_LECTURA`.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun IntegraMapScreen(
    onOpenKey: ((String) -> Unit)? = null,
    vm: IntegraMapViewModel = viewModel(),
) {
    val s by vm.state.collectAsState()
    val sites by IntegraSitesCache.sites.collectAsState()
    val sitesLoading by IntegraSitesCache.loading.collectAsState()

    PullToRefreshBox(
        isRefreshing = s.refreshing,
        onRefresh = { vm.load(initial = false) },
        modifier = Modifier.fillMaxSize().background(NxColors.Surface),
    ) {
        LazyColumn(
            contentPadding = PaddingValues(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            item {
                IntegraSiteBar(sites = sites, loading = sitesLoading) { vm.selectSite(it) }
            }

            when {
                s.loading -> item { NxLoadingBlock("Cargando plano del sitio…") }

                s.error != null && s.plans.isEmpty() -> item {
                    NxErrorBlock(s.error.orEmpty()) { vm.load(initial = true) }
                }

                s.plans.isEmpty() -> item {
                    NxEmptyState(
                        title = "Este sitio no tiene plano",
                        subtitle = "Los planos de planta se suben desde la consola web, en " +
                            "INTEGRA → Plano. Una vez subido y con las puertas y cámaras " +
                            "colocadas, se consulta aquí.",
                    )
                }

                else -> {
                    if (s.plans.size > 1) {
                        item { PlanPicker(state = s, onSelect = vm::selectPlan) }
                    }
                    item { MapFilterRow(state = s, onSelect = vm::setFilter) }
                    item { FloorplanViewer(state = s, onPinTap = vm::togglePin) }
                    item { MapLegend() }

                    s.selected?.let { card ->
                        item {
                            PinDetailCard(
                                card = card,
                                onClose = vm::closePin,
                                onOpenKey = onOpenKey,
                            )
                        }
                    }

                    item { CoverageNote(state = s) }
                    item { ReadOnlyNote() }
                    item { Spacer(Modifier.height(24.dp)) }
                }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun PlanPicker(state: MapUiState, onSelect: (Int) -> Unit) {
    val activeId = state.activePlan?.id
    Row(
        modifier = Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        state.plans.forEach { plan ->
            FilterChip(
                selected = plan.id == activeId,
                onClick = { onSelect(plan.id) },
                label = { Text("${plan.name} · ${plan.pins.size}") },
            )
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun MapFilterRow(state: MapUiState, onSelect: (MapFilter) -> Unit) {
    Row(
        modifier = Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        MapFilter.entries.forEach { f ->
            FilterChip(
                selected = state.filter == f,
                onClick = { onSelect(f) },
                label = { Text(f.label) },
            )
        }
    }
}

/**
 * El plano con sus pines.
 *
 * El contenedor tiene **la proporción exacta de la imagen** en vez de dejar que
 * `ContentScale.Fit` la centre con bandas. No es un detalle estético: los pines
 * vienen en porcentaje de la imagen, así que si el marco no coincide con ella,
 * todos salen corridos y nadie entiende por qué la puerta está en el pasillo.
 *
 * Zoom y arrastre se recortan en [MapViewport], que además sanea los `NaN` que
 * un gesto interrumpido puede meter en el `graphicsLayer` —y que no lanzan
 * excepción: simplemente dejan la pantalla en blanco—.
 */
@Composable
private fun FloorplanViewer(
    state: MapUiState,
    onPinTap: (mx.nexara.mobile.nativeapp.data.integra.map.MapPin) -> Unit,
) {
    val plan = state.activePlan ?: return
    val image by rememberFloorplanImage(plan.imageData)

    var scale by remember(plan.id) { mutableFloatStateOf(MapViewport.MIN_SCALE) }
    var pan by remember(plan.id) { mutableStateOf(Pan.ZERO) }

    NxPanelShell(contentPadding = PaddingValues(12.dp)) {
        Text(
            plan.name,
            style = MaterialTheme.typography.titleSmall.copy(fontWeight = FontWeight.SemiBold),
            color = NxColors.Slate,
        )
        Text(
            "${plan.doorPins} puertas · ${plan.cameraPins} cámaras situadas",
            style = MaterialTheme.typography.labelSmall,
            color = NxColors.Muted,
        )
        Spacer(Modifier.height(8.dp))

        when (val img = image) {
            is FloorplanImageState.Loading -> Box(
                Modifier.fillMaxWidth().height(200.dp),
                contentAlignment = Alignment.Center,
            ) { CircularProgressIndicator(color = NxColors.Teal) }

            is FloorplanImageState.Unavailable -> Box(
                Modifier
                    .fillMaxWidth()
                    .height(160.dp)
                    .background(NxColors.WarningSoft, RoundedCornerShape(NxDimens.PanelRadius))
                    .padding(16.dp),
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    img.reason,
                    style = MaterialTheme.typography.bodySmall,
                    color = NxColors.Slate,
                )
            }

            is FloorplanImageState.Ready -> {
                BoxWithConstraints(Modifier.fillMaxWidth().clipToBounds()) {
                    val density = LocalDensity.current
                    val contentWidthPx = with(density) { maxWidth.toPx() }
                    val contentHeightPx = contentWidthPx / img.aspectRatio

                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .aspectRatio(img.aspectRatio)
                            .graphicsLayer {
                                scaleX = scale
                                scaleY = scale
                                translationX = pan.x
                                translationY = pan.y
                            }
                            .pointerInput(plan.id) {
                                detectTransformGestures { _, panChange, zoomChange, _ ->
                                    val (newScale, newPan) = MapViewport.applyGesture(
                                        scale = scale,
                                        pan = pan,
                                        zoomChange = zoomChange,
                                        panChange = Pan(panChange.x, panChange.y),
                                        viewportWidth = contentWidthPx,
                                        viewportHeight = contentHeightPx,
                                    )
                                    scale = newScale
                                    pan = newPan
                                }
                            }
                            .pointerInput(plan.id) {
                                detectTapGestures(
                                    onDoubleTap = {
                                        val (newScale, newPan) = MapViewport.toggleZoom(scale)
                                        scale = newScale
                                        pan = newPan
                                    },
                                )
                            },
                    ) {
                        Image(
                            bitmap = img.bitmap,
                            contentDescription = "Plano ${plan.name}",
                            modifier = Modifier.fillMaxSize(),
                            contentScale = ContentScale.FillBounds,
                        )

                        state.visibleCards.forEach { card ->
                            PinMarker(
                                card = card,
                                selected = card.pin.id == state.selectedPinId,
                                scale = scale,
                                contentWidthPx = contentWidthPx,
                                contentHeightPx = contentHeightPx,
                                onTap = { onPinTap(card.pin) },
                            )
                        }
                    }
                }

                Spacer(Modifier.height(8.dp))
                Row(
                    Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(
                        "Pellizca o toca dos veces para acercar. Toca un pin para ver qué es.",
                        style = MaterialTheme.typography.labelSmall,
                        color = NxColors.Muted,
                        modifier = Modifier.weight(1f),
                    )
                    if (scale > MapViewport.MIN_SCALE) {
                        TextButton(onClick = {
                            scale = MapViewport.MIN_SCALE
                            pan = Pan.ZERO
                        }) { Text("Ver completo") }
                    }
                }
                if (state.hiddenByFilter > 0) {
                    Text(
                        "El filtro esconde ${state.hiddenByFilter} pines de este plano.",
                        style = MaterialTheme.typography.labelSmall,
                        color = NxColors.Muted,
                    )
                }
            }
        }
    }
}

/** Tamaño del área tocable del pin. Por debajo de esto no se acierta. */
private val PIN_TOUCH_SIZE = 44.dp
private val PIN_DOT_SIZE = 18.dp

@Composable
private fun PinMarker(
    card: PinCard,
    selected: Boolean,
    scale: Float,
    contentWidthPx: Float,
    contentHeightPx: Float,
    onTap: () -> Unit,
) {
    val density = LocalDensity.current
    val point = MapViewport.pinOffset(
        xPct = card.pin.xPct,
        yPct = card.pin.yPct,
        contentWidth = contentWidthPx,
        contentHeight = contentHeightPx,
    )
    val halfTouchPx = with(density) { PIN_TOUCH_SIZE.toPx() } / 2f
    val fill = pinColor(card)
    val ring = if (selected) NxColors.Slate else Color.White

    Box(
        modifier = Modifier
            .offset {
                IntOffset(
                    (point.x - halfTouchPx).roundToInt(),
                    (point.y - halfTouchPx).roundToInt(),
                )
            }
            .size(PIN_TOUCH_SIZE)
            // El pin conserva su tamaño en pantalla aunque el plano esté al
            // 400 %: si no, acercarse convierte los pines en manchas.
            .graphicsLayer {
                val inverse = if (scale > 0f) 1f / scale else 1f
                scaleX = inverse
                scaleY = inverse
            }
            .semantics { contentDescription = pinAccessibilityLabel(card) }
            .clickable(onClick = onTap),
        contentAlignment = Alignment.Center,
    ) {
        Box(
            Modifier
                .size(if (selected) PIN_DOT_SIZE + 6.dp else PIN_DOT_SIZE)
                .background(fill, CircleShape)
                .border(if (selected) 3.dp else 2.dp, ring, CircleShape),
        )
    }
}

private fun pinColor(card: PinCard): Color = when {
    card.orphan -> NxColors.Muted
    card.entity?.online == false -> NxColors.Danger
    card.pin.kind == PinKind.CAMERA -> Color(0xFF0E7490)
    card.pin.kind == PinKind.DOOR -> Color(0xFFB45309)
    else -> NxColors.Muted
}

private fun pinAccessibilityLabel(card: PinCard): String {
    val kind = when (card.pin.kind) {
        PinKind.DOOR -> "Puerta"
        PinKind.CAMERA -> "Cámara"
        PinKind.OTHER -> "Elemento"
    }
    val estado = when {
        card.orphan -> "ya no está en el inventario"
        card.entity?.online == false -> "fuera de línea"
        card.entity?.online == true -> "en línea"
        else -> "sin dato de estado"
    }
    return "$kind ${card.title}, $estado. Tocar para ver la ficha."
}

@Composable
private fun MapLegend() {
    Row(
        modifier = Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        LegendDot(Color(0xFFB45309), "Puerta")
        LegendDot(Color(0xFF0E7490), "Cámara")
        LegendDot(NxColors.Danger, "Fuera de línea")
        LegendDot(NxColors.Muted, "Sin inventario")
    }
}

@Composable
private fun LegendDot(color: Color, label: String) {
    Row(
        horizontalArrangement = Arrangement.spacedBy(6.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(Modifier.size(10.dp).background(color, CircleShape))
        Text(label, style = MaterialTheme.typography.labelSmall, color = NxColors.Muted)
    }
}

/**
 * Ficha del pin. Es lo que aparece al tocar, y es lo único que aparece.
 *
 * Enseña el estado de **ahora** del equipo, que es lo que hace útil mirar el
 * plano desde el teléfono: ver de un vistazo que la puerta del muelle lleva el
 * terminal caído sin tener que cruzar la nave.
 */
@Composable
private fun PinDetailCard(
    card: PinCard,
    onClose: () -> Unit,
    onOpenKey: ((String) -> Unit)?,
) {
    NxPanelShell {
        Row(
            Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                card.title,
                style = MaterialTheme.typography.titleSmall.copy(fontWeight = FontWeight.Bold),
                color = NxColors.Slate,
                modifier = Modifier.weight(1f),
            )
            val (label, tone) = pinStatusChip(card)
            NxStatusChip(label, tone)
        }

        Spacer(Modifier.height(6.dp))

        IntegraDetailLine(
            "Tipo",
            when (card.pin.kind) {
                PinKind.DOOR -> "Puerta"
                PinKind.CAMERA -> "Cámara"
                PinKind.OTHER -> card.pin.entityType.ifBlank { "Sin tipo" }
            },
        )
        IntegraDetailLine("Identificador del equipo", card.pin.entityId)
        card.entity?.location?.let { IntegraDetailLine("Ubicación", it) }
        card.pin.label?.takeIf { it != card.title }?.let {
            IntegraDetailLine("Etiqueta en el plano", it)
        }

        if (card.orphan) {
            Spacer(Modifier.height(6.dp))
            Text(
                "Este pin apunta a un equipo que ya no está en el inventario del sitio. " +
                    "Se dio de baja el equipo y el pin se quedó; quitarlo del plano se hace " +
                    "en la consola web.",
                style = MaterialTheme.typography.bodySmall,
                color = NxColors.Muted,
            )
        }

        Spacer(Modifier.height(8.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            if (onOpenKey != null && !card.orphan) {
                val (key, texto) = when (card.pin.kind) {
                    PinKind.CAMERA -> "integra-video" to "Ver cámaras"
                    else -> "integra-access" to "Ir a Acceso"
                }
                OutlinedButton(onClick = { onOpenKey(key) }) { Text(texto) }
            }
            TextButton(onClick = onClose) { Text("Cerrar") }
        }
    }
}

private fun pinStatusChip(card: PinCard): Pair<String, NxTone> {
    val entity = card.entity ?: return "Sin inventario" to NxTone.Warning
    return when (card.pin.kind) {
        PinKind.DOOR -> {
            val estado = doorState(entity.online, entity.doorState)
            doorStateLabel(estado) to doorStateTone(estado)
        }
        else -> when (entity.online) {
            true -> "En línea" to NxTone.Success
            false -> "Fuera de línea" to NxTone.Danger
            null -> "Sin reportar estado" to NxTone.Neutral
        }
    }
}

/** Cuánto del sitio está de verdad situado. Un plano a medias engaña. */
@Composable
private fun CoverageNote(state: MapUiState) {
    val c = state.snapshot.coverage()
    if (c.totalDoors == 0 && c.totalCameras == 0) return
    NxPanelShell {
        Text(
            "Cobertura del plano",
            style = MaterialTheme.typography.titleSmall.copy(fontWeight = FontWeight.SemiBold),
            color = NxColors.Slate,
        )
        Spacer(Modifier.height(4.dp))
        Text(
            "Puertas situadas: ${c.pinnedDoors} de ${c.totalDoors} · " +
                "Cámaras situadas: ${c.pinnedCameras} de ${c.totalCameras}",
            style = MaterialTheme.typography.bodySmall,
            color = NxColors.Slate,
        )
        if (c.missingDoors > 0 || c.missingCameras > 0) {
            Spacer(Modifier.height(4.dp))
            Text(
                "Lo que no está en ningún plano no aparece aquí: faltan " +
                    "${c.missingDoors} puertas y ${c.missingCameras} cámaras por colocar.",
                style = MaterialTheme.typography.labelSmall,
                color = NxColors.Muted,
            )
        }
        if (c.orphanPins > 0) {
            Spacer(Modifier.height(4.dp))
            Text(
                "${c.orphanPins} pines apuntan a equipos que ya no existen en el sitio.",
                style = MaterialTheme.typography.labelSmall,
                color = NxColors.Muted,
            )
        }
    }
}

@Composable
private fun ReadOnlyNote() {
    Text(
        "Esta pantalla no modifica el plano. Colocar, mover o quitar pines y subir " +
            "planos se hace en la consola web (INTEGRA → Plano): situar un equipo con el " +
            "dedo sale mal y un toque accidental no puede costar una posición.",
        style = MaterialTheme.typography.labelSmall,
        color = NxColors.Muted,
    )
}
