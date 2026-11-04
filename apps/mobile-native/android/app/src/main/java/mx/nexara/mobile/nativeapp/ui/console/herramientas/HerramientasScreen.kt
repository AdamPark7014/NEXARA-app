package mx.nexara.mobile.nativeapp.ui.console.herramientas

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material3.ExtendedFloatingActionButton
import androidx.compose.material3.Icon
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
import androidx.compose.ui.graphics.Color
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
 * Herramientas (`/erp/almacen/herramientas`) en el teléfono. La misma pantalla, con lo que le toca a
 * cada quien ([HerramientasRules.Perfil]):
 *
 * - **Dirección:** préstamos de toda la empresa e inventario. Solo lectura y sin escáner.
 * - **Iván:** escáner arriba, por aprobar, préstamos (entregar y recibir), inventario con alta, y
 *   lo suyo: mi kit y mis préstamos.
 * - **Personal:** mi kit, mis préstamos y pedir préstamo. Abre en «Mi kit» a propósito: es lo que la
 *   persona trae encima ahora mismo y de lo que responde.
 *
 * Error y vacío nunca salen juntos: mientras la primera carga esté fallando se ve el bloque de error
 * y nada más, porque un «no tienes herramientas» sobre una lista que no se pudo leer es mentira.
 *
 * Las cuentas viven en [HerramientasRules], que se prueba sin Android.
 */
@Composable
fun HerramientasScreen(vm: HerramientasViewModel = viewModel()) {
    val state by vm.state.collectAsState()
    val vista by vm.vista.collectAsState()
    val filtro by vm.filtro.collectAsState()
    val filtroEmpresa by vm.filtroEmpresa.collectAsState()
    val consulta by vm.consulta.collectAsState()
    val snackbar = rememberNxSnackbarHostState()

    /** Préstamo al que se le está pidiendo prórroga; `null` = sin diálogo abierto. */
    var renovando by remember { mutableStateOf<PrestamoHerramientaDto?>(null) }
    var reportando by remember { mutableStateOf<KitAsignacionDto?>(null) }
    var dialogoAlmacen by remember { mutableStateOf<DialogoDeAlmacen?>(null) }
    var pidiendo by remember { mutableStateOf(false) }
    var dandoDeAlta by remember { mutableStateOf(false) }

    LaunchedEffect(Unit) { vm.arrancar() }

    LaunchedEffect(state.mensaje) {
        val msg = state.mensaje ?: return@LaunchedEffect
        vm.limpiarMensaje()
        snackbar.showSnackbar(msg)
    }

    val perfil = vm.perfil
    val vistas = remember(perfil) { HerramientasRules.vistas(perfil) }
    val hoy = vm.hoy
    // Un solo instante para toda la lista: dos lecturas del reloj podrían dar
    // por caducado un código en una tarjeta y por vigente el mismo en otra.
    val ahora = remember(state.prestamos, state.empresa) { Instant.now() }

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
    val porAprobar = remember(state.empresa) { HerramientasRules.porAprobar(state.empresa) }
    // A Iván lo que espera aprobación ya le sale en su pestaña; a dirección, todo lo abierto.
    val baseEmpresa = remember(state.empresa, perfil) {
        if (HerramientasRules.puedeOperar(perfil)) HerramientasRules.porOperar(state.empresa) else state.empresa
    }
    val empresaVisibles = remember(baseEmpresa, filtroEmpresa, consulta, hoy) {
        HerramientasRules.ordenarPrestamos(
            HerramientasRules.buscarPrestamos(
                HerramientasRules.filtrarEmpresa(baseEmpresa, filtroEmpresa, hoy),
                consulta,
            ),
            hoy,
        )
    }
    val inventarioVisible = remember(state.inventario, consulta) {
        HerramientasRules.buscarInventario(state.inventario, consulta)
    }

    /** Primera carga fallida: no hay nada que enseñar y el vacío no aplica. */
    val soloError = state.error != null && !state.cargado
    val principal = HerramientasRules.botonPrincipal(perfil, vista).takeIf { state.cargado }

    NxScreenScaffold(isRefreshing = state.refrescando, onRefresh = vm::refrescar) {
        LazyColumn(
            modifier = Modifier.fillMaxSize(),
            // Abajo cabe el botón principal sin tapar la última tarjeta.
            contentPadding = PaddingValues(start = 16.dp, end = 16.dp, top = 16.dp, bottom = 96.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            if (HerramientasRules.muestraEscaner(perfil)) {
                item(key = "escaner") { EscanerDeHerramientas(onMovimiento = vm::refrescar) }
            }

            item(key = "vistas") {
                MoreFilaDePastillas(
                    vistas.map { opcion ->
                        MorePastilla(
                            etiqueta = opcion.etiqueta,
                            conteo = when (opcion) {
                                HerramientasRules.Vista.KIT -> HerramientasRules.kitActivo(state.kit).size
                                HerramientasRules.Vista.PRESTAMOS ->
                                    state.prestamos.count { HerramientasRules.estaAbierto(it) }
                                HerramientasRules.Vista.POR_APROBAR -> porAprobar.size + state.renovaciones.size
                                HerramientasRules.Vista.EMPRESA -> baseEmpresa.size
                                HerramientasRules.Vista.INVENTARIO -> state.inventario.size
                            }.takeIf { state.cargado },
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
                        onReportar = { reportando = it },
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

                    HerramientasRules.Vista.POR_APROBAR -> seccionPorAprobar(
                        prestamos = porAprobar,
                        renovaciones = state.renovaciones,
                        hoy = hoy,
                        enviando = state.enviando,
                        onAprobarPrestamo = vm::aprobarPrestamo,
                        onAprobarRenovacion = vm::aprobarRenovacion,
                        onRechazar = { dialogoAlmacen = it },
                    )

                    HerramientasRules.Vista.EMPRESA -> seccionEmpresa(
                        prestamos = empresaVisibles,
                        perfil = perfil,
                        filtro = filtroEmpresa,
                        total = baseEmpresa.size,
                        consulta = consulta,
                        hoy = hoy,
                        ahora = ahora,
                        enviando = state.enviando,
                        onFiltro = vm::cambiarFiltroEmpresa,
                        onBuscar = vm::buscar,
                        onEntregar = { dialogoAlmacen = DialogoDeAlmacen.Entregar(it) },
                        onRecibir = { dialogoAlmacen = DialogoDeAlmacen.Recibir(it) },
                        onOtroCodigo = vm::generarOtroCodigo,
                    )

                    HerramientasRules.Vista.INVENTARIO -> seccionInventario(
                        piezas = inventarioVisible,
                        total = state.inventario.size,
                        perfil = perfil,
                        prestamos = state.empresa,
                        kits = state.kitsEmpresa,
                        consulta = consulta,
                        onBuscar = vm::buscar,
                    )
                }
            }

            item(key = "alcance") { MoreNotaDeAlcance(HerramientasRules.limite(perfil)) }
        }

        // Un solo botón principal, donde alcanza el pulgar. Cambia con la pestaña.
        principal?.let { boton ->
            ExtendedFloatingActionButton(
                onClick = {
                    vm.limpiarAccionError()
                    when (boton) {
                        HerramientasRules.BotonPrincipal.PEDIR_PRESTAMO -> pidiendo = true
                        HerramientasRules.BotonPrincipal.NUEVA_HERRAMIENTA -> dandoDeAlta = true
                    }
                },
                icon = { Icon(Icons.Default.Add, contentDescription = null) },
                text = { Text(boton.etiqueta, fontWeight = FontWeight.SemiBold) },
                containerColor = NxColors.Brand,
                contentColor = Color.White,
                modifier = Modifier
                    .align(Alignment.BottomEnd)
                    .padding(16.dp)
                    .heightIn(min = 56.dp),
            )
        }

        NxSnackbarHost(
            snackbar,
            modifier = Modifier.align(Alignment.BottomCenter).padding(bottom = 72.dp),
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

    reportando?.let { asignacion ->
        DialogoReportarDanio(
            pieza = HerramientasRules.tituloPieza(asignacion),
            enviando = state.enviando,
            error = state.accionError,
            onCerrar = {
                reportando = null
                vm.limpiarAccionError()
            },
            onConfirmar = { descripcion -> vm.reportarDanio(asignacion, descripcion) { reportando = null } },
        )
    }

    dialogoAlmacen?.let { abierto ->
        val cerrar = {
            dialogoAlmacen = null
            vm.limpiarAccionError()
        }
        DialogoAlmacen(
            dialogo = abierto,
            enviando = state.enviando,
            error = state.accionError,
            onCerrar = cerrar,
            onEntregar = { p, codigo -> vm.entregar(p, codigo) { dialogoAlmacen = null } },
            onRecibir = { p, danio -> vm.recibir(p, danio) { dialogoAlmacen = null } },
            onRechazarPrestamo = { p, motivo -> vm.rechazarPrestamo(p, motivo) { dialogoAlmacen = null } },
            onRechazarRenovacion = { r, motivo -> vm.rechazarRenovacion(r, motivo) { dialogoAlmacen = null } },
        )
    }

    if (pidiendo) {
        HojaPedirPrestamo(
            hoy = hoy,
            enviando = state.enviando,
            error = state.accionError,
            buscar = vm::buscarInventario,
            cargarActividades = vm::misActividades,
            onPedir = { pieza, regreso, motivo, actividad ->
                vm.pedirPrestamo(pieza, regreso, motivo, actividad) { pidiendo = false }
            },
            onCerrar = {
                pidiendo = false
                vm.limpiarAccionError()
            },
        )
    }

    if (dandoDeAlta) {
        HojaNuevaHerramienta(
            enviando = state.enviando,
            error = state.accionError,
            onGuardar = { nombre, modelo, serie, panoramica, fotoSerie ->
                vm.nuevaHerramienta(nombre, modelo, serie, panoramica, fotoSerie) { dandoDeAlta = false }
            },
            onCerrar = {
                dandoDeAlta = false
                vm.limpiarAccionError()
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
    onReportar: (KitAsignacionDto) -> Unit,
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
                    "Aquí lo reportas; el dictamen de un daño lo da almacén.",
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
                    "permanente. Si necesitas una, pídela prestada.",
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
        TarjetaKit(asignacion = asignacion, hoy = hoy, onReportar = { onReportar(asignacion) })
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
                    title = HerramientasRules.VACIO_MIS_PRESTAMOS.titulo,
                    subtitle = HerramientasRules.VACIO_MIS_PRESTAMOS.texto,
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
