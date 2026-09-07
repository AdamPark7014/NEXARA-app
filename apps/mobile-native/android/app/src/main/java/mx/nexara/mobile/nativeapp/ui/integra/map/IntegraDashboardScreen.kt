package mx.nexara.mobile.nativeapp.ui.integra.map

import androidx.compose.foundation.background
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import mx.nexara.mobile.nativeapp.data.integra.map.CameraHealth
import mx.nexara.mobile.nativeapp.data.integra.map.DoorHealth
import mx.nexara.mobile.nativeapp.data.integra.map.PanoramaPart
import mx.nexara.mobile.nativeapp.data.integra.map.PanoramaSnapshot
import mx.nexara.mobile.nativeapp.ui.enterprise.NxAlert
import mx.nexara.mobile.nativeapp.ui.enterprise.NxAlertBanner
import mx.nexara.mobile.nativeapp.ui.enterprise.NxColors
import mx.nexara.mobile.nativeapp.ui.enterprise.NxErrorBlock
import mx.nexara.mobile.nativeapp.ui.enterprise.NxKpi
import mx.nexara.mobile.nativeapp.ui.enterprise.NxKpiGrid
import mx.nexara.mobile.nativeapp.ui.enterprise.NxListRow
import mx.nexara.mobile.nativeapp.ui.enterprise.NxLoadingBlock
import mx.nexara.mobile.nativeapp.ui.enterprise.NxPanelShell
import mx.nexara.mobile.nativeapp.ui.enterprise.NxSectionHeader
import mx.nexara.mobile.nativeapp.ui.enterprise.NxStatusChip
import mx.nexara.mobile.nativeapp.ui.enterprise.NxTone
import mx.nexara.mobile.nativeapp.ui.integra.common.IntegraFormat
import mx.nexara.mobile.nativeapp.ui.integra.common.IntegraSiteBar
import mx.nexara.mobile.nativeapp.ui.integra.common.IntegraSitesCache
import mx.nexara.mobile.nativeapp.ui.integra.common.providerLabel
import mx.nexara.mobile.nativeapp.ui.integra.common.str
import java.time.Instant
import java.time.ZoneId

/**
 * PANORAMA de INTEGRA — la respuesta a «¿cómo está el sistema ahora?».
 *
 * El hub de inicio ya existía, pero es un menú: veinte tarjetas de colores que
 * dicen a dónde ir y nada de cómo va todo. Esta pantalla es la otra mitad, la
 * que en la web vive en `/integra`: puertas en línea, cámaras vivas, alarmas
 * abiertas y gente dentro, en la primera pantalla y sin desplazarse.
 *
 * Dos reglas que gobiernan todo lo de abajo:
 *
 *  1. **Ninguna métrica se inventa.** Sólo se pinta lo que devuelven
 *     `integra/dashboard`, `integra/alarms/queue`, `integra/occupancy`,
 *     `integra/push/events/stats` e `integra/cameras`. No hay tendencias, ni
 *     porcentajes de disponibilidad, ni comparaciones con ayer: la API no da
 *     serie histórica y dibujar una línea bonita con dos puntos es mentir.
 *  2. **Un hueco no es un cero.** Si un endpoint no responde, su bloque dice que
 *     no respondió. Un «0 alarmas abiertas» falso es la clase de dato que hace
 *     que nadie vuelva a mirar la pantalla.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun IntegraDashboardScreen(
    onOpenKey: ((String) -> Unit)? = null,
    vm: IntegraPanoramaViewModel = viewModel(),
) {
    val s by vm.state.collectAsState()
    val sites by IntegraSitesCache.sites.collectAsState()
    val sitesLoading by IntegraSitesCache.loading.collectAsState()
    val zone = remember { ZoneId.systemDefault() }

    PullToRefreshBox(
        isRefreshing = s.refreshing,
        onRefresh = { vm.load(initial = false) },
        modifier = Modifier.fillMaxSize().background(NxColors.Surface),
    ) {
        LazyColumn(
            contentPadding = PaddingValues(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            item { IntegraSiteBar(sites = sites, loading = sitesLoading) { vm.selectSite(it) } }

            val snap = s.snapshot
            when {
                s.loading -> item { NxLoadingBlock("Leyendo el estado del sitio…") }

                snap == null -> item {
                    NxErrorBlock(s.error ?: "No se pudo leer el estado del sitio") {
                        vm.load(initial = true)
                    }
                }

                else -> {
                    val avisos = snap.attention()
                    if (avisos.isNotEmpty()) {
                        items(avisos, key = { it }) { aviso ->
                            NxAlertBanner(
                                NxAlert(
                                    id = aviso,
                                    title = aviso,
                                    tone = if (snap.link.connected) NxTone.Warning else NxTone.Danger,
                                ),
                            )
                        }
                    }

                    item { LinkPanel(snap = snap, zone = zone) }
                    item { NowSection(snap = snap) }

                    snap.today?.let { item { TodaySection(snap = snap) } }

                    if (snap.topAlarms.isNotEmpty()) {
                        item {
                            NxSectionHeader(
                                title = "Alarmas abiertas",
                                subtitle = "Últimas 24 horas",
                            )
                        }
                        items(snap.topAlarms, key = { str(it, "id").ifBlank { it.hashCode().toString() } }) { alarma ->
                            NxListRow(
                                title = str(alarma, "title").ifBlank { "Alarma" },
                                subtitle = str(alarma, "personName", "deviceName")
                                    .takeIf { it.isNotBlank() },
                                meta = IntegraFormat.shortDateTime(
                                    str(alarma, "timestamp", "occurredAt"),
                                    zone,
                                ),
                                chipText = str(alarma, "severity").takeIf { it.isNotBlank() },
                                chipTone = NxTone.Warning,
                            )
                        }
                        if (onOpenKey != null) {
                            item {
                                OutlinedButton(onClick = { onOpenKey("integra-alarms") }) {
                                    Text("Ver toda la cola")
                                }
                            }
                        }
                    }

                    item { InventorySection(snap = snap) }

                    if (onOpenKey != null) {
                        item { QuickJumps(onOpenKey = onOpenKey) }
                    }

                    item { HonestyNotes(snap = snap) }
                    item { Spacer(Modifier.height(24.dp)) }
                }
            }
        }
    }
}

@Composable
private fun LinkPanel(snap: PanoramaSnapshot, zone: ZoneId) {
    NxPanelShell {
        Row(
            Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column(Modifier.weight(1f)) {
                Text(
                    "Enlace con el sitio",
                    style = MaterialTheme.typography.titleSmall.copy(fontWeight = FontWeight.SemiBold),
                    color = NxColors.Slate,
                )
                Text(
                    providerLabel(snap.link.provider),
                    style = MaterialTheme.typography.bodySmall,
                    color = NxColors.Muted,
                )
            }
            val (etiqueta, tono) = when {
                !snap.link.configured -> "Sin configurar" to NxTone.Warning
                snap.link.connected -> "Conectado" to NxTone.Success
                else -> "Sin conexión" to NxTone.Danger
            }
            NxStatusChip(etiqueta, tono)
        }

        Spacer(Modifier.height(6.dp))
        snap.link.host?.let {
            Text("Equipo: $it", style = MaterialTheme.typography.bodySmall, color = NxColors.Slate)
        }
        Text(
            "Espejo sincronizado " + (
                snap.lastSync
                    ?.let { IntegraFormat.relative(it, zone, Instant.now()) }
                    ?.takeIf { it != IntegraFormat.EMPTY }
                    ?: "nunca"
                ),
            style = MaterialTheme.typography.labelSmall,
            color = NxColors.Muted,
        )
    }
}

/**
 * Lo que hay que saber estando de pie: puertas, cámaras, alarmas y gente.
 *
 * `doorsOnline` y `doorsOffline` los cuenta el servidor por separado, y las
 * filas sin dato no caen en ninguno de los dos. Ese resto se nombra («sin
 * reportar») en vez de repartirlo a ojo, que es como una puerta caída acaba
 * contada como sana.
 */
@Composable
private fun NowSection(snap: PanoramaSnapshot) {
    val kpis = buildList {
        add(doorKpi(snap.doorHealth))
        add(cameraKpi(snap))
        add(
            NxKpi(
                label = "Alarmas abiertas",
                value = if (snap.failed(PanoramaPart.ALARMS)) IntegraFormat.EMPTY
                else snap.openAlarms?.toString() ?: IntegraFormat.EMPTY,
                hint = if (snap.failed(PanoramaPart.ALARMS)) "La cola no respondió" else "Últimas 24 h",
                tone = if ((snap.openAlarms ?: 0) > 0) NxTone.Danger else NxTone.Success,
            ),
        )
        add(
            NxKpi(
                label = "Gente en sitio",
                value = if (snap.failed(PanoramaPart.OCCUPANCY) && snap.onSite == null) {
                    IntegraFormat.EMPTY
                } else {
                    snap.onSite?.toString() ?: IntegraFormat.EMPTY
                },
                hint = "Deducido de los accesos",
                tone = NxTone.Info,
            ),
        )
    }

    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        NxSectionHeader(title = "Ahora mismo", subtitle = "Estado vivo del sitio")
        NxKpiGrid(items = kpis)
    }
}

private fun doorKpi(health: DoorHealth?): NxKpi {
    if (health == null) {
        return NxKpi(
            label = "Puertas en línea",
            value = IntegraFormat.EMPTY,
            hint = "El panel no devolvió conteos",
            tone = NxTone.Neutral,
        )
    }
    val partes = buildList {
        if (health.offline > 0) add("${health.offline} caídas")
        if (health.unknown > 0) add("${health.unknown} sin reportar")
    }
    return NxKpi(
        label = "Puertas en línea",
        value = "${health.online}/${health.total}",
        hint = partes.joinToString(" · ").ifBlank { "Todas reportan" },
        tone = if (health.offline > 0) NxTone.Danger else NxTone.Success,
    )
}

private fun cameraKpi(snap: PanoramaSnapshot): NxKpi {
    val health: CameraHealth? = snap.cameraHealth
    if (health == null) {
        // El `dashboard` da el total de cámaras pero NO cuántas están vivas.
        // Sin el inventario no hay desglose, y no se inventa uno.
        return NxKpi(
            label = "Cámaras",
            value = snap.counts.cameras?.toString() ?: IntegraFormat.EMPTY,
            hint = "Sin desglose: el inventario no respondió",
            tone = NxTone.Neutral,
        )
    }
    val partes = buildList {
        if (health.offline > 0) add("${health.offline} caídas")
        if (health.unreported > 0) add("${health.unreported} sin reportar")
    }
    return NxKpi(
        label = "Cámaras en línea",
        value = "${health.online}/${health.total}",
        hint = partes.joinToString(" · ").ifBlank { "Todas reportan" },
        tone = if (health.offline > 0) NxTone.Danger else NxTone.Success,
    )
}

@Composable
private fun TodaySection(snap: PanoramaSnapshot) {
    val hoy = snap.today ?: return
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        NxSectionHeader(
            title = "Hoy",
            subtitle = hoy.day?.let { "Día $it" } ?: "Actividad del día",
        )
        NxKpiGrid(
            items = listOf(
                NxKpi(
                    label = "Accesos concedidos",
                    value = hoy.granted?.toString() ?: IntegraFormat.EMPTY,
                    tone = NxTone.Success,
                ),
                NxKpi(
                    label = "Denegados",
                    value = hoy.denied?.toString() ?: IntegraFormat.EMPTY,
                    tone = if ((hoy.denied ?: 0) > 0) NxTone.Warning else NxTone.Neutral,
                ),
                NxKpi(
                    label = "Personas distintas",
                    value = hoy.uniquePeople?.toString() ?: IntegraFormat.EMPTY,
                    tone = NxTone.Brand,
                ),
            ),
        )
    }
}

@Composable
private fun InventorySection(snap: PanoramaSnapshot) {
    val c = snap.counts
    NxPanelShell {
        Text(
            "Inventario del sitio",
            style = MaterialTheme.typography.titleSmall.copy(fontWeight = FontWeight.SemiBold),
            color = NxColors.Slate,
        )
        Spacer(Modifier.height(6.dp))
        Text(
            listOfNotNull(
                c.people?.let { "$it personas" },
                c.doors?.let { "$it puertas" },
                c.cameras?.let { "$it cámaras" },
                c.devices?.let { "$it equipos" },
                c.vehicles?.let { "$it vehículos" },
                c.regions?.let { "$it zonas" },
            ).joinToString(" · ").ifBlank { "El panel no devolvió conteos de inventario." },
            style = MaterialTheme.typography.bodySmall,
            color = NxColors.Slate,
        )
        Spacer(Modifier.height(4.dp))
        Text(
            "Conteos del espejo local, no del equipo en vivo.",
            style = MaterialTheme.typography.labelSmall,
            color = NxColors.Muted,
        )
    }
}

/** Saltos a los módulos que uno abre justo después de mirar el panorama. */
@Composable
private fun QuickJumps(onOpenKey: (String) -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        NxSectionHeader(title = "Ir a", subtitle = "Los módulos que siguen a esta pantalla")
        Row(
            modifier = Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            listOf(
                "integra-access" to "Acceso",
                "integra-alarms" to "Alarmas",
                "integra-map" to "Plano",
                "integra-video" to "Cámaras",
                "integra-occupancy" to "En sitio",
            ).forEach { (key, texto) ->
                OutlinedButton(onClick = { onOpenKey(key) }) { Text(texto) }
            }
        }
    }
}

/**
 * Lo que esta pantalla NO sabe, dicho en voz alta.
 *
 * Sin esta nota, un bloque que falló y otro que devolvió cero se ven igual.
 */
@Composable
private fun HonestyNotes(snap: PanoramaSnapshot) {
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        snap.occupancyNote?.takeIf { it.isNotBlank() }?.let {
            Text(it, style = MaterialTheme.typography.labelSmall, color = NxColors.Muted)
        }
        if (snap.missing.isNotEmpty()) {
            Text(
                "No respondieron: ${snap.missing.joinToString(", ") { it.label }}. " +
                    "Esos huecos salen como «—», no como cero.",
                style = MaterialTheme.typography.labelSmall,
                color = NxColors.Muted,
            )
        }
    }
}
