package mx.nexara.mobile.nativeapp.ui.integra.governance

import android.app.Application
import android.content.Intent
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.AssistChip
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.DatePicker
import androidx.compose.material3.DatePickerDialog
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.material3.rememberDatePickerState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.compose.viewModel
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import mx.nexara.mobile.nativeapp.data.api.toUserMessage
import mx.nexara.mobile.nativeapp.data.integra.governance.AuditEntryDto
import mx.nexara.mobile.nativeapp.data.integra.governance.IntegraGovernanceRepository
import mx.nexara.mobile.nativeapp.ui.enterprise.NxColors
import mx.nexara.mobile.nativeapp.ui.enterprise.NxDimens
import mx.nexara.mobile.nativeapp.ui.enterprise.NxEmptyState
import mx.nexara.mobile.nativeapp.ui.enterprise.NxErrorBlock
import mx.nexara.mobile.nativeapp.ui.enterprise.NxLoadingBlock
import mx.nexara.mobile.nativeapp.ui.enterprise.NxStatusChip
import mx.nexara.mobile.nativeapp.ui.enterprise.NxTone

/**
 * Bitácora / auditoría de INTEGRA.
 *
 * Es el único sitio donde queda constancia de quién abrió una puerta a
 * distancia o quién cambió un horario, así que la pantalla está pensada para
 * una sola tarea: reconstruir **qué pasó el martes por la tarde**. De ahí el
 * selector de día + franja, el orden cronológico, la ficha entera —IP,
 * user-agent y valor anterior incluidos— y el botón de compartir.
 *
 * No es la tabla de escritorio portada. En un teléfono una tabla de ocho
 * columnas no se lee: aquí es una lista cronológica agrupada por día, y el
 * detalle se abre al tocar la fila.
 *
 * Toda la paginación y todos los filtros son de **servidor**. La tabla puede
 * tener decenas de miles de filas y traérselas para filtrar en memoria sería
 * volver al problema que este endpoint acaba de dejar atrás.
 */

private val TAMANOS_PAGINA = listOf(25, 50, 100)

// ── Estado ────────────────────────────────────────────────────────────────────

data class BitacoraFiltros(
    /** Rango relativo. Se ignora si hay `diaMs`. */
    val preset: PresetRango = PresetRango.H48,
    /** Día concreto, anclado al mediodía local. `null` = manda el preset. */
    val diaMs: Long? = null,
    val franja: FranjaDia = FranjaDia.TODO_EL_DIA,
    val accion: String? = null,
    /** Va como `q`: filtra el **código** de acción, no `changes`. */
    val codigoContiene: String = "",
    val orden: String = "desc",
    val limit: Int = 25,
    val actorId: Long? = null,
    val actorEtiqueta: String? = null,
) {
    fun rango(ahoraMs: Long): RangoConsulta =
        if (diaMs != null) rangoDeDia(diaMs, franja) else rangoDePreset(preset, ahoraMs)

    val hayFiltroFino: Boolean
        get() = accion != null || codigoContiene.isNotBlank() || actorId != null || diaMs != null
}

data class BitacoraUiState(
    val loading: Boolean = true,
    val isRefreshing: Boolean = false,
    val error: String? = null,
    val items: List<AuditEntryDto> = emptyList(),
    val total: Int = 0,
    val skip: Int = 0,
    val limit: Int = 25,
    val filtros: BitacoraFiltros = BitacoraFiltros(),
    val filtrosAbiertos: Boolean = false,
    val seleccionada: AuditEntryDto? = null,
    /**
     * Instante de referencia de los «hace N h». Se congela en cada carga en vez
     * de leer el reloj en cada recomposición: si no, dos filas de la misma
     * lista podrían calcularse contra relojes distintos.
     */
    val ahoraMs: Long = System.currentTimeMillis(),
    /** Códigos vistos en la sesión, para poblar el desplegable con lo real. */
    val accionesVistas: List<String> = emptyList(),
) {
    val resumen: ResumenPagina
        get() = resumenPagina(total = total, skip = skip, limit = limit, recibidas = items.size)

    val criticasEnPagina: Int
        get() = items.count { esAccionCritica(it.action) }
}

// ── ViewModel ─────────────────────────────────────────────────────────────────

class IntegraAuditViewModel(app: Application) : AndroidViewModel(app) {

    private val repo = IntegraGovernanceRepository(app.applicationContext)
    private val _state = MutableStateFlow(BitacoraUiState())
    val state: StateFlow<BitacoraUiState> = _state

    /** Una consulta a la vez: cambiar de filtro cancela la anterior. */
    private var cargaEnCurso: Job? = null

    init { cargar(inicial = true) }

    fun alternarFiltros() = _state.update { it.copy(filtrosAbiertos = !it.filtrosAbiertos) }

    fun seleccionar(entrada: AuditEntryDto?) = _state.update { it.copy(seleccionada = entrada) }

    /** Cualquier cambio de filtro vuelve a la primera página: si no, el «N–M de T» miente. */
    private fun aplicar(cambio: (BitacoraFiltros) -> BitacoraFiltros) {
        _state.update { it.copy(filtros = cambio(it.filtros), skip = 0, seleccionada = null) }
        cargar(inicial = false)
    }

    fun setPreset(preset: PresetRango) = aplicar { it.copy(preset = preset, diaMs = null) }

    fun setDia(diaMs: Long?) = aplicar {
        if (diaMs == null) it.copy(diaMs = null) else it.copy(diaMs = diaMs)
    }

    fun setFranja(franja: FranjaDia) = aplicar { it.copy(franja = franja) }

    fun setAccion(accion: String?) = aplicar { it.copy(accion = accion) }

    fun setCodigoContiene(v: String) = _state.update {
        it.copy(filtros = it.filtros.copy(codigoContiene = v))
    }

    /** El texto libre no dispara consulta por tecla: se busca al confirmar. */
    fun buscarCodigo() {
        _state.update { it.copy(skip = 0, seleccionada = null) }
        cargar(inicial = false)
    }

    fun alternarOrden() = aplicar { it.copy(orden = if (it.orden == "desc") "asc" else "desc") }

    fun setTamanoPagina(limit: Int) = aplicar { it.copy(limit = limit) }

    /**
     * «Enséñame todo lo de esta persona». Es la pregunta que sigue a «¿quién
     * abrió esa puerta?», y va al servidor por `userId`, así que la paginación
     * y el total siguen siendo verdad.
     */
    fun filtrarPorActor(entrada: AuditEntryDto) {
        val id = entrada.userId ?: return
        aplicar {
            it.copy(actorId = id, actorEtiqueta = describirActor(entrada.userName, entrada.userEmail))
        }
    }

    fun quitarActor() = aplicar { it.copy(actorId = null, actorEtiqueta = null) }

    fun limpiarFiltros() = aplicar {
        BitacoraFiltros(limit = it.limit, orden = it.orden)
    }

    fun paginaAnterior() = irA(_state.value.skip - _state.value.limit)

    fun paginaSiguiente() = irA(_state.value.skip + _state.value.limit)

    fun primeraPagina() = irA(0)

    fun ultimaPagina() {
        val s = _state.value
        val limit = if (s.limit > 0) s.limit else 1
        val ultima = ((maxOf(s.total, 1) - 1) / limit) * limit
        irA(ultima)
    }

    private fun irA(skip: Int) {
        val nuevo = maxOf(skip, 0)
        if (nuevo == _state.value.skip) return
        _state.update { it.copy(skip = nuevo, seleccionada = null) }
        cargar(inicial = false)
    }

    fun refrescar() = cargar(inicial = false, refresco = true)

    fun cargar(inicial: Boolean = false, refresco: Boolean = false) {
        cargaEnCurso?.cancel()
        _state.update {
            it.copy(
                loading = inicial || (!refresco && it.items.isEmpty()),
                isRefreshing = refresco,
                error = null,
            )
        }
        cargaEnCurso = viewModelScope.launch {
            val snapshot = _state.value
            val ahora = System.currentTimeMillis()
            val rango = snapshot.filtros.rango(ahora)
            try {
                val pagina = withContext(Dispatchers.IO) {
                    repo.audit(
                        IntegraGovernanceRepository.ConsultaBitacora(
                            limit = snapshot.limit,
                            skip = snapshot.skip,
                            fromIso = aIsoUtc(rango.desdeMs),
                            toIso = aIsoUtc(rango.hastaMs),
                            action = snapshot.filtros.accion,
                            userId = snapshot.filtros.actorId,
                            q = snapshot.filtros.codigoContiene,
                            order = snapshot.filtros.orden,
                        ),
                    )
                }
                val items = pagina.items.orEmpty()
                _state.update { previo ->
                    previo.copy(
                        loading = false,
                        isRefreshing = false,
                        error = null,
                        items = items,
                        total = pagina.total ?: items.size,
                        // El servidor recorta `limit` a [1, 200]: se toma el que
                        // devuelve, no el que se pidió, o el «N–M de T» mentiría.
                        limit = pagina.limit ?: previo.limit,
                        skip = pagina.skip ?: previo.skip,
                        ahoraMs = ahora,
                        accionesVistas = (previo.accionesVistas + items.mapNotNull { e ->
                            e.action?.trim()?.ifBlank { null }
                        }).distinct().sorted(),
                    )
                }
            } catch (e: Exception) {
                _state.update {
                    it.copy(
                        loading = false,
                        isRefreshing = false,
                        error = e.toUserMessage("No se pudo cargar la bitácora"),
                    )
                }
            }
        }
    }
}

// ── Pantalla ──────────────────────────────────────────────────────────────────

/** Filas ya listas para pintar: la cabecera de día se calcula una vez, no por fila. */
private sealed interface FilaBitacora {
    data class Dia(val etiqueta: String) : FilaBitacora
    data class Entrada(val dto: AuditEntryDto) : FilaBitacora
}

private fun filasDe(items: List<AuditEntryDto>): List<FilaBitacora> {
    val filas = mutableListOf<FilaBitacora>()
    var diaActual: String? = null
    for (item in items) {
        val dia = etiquetaDia(item.createdAt)
        if (dia != diaActual) {
            filas += FilaBitacora.Dia(dia)
            diaActual = dia
        }
        filas += FilaBitacora.Entrada(item)
    }
    return filas
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun IntegraAuditScreen(vm: IntegraAuditViewModel = viewModel()) {
    val s by vm.state.collectAsState()
    val seleccionada = s.seleccionada

    if (seleccionada != null) {
        FichaBitacora(
            entrada = seleccionada,
            ahoraMs = s.ahoraMs,
            puedeFiltrarActor = seleccionada.userId != null && s.filtros.actorId == null,
            onFiltrarActor = { vm.filtrarPorActor(seleccionada) },
            onVolver = { vm.seleccionar(null) },
        )
        return
    }

    Column(Modifier.fillMaxSize()) {
        BarraFiltros(state = s, vm = vm)

        PullToRefreshBox(
            isRefreshing = s.isRefreshing,
            onRefresh = vm::refrescar,
            modifier = Modifier.weight(1f),
        ) {
            when {
                s.loading -> NxLoadingBlock("Cargando bitácora…")
                s.error != null && s.items.isEmpty() -> NxErrorBlock(s.error.orEmpty()) { vm.cargar() }
                s.items.isEmpty() -> NxEmptyState(
                    title = "Sin movimientos",
                    subtitle = if (s.filtros.hayFiltroFino || s.filtros.diaMs != null) {
                        "Nada en ese rango con esos filtros. Amplía el rango o quita filtros."
                    } else {
                        "La bitácora no tiene entradas en este rango."
                    },
                    actionLabel = "Quitar filtros".takeIf { s.filtros.hayFiltroFino },
                    onAction = vm::limpiarFiltros,
                )
                else -> {
                    val filas = remember(s.items) { filasDe(s.items) }
                    LazyColumn(
                        contentPadding = PaddingValues(horizontal = 16.dp, vertical = 12.dp),
                        verticalArrangement = Arrangement.spacedBy(6.dp),
                    ) {
                        s.error?.let { err ->
                            item { NxErrorBlock(err) { vm.cargar() } }
                        }
                        itemsIndexed(
                            items = filas,
                            key = { idx, fila ->
                                when (fila) {
                                    is FilaBitacora.Dia -> "dia-${fila.etiqueta}-$idx"
                                    is FilaBitacora.Entrada -> "e-${fila.dto.id ?: -(idx.toLong() + 1)}"
                                }
                            },
                        ) { _, fila ->
                            when (fila) {
                                is FilaBitacora.Dia -> Text(
                                    fila.etiqueta,
                                    modifier = Modifier.padding(top = 10.dp, bottom = 2.dp),
                                    style = MaterialTheme.typography.labelMedium
                                        .copy(fontWeight = FontWeight.Bold),
                                    color = NxColors.Muted,
                                )
                                is FilaBitacora.Entrada -> FilaEntrada(
                                    entrada = fila.dto,
                                    onClick = { vm.seleccionar(fila.dto) },
                                )
                            }
                        }
                        item { Spacer(Modifier.height(8.dp)) }
                    }
                }
            }
        }

        PieDePaginacion(state = s, vm = vm)
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun BarraFiltros(state: BitacoraUiState, vm: IntegraAuditViewModel) {
    var mostrarCalendario by remember { mutableStateOf(false) }
    var menuAcciones by remember { mutableStateOf(false) }
    val f = state.filtros

    Column(
        Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 8.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Row(
            Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column(Modifier.weight(1f)) {
                Text(
                    state.resumen.texto,
                    style = MaterialTheme.typography.titleSmall.copy(fontWeight = FontWeight.Bold),
                    color = NxColors.Slate,
                )
                Text(
                    if (state.criticasEnPagina > 0) {
                        "${state.criticasEnPagina} crítica(s) en esta página · página ${state.resumen.pagina} de ${state.resumen.paginas}"
                    } else {
                        "Página ${state.resumen.pagina} de ${state.resumen.paginas}"
                    },
                    style = MaterialTheme.typography.labelSmall,
                    color = NxColors.Muted,
                )
            }
            TextButton(onClick = vm::alternarFiltros) {
                Text(if (state.filtrosAbiertos) "Ocultar filtros" else "Filtros")
            }
        }

        // Los rangos siempre visibles: es el filtro que se usa el 90 % del tiempo.
        Row(
            Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()),
            horizontalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            PresetRango.entries.forEach { preset ->
                FilterChip(
                    selected = f.diaMs == null && f.preset == preset,
                    onClick = { vm.setPreset(preset) },
                    label = { Text(preset.etiqueta) },
                )
            }
            FilterChip(
                selected = f.diaMs != null,
                onClick = { mostrarCalendario = true },
                label = { Text(f.diaMs?.let { etiquetaDiaCorto(it) } ?: "Un día…") },
            )
        }

        if (f.diaMs != null) {
            Row(
                Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()),
                horizontalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                FranjaDia.entries.forEach { franja ->
                    FilterChip(
                        selected = f.franja == franja,
                        onClick = { vm.setFranja(franja) },
                        label = { Text(franja.etiqueta) },
                    )
                }
                AssistChip(
                    onClick = { vm.setDia(null) },
                    label = { Text("Quitar día") },
                )
            }
        }

        if (f.actorId != null) {
            AssistChip(
                onClick = vm::quitarActor,
                label = { Text("Actor: ${f.actorEtiqueta ?: "#${f.actorId}"} ✕") },
            )
        }

        if (state.filtrosAbiertos) {
            Box {
                OutlinedButton(
                    onClick = { menuAcciones = true },
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Text(f.accion?.let { etiquetaAccion(it) } ?: "Todas las acciones")
                }
                DropdownMenu(
                    expanded = menuAcciones,
                    onDismissRequest = { menuAcciones = false },
                ) {
                    DropdownMenuItem(
                        text = { Text("Todas las acciones") },
                        onClick = { menuAcciones = false; vm.setAccion(null) },
                    )
                    // Catálogo + lo que de verdad ha aparecido: un código nuevo
                    // del backend se puede filtrar sin tocar la app.
                    val codigos = remember(state.accionesVistas) {
                        (ACCIONES_BITACORA.keys + state.accionesVistas)
                            .distinct()
                            .sortedBy { etiquetaAccion(it).lowercase() }
                    }
                    codigos.forEach { codigo ->
                        DropdownMenuItem(
                            text = {
                                Column {
                                    Text(etiquetaAccion(codigo))
                                    Text(
                                        codigo,
                                        style = MaterialTheme.typography.labelSmall
                                            .copy(fontFamily = FontFamily.Monospace),
                                        color = NxColors.Muted,
                                    )
                                }
                            },
                            onClick = { menuAcciones = false; vm.setAccion(codigo) },
                        )
                    }
                }
            }

            OutlinedTextField(
                value = f.codigoContiene,
                onValueChange = vm::setCodigoContiene,
                modifier = Modifier.fillMaxWidth(),
                singleLine = true,
                label = { Text("El código de acción contiene") },
                supportingText = {
                    Text("Busca en el código (p. ej. «door»), no dentro del detalle: `changes` es JSON y el servidor no lo indexa.")
                },
                trailingIcon = {
                    TextButton(onClick = vm::buscarCodigo) { Text("Buscar") }
                },
            )

            Row(
                Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()),
                horizontalArrangement = Arrangement.spacedBy(6.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                AssistChip(
                    onClick = vm::alternarOrden,
                    label = {
                        Text(if (f.orden == "desc") "Más reciente primero" else "Más antiguo primero")
                    },
                )
                TAMANOS_PAGINA.forEach { tam ->
                    FilterChip(
                        selected = state.limit == tam,
                        onClick = { vm.setTamanoPagina(tam) },
                        label = { Text("$tam/pág") },
                    )
                }
                if (f.hayFiltroFino) {
                    AssistChip(onClick = vm::limpiarFiltros, label = { Text("Limpiar") })
                }
            }

            NotaAclaratoria(
                "Fechas, acción, actor, orden y página los resuelve el servidor: " +
                    "el total de abajo es el de la consulta completa, no el de lo que ves.",
            )
        }
    }

    if (mostrarCalendario) {
        val estadoCalendario = rememberDatePickerState(
            initialSelectedDateMillis = state.filtros.diaMs ?: state.ahoraMs,
        )
        DatePickerDialog(
            onDismissRequest = { mostrarCalendario = false },
            confirmButton = {
                TextButton(
                    onClick = {
                        val elegido = estadoCalendario.selectedDateMillis
                        mostrarCalendario = false
                        if (elegido != null) vm.setDia(anclaLocalDeDiaUtc(elegido))
                    },
                ) { Text("Ver ese día") }
            },
            dismissButton = {
                TextButton(onClick = { mostrarCalendario = false }) { Text("Cancelar") }
            },
        ) {
            DatePicker(state = estadoCalendario)
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun FilaEntrada(entrada: AuditEntryDto, onClick: () -> Unit) {
    val critica = esAccionCritica(entrada.action)
    val resumen = remember(entrada) { resumenDeCambios(entrada.changes) }

    Card(
        onClick = onClick,
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(NxDimens.PanelRadius),
        colors = CardDefaults.cardColors(containerColor = NxColors.Card),
        elevation = CardDefaults.cardElevation(NxDimens.PanelElevation),
    ) {
        Row(
            Modifier.fillMaxWidth().padding(12.dp),
            horizontalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            // La hora manda en una lista cronológica: va primero y en monoespaciada
            // para que las filas se lean en columna aunque cambien de anchura.
            Column(Modifier.width(64.dp)) {
                Text(
                    formatearHora(entrada.createdAt),
                    style = MaterialTheme.typography.labelMedium
                        .copy(fontFamily = FontFamily.Monospace, fontWeight = FontWeight.SemiBold),
                    color = if (critica) NxColors.Danger else NxColors.Slate,
                )
                Text(
                    categoriaAccion(entrada.action).etiqueta,
                    style = MaterialTheme.typography.labelSmall,
                    color = NxColors.Muted,
                )
            }
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                Text(
                    etiquetaAccion(entrada.action),
                    style = MaterialTheme.typography.bodyMedium
                        .copy(fontWeight = FontWeight.SemiBold),
                    color = NxColors.Slate,
                )
                Text(
                    describirActor(entrada.userName, entrada.userEmail),
                    style = MaterialTheme.typography.bodySmall,
                    color = NxColors.Muted,
                )
                if (resumen.isNotBlank()) {
                    Text(
                        resumen,
                        style = MaterialTheme.typography.labelSmall,
                        color = NxColors.Muted,
                    )
                }
            }
            if (critica) {
                NxStatusChip("Crítica", NxTone.Danger)
            }
        }
    }
}

@Composable
private fun PieDePaginacion(state: BitacoraUiState, vm: IntegraAuditViewModel) {
    val r = state.resumen
    Row(
        Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 8.dp),
        horizontalArrangement = Arrangement.spacedBy(6.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        OutlinedButton(
            onClick = vm::primeraPagina,
            enabled = r.hayAnterior && !state.loading,
        ) { Text("«") }
        OutlinedButton(
            onClick = vm::paginaAnterior,
            enabled = r.hayAnterior && !state.loading,
            modifier = Modifier.weight(1f),
        ) { Text("Anterior") }
        OutlinedButton(
            onClick = vm::paginaSiguiente,
            enabled = r.haySiguiente && !state.loading,
            modifier = Modifier.weight(1f),
        ) { Text("Siguiente") }
        OutlinedButton(
            onClick = vm::ultimaPagina,
            enabled = r.haySiguiente && !state.loading,
        ) { Text("»") }
    }
}

/**
 * La ficha entera. Es el motivo por el que existe esta pantalla: `ipAddress`,
 * `userAgent` y `previousData` llevaban desde el principio guardándose en
 * `audit_logs` sin que nadie los pintara, que es justo lo que hace falta para
 * investigar un incidente.
 */
@Composable
private fun FichaBitacora(
    entrada: AuditEntryDto,
    ahoraMs: Long,
    puedeFiltrarActor: Boolean,
    onFiltrarActor: () -> Unit,
    onVolver: () -> Unit,
) {
    val context = LocalContext.current
    val cambios = remember(entrada) { describirCambios(entrada.changes) }
    val previos = remember(entrada) { describirCambios(entrada.previousData) }
    val antiguedad = haceCuanto(entrada.createdAt, ahoraMs)

    LazyColumn(
        Modifier.fillMaxSize(),
        contentPadding = PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        item {
            Text(
                etiquetaAccion(entrada.action),
                style = MaterialTheme.typography.titleLarge,
                color = NxColors.Slate,
            )
        }
        item {
            Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                NxStatusChip(categoriaAccion(entrada.action).etiqueta, NxTone.Info)
                if (esAccionCritica(entrada.action)) {
                    NxStatusChip("Crítica", NxTone.Danger)
                }
            }
        }
        item {
            FichaLinea(
                etiqueta = "Cuándo",
                valor = formatearFechaAbsoluta(entrada.createdAt) +
                    if (antiguedad.isBlank()) "" else " · $antiguedad",
                fuente = "audit_logs.createdAt",
            )
        }
        item {
            FichaLinea(
                etiqueta = "Código de acción",
                valor = entrada.action,
                fuente = "audit_logs.action",
                monoespaciado = true,
                vacio = "sin código",
            )
        }
        item {
            FichaLinea(
                etiqueta = "Quién",
                valor = describirActor(entrada.userName, entrada.userEmail),
                fuente = entrada.userId?.let { "audit_logs.userId = $it" }
                    ?: "audit_logs.userId nulo — mutación sin sesión",
            )
        }
        if (puedeFiltrarActor) {
            item {
                Button(onClick = onFiltrarActor, modifier = Modifier.fillMaxWidth()) {
                    Text("Ver todo lo de este actor")
                }
            }
        }
        item {
            FichaLinea(
                etiqueta = "Sitio",
                valor = entrada.entityId?.toString(),
                // Aviso heredado del análisis de la web: este campo NO es el id
                // de la cosa tocada, por mucho que se llame `entityId`.
                fuente = "audit_logs.entityId — `auditMut` guarda aquí el siteId, no la entidad",
            )
        }
        item {
            FichaLinea(
                etiqueta = "IP de origen",
                valor = entrada.ipAddress,
                fuente = "audit_logs.ipAddress",
                monoespaciado = true,
                vacio = "no registrada",
            )
        }
        item {
            FichaLinea(
                etiqueta = "Dispositivo (user-agent)",
                valor = entrada.userAgent,
                fuente = "audit_logs.userAgent",
                monoespaciado = true,
                vacio = "no registrado",
            )
        }
        item { Spacer(Modifier.height(6.dp)) }
        item {
            Text(
                "Qué cambió",
                style = MaterialTheme.typography.titleSmall.copy(fontWeight = FontWeight.Bold),
                color = NxColors.Slate,
            )
        }
        if (cambios.campos.isEmpty()) {
            item {
                Text(
                    if (cambios.vacio && cambios.json != null) {
                        "La entrada existe pero no trae campos (es lo que escribe, por ejemplo, integra.privilege.apply)."
                    } else {
                        "Sin detalle registrado."
                    },
                    style = MaterialTheme.typography.bodySmall,
                    color = NxColors.Muted,
                )
            }
        } else {
            items(cambios.campos.size) { i ->
                val campo = cambios.campos[i]
                FichaLinea(
                    etiqueta = campo.etiqueta,
                    valor = campo.valor,
                    fuente = if (campo.etiqueta == campo.clave) null else campo.clave,
                )
            }
        }
        item { BloqueJson("JSON completo (changes)", cambios.json) }
        if (previos.json != null) {
            item { Spacer(Modifier.height(6.dp)) }
            item {
                Text(
                    "Qué había antes",
                    style = MaterialTheme.typography.titleSmall.copy(fontWeight = FontWeight.Bold),
                    color = NxColors.Slate,
                )
            }
            item { BloqueJson("JSON completo (previousData)", previos.json) }
        }
        item { Spacer(Modifier.height(8.dp)) }
        item {
            OutlinedButton(
                onClick = {
                    val envio = Intent(Intent.ACTION_SEND).apply {
                        type = "text/plain"
                        putExtra(Intent.EXTRA_SUBJECT, "Bitácora INTEGRA · ${entrada.id ?: ""}")
                        putExtra(Intent.EXTRA_TEXT, fichaComoTexto(entrada))
                    }
                    context.startActivity(Intent.createChooser(envio, "Compartir ficha"))
                },
                modifier = Modifier.fillMaxWidth(),
            ) { Text("Compartir ficha") }
        }
        item {
            TextButton(onClick = onVolver, modifier = Modifier.fillMaxWidth()) {
                Text("Volver a la bitácora")
            }
        }
    }
}
