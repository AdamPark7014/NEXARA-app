package mx.nexara.mobile.nativeapp.ui.console.cotizaciones

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
import androidx.compose.material.icons.automirrored.filled.ScheduleSend
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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import java.time.LocalDate
import mx.nexara.mobile.nativeapp.data.api.CotizacionResumenDto
import mx.nexara.mobile.nativeapp.ui.console.more.MoreAvisoDesactualizado
import mx.nexara.mobile.nativeapp.ui.console.more.MoreCabecera
import mx.nexara.mobile.nativeapp.ui.console.more.MoreFilaDePastillas
import mx.nexara.mobile.nativeapp.ui.console.more.MoreNotaDeAlcance
import mx.nexara.mobile.nativeapp.ui.console.more.MorePastilla
import mx.nexara.mobile.nativeapp.ui.console.more.MoreTarjeta
import mx.nexara.mobile.nativeapp.ui.console.viaticos.Dinero
import mx.nexara.mobile.nativeapp.ui.enterprise.NxColors
import mx.nexara.mobile.nativeapp.ui.enterprise.NxEmptyState
import mx.nexara.mobile.nativeapp.ui.enterprise.NxErrorBlock
import mx.nexara.mobile.nativeapp.ui.enterprise.NxScreenScaffold
import mx.nexara.mobile.nativeapp.ui.enterprise.NxSearchField
import mx.nexara.mobile.nativeapp.ui.enterprise.NxSkeletonList
import mx.nexara.mobile.nativeapp.ui.enterprise.NxStatusChip
import mx.nexara.mobile.nativeapp.ui.enterprise.NxTone
import mx.nexara.mobile.nativeapp.ui.enterprise.fg

/** El estado de la cotización con el tono del design system. */
internal fun CotizacionesRules.Estado.tono(): NxTone = when (this) {
    CotizacionesRules.Estado.BORRADOR -> NxTone.Neutral
    CotizacionesRules.Estado.ENVIADA -> NxTone.Info
    CotizacionesRules.Estado.APROBADA -> NxTone.Success
    CotizacionesRules.Estado.RECHAZADA -> NxTone.Danger
    CotizacionesRules.Estado.VENCIDA -> NxTone.Warning
    CotizacionesRules.Estado.DESCONOCIDO -> NxTone.Neutral
}

/**
 * Cotizaciones (`/erp/cotizaciones`) en el teléfono.
 *
 * La web trae una tabla de nueve columnas y el editor completo de la propuesta.
 * Aquí no se cotiza: se consulta. Cada cotización es una tarjeta que contesta,
 * en este orden, lo que se pregunta con el teléfono en la mano: **de quién es y
 * cuánto** (folio, cliente y monto), **en qué va** (el estado) y **si urge**
 * (una enviada a punto de vencer).
 *
 * Los filtros, la búsqueda y los textos viven en [CotizacionesRules], que se
 * prueba sin Android.
 */
@Composable
fun CotizacionesScreen(
    onAbrirCotizacion: (Long) -> Unit,
    vm: CotizacionesViewModel = viewModel(),
) {
    val state by vm.state.collectAsState()
    val filtro by vm.filtro.collectAsState()
    val consulta by vm.consulta.collectAsState()

    LaunchedEffect(Unit) { vm.arrancar() }

    val todas = state.datos.orEmpty()
    val visibles = remember(todas, filtro, consulta) { CotizacionesRules.aplicar(todas, filtro, consulta) }
    val conteos = remember(todas) { CotizacionesRules.conteos(todas) }
    val cifras = remember(todas) { CotizacionesRules.cifras(todas) }
    // El aviso de vigencia se calcula contra el día de hoy; se fija una vez por
    // composición para que todas las tarjetas cuenten desde la misma fecha.
    val hoy = remember { LocalDate.now() }

    NxScreenScaffold(isRefreshing = state.refrescando, onRefresh = vm::refrescar) {
        LazyColumn(
            modifier = Modifier.fillMaxSize(),
            contentPadding = PaddingValues(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            item(key = "filtros") {
                MoreFilaDePastillas(
                    CotizacionesRules.Filtro.entries.map { opcion ->
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
                item(key = "esqueleto") { NxSkeletonList(itemCount = 4, itemHeight = 132.dp) }
            }

            // Error y vacío nunca coinciden: el error solo existe cuando no hay
            // nada cargado, y el vacío solo cuando la carga sí llegó.
            state.error?.takeIf { !state.hayDatos }?.let { error ->
                item(key = "error") { NxErrorBlock(error, onRetry = vm::reintentar) }
            }

            if (state.hayDatos) {
                if (todas.isNotEmpty()) {
                    item(key = "cifras") { CifrasDeCotizaciones(cifras) }
                }

                if (todas.size > 6) {
                    item(key = "buscar") {
                        NxSearchField(
                            value = consulta,
                            onValueChange = vm::buscar,
                            placeholder = "Buscar por folio, cliente o quien la hizo",
                        )
                    }
                }

                if (visibles.isEmpty()) {
                    item(key = "vacio") { VacioDeCotizaciones(todas.isEmpty(), consulta, filtro, vm) }
                } else {
                    item(key = "cabecera") {
                        MoreCabecera(
                            titulo = filtro.etiqueta,
                            subtitulo = "De la más reciente a la más vieja",
                            trailing = "${visibles.size}",
                        )
                    }
                    items(visibles, key = { it.id ?: it.hashCode().toLong() }) { cotizacion ->
                        TarjetaDeCotizacion(
                            cotizacion = cotizacion,
                            hoy = hoy,
                            onAbrir = { cotizacion.id?.let(onAbrirCotizacion) },
                        )
                    }
                }
            }

            item(key = "alcance") { MoreNotaDeAlcance(CotizacionesRules.LIMITE) }
        }
    }
}

/**
 * El vacío, que es distinto según por qué está vacío.
 *
 * Sin registros es una empresa que todavía no cotiza; con registros pero sin
 * coincidencias es una búsqueda o un filtro que no encontró nada, y ahí lo útil
 * es el botón que lo deshace. Decir «no hay cotizaciones» cuando hay treinta
 * detrás de un filtro sería mentir.
 */
@Composable
private fun VacioDeCotizaciones(
    sinRegistros: Boolean,
    consulta: String,
    filtro: CotizacionesRules.Filtro,
    vm: CotizacionesViewModel,
) {
    when {
        sinRegistros -> NxEmptyState(
            title = "Sin cotizaciones",
            subtitle = "Todavía no hay ninguna cotización en esta empresa. " +
                "La primera se arma desde la computadora.",
        )
        consulta.isNotBlank() -> NxEmptyState(
            title = "Sin coincidencias",
            subtitle = "Ninguna cotización coincide con «$consulta».",
            actionLabel = "Limpiar búsqueda",
            onAction = { vm.buscar("") },
        )
        else -> NxEmptyState(
            title = "Nada en «${filtro.etiqueta.lowercase()}»",
            subtitle = when (filtro) {
                CotizacionesRules.Filtro.POR_CERRAR ->
                    "No hay cotizaciones enviadas esperando respuesta del cliente."
                CotizacionesRules.Filtro.BORRADORES ->
                    "No queda ningún borrador por terminar."
                CotizacionesRules.Filtro.APROBADAS ->
                    "Todavía no hay ninguna aprobada."
                CotizacionesRules.Filtro.PERDIDAS ->
                    "Ninguna se rechazó ni se venció. Buena señal."
                CotizacionesRules.Filtro.TODAS ->
                    "No hay cotizaciones en este filtro."
            },
            actionLabel = "Ver todas",
            onAction = { vm.cambiarFiltro(CotizacionesRules.Filtro.TODAS) },
        )
    }
}

/** Lo que está en la mesa y lo que ya se ganó, en una sola tarjeta. */
@Composable
private fun CifrasDeCotizaciones(cifras: CotizacionesRules.Cifras) {
    MoreTarjeta {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            CifraSuelta(
                etiqueta = "Por cerrar",
                valor = Dinero.pesos(cifras.porCerrarCentavos),
                pie = if (cifras.porCerrar == 1) "1 enviada" else "${cifras.porCerrar} enviadas",
                color = NxColors.Brand,
                modifier = Modifier.weight(1f),
            )
            CifraSuelta(
                etiqueta = "Aprobadas",
                valor = Dinero.pesos(cifras.aprobadoCentavos),
                pie = if (cifras.aprobadas == 1) "1 aprobada" else "${cifras.aprobadas} aprobadas",
                color = NxColors.Success,
                modifier = Modifier.weight(1f),
            )
        }
    }
}

@Composable
private fun CifraSuelta(
    etiqueta: String,
    valor: String,
    pie: String,
    color: Color,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier = modifier.semantics { contentDescription = "$etiqueta: $valor, $pie" },
        verticalArrangement = Arrangement.spacedBy(2.dp),
    ) {
        Text(etiqueta, style = MaterialTheme.typography.labelMedium, color = NxColors.Muted)
        Text(
            valor,
            style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Bold),
            color = color,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
        Text(pie, style = MaterialTheme.typography.labelSmall, color = NxColors.Muted)
    }
}

/**
 * Una cotización: folio y estado arriba, cliente en medio, monto grande abajo.
 *
 * El folio va en monoespaciado porque es un código que se compara carácter a
 * carácter contra un correo o un WhatsApp, y con letra proporcional dos folios
 * parecidos se confunden.
 */
@Composable
private fun TarjetaDeCotizacion(
    cotizacion: CotizacionResumenDto,
    hoy: LocalDate,
    onAbrir: () -> Unit,
) {
    val estado = CotizacionesRules.estadoDe(cotizacion)
    val tono = estado.tono()
    val vigencia = CotizacionesRules.vigenciaTexto(cotizacion, hoy)
    val vigenciaTono = if (CotizacionesRules.vigenciaVencida(cotizacion, hoy)) NxTone.Danger else NxTone.Warning

    MoreTarjeta(onClick = onAbrir) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(10.dp),
            verticalAlignment = Alignment.Top,
        ) {
            Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                Text(
                    cotizacion.folio?.trim()?.ifEmpty { null } ?: "Sin folio",
                    style = MaterialTheme.typography.labelLarge.copy(
                        fontWeight = FontWeight.Bold,
                        fontFamily = FontFamily.Monospace,
                    ),
                    color = NxColors.Slate,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                )
                Text(
                    CotizacionesRules.clienteTexto(cotizacion),
                    style = MaterialTheme.typography.bodyMedium.copy(fontWeight = FontWeight.SemiBold),
                    color = NxColors.Slate,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                )
                CotizacionesRules.contextoTexto(cotizacion)?.let { contexto ->
                    Text(
                        contexto,
                        style = MaterialTheme.typography.bodySmall,
                        color = NxColors.Muted,
                        maxLines = 2,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
            }
            NxStatusChip(CotizacionesRules.etiquetaEstado(cotizacion), tono)
        }

        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalAlignment = Alignment.Bottom,
        ) {
            Text(
                CotizacionesRules.montoTexto(cotizacion),
                style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Bold),
                color = NxColors.Slate,
                modifier = Modifier.weight(1f),
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            CotizacionesRules.fechaTexto(cotizacion)?.let { fecha ->
                Text(
                    fecha,
                    style = MaterialTheme.typography.labelSmall,
                    color = NxColors.Muted,
                    textAlign = TextAlign.End,
                )
            }
        }

        // La única alarma de la lista: una enviada que se acaba (o ya se acabó).
        if (vigencia != null) {
            Row(
                horizontalArrangement = Arrangement.spacedBy(6.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Icon(
                    Icons.AutoMirrored.Filled.ScheduleSend,
                    contentDescription = null,
                    tint = vigenciaTono.fg(),
                    modifier = Modifier.size(14.dp),
                )
                Text(
                    vigencia,
                    style = MaterialTheme.typography.labelMedium.copy(fontWeight = FontWeight.SemiBold),
                    color = vigenciaTono.fg(),
                )
            }
        }

        val siglas = CotizacionesRules.siglas(cotizacion)
        val autoria = CotizacionesRules.autoriaTexto(cotizacion)
        if (siglas.isNotEmpty() || autoria != null) {
            Text(
                listOfNotNull(autoria, siglas.takeIf { it.isNotEmpty() }?.joinToString(" · "))
                    .joinToString(" — "),
                style = MaterialTheme.typography.labelSmall,
                color = NxColors.Muted,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
            )
        }
    }
}
