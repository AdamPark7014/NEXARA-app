package mx.nexara.mobile.nativeapp.ui.console.horarios

import android.app.Application
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.compose.viewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import mx.nexara.mobile.nativeapp.data.api.DiaHorarioDto
import mx.nexara.mobile.nativeapp.data.api.HorariosEquipoDto
import mx.nexara.mobile.nativeapp.data.api.MiHorarioDto
import mx.nexara.mobile.nativeapp.data.api.PersonaHorarioDto
import mx.nexara.mobile.nativeapp.data.api.toUserMessage
import mx.nexara.mobile.nativeapp.data.console.HorariosRepository
import mx.nexara.mobile.nativeapp.ui.console.more.CargaUiState
import mx.nexara.mobile.nativeapp.ui.console.more.MoreAvisoDesactualizado
import mx.nexara.mobile.nativeapp.ui.enterprise.NxColors
import mx.nexara.mobile.nativeapp.ui.enterprise.NxDenseSectionHeader
import mx.nexara.mobile.nativeapp.ui.enterprise.NxEmptyState
import mx.nexara.mobile.nativeapp.ui.enterprise.NxErrorBlock
import mx.nexara.mobile.nativeapp.ui.enterprise.NxFormTextField
import mx.nexara.mobile.nativeapp.ui.enterprise.NxPrimaryButton
import mx.nexara.mobile.nativeapp.ui.enterprise.NxSegmented
import mx.nexara.mobile.nativeapp.ui.enterprise.NxSkeletonList
import mx.nexara.mobile.nativeapp.ui.enterprise.NxUi

/** Mi horario y los de mi gente. Un fallo al refrescar no borra lo que ya se veía. */
class HorariosViewModel(app: Application) : AndroidViewModel(app) {
    private val repo = HorariosRepository(app.applicationContext)

    private val _mio = MutableStateFlow(CargaUiState<MiHorarioDto>())
    val mio: StateFlow<CargaUiState<MiHorarioDto>> = _mio

    private val _equipo = MutableStateFlow(CargaUiState<HorariosEquipoDto>())
    val equipo: StateFlow<CargaUiState<HorariosEquipoDto>> = _equipo

    private val _enviando = MutableStateFlow(false)
    val enviando: StateFlow<Boolean> = _enviando

    private val _errorCambio = MutableStateFlow<String?>(null)
    val errorCambio: StateFlow<String?> = _errorCambio

    fun cargarMio() {
        val hoy = HorariosRules.hoy()
        cargar(_mio, "No se pudo cargar tu horario") { repo.mio(hoy.toString(), hoy.plusDays(7).toString()) }
    }

    fun cargarEquipo() {
        val hoy = HorariosRules.hoy().toString()
        cargar(_equipo, "No se pudieron cargar los horarios") { repo.equipo(hoy, hoy) }
    }

    fun limpiarError() { _errorCambio.value = null }

    fun cambiarSalida(persona: PersonaHorarioDto, hasta: String, motivo: String, extender: Boolean, onListo: () -> Unit) {
        val id = persona.id ?: return
        val fecha = persona.dias?.firstOrNull()?.fecha ?: return
        if (_enviando.value) return
        _enviando.value = true
        _errorCambio.value = null
        viewModelScope.launch {
            try {
                repo.cambiarSalida(id, fecha, hasta, motivo, extender)
                onListo()
                cargarEquipo()
            } catch (e: Throwable) {
                _errorCambio.value = e.toUserMessage("No se pudo cambiar el horario")
            } finally {
                _enviando.value = false
            }
        }
    }

    private fun <T> cargar(estado: MutableStateFlow<CargaUiState<T>>, fallo: String, pedir: suspend () -> T) {
        estado.update { it.copy(cargando = !it.hayDatos, refrescando = it.hayDatos, error = null, avisoRefresco = null) }
        viewModelScope.launch {
            try {
                val datos = pedir()
                estado.update { CargaUiState(cargando = false, datos = datos) }
            } catch (e: Throwable) {
                val texto = e.toUserMessage(fallo)
                estado.update {
                    it.copy(
                        cargando = false,
                        refrescando = false,
                        error = if (it.hayDatos) null else texto,
                        avisoRefresco = if (it.hayDatos) texto else null,
                    )
                }
            }
        }
    }
}

/** Pestaña «Horarios» de Asistencias. [checa]: lleva horario propio; [gestiona]: tiene gente a su cargo. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun HorariosPanel(checa: Boolean, gestiona: Boolean, modifier: Modifier = Modifier, vm: HorariosViewModel = viewModel()) {
    var enEquipo by rememberSaveable { mutableStateOf(gestiona) }
    val mio by vm.mio.collectAsState()
    val equipo by vm.equipo.collectAsState()
    var cambiando by remember { mutableStateOf<PersonaHorarioDto?>(null) }
    val verEquipo = gestiona && (enEquipo || !checa)

    LaunchedEffect(verEquipo) { if (verEquipo) vm.cargarEquipo() else vm.cargarMio() }

    val refrescando = if (verEquipo) equipo.refrescando else mio.refrescando
    PullToRefreshBox(
        isRefreshing = refrescando,
        onRefresh = { if (verEquipo) vm.cargarEquipo() else vm.cargarMio() },
        modifier = modifier,
    ) {
        LazyColumn(
            modifier = Modifier.fillMaxSize(),
            contentPadding = PaddingValues(16.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            if (checa && gestiona) {
                item(key = "cual") {
                    NxSegmented(
                        options = listOf("Mi equipo hoy", "Mi horario"),
                        selectedIndex = if (verEquipo) 0 else 1,
                        onSelect = { enEquipo = it == 0 },
                        modifier = Modifier.fillMaxWidth(),
                    )
                }
            }
            val aviso = if (verEquipo) equipo.avisoRefresco else mio.avisoRefresco
            val error = if (verEquipo) equipo.error else mio.error
            val cargando = if (verEquipo) equipo.cargando else mio.cargando
            aviso?.let { texto -> item(key = "aviso") { MoreAvisoDesactualizado(texto, onCerrar = { if (verEquipo) vm.cargarEquipo() else vm.cargarMio() }) } }
            when {
                error != null -> item(key = "error") {
                    NxErrorBlock(error, onRetry = { if (verEquipo) vm.cargarEquipo() else vm.cargarMio() })
                }
                cargando -> item(key = "esqueleto") { NxSkeletonList(itemCount = 5, itemHeight = 64.dp) }
                verEquipo -> {
                    val personas = equipo.datos?.personas.orEmpty()
                    if (personas.isEmpty()) {
                        item(key = "vacio") {
                            NxEmptyState(title = "No tienes personas a tu cargo", subtitle = "Aquí aparece el horario de tu equipo.")
                        }
                    } else {
                        item(key = "titulo") {
                            NxDenseSectionHeader(
                                title = "Hoy, ${HorariosRules.dia(equipo.datos?.hoy)}",
                                hint = "Toca a una persona para que salga más tarde o antes.",
                            )
                        }
                        item(key = "equipo") {
                            Superficie {
                                personas.forEachIndexed { i, p ->
                                    if (i > 0) HorizontalDivider(color = NxUi.BorderSubtle)
                                    FilaPersona(p) { cambiando = p }
                                }
                            }
                        }
                    }
                }
                else -> {
                    val dias = mio.datos?.dias.orEmpty()
                    if (dias.isEmpty()) {
                        item(key = "vacio") {
                            NxEmptyState(title = "Sin horario que mostrar", subtitle = "Desliza hacia abajo para volver a cargarlo.")
                        }
                    } else {
                        item(key = "hoy") { TarjetaHoy(dias.first(), mio.datos?.entradaHoyAt) }
                        item(key = "proximos") { NxDenseSectionHeader(title = "Próximos días") }
                        item(key = "lista") {
                            Superficie {
                                dias.drop(1).forEachIndexed { i, d ->
                                    if (i > 0) HorizontalDivider(color = NxUi.BorderSubtle)
                                    FilaDia(d)
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    cambiando?.let { persona ->
        HojaCambiarSalida(
            persona = persona,
            vm = vm,
            onCerrar = {
                cambiando = null
                vm.limpiarError()
            },
        )
    }
}

@Composable
private fun Superficie(content: @Composable () -> Unit) {
    val forma = RoundedCornerShape(NxUi.RadiusLg)
    Column(Modifier.fillMaxWidth().clip(forma).background(NxColors.Card).border(1.dp, NxUi.Border, forma)) { content() }
}

@Composable
private fun TarjetaHoy(d: DiaHorarioDto, entradaIso: String?) {
    Superficie {
        Column(Modifier.padding(18.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text("Hoy, ${HorariosRules.dia(d.fecha)}", style = MaterialTheme.typography.bodySmall, color = NxColors.Muted)
            Text(
                HorariosRules.rango(d).replace("–", " a "),
                fontSize = 30.sp,
                fontWeight = FontWeight.Bold,
                color = NxColors.Slate,
            )
            HorariosRules.quienYPorQue(d)?.let {
                Text(it, style = MaterialTheme.typography.bodyMedium, color = NxUi.Fg2)
            }
            val partes = listOfNotNull(
                HorariosRules.horaDe(entradaIso)?.let { "Entraste $it." },
                (d.extraMin ?: 0).takeIf { it > 0 }?.let { "Extra prevista: ${HorariosRules.horas(it)}, por autorizar." },
            )
            if (partes.isNotEmpty()) {
                Text(partes.joinToString(" "), style = MaterialTheme.typography.bodyMedium, color = NxUi.Fg2)
            }
        }
    }
}

@Composable
private fun FilaDia(d: DiaHorarioDto) {
    Row(
        Modifier.fillMaxWidth().heightIn(min = 48.dp).padding(horizontal = 18.dp, vertical = 10.dp),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(Modifier.weight(1f)) {
            Text(HorariosRules.diaConMayuscula(d.fecha), style = MaterialTheme.typography.bodyMedium, color = NxColors.Slate)
            HorariosRules.quienYPorQue(d)?.let {
                Text(it, style = MaterialTheme.typography.bodySmall, color = NxColors.Muted)
            }
        }
        Text(
            HorariosRules.rango(d),
            style = MaterialTheme.typography.bodyMedium.copy(fontWeight = FontWeight.SemiBold),
            color = NxColors.Slate,
        )
    }
}

@Composable
private fun FilaPersona(p: PersonaHorarioDto, onTocar: () -> Unit) {
    val hoy = p.dias?.firstOrNull()
    val puede = p.puedeProgramar == true && hoy?.trabaja == true
    Row(
        Modifier
            .fillMaxWidth()
            .then(if (puede) Modifier.clickable(onClickLabel = "Cambiar su salida", onClick = onTocar) else Modifier)
            .heightIn(min = 56.dp)
            .padding(horizontal = 18.dp, vertical = 10.dp),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(Modifier.weight(1f)) {
            Text(
                p.nombre.orEmpty(),
                style = MaterialTheme.typography.bodyMedium.copy(fontWeight = FontWeight.SemiBold),
                color = NxColors.Slate,
            )
            Text(
                HorariosRules.horaDe(p.entradaHoyAt)?.let { "Entró $it" } ?: hoy?.horario?.motivo ?: p.puesto ?: "Sin entrada",
                style = MaterialTheme.typography.bodySmall,
                color = NxColors.Muted,
            )
        }
        Text(
            hoy?.let { if (it.trabaja == false) "Descansa" else HorariosRules.rango(it) }.orEmpty(),
            style = MaterialTheme.typography.bodyMedium.copy(fontWeight = FontWeight.SemiBold),
            color = NxColors.Slate,
        )
    }
}

@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
private fun HojaCambiarSalida(persona: PersonaHorarioDto, vm: HorariosViewModel, onCerrar: () -> Unit) {
    val enviando by vm.enviando.collectAsState()
    val error by vm.errorCambio.collectAsState()
    val dia = persona.dias?.firstOrNull()
    val entrada = dia?.horario?.horaEntrada
    val salida = dia?.horario?.horaSalida
    var extender by rememberSaveable { mutableStateOf(true) }
    val sugerencias = if (extender) HorariosRules.sugerenciasExtender(salida) else HorariosRules.sugerenciasRecortar(entrada, salida)
    var hora by rememberSaveable { mutableStateOf(HorariosRules.sugerenciasExtender(salida).firstOrNull().orEmpty()) }
    var motivo by rememberSaveable { mutableStateOf("") }
    val falta = HorariosRules.falta(hora, entrada, salida, extender)

    ModalBottomSheet(
        onDismissRequest = { if (!enviando) onCerrar() },
        sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true),
    ) {
        Column(
            Modifier.verticalScroll(rememberScrollState()).padding(start = 20.dp, end = 20.dp, bottom = 28.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            Text(
                persona.nombre.orEmpty(),
                style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Bold),
                color = NxColors.Slate,
            )
            Text("Hoy sale a las ${salida.orEmpty()}", style = MaterialTheme.typography.bodySmall, color = NxColors.Muted)
            NxSegmented(
                options = listOf("Se queda más tarde", "Termina antes"),
                selectedIndex = if (extender) 0 else 1,
                onSelect = {
                    extender = it == 0
                    hora = (if (extender) HorariosRules.sugerenciasExtender(salida) else HorariosRules.sugerenciasRecortar(entrada, salida))
                        .firstOrNull().orEmpty()
                    vm.limpiarError()
                },
                modifier = Modifier.fillMaxWidth(),
            )
            FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                sugerencias.forEach { s ->
                    FilterChip(
                        selected = hora == s,
                        onClick = { hora = s },
                        enabled = !enviando,
                        label = { Text(s) },
                        modifier = Modifier.heightIn(min = 48.dp),
                    )
                }
            }
            NxFormTextField(value = hora, onValueChange = { hora = it.take(5) }, label = "Hora de salida (24 h)")
            NxFormTextField(
                value = motivo,
                onValueChange = { motivo = it.take(200) },
                label = "Motivo (opcional)",
                imeAction = ImeAction.Done,
            )
            error?.let { Text(it, style = MaterialTheme.typography.bodySmall, color = NxColors.Danger) }
            NxPrimaryButton(
                text = if (extender) "Extender hasta $hora" else "Terminar a las $hora",
                loading = enviando,
                enabled = falta == null,
                onClick = { vm.cambiarSalida(persona, hora, motivo, extender, onCerrar) },
            )
            Text(
                falta ?: "Le avisamos por chat. La hora extra se paga solo si la autorizas después.",
                style = MaterialTheme.typography.bodySmall,
                color = if (falta != null) NxColors.Warning else NxColors.Muted,
            )
            TextButton(onClick = onCerrar, enabled = !enviando, modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp)) {
                Text("Cancelar")
            }
        }
    }
}
