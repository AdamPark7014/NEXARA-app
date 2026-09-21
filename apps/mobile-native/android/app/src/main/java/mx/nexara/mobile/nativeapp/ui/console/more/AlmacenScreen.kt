package mx.nexara.mobile.nativeapp.ui.console.more

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
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
import mx.nexara.mobile.nativeapp.data.api.StockLevelDto
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
 * Almacén (`/erp/almacen`) en el teléfono, **solo consulta**.
 *
 * La tabla de la web tiene nueve columnas: producto, SKU, almacén, ubicación,
 * cantidad, reservado, disponible, punto de reorden y costo. En un teléfono eso
 * es ilegible, y además no es la pregunta que se hace en campo. La pregunta es
 * «¿alcanza o hay que pedir?», así que la pantalla **abre en lo que está bajo
 * mínimo** —que es la lista de compras— y el inventario completo queda en la
 * segunda pestaña, con buscador.
 *
 * Cada renglón lleva el producto, dónde está, la cantidad grande y una barra que
 * compara lo que hay contra el punto de reorden. El costo no sale: en el bolsillo
 * no se decide un precio, y sí se enseña delante de un cliente.
 *
 * Las cuentas viven en [AlmacenRules], que se prueba sin Android.
 */
@Composable
fun AlmacenScreen(vm: AlmacenViewModel = viewModel()) {
    val state by vm.state.collectAsState()
    val vista by vm.vista.collectAsState()
    val consulta by vm.consulta.collectAsState()

    LaunchedEffect(Unit) { vm.arrancar() }

    val datos = state.datos
    val visibles = remember(datos, vista, consulta) {
        val base = when (vista) {
            AlmacenRules.Vista.BAJO_MINIMO -> AlmacenRules.ordenarPorUrgencia(datos?.bajoMinimo.orEmpty())
            AlmacenRules.Vista.TODO -> AlmacenRules.ordenarPorNombre(datos?.niveles.orEmpty())
        }
        AlmacenRules.filtrar(base, consulta)
    }

    NxScreenScaffold(isRefreshing = state.refrescando, onRefresh = vm::refrescar) {
        LazyColumn(
            modifier = Modifier.fillMaxSize(),
            contentPadding = PaddingValues(16.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            item(key = "vistas") {
                MoreFilaDePastillas(
                    AlmacenRules.Vista.entries.map { opcion ->
                        MorePastilla(
                            etiqueta = opcion.etiqueta,
                            conteo = when (opcion) {
                                AlmacenRules.Vista.BAJO_MINIMO -> datos?.bajoMinimo?.size
                                AlmacenRules.Vista.TODO -> datos?.niveles?.size
                            },
                            seleccionada = opcion == vista,
                            onClick = { vm.cambiarVista(opcion) },
                        )
                    },
                )
            }

            state.avisoRefresco?.let { aviso ->
                item(key = "aviso") { MoreAvisoDesactualizado(aviso, onCerrar = vm::descartarAviso) }
            }

            if (state.cargando && !state.hayDatos) {
                item(key = "esqueleto") { NxSkeletonList(itemCount = 6, itemHeight = 88.dp) }
            }

            state.error?.takeIf { !state.hayDatos }?.let { error ->
                item(key = "error") { NxErrorBlock(error, onRetry = vm::reintentar) }
            }

            if (datos != null) {
                AlmacenRules.resumenAlertas(datos.bajoMinimo)?.let { resumen ->
                    item(key = "resumen") {
                        MoreTarjeta {
                            Text(
                                "Hay que pedir",
                                style = MaterialTheme.typography.labelMedium,
                                color = NxColors.Muted,
                            )
                            Text(
                                resumen,
                                style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Bold),
                                color = NxColors.Danger,
                            )
                            Text(
                                "De ${datos.niveles.size} existencias en total",
                                style = MaterialTheme.typography.labelSmall,
                                color = NxColors.Muted,
                            )
                        }
                    }
                }

                if (vista == AlmacenRules.Vista.TODO || datos.bajoMinimo.size > 6) {
                    item(key = "buscar") {
                        NxSearchField(
                            value = consulta,
                            onValueChange = vm::buscar,
                            placeholder = "Buscar por producto, SKU o almacén",
                        )
                    }
                }

                if (visibles.isEmpty()) {
                    item(key = "vacio") { VacioDeAlmacen(vista, consulta, datos.niveles.size, vm) }
                } else {
                    item(key = "cabecera") {
                        MoreCabecera(
                            titulo = vista.etiqueta,
                            subtitulo = when (vista) {
                                AlmacenRules.Vista.BAJO_MINIMO -> "Primero lo que ya se acabó"
                                AlmacenRules.Vista.TODO -> "En orden alfabético"
                            },
                            trailing = "${visibles.size}",
                        )
                    }
                    items(visibles, key = { it.id ?: it.hashCode().toLong() }) { nivel ->
                        FilaDeExistencia(nivel)
                    }
                }
            }

            item(key = "alcance") { MoreNotaDeAlcance(AlmacenRules.LIMITE) }
        }
    }
}

@Composable
private fun VacioDeAlmacen(
    vista: AlmacenRules.Vista,
    consulta: String,
    totalNiveles: Int,
    vm: AlmacenViewModel,
) {
    when {
        consulta.isNotBlank() -> NxEmptyState(
            title = "Sin coincidencias",
            subtitle = "Ningún producto coincide con «$consulta».",
            actionLabel = "Limpiar búsqueda",
            onAction = { vm.buscar("") },
        )
        vista == AlmacenRules.Vista.BAJO_MINIMO && totalNiveles > 0 -> NxEmptyState(
            title = "Nada bajo mínimo",
            subtitle = "Ningún producto con punto de reorden está por acabarse.",
            actionLabel = "Ver todo el inventario",
            onAction = { vm.cambiarVista(AlmacenRules.Vista.TODO) },
        )
        else -> NxEmptyState(
            title = "Sin existencias",
            subtitle = "Todavía no hay productos con existencia en los almacenes de esta empresa.",
        )
    }
}

/**
 * Una existencia. La cantidad va grande a la derecha porque es lo que se busca
 * con la vista; la barra dice de un golpe si está por encima o por debajo del
 * mínimo, y el texto lo repite con palabras para quien no ve el color.
 */
@Composable
private fun FilaDeExistencia(nivel: StockLevelDto) {
    val agotado = AlmacenRules.agotado(nivel)
    val bajo = AlmacenRules.bajoMinimo(nivel)
    val tono = when {
        agotado -> NxTone.Danger
        bajo -> NxTone.Warning
        else -> NxTone.Success
    }
    val estado = when {
        agotado -> "Agotado"
        bajo -> "Bajo mínimo"
        else -> "Con existencia"
    }

    MoreTarjeta {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(12.dp),
            verticalAlignment = Alignment.Top,
        ) {
            Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                Text(
                    AlmacenRules.titulo(nivel),
                    style = MaterialTheme.typography.bodyLarge.copy(fontWeight = FontWeight.SemiBold),
                    color = NxColors.Slate,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                )
                Text(
                    AlmacenRules.ubicacionTexto(nivel),
                    style = MaterialTheme.typography.labelMedium,
                    color = NxColors.Muted,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                )
            }
            Column(horizontalAlignment = Alignment.End) {
                Text(
                    AlmacenRules.formato(AlmacenRules.cantidad(nivel)),
                    style = MaterialTheme.typography.headlineSmall.copy(fontWeight = FontWeight.Bold),
                    color = tono.fg(),
                    maxLines = 1,
                )
                Text("en existencia", style = MaterialTheme.typography.labelSmall, color = NxColors.Muted)
            }
        }

        MoreBarra(
            progreso = AlmacenRules.progreso(nivel),
            etiqueta = AlmacenRules.detalleTexto(nivel),
            tono = tono,
        )

        NxStatusChip(estado, tono)
    }
}
