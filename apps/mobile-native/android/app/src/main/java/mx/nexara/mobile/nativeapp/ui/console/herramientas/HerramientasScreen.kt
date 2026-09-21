package mx.nexara.mobile.nativeapp.ui.console.herramientas

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import java.time.Instant
import java.time.LocalDate
import mx.nexara.mobile.nativeapp.data.api.KitAsignacionDto
import mx.nexara.mobile.nativeapp.data.api.PrestamoHerramientaDto
import mx.nexara.mobile.nativeapp.ui.console.more.MoreAvisoDesactualizado
import mx.nexara.mobile.nativeapp.ui.console.more.MoreCabecera
import mx.nexara.mobile.nativeapp.ui.console.more.MoreFilaDePastillas
import mx.nexara.mobile.nativeapp.ui.console.more.MoreNotaDeAlcance
import mx.nexara.mobile.nativeapp.ui.console.more.MorePastilla
import mx.nexara.mobile.nativeapp.ui.console.more.MoreTarjeta
import mx.nexara.mobile.nativeapp.ui.enterprise.NxAlert
import mx.nexara.mobile.nativeapp.ui.enterprise.NxAlertBanner
import mx.nexara.mobile.nativeapp.ui.enterprise.NxColors
import mx.nexara.mobile.nativeapp.ui.enterprise.NxEmptyState
import mx.nexara.mobile.nativeapp.ui.enterprise.NxErrorBlock
import mx.nexara.mobile.nativeapp.ui.enterprise.NxScreenScaffold
import mx.nexara.mobile.nativeapp.ui.enterprise.NxSearchField
import mx.nexara.mobile.nativeapp.ui.enterprise.NxSkeletonList
import mx.nexara.mobile.nativeapp.ui.enterprise.NxSnackbarHost
import mx.nexara.mobile.nativeapp.ui.enterprise.NxTone
import mx.nexara.mobile.nativeapp.ui.enterprise.rememberNxSnackbarHostState

/**
 * Herramientas (`/erp/almacen/herramientas`) en el teléfono.
 *
 * La web enseña hasta siete pestañas porque mete en la misma página a quien pide
 * y a quien administra. En el teléfono no hay más que una de esas dos personas:
 * el guard del API solo deja pasar con `tools.view` lo **propio** —mi kit, mis
 * préstamos, mis números— y la única mutación que permite es pedir más plazo. Así
 * que la pantalla son dos listas y un botón, que es exactamente lo que se puede
 * hacer desde la calle.
 *
 * Abre en «Mi kit» a propósito: es lo que la persona trae encima ahora mismo y
 * de lo que responde. Los préstamos son la excepción, no la regla.
 *
 * Error y vacío nunca salen juntos: mientras la primera carga esté fallando se
 * ve el bloque de error y nada más, porque un «no tienes herramientas» sobre una
 * lista que no se pudo leer es mentira.
 *
 * Las cuentas viven en [HerramientasRules], que se prueba sin Android.
 */
@Composable
fun HerramientasScreen(vm: HerramientasViewModel = viewModel()) {
    val state by vm.state.collectAsState()
    val vista by vm.vista.collectAsState()
    val filtro by vm.filtro.collectAsState()
    val consulta by vm.consulta.collectAsState()
    val snackbar = rememberNxSnackbarHostState()

    /** Préstamo al que se le está pidiendo prórroga; `null` = sin diálogo abierto. */
    var renovando by remember { mutableStateOf<PrestamoHerramientaDto?>(null) }

    LaunchedEffect(Unit) { vm.arrancar() }

    LaunchedEffect(state.mensaje) {
        val msg = state.mensaje ?: return@LaunchedEffect
        vm.limpiarMensaje()
        snackbar.showSnackbar(msg)
    }

    val hoy = vm.hoy
    // Un solo instante para toda la lista: dos lecturas del reloj podrían dar
    // por caducado un código en una tarjeta y por vigente el mismo en otra.
    val ahora = remember(state.prestamos) { Instant.now() }

    val kitVisible = remember(state.kit, hoy) {
        HerramientasRules.ordenarKit(HerramientasRules.kitActivo(state.kit), hoy)
    }
    val prestamosVisibles = remember(state.prestamos, filtro, consulta, hoy) {
        HerramientasRules.ordenarPrestamos(
            HerramientasRules.buscarPrestamos(
                HerramientasRules.filtrarPrestamos(state.prestamos, filtro),
                consulta,
            ),
            hoy,
        )
    }

    /** Primera carga fallida: no hay nada que enseñar y el vacío no aplica. */
    val soloError = state.error != null && !state.cargado

    NxScreenScaffold(isRefreshing = state.refrescando, onRefresh = vm::refrescar) {
        LazyColumn(
            modifier = Modifier.fillMaxSize(),
            contentPadding = PaddingValues(16.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            item(key = "vistas") {
                MoreFilaDePastillas(
                    HerramientasRules.Vista.entries.map { opcion ->
                        MorePastilla(
                            etiqueta = opcion.etiqueta,
                            conteo = when (opcion) {
                                HerramientasRules.Vista.KIT ->
                                    HerramientasRules.kitActivo(state.kit).size.takeIf { state.cargado }
                                HerramientasRules.Vista.PRESTAMOS ->
                                    state.prestamos.count { HerramientasRules.estaAbierto(it) }
                                        .takeIf { state.cargado }
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

            if (state.cargando && !state.cargado) {
                item(key = "esqueleto") { NxSkeletonList(itemCount = 5, itemHeight = 104.dp) }
            }

            if (soloError) {
                item(key = "error") { NxErrorBlock(state.error.orEmpty(), onRetry = vm::reintentar) }
            } else if (state.cargado) {
                // Media pantalla caída (normalmente un 403 en la mitad que el rol
                // no tiene): se dice arriba, pero no tapa lo que sí llegó.
                state.avisoParcial?.let { parcial ->
                    item(key = "parcial") {
                        NxAlertBanner(
                            NxAlert(
                                id = "herramientas-parcial",
                                title = parcial,
                                subtitle = "Lo demás de esta pantalla sí se pudo leer.",
                                tone = NxTone.Warning,
                                actionLabel = "Reintentar",
                                onAction = vm::refrescar,
                            ),
                        )
                    }
                }

                when (vista) {
                    HerramientasRules.Vista.KIT -> seccionKit(
                        kit = kitVisible,
                        resumen = HerramientasRules.resumenKit(state.kit, hoy),
                        hoy = hoy,
                        hayPrestamos = state.prestamos.isNotEmpty(),
                        onVerPrestamos = { vm.cambiarVista(HerramientasRules.Vista.PRESTAMOS) },
                    )

                    HerramientasRules.Vista.PRESTAMOS -> seccionPrestamos(
                        prestamos = prestamosVisibles,
                        resumen = HerramientasRules.resumenPrestamos(state.prestamos, hoy),
                        total = state.prestamos.size,
                        filtro = filtro,
                        consulta = consulta,
                        hoy = hoy,
                        ahora = ahora,
                        onFiltro = vm::cambiarFiltro,
                        onBuscar = vm::buscar,
                        onRenovar = { renovando = it },
                    )
                }
            }

            item(key = "alcance") { MoreNotaDeAlcance(HerramientasRules.LIMITE) }
        }

        NxSnackbarHost(
            snackbar,
            modifier = Modifier.align(Alignment.BottomCenter).padding(bottom = 16.dp),
        )
    }

    renovando?.let { prestamo ->
        DialogoRenovar(
            prestamo = prestamo,
            hoy = hoy,
            enviando = state.enviando,
            error = state.accionError,
            onCerrar = {
                renovando = null
                vm.limpiarAccionError()
            },
            onConfirmar = { fecha, motivo ->
                vm.renovar(prestamo, fecha, motivo) { renovando = null }
            },
        )
    }
}

/**
 * «Mi kit»: lo que traigo asignado.
 *
 * El vacío de aquí no es un fallo — la mayoría del personal administrativo no
 * tiene kit — así que en vez de un mensaje seco se ofrece la otra mitad de la
 * pantalla, que es donde sí puede haber algo suyo.
 */
private fun LazyListScope.seccionKit(
    kit: List<KitAsignacionDto>,
    resumen: String?,
    hoy: LocalDate,
    hayPrestamos: Boolean,
    onVerPrestamos: () -> Unit,
) {
    if (resumen != null) {
        item(key = "kit-resumen") {
            MoreTarjeta {
                Text("Tu kit necesita atención", style = MaterialTheme.typography.labelMedium, color = NxColors.Muted)
                Text(
                    resumen,
                    style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Bold),
                    color = NxColors.Danger,
                )
                Text(
                    "Repórtalo en almacén: el dictamen de un daño no se hace desde el teléfono.",
                    style = MaterialTheme.typography.labelSmall,
                    color = NxColors.Muted,
                )
            }
        }
    }

    if (kit.isEmpty()) {
        item(key = "kit-vacio") {
            NxEmptyState(
                title = "No traes herramienta asignada",
                subtitle = "Tu kit está vacío: nadie te ha asignado una herramienta de forma " +
                    "permanente. Almacén es quien las reparte.",
                actionLabel = if (hayPrestamos) "Ver mis préstamos" else null,
                onAction = if (hayPrestamos) onVerPrestamos else null,
            )
        }
        return
    }

    item(key = "kit-cabecera") {
        MoreCabecera(
            titulo = "Mi kit",
            subtitulo = "Primero lo que reclama atención",
            trailing = "${kit.size}",
        )
    }
    items(kit, key = { "kit-${it.id}" }) { asignacion ->
        TarjetaKit(asignacion = asignacion, hoy = hoy)
    }
}

/**
 * «Mis préstamos»: lo que pedí y todavía debo.
 *
 * Abre en «Abiertos» porque la pregunta de campo es «¿qué tengo que devolver?»,
 * no «¿qué pedí el año pasado?». El historial completo está a una pastilla.
 */
private fun LazyListScope.seccionPrestamos(
    prestamos: List<PrestamoHerramientaDto>,
    resumen: String?,
    total: Int,
    filtro: HerramientasRules.FiltroPrestamo,
    consulta: String,
    hoy: LocalDate,
    ahora: Instant,
    onFiltro: (HerramientasRules.FiltroPrestamo) -> Unit,
    onBuscar: (String) -> Unit,
    onRenovar: (PrestamoHerramientaDto) -> Unit,
) {
    if (resumen != null) {
        item(key = "prestamos-resumen") {
            MoreTarjeta {
                Text("Tienes prestado", style = MaterialTheme.typography.labelMedium, color = NxColors.Muted)
                Text(
                    resumen,
                    style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Bold),
                    color = NxColors.Slate,
                )
            }
        }
    }

    item(key = "prestamos-filtros") {
        MoreFilaDePastillas(
            HerramientasRules.FiltroPrestamo.entries.map { opcion ->
                MorePastilla(
                    etiqueta = opcion.etiqueta,
                    seleccionada = opcion == filtro,
                    onClick = { onFiltro(opcion) },
                )
            },
        )
    }

    // El buscador solo cuando hay lista que valga la pena filtrar: con tres
    // renglones estorba más de lo que ayuda.
    if (total > 6) {
        item(key = "prestamos-buscar") {
            NxSearchField(
                value = consulta,
                onValueChange = onBuscar,
                placeholder = "Buscar por herramienta, modelo o serie",
            )
        }
    }

    if (prestamos.isEmpty()) {
        item(key = "prestamos-vacio") {
            when {
                consulta.isNotBlank() -> NxEmptyState(
                    title = "Sin coincidencias",
                    subtitle = "Ninguna herramienta tuya coincide con «$consulta».",
                    actionLabel = "Limpiar búsqueda",
                    onAction = { onBuscar("") },
                )

                filtro == HerramientasRules.FiltroPrestamo.ABIERTOS && total > 0 -> NxEmptyState(
                    title = "No debes ninguna",
                    subtitle = "No tienes préstamos abiertos: todo lo que pediste ya se cerró.",
                    actionLabel = "Ver el historial",
                    onAction = { onFiltro(HerramientasRules.FiltroPrestamo.TODOS) },
                )

                else -> NxEmptyState(
                    title = "Todavía no pides herramienta prestada",
                    subtitle = "Los préstamos se dan de alta en almacén. Cuando te presten algo, " +
                        "aparecerá aquí con su fecha de devolución y su código para recogerlo.",
                )
            }
        }
        return
    }

    item(key = "prestamos-cabecera") {
        MoreCabecera(
            titulo = filtro.etiqueta,
            subtitulo = "Primero lo vencido y lo que vence antes",
            trailing = "${prestamos.size}",
        )
    }
    items(prestamos, key = { "prestamo-${it.id}" }) { prestamo ->
        TarjetaPrestamo(
            prestamo = prestamo,
            hoy = hoy,
            ahora = ahora,
            onRenovar = { onRenovar(prestamo) },
        )
    }
}
