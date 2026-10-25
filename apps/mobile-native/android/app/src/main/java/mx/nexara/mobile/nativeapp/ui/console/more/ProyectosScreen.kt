package mx.nexara.mobile.nativeapp.ui.console.more

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
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
import mx.nexara.mobile.nativeapp.ui.enterprise.NxScreenScaffold
import mx.nexara.mobile.nativeapp.ui.enterprise.NxSearchField
import mx.nexara.mobile.nativeapp.ui.enterprise.NxSkeletonList
import mx.nexara.mobile.nativeapp.ui.enterprise.NxStatusChip
import mx.nexara.mobile.nativeapp.ui.enterprise.NxTone
import mx.nexara.mobile.nativeapp.ui.enterprise.fg
import mx.nexara.mobile.nativeapp.ui.enterprise.nxFriendlyError

/**
 * Proyectos (`/erp/proyectos`) en el teléfono.
 *
 * Cada dato de la tarjeta va en su renglón. El vacío y el error caben en una
 * frase. Los filtros y los textos viven en [ProyectosRules], que se prueba sin Android.
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
                item(key = "error") {
                    NxEmptyState(
                        title = unaFrase(nxFriendlyError(error)),
                        subtitle = "",
                        actionLabel = "Reintentar",
                        onAction = vm::reintentar,
                    )
                }
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
                            NxEmptyState(title = "Sin proyectos", subtitle = "")
                        } else if (consulta.isNotBlank()) {
                            NxEmptyState(
                                title = "Sin coincidencias",
                                subtitle = "",
                                actionLabel = "Limpiar búsqueda",
                                onAction = { vm.buscar("") },
                            )
                        } else {
                            NxEmptyState(
                                title = "Nada en «${filtro.etiqueta.lowercase()}»",
                                subtitle = "",
                                actionLabel = "Ver todos",
                                onAction = { vm.cambiarFiltro(ProyectosRules.Filtro.TODOS) },
                            )
                        }
                    }
                } else {
                    item(key = "cabecera") {
                        MoreCabecera(
                            titulo = filtro.etiqueta,
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

/** Un proyecto: un dato por renglón. El porcentaje desconocido no se pinta como cero. */
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
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
        NxStatusChip(ProyectosRules.etiquetaSalud(proyecto), tono)
        if (avance != null) {
            Text(
                "$avance %",
                style = MaterialTheme.typography.labelMedium,
                color = NxColors.Muted,
                maxLines = 1,
            )
        }
        Text(
            ProyectosRules.avanceTexto(proyecto),
            style = MaterialTheme.typography.labelSmall,
            color = NxColors.Muted,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
        Text(
            ProyectosRules.plazoTexto(proyecto),
            style = MaterialTheme.typography.labelMedium.copy(fontWeight = FontWeight.SemiBold),
            color = if (tono == NxTone.Danger || tono == NxTone.Warning) tono.fg() else NxColors.Muted,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
        val equipo = proyecto.equipoCount ?: 0
        if (equipo > 0) {
            Text(
                "$equipo en el equipo",
                style = MaterialTheme.typography.labelSmall,
                color = NxColors.Muted,
                maxLines = 1,
            )
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
                    maxLines = 1,
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
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
    }
}

/** La primera oración. El vacío y el error de esta pantalla no siguen con otra. */
private fun unaFrase(texto: String): String {
    val limpio = texto.trim()
    val corte = limpio.indexOfAny(charArrayOf('.', '!', '?'))
    if (corte < 0 || corte == limpio.lastIndex) return limpio
    return if (limpio.substring(corte + 1).isBlank()) limpio else limpio.substring(0, corte + 1)
}
