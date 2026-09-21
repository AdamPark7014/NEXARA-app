package mx.nexara.mobile.nativeapp.ui.console.gastos

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material3.ExtendedFloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.viewmodel.compose.viewModel
import kotlinx.coroutines.launch
import mx.nexara.mobile.nativeapp.data.api.GastoDto
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
import mx.nexara.mobile.nativeapp.ui.enterprise.NxRowDivider
import mx.nexara.mobile.nativeapp.ui.enterprise.NxScreenScaffold
import mx.nexara.mobile.nativeapp.ui.enterprise.NxSearchField
import mx.nexara.mobile.nativeapp.ui.enterprise.NxSkeletonList
import mx.nexara.mobile.nativeapp.ui.enterprise.NxSnackbarHost
import mx.nexara.mobile.nativeapp.ui.enterprise.NxStatusDot
import mx.nexara.mobile.nativeapp.ui.enterprise.NxUi
import mx.nexara.mobile.nativeapp.ui.enterprise.nxEstadoPantalla
import mx.nexara.mobile.nativeapp.ui.enterprise.rememberNxSnackbarHostState

/**
 * Los importes se pintan con cifras de ancho fijo.
 *
 * Es la regla 2 del contrato de diseño (`tabular-nums`): con la letra
 * proporcional, `$1,111.00` ocupa bastante menos que `$8,888.00` y una columna
 * de montos deja de poder compararse de un vistazo, que es justo para lo que
 * existe esa columna.
 */
internal val CIFRAS_TABULARES = TextStyle(fontFeatureSettings = "tnum")

/** Ancho mínimo de la columna del monto: que la cifra no baile de fila en fila. */
private val ANCHO_MONTO = 96.dp

/**
 * Gastos administrativos (`/erp/finance/expenses`) en el teléfono.
 *
 * La web tiene una tabla de seis columnas, dos pestañas y un reporte por rango
 * de fechas. Aquí se hace lo que se hace con el teléfono en la mano:
 * **registrar el gasto con la foto del ticket** donde se pagó, y **autorizarlo
 * o marcarlo pagado** desde donde estés. Corregir y reportar siguen siendo
 * trabajo de escritorio, y la nota del pie lo dice sin echar a nadie al
 * navegador.
 *
 * Sigue el contrato de `.ai/DISENO-FINANZAS.md`: una tira de cifras en vez de
 * tarjetas con resplandor (1 y 7), filas densas con el monto a la derecha (2),
 * el estado como punto y palabra (3), un único botón primario (4), una sola
 * barra de filtros (8) y ninguna caja dentro de otra caja (9).
 *
 * Los filtros, la búsqueda, las cifras y los textos viven en [GastosRules], que
 * se prueba sin Android.
 */
@Composable
fun GastosScreen(vm: GastosViewModel = viewModel()) {
    val state by vm.state.collectAsState()
    val filtro by vm.filtro.collectAsState()
    val consulta by vm.consulta.collectAsState()
    val accion by vm.accion.collectAsState()
    val snackbar = rememberNxSnackbarHostState()

    LaunchedEffect(Unit) { vm.arrancar() }

    // Qué hoja está abierta. Se guarda el id y no la fila: al releer del
    // servidor, la hoja tiene que enseñar el gasto nuevo, no la copia vieja.
    var abiertoId by rememberSaveable { mutableStateOf<Long?>(null) }
    var altaAbierta by rememberSaveable { mutableStateOf(false) }

    val todos = state.datos.orEmpty()
    val visibles = remember(todos, filtro, consulta) { GastosRules.aplicar(todos, filtro, consulta) }
    val conteos = remember(todos) { GastosRules.conteos(todos) }
    val cifras = remember(todos) { GastosRules.cifras(todos) }
    val abierto = remember(todos, abiertoId) { todos.firstOrNull { it.id == abiertoId } }

    // Los cuatro estados son excluyentes: nunca se pinta el esqueleto encima de
    // un vacío, ni un «no hay gastos» cuando lo que pasó es que falló la red.
    //
    // «Hay datos» es que haya **filas**, no que la respuesta llegara: una
    // empresa que todavía no captura gastos devuelve un arreglo vacío, y darlo
    // por contenido la dejaba leyendo «nada en todos» con un botón para quitar
    // un filtro que no había puesto, en vez del texto que dice cómo empezar.
    val estadoPantalla = nxEstadoPantalla(
        cargando = state.cargando,
        error = state.error,
        hayDatos = todos.isNotEmpty(),
    )

    // El resultado de una acción se cuenta una sola vez. Si salió bien, además
    // cierra la hoja que lo pidió: dejarla abierta encima de una lista que ya
    // cambió invita a tocar el botón otra vez.
    //
    // El aviso se lanza en el ámbito de la pantalla y no en el del efecto a
    // propósito: `limpiarAccion` cambia justo las claves de este efecto, así
    // que Compose lo cancela al recomponer y la cinta se apagaría a media
    // frase. En el ámbito de la pantalla vive hasta que se lee o se sustituye.
    val alcance = rememberCoroutineScope()
    LaunchedEffect(accion.aviso, accion.error) {
        val mensaje = accion.aviso ?: accion.error ?: return@LaunchedEffect
        if (accion.aviso != null) {
            abiertoId = null
            altaAbierta = false
        }
        vm.limpiarAccion()
        alcance.launch { snackbar.showSnackbar(mensaje) }
    }

    NxScreenScaffold(isRefreshing = state.refrescando, onRefresh = vm::refrescar) {
        Column(Modifier.fillMaxSize()) {
            // Regla 8: los filtros son UNA fila que se desliza, sin caja propia
            // y sin fondo. Solo cuando hay algo que filtrar: sobre un error o
            // una lista vacía son ruido que tapa lo único que ayuda ahí.
            if (estadoPantalla == NxEstadoPantalla.CONTENIDO) {
                NxFilterBar(modifier = Modifier.padding(vertical = 10.dp)) {
                    GastosRules.Filtro.entries.forEach { opcion ->
                        NxFilterPill(
                            label = opcion.etiqueta,
                            count = conteos[opcion],
                            selected = opcion == filtro,
                            onClick = { vm.alternarFiltro(opcion) },
                        )
                    }
                }
            }

            LazyColumn(
                modifier = Modifier.fillMaxSize(),
                // Sin separación automática: las filas de la tabla van pegadas
                // unas a otras y la separación entre bloques se pone a mano.
                contentPadding = PaddingValues(start = 16.dp, end = 16.dp, top = 4.dp, bottom = 96.dp),
                verticalArrangement = Arrangement.spacedBy(0.dp),
            ) {
                state.avisoRefresco?.let { aviso ->
                    item(key = "aviso") {
                        MoreAvisoDesactualizado(aviso, onCerrar = vm::descartarAviso)
                        Espacio(12)
                    }
                }

                when (estadoPantalla) {
                    NxEstadoPantalla.CARGANDO -> item(key = "esqueleto") {
                        NxSkeletonList(itemCount = 5, itemHeight = 68.dp)
                    }

                    NxEstadoPantalla.ERROR -> item(key = "error") {
                        NxErrorBlock(state.error.orEmpty(), onRetry = vm::reintentar)
                    }

                    NxEstadoPantalla.VACIO -> item(key = "vacio") {
                        NxEmptyState(
                            title = "Todavía no hay gastos",
                            subtitle = "Aquí se juntan la renta, los servicios, las suscripciones y lo que " +
                                "se paga de la bolsa. El primero se registra con la foto de su ticket.",
                            actionLabel = "Registrar un gasto",
                            onAction = { altaAbierta = true },
                        )
                    }

                    NxEstadoPantalla.CONTENIDO -> {
                        // Reglas 1 y 7: la tira solo aparece cuando hay filas
                        // que contar, y tocar una celda filtra la lista en el
                        // sitio en vez de mandar a otro control.
                        if (cifras.isNotEmpty()) {
                            item(key = "cifras") {
                                NxMetricStrip(
                                    items = cifras,
                                    seleccion = filtro.clave,
                                    onSelect = vm::alternarPorClave,
                                )
                                Espacio(12)
                            }
                        }

                        // Con pocos gastos, buscar es más trabajo que mirar.
                        if (todos.size > UMBRAL_BUSQUEDA) {
                            item(key = "buscar") {
                                NxSearchField(
                                    value = consulta,
                                    onValueChange = vm::buscar,
                                    placeholder = "Buscar por concepto, persona o categoría",
                                )
                                Espacio(12)
                            }
                        }

                        if (visibles.isEmpty()) {
                            item(key = "sin-coincidencias") {
                                VacioDeFiltro(consulta = consulta, filtro = filtro, vm = vm)
                            }
                        } else {
                            item(key = "cabecera") {
                                NxDenseSectionHeader(
                                    title = filtro.etiqueta,
                                    hint = "Del más reciente al más viejo",
                                    trailing = {
                                        Text(
                                            "${visibles.size}",
                                            fontSize = 12.sp,
                                            color = NxColors.Muted,
                                        )
                                    },
                                )
                                Espacio(8)
                            }
                            itemsIndexed(
                                visibles,
                                key = { _, gasto -> gasto.id ?: gasto.hashCode().toLong() },
                            ) { indice, gasto ->
                                FilaDeGasto(
                                    gasto = gasto,
                                    primera = indice == 0,
                                    ultima = indice == visibles.lastIndex,
                                    onAbrir = { abiertoId = gasto.id },
                                )
                            }
                        }
                    }
                }

                item(key = "alcance") {
                    Espacio(12)
                    MoreNotaDeAlcance(GastosRules.LIMITE)
                }
            }
        }

        // Regla 4: un solo botón primario, y es a lo que se vino. En el
        // teléfono vive donde alcanza el pulgar, no arriba entre los filtros.
        ExtendedFloatingActionButton(
            onClick = { altaAbierta = true },
            icon = { Icon(Icons.Default.Add, contentDescription = null) },
            text = { Text("Registrar gasto", fontWeight = FontWeight.SemiBold) },
            containerColor = NxColors.Brand,
            contentColor = Color.White,
            modifier = Modifier
                .align(Alignment.BottomEnd)
                .padding(16.dp)
                .heightIn(min = 56.dp),
        )

        NxSnackbarHost(
            snackbar,
            modifier = Modifier.align(Alignment.BottomCenter).padding(bottom = 72.dp),
        )
    }

    abierto?.let { gasto ->
        HojaDeGasto(
            gasto = gasto,
            puedeDecidir = vm.puedeDecidir,
            enviando = accion.enviando,
            onAutorizar = { vm.autorizar(it) },
            onRechazar = { id, motivo -> vm.rechazar(id, motivo) },
            onMarcarPagado = { vm.marcarPagado(it) },
            onCerrar = { abiertoId = null },
        )
    }

    if (altaAbierta) {
        HojaDeAltaDeGasto(
            enviando = accion.enviando,
            onRegistrar = { concepto, importe, categoria, recurrente, fecha, ticket ->
                vm.registrar(concepto, importe, categoria, recurrente, fecha, ticket)
            },
            onCerrar = { altaAbierta = false },
        )
    }
}

/** A partir de cuántos gastos vale la pena ofrecer el buscador. */
private const val UMBRAL_BUSQUEDA = 6

/** Separación entre bloques; la lista no la pone sola porque las filas van pegadas. */
@Composable
private fun Espacio(alto: Int) {
    Spacer(Modifier.height(alto.dp))
}

/**
 * El vacío de un filtro, que no es el mismo que el de una empresa sin gastos.
 *
 * Decir «no hay gastos» con treinta detrás de un filtro sería mentir, así que
 * aquí se nombra el filtro y se ofrece deshacerlo, que es lo único útil.
 */
@Composable
private fun VacioDeFiltro(
    consulta: String,
    filtro: GastosRules.Filtro,
    vm: GastosViewModel,
) {
    if (consulta.isNotBlank()) {
        NxEmptyState(
            title = "Sin coincidencias",
            subtitle = "Ningún gasto coincide con «$consulta».",
            actionLabel = "Limpiar búsqueda",
            onAction = { vm.buscar("") },
        )
        return
    }
    NxEmptyState(
        title = "Nada en «${filtro.etiqueta.lowercase()}»",
        subtitle = when (filtro) {
            GastosRules.Filtro.POR_AUTORIZAR -> "No hay gastos esperando visto bueno. Al día."
            GastosRules.Filtro.POR_PAGAR -> "No queda ningún gasto autorizado sin pagar."
            GastosRules.Filtro.SIN_COMPROBANTE ->
                "Todos los gastos tienen su comprobante. Nada bloquea el cierre."
            GastosRules.Filtro.PAGADOS -> "Todavía no se ha liquidado ningún gasto."
            GastosRules.Filtro.RECHAZADOS -> "No se ha rechazado ninguno. Buena señal."
            GastosRules.Filtro.TODOS -> "No hay gastos en este filtro."
        },
        actionLabel = "Ver todos",
        onAction = { vm.cambiarFiltro(GastosRules.Filtro.TODOS) },
    )
}

/**
 * Una fila de la tabla densa.
 *
 * Las filas comparten una sola superficie blanca con las esquinas redondeadas
 * arriba y abajo del bloque, y se separan con una línea de 1 px: es una tabla,
 * no una pila de tarjetas con sombra (reglas 2 y 9). Cada fila se emite como su
 * propio elemento de la lista para que Compose solo componga las que se ven; un
 * año de gastos son cientos de renglones.
 *
 * El orden de lectura es el del contrato: concepto y su contexto a la
 * izquierda, **monto a la derecha y en cifras de ancho fijo**, y debajo la
 * fecha y el estado. La única alarma —que falte el comprobante— va bajo el
 * concepto y en rojo, porque es lo que impide cerrar el mes.
 */
@Composable
private fun FilaDeGasto(
    gasto: GastoDto,
    primera: Boolean,
    ultima: Boolean,
    onAbrir: () -> Unit,
) {
    val estado = GastosRules.estadoDe(gasto)
    val concepto = GastosRules.conceptoTexto(gasto)
    val monto = GastosRules.montoTexto(gasto)
    val fecha = GastosRules.fechaTexto(gasto)
    val faltaTicket = GastosRules.sinComprobante(gasto)
    val forma = RoundedCornerShape(
        topStart = if (primera) NxUi.RadiusLg else 0.dp,
        topEnd = if (primera) NxUi.RadiusLg else 0.dp,
        bottomStart = if (ultima) NxUi.RadiusLg else 0.dp,
        bottomEnd = if (ultima) NxUi.RadiusLg else 0.dp,
    )

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(forma)
            .background(NxColors.Card)
            // La fila entera se lee de una vez con lector de pantalla; los
            // trozos sueltos sonarían a lista de palabras inconexas.
            .semantics(mergeDescendants = true) {
                contentDescription = buildString {
                    append("$concepto, $monto, ${GastosRules.etiquetaEstado(gasto)}, $fecha")
                    if (faltaTicket) append(", sin comprobante")
                }
            }
            .clickable(onClick = onAbrir),
    ) {
        // La línea va arriba de cada fila menos la primera: así nunca se dibuja
        // dos veces entre dos filas ni queda una suelta al final del bloque.
        if (!primera) NxRowDivider(Modifier.padding(start = 12.dp))

        Row(
            modifier = Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 10.dp),
            horizontalArrangement = Arrangement.spacedBy(10.dp),
            verticalAlignment = Alignment.Top,
        ) {
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                Text(
                    concepto,
                    fontSize = 13.5.sp,
                    fontWeight = FontWeight.SemiBold,
                    color = NxColors.Slate,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                )
                Text(
                    GastosRules.contextoTexto(gasto),
                    fontSize = 11.5.sp,
                    color = NxColors.Muted,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                )
                if (faltaTicket) {
                    NxStatusDot(
                        "Sin comprobante",
                        color = GastosRules.colorEstado(GastosRules.Estado.RECHAZADO),
                        fontSize = 11.5.sp,
                        fontWeight = FontWeight.SemiBold,
                    )
                }
            }

            Column(
                modifier = Modifier.widthIn(min = ANCHO_MONTO),
                horizontalAlignment = Alignment.End,
                verticalArrangement = Arrangement.spacedBy(2.dp),
            ) {
                Text(
                    monto,
                    style = CIFRAS_TABULARES,
                    fontSize = 14.5.sp,
                    fontWeight = FontWeight.Bold,
                    color = NxColors.Slate,
                    textAlign = TextAlign.End,
                    maxLines = 1,
                )
                Text(
                    fecha,
                    fontSize = 11.5.sp,
                    color = NxColors.Muted,
                    textAlign = TextAlign.End,
                    maxLines = 1,
                )
                // El punto y la palabra, alineados con el monto. Ya se dijo en
                // la descripción de la fila, así que aquí no se repite.
                Box(Modifier.clearAndSetSemantics { }) {
                    NxStatusDot(
                        GastosRules.etiquetaEstado(gasto),
                        color = GastosRules.colorEstado(estado),
                        fontSize = 11.5.sp,
                    )
                }
            }
        }
    }
}
