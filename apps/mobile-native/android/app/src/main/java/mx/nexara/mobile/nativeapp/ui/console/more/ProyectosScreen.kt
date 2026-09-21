package mx.nexara.mobile.nativeapp.ui.console.more

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Flag
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import mx.nexara.mobile.nativeapp.data.api.ProyectoResumenDto
import mx.nexara.mobile.nativeapp.ui.enterprise.NxColors
import mx.nexara.mobile.nativeapp.ui.enterprise.NxEmptyState
import mx.nexara.mobile.nativeapp.ui.enterprise.NxErrorBlock
import mx.nexara.mobile.nativeapp.ui.enterprise.NxSearchField
import mx.nexara.mobile.nativeapp.ui.enterprise.NxScreenScaffold
import mx.nexara.mobile.nativeapp.ui.enterprise.NxSkeletonList
import mx.nexara.mobile.nativeapp.ui.enterprise.NxStatusChip
import mx.nexara.mobile.nativeapp.ui.enterprise.NxTone
import mx.nexara.mobile.nativeapp.ui.enterprise.fg

/**
 * Proyectos (`/erp/proyectos`) en el teléfono.
 *
 * La web trae una tabla con título, cliente, responsable, estado, salud, fechas,
 * avance, hitos y documentos. Nueve columnas en 375 px no se leen, así que cada
 * proyecto es una tarjeta con la jerarquía invertida respecto de la tabla: lo
 * primero es **la salud** —el semáforo que pidió dirección—, luego qué toca
 * (el próximo hito) y cuánto va, y al final cliente y responsable.
 *
 * Los filtros y los textos viven en [ProyectosRules], que se prueba sin Android.
 */
@Composable
fun ProyectosScreen(vm: ProyectosViewModel = viewModel()) {
    val state by vm.state.collectAsState()
    val filtro by vm.filtro.collectAsState()
    val consulta by vm.consulta.collectAsState()

    LaunchedEffect(Unit) { vm.arrancar() }

    val todos = state.datos.orEmpty()
    val visibles = remember(todos, filtro, consulta) { ProyectosRules.aplicar(todos, filtro, consulta) }
    val conteos = remember(todos) { ProyectosRules.conteos(todos) }

    NxScreenScaffold(isRefreshing = state.refrescando, onRefresh = vm::refrescar) {
        LazyColumn(
            modifier = Modifier.fillMaxSize(),
            contentPadding = PaddingValues(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            item(key = "filtros") {
                MoreFilaDePastillas(
                    ProyectosRules.Filtro.entries.map { opcion ->
                        MorePastilla(
                            etiqueta = opcion.etiqueta,
                            conteo = conteos[opcion],
                            seleccionada = opcion == filtro,
                            onClick = { vm.cambiarFiltro(opcion) },
                        )
                    },
                )
            }

            state.avisoRefresco?.let { aviso ->
                item(key = "aviso") { MoreAvisoDesactualizado(aviso, onCerrar = vm::descartarAviso) }
            }

            if (state.cargando && !state.hayDatos) {
                item(key = "esqueleto") { NxSkeletonList(itemCount = 4, itemHeight = 136.dp) }
            }

            state.error?.takeIf { !state.hayDatos }?.let { error ->
                item(key = "error") { NxErrorBlock(error, onRetry = vm::reintentar) }
            }

            if (state.hayDatos) {
                if (todos.size > 6) {
                    item(key = "buscar") {
                        NxSearchField(
                            value = consulta,
                            onValueChange = vm::buscar,
                            placeholder = "Buscar por proyecto, cliente o responsable",
                        )
                    }
                }

                if (visibles.isEmpty()) {
                    item(key = "vacio") {
                        if (todos.isEmpty()) {
                            NxEmptyState(
                                title = "Sin proyectos",
                                subtitle = "Todavía no hay proyectos dados de alta en esta empresa.",
                            )
                        } else if (consulta.isNotBlank()) {
                            NxEmptyState(
                                title = "Sin coincidencias",
                                subtitle = "Ningún proyecto coincide con «$consulta».",
                                actionLabel = "Limpiar búsqueda",
                                onAction = { vm.buscar("") },
                            )
                        } else {
                            NxEmptyState(
                                title = "Nada en «${filtro.etiqueta.lowercase()}»",
                                subtitle = if (filtro == ProyectosRules.Filtro.ATENCION) {
                                    "Ningún proyecto está retrasado ni en riesgo. Buena señal."
                                } else {
                                    "No hay proyectos en este filtro."
                                },
                                actionLabel = "Ver todos",
                                onAction = { vm.cambiarFiltro(ProyectosRules.Filtro.TODOS) },
                            )
                        }
                    }
                } else {
                    item(key = "cabecera") {
                        MoreCabecera(
                            titulo = filtro.etiqueta,
                            subtitulo = "Primero lo que va tarde",
                            trailing = "${visibles.size}",
                        )
                    }
                    items(visibles, key = { it.id ?: it.hashCode().toLong() }) { proyecto ->
                        TarjetaDeProyecto(proyecto)
                    }
                }
            }

            item(key = "alcance") { MoreNotaDeAlcance(ProyectosRules.LIMITE) }
        }
    }
}

/** Un proyecto: salud arriba, qué toca en medio, contexto abajo. */
@Composable
private fun TarjetaDeProyecto(proyecto: ProyectoResumenDto) {
    val salud = ProyectosRules.saludDe(proyecto)
    val tono = when (salud) {
        ProyectosRules.Salud.RETRASADO -> NxTone.Danger
        ProyectosRules.Salud.EN_RIESGO -> NxTone.Warning
        ProyectosRules.Salud.EN_TIEMPO -> NxTone.Success
        ProyectosRules.Salud.TERMINADO -> NxTone.Success
        ProyectosRules.Salud.PLANEADO -> NxTone.Info
        else -> NxTone.Neutral
    }
    val avance = ProyectosRules.avancePct(proyecto)

    MoreTarjeta {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(10.dp),
            verticalAlignment = Alignment.Top,
        ) {
            Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                Text(
                    proyecto.title?.trim()?.ifEmpty { null } ?: "Proyecto sin título",
                    style = MaterialTheme.typography.titleSmall.copy(fontWeight = FontWeight.Bold),
                    color = NxColors.Slate,
                    maxLines = 3,
                    overflow = TextOverflow.Ellipsis,
                )
                Text(
                    ProyectosRules.contextoTexto(proyecto),
                    style = MaterialTheme.typography.bodySmall,
                    color = NxColors.Muted,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                )
            }
            NxStatusChip(ProyectosRules.etiquetaSalud(proyecto), tono)
        }

        MoreBarra(
            progreso = avance?.let { it / 100f },
            etiqueta = buildString {
                append(if (avance != null) "$avance % · " else "Avance desconocido · ")
                append(ProyectosRules.avanceTexto(proyecto))
            },
            tono = tono,
        )

        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                ProyectosRules.plazoTexto(proyecto),
                style = MaterialTheme.typography.labelMedium.copy(fontWeight = FontWeight.SemiBold),
                color = if (tono == NxTone.Danger || tono == NxTone.Warning) tono.fg() else NxColors.Muted,
                modifier = Modifier.weight(1f),
            )
            val equipo = proyecto.equipoCount ?: 0
            if (equipo > 0) {
                Text(
                    "$equipo en el equipo",
                    style = MaterialTheme.typography.labelSmall,
                    color = NxColors.Muted,
                )
            }
        }

        ProyectosRules.proximoHitoTexto(proyecto)?.let { hito ->
            Row(
                horizontalArrangement = Arrangement.spacedBy(6.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Icon(
                    Icons.Default.Flag,
                    contentDescription = null,
                    tint = NxColors.Brand,
                    modifier = Modifier.size(14.dp),
                )
                Text(
                    hito,
                    style = MaterialTheme.typography.labelMedium,
                    color = NxColors.Slate,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                )
            }
        }

        val req = proyecto.resumen?.requerimientos
        if (req != null && (req.total ?: 0) > 0) {
            Text(
                "Requerimientos: ${req.cumplidos ?: 0} de ${req.total} cumplidos",
                style = MaterialTheme.typography.labelSmall,
                color = NxColors.Muted,
            )
        }
    }
}
