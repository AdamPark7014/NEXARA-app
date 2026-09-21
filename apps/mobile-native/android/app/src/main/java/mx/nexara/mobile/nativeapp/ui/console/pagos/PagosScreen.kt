package mx.nexara.mobile.nativeapp.ui.console.pagos

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.ReportProblem
import androidx.compose.material3.HorizontalDivider
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
import androidx.compose.ui.draw.clip
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import mx.nexara.mobile.nativeapp.data.api.PagoEmpleadoDto
import mx.nexara.mobile.nativeapp.ui.console.more.MoreAvisoDesactualizado
import mx.nexara.mobile.nativeapp.ui.console.more.MoreNotaDeAlcance
import mx.nexara.mobile.nativeapp.ui.enterprise.NxColors
import mx.nexara.mobile.nativeapp.ui.enterprise.NxDenseSectionHeader
import mx.nexara.mobile.nativeapp.ui.enterprise.NxEmptyState
import mx.nexara.mobile.nativeapp.ui.enterprise.NxErrorBlock
import mx.nexara.mobile.nativeapp.ui.enterprise.NxEstadoPantalla
import mx.nexara.mobile.nativeapp.ui.enterprise.NxFilterBar
import mx.nexara.mobile.nativeapp.ui.enterprise.NxFilterPill
import mx.nexara.mobile.nativeapp.ui.enterprise.NxMetricStrip
import mx.nexara.mobile.nativeapp.ui.enterprise.NxScreenScaffold
import mx.nexara.mobile.nativeapp.ui.enterprise.NxSearchField
import mx.nexara.mobile.nativeapp.ui.enterprise.NxSkeletonList
import mx.nexara.mobile.nativeapp.ui.enterprise.NxStatusDot
import mx.nexara.mobile.nativeapp.ui.enterprise.NxUi
import mx.nexara.mobile.nativeapp.ui.enterprise.nxEstadoPantalla

/**
 * Pagos a empleados (`/erp/finance/employee-payments`) en el teléfono.
 *
 * La web es una tabla con alta, edición, comprobantes y anulación. Aquí **no se
 * paga nada**: se consulta. Cada pago es una fila densa que contesta, en este
 * orden, lo que se pregunta con el teléfono en la mano: **a quién**, **cuánto**,
 * **de qué periodo** y **si el dinero ya salió**.
 *
 * Los cuatro estados de la pantalla —cargando, error, vacío y contenido— los
 * decide [nxEstadoPantalla] y por construcción no pueden coincidir: la pantalla
 * que dibujaba el error, el esqueleto y el «no hay nada» uno debajo de otro
 * dejaba a la gente sin saber si esperar o reintentar.
 *
 * Quién puede ver los pagos de quién **lo decide el servidor** y no se toca
 * desde aquí: con `CONTABILIDAD_MANAGE` se ve toda la empresa, y sin él solo el
 * propio departamento (`canViewAll` en `employee-payments.service.ts`). Esta
 * pantalla no manda ningún filtro que ensanche eso.
 *
 * Los textos, los importes y los periodos viven en [PagosRules], que se prueba
 * sin Android.
 */
@Composable
fun PagosEmpleadosScreen(vm: PagosViewModel = viewModel()) {
    val state by vm.state.collectAsState()
    val filtro by vm.filtro.collectAsState()
    val consulta by vm.consulta.collectAsState()

    LaunchedEffect(Unit) { vm.arrancar() }

    val todos = state.datos.orEmpty()
    val visibles = remember(todos, filtro, consulta) { PagosRules.aplicar(todos, filtro, consulta) }
    val conteos = remember(todos) { PagosRules.conteos(todos) }
    val metricas = remember(todos) { PagosRules.metricas(todos) }
    val avisoImportes = remember(todos) { PagosRules.avisoImportesTexto(todos) }

    // `hayDatos` es «hay filas que enseñar», no «ya contestó el servidor». Con
    // `state.hayDatos` (que solo mira si la lista llegó) una empresa sin un solo
    // pago caería en CONTENIDO y vería una barra de filtros en ceros y un «sin
    // coincidencias», en vez del vacío que explica de dónde sale el primer pago.
    val estado = nxEstadoPantalla(
        cargando = state.cargando,
        error = state.error,
        hayDatos = todos.isNotEmpty(),
    )

    NxScreenScaffold(isRefreshing = state.refrescando, onRefresh = vm::refrescar) {
        LazyColumn(
            modifier = Modifier.fillMaxSize(),
            contentPadding = PaddingValues(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            // La cinta de «esto es de hace un momento» convive con el contenido:
            // no es uno de los cuatro estados, es un aviso sobre lo que ya se ve.
            state.avisoRefresco?.let { aviso ->
                item(key = "aviso") { MoreAvisoDesactualizado(aviso, onCerrar = vm::descartarAviso) }
            }

            when (estado) {
                NxEstadoPantalla.CARGANDO -> item(key = "esqueleto") {
                    NxSkeletonList(itemCount = 5, itemHeight = 72.dp)
                }

                NxEstadoPantalla.ERROR -> item(key = "error") {
                    NxErrorBlock(state.error.orEmpty(), onRetry = vm::reintentar)
                }

                NxEstadoPantalla.VACIO -> item(key = "vacio") {
                    NxEmptyState(
                        title = "Sin pagos registrados",
                        subtitle = "Todavía no hay ningún pago al personal en esta empresa. " +
                            "El primero se captura desde la computadora, con su comprobante.",
                    )
                }

                NxEstadoPantalla.CONTENIDO -> {
                    // Regla 7: la tira solo aparece cuando hay filas que contar.
                    // Un periodo que de verdad cerró en cero sí se enseña.
                    item(key = "cifras") {
                        NxMetricStrip(
                            items = metricas,
                            seleccion = PagosRules.metricaDeFiltro(filtro),
                            onSelect = { clave ->
                                PagosRules.filtroDeMetrica(clave)?.let(vm::alternarFiltro)
                            },
                        )
                    }

                    // Lo único que puede hacer que una cifra de arriba esté mal.
                    avisoImportes?.let { texto ->
                        item(key = "aviso-importes") { AvisoDeImportes(texto) }
                    }

                    // Regla 8: una sola fila de filtros, sin caja y sin fondo.
                    item(key = "filtros") {
                        NxFilterBar(contentPadding = PaddingValues(horizontal = 0.dp)) {
                            PagosRules.Filtro.entries.forEach { opcion ->
                                NxFilterPill(
                                    label = opcion.etiqueta,
                                    count = conteos[opcion],
                                    color = PagosRules.colorDeFiltro(opcion),
                                    selected = opcion == filtro,
                                    onClick = { vm.alternarFiltro(opcion) },
                                )
                            }
                        }
                    }

                    // Con pocos pagos, buscar estorba más de lo que ayuda.
                    if (todos.size > UMBRAL_BUSQUEDA) {
                        item(key = "buscar") {
                            NxSearchField(
                                value = consulta,
                                onValueChange = vm::buscar,
                                placeholder = "Buscar por empleado, concepto o folio",
                            )
                        }
                    }

                    if (visibles.isEmpty()) {
                        item(key = "sin-coincidencias") {
                            SinCoincidencias(consulta = consulta, filtro = filtro, vm = vm)
                        }
                    } else {
                        item(key = "cabecera") {
                            NxDenseSectionHeader(
                                title = PagosRules.tituloLista(filtro),
                                hint = "Del más reciente al más viejo.",
                                trailing = {
                                    Text(
                                        visibles.size.toString(),
                                        style = MaterialTheme.typography.labelLarge
                                            .copy(fontWeight = FontWeight.Bold),
                                        color = NxUi.Fg2,
                                    )
                                },
                            )
                        }
                        // Regla 2 y regla 9: UNA superficie con filas separadas por
                        // una línea de 1px, no una tarjeta por pago dentro de otra caja.
                        item(key = "lista") {
                            Column(
                                Modifier
                                    .fillMaxWidth()
                                    .clip(RoundedCornerShape(NxUi.RadiusLg))
                                    .background(NxColors.Card)
                                    .border(1.dp, NxUi.Border, RoundedCornerShape(NxUi.RadiusLg)),
                            ) {
                                visibles.forEachIndexed { i, pago ->
                                    if (i > 0) HorizontalDivider(color = NxUi.BorderSubtle)
                                    FilaDePago(pago)
                                }
                            }
                        }
                    }
                }
            }

            item(key = "alcance") { MoreNotaDeAlcance(PagosRules.LIMITE) }
            item(key = "fin") { Spacer(Modifier.height(8.dp)) }
        }
    }
}

/**
 * Un pago, en una fila.
 *
 * A la izquierda quién y de qué; a la derecha **el importe, alineado a la
 * derecha** (regla 2: así se comparan de un vistazo) y debajo el estado como
 * punto y palabra (regla 3). Toda la fila se lee de una vez con lector de
 * pantalla: leída pieza a pieza sonaría a lista de palabras sueltas.
 */
@Composable
private fun FilaDePago(pago: PagoEmpleadoDto) {
    val empleado = PagosRules.empleadoTexto(pago)
    val concepto = PagosRules.conceptoTexto(pago)
    val contexto = PagosRules.contextoTexto(pago)
    val monto = PagosRules.montoTexto(pago)
    val estado = PagosRules.estadoDe(pago)
    val pagadoEl = PagosRules.pagadoElTexto(pago)

    val descripcion = buildString {
        append("$empleado. ")
        append("$concepto. ")
        // «—» se lee fatal en voz alta: se dice con palabras qué pasa.
        append(if (monto == PagosRules.SIN_DATO) "Importe no disponible. " else "$monto. ")
        append("${estado.etiqueta}. ")
        contexto?.let { append("$it. ") }
        pagadoEl?.let { append("$it. ") }
    }

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .heightIn(min = NxUi.TouchH)
            .padding(horizontal = 12.dp, vertical = 10.dp)
            .clearAndSetSemantics { contentDescription = descripcion },
        horizontalArrangement = Arrangement.spacedBy(12.dp),
        verticalAlignment = Alignment.Top,
    ) {
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Text(
                empleado,
                style = MaterialTheme.typography.bodyMedium.copy(fontWeight = FontWeight.Bold),
                color = NxColors.Slate,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            Text(
                concepto,
                style = MaterialTheme.typography.bodySmall,
                color = NxUi.Fg2,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
            )
            contexto?.let {
                Text(
                    it,
                    style = MaterialTheme.typography.labelSmall,
                    color = NxColors.Muted,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                )
            }
            pagadoEl?.let {
                Text(
                    it,
                    style = MaterialTheme.typography.labelSmall,
                    color = NxColors.Muted,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
        }
        Column(horizontalAlignment = Alignment.End, verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text(
                monto,
                style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Bold),
                // Un importe ilegible no grita en rojo, pero tampoco se disfraza
                // de cifra: va en gris y dice «—».
                color = if (monto == PagosRules.SIN_DATO) NxColors.Muted else NxColors.Slate,
                maxLines = 1,
                textAlign = TextAlign.End,
            )
            NxStatusDot(
                text = estado.etiqueta,
                color = PagosRules.colorDe(estado),
            )
        }
    }
}

/**
 * El aviso de que alguna cifra de arriba se quedó corta.
 *
 * Va arriba, con color y con palabras: es lo único de esta pantalla que puede
 * hacer que un total esté mal, y esconderlo sería justo lo contrario de lo que
 * pide una pantalla de nómina.
 */
@Composable
private fun AvisoDeImportes(texto: String) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(NxUi.Radius))
            .background(NxColors.WarningSoft)
            .padding(horizontal = 12.dp, vertical = 10.dp),
        horizontalArrangement = Arrangement.spacedBy(10.dp),
        verticalAlignment = Alignment.Top,
    ) {
        Icon(
            Icons.Outlined.ReportProblem,
            contentDescription = null,
            tint = NxColors.Warning,
            modifier = Modifier.size(18.dp),
        )
        Text(
            texto,
            style = MaterialTheme.typography.labelMedium,
            color = NxColors.Slate,
            modifier = Modifier.weight(1f),
        )
    }
}

/**
 * El vacío de «hay pagos, pero ninguno aquí», que no es el mismo que el de «no
 * hay pagos» —ése lo resuelve [NxEstadoPantalla.VACIO] antes de llegar aquí—.
 * Decir «sin pagos registrados» con treinta detrás de un filtro sería mentir,
 * así que lo útil aquí es el botón que deshace el filtro o la búsqueda.
 */
@Composable
private fun SinCoincidencias(
    consulta: String,
    filtro: PagosRules.Filtro,
    vm: PagosViewModel,
) {
    if (consulta.isNotBlank()) {
        NxEmptyState(
            title = "Sin coincidencias",
            subtitle = "Ningún pago coincide con «$consulta».",
            actionLabel = "Limpiar búsqueda",
            onAction = { vm.buscar("") },
        )
    } else {
        NxEmptyState(
            title = "Nada en «${filtro.etiqueta.lowercase()}»",
            subtitle = when (filtro) {
                PagosRules.Filtro.PAGADOS -> "Todavía no se ha liquidado ningún pago."
                PagosRules.Filtro.BORRADORES -> "No queda ningún pago esperando autorización."
                PagosRules.Filtro.ANULADOS -> "No se ha anulado ningún pago. Buena señal."
                PagosRules.Filtro.TODOS -> "No hay pagos en este filtro."
            },
            actionLabel = "Ver todos",
            onAction = { vm.cambiarFiltro(PagosRules.Filtro.TODOS) },
        )
    }
}

/** A partir de cuántos pagos aparece el buscador. Con menos, estorba. */
private const val UMBRAL_BUSQUEDA = 6
