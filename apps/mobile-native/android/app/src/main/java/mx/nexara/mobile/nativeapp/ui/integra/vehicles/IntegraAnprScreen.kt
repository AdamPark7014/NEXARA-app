package mx.nexara.mobile.nativeapp.ui.integra.vehicles

import android.app.Application
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
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FilterChipDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.unit.dp
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.compose.viewModel
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import mx.nexara.mobile.nativeapp.data.integra.vehicles.ANPR_MAX_OWNER_LEN
import mx.nexara.mobile.nativeapp.data.integra.vehicles.ANPR_MAX_PLATE_LEN
import mx.nexara.mobile.nativeapp.data.integra.vehicles.ANPR_MAX_RANGE_DAYS
import mx.nexara.mobile.nativeapp.data.integra.vehicles.AnprQueryRequest
import mx.nexara.mobile.nativeapp.data.integra.vehicles.AnprRecordDto
import mx.nexara.mobile.nativeapp.data.integra.vehicles.AnprVentana
import mx.nexara.mobile.nativeapp.data.integra.vehicles.CamaraOpcion
import mx.nexara.mobile.nativeapp.data.integra.vehicles.IntegraVehiclesRepository
import mx.nexara.mobile.nativeapp.data.integra.vehicles.anprDirection
import mx.nexara.mobile.nativeapp.data.integra.vehicles.anprVehicleColor
import mx.nexara.mobile.nativeapp.data.integra.vehicles.anprVehicleType
import mx.nexara.mobile.nativeapp.data.integra.vehicles.formatearCrossTime
import mx.nexara.mobile.nativeapp.data.integra.vehicles.rangoDeVentana
import mx.nexara.mobile.nativeapp.data.integra.vehicles.toArtemisTime
import mx.nexara.mobile.nativeapp.ui.enterprise.NxColors
import mx.nexara.mobile.nativeapp.ui.enterprise.NxEmptyState
import mx.nexara.mobile.nativeapp.ui.enterprise.NxErrorBlock
import mx.nexara.mobile.nativeapp.ui.enterprise.NxFormTextField
import mx.nexara.mobile.nativeapp.ui.enterprise.NxLoadingBlock
import mx.nexara.mobile.nativeapp.ui.enterprise.NxStatusChip
import mx.nexara.mobile.nativeapp.ui.enterprise.NxTone

/**
 * Cruces ANPR de INTEGRA — paridad con
 * `apps/web/app/(panels)/integra/anpr/page.tsx`.
 *
 * ── Lo que esta pantalla NO hace ─────────────────────────────────────────────
 * No inventa lecturas de placa. `POST integra/anpr/cross-records` solo funciona
 * en sitios con proveedor ARTEMIS; en un sitio ISAPI —el parque de Oficinas, con
 * la PTZ .179— el servidor devuelve HTTP 400 y aquí se enseña «este sitio no
 * tiene ANPR», con el texto que mandó el servidor, y sin botón de reintentar.
 * Una lista vacía haría creer que no pasó ningún coche.
 *
 * Tampoco pinta la foto del vehículo: `vehiclePicUri` es una referencia interna
 * de HikCentral que solo se resuelve con `POST /artemis/api/pms/v1/image`, y la
 * API de NEXARA no expone ese proxy. Se muestra la referencia, no una imagen
 * rota ni un hueco.
 *
 * Los filtros de placa, dueño y cámara son de SERVIDOR (§5.8.2): acotan la
 * búsqueda entera, no la página descargada. Por eso «0 resultados» con filtro
 * significa 0 en todo el rango, y así se dice.
 */

private val TAMANOS_PAGINA = listOf(25, 50, 100, 200)

/** Lo que de verdad se le pidió al servidor. El formulario es solo un borrador. */
data class AnprConsulta(
    val startMillis: Long,
    val endMillis: Long,
    val ventana: AnprVentana?,
    val placa: String = "",
    val dueno: String = "",
    val camaraId: String = "",
    val pageNo: Int = 1,
    val pageSize: Int = 50,
    /** 1 = más recientes primero (valor por defecto del manual). */
    val orderType: Int = 1,
)

data class AnprBorrador(
    val ventana: AnprVentana = AnprVentana.UN_DIA,
    val placa: String = "",
    val dueno: String = "",
    val camaraId: String = "",
    val orderType: Int = 1,
)

data class IntegraAnprUiState(
    val loading: Boolean = true,
    val buscando: Boolean = false,
    val error: String? = null,
    /** El sitio no habla Artemis: no hay nada que reintentar. */
    val noDisponible: Boolean = false,
    val registros: List<AnprRecordDto> = emptyList(),
    /** `null` = la plataforma no dijo cuántos hay en total. */
    val total: Int? = null,
    val camaras: List<CamaraOpcion> = emptyList(),
    val consulta: AnprConsulta,
    val borrador: AnprBorrador = AnprBorrador(),
    val abierta: String? = null,
) {
    val sucio: Boolean
        get() = borrador.ventana != consulta.ventana ||
            borrador.placa != consulta.placa ||
            borrador.dueno != consulta.dueno ||
            borrador.camaraId != consulta.camaraId ||
            borrador.orderType != consulta.orderType

    val conFiltroServidor: Boolean
        get() = consulta.placa.isNotBlank() ||
            consulta.dueno.isNotBlank() ||
            consulta.camaraId.isNotBlank()

    val conFoto: Int get() = registros.count { !it.vehiclePicUri.isNullOrBlank() }

    fun nombreCamara(id: String?): String? {
        if (id.isNullOrBlank()) return null
        return camaras.firstOrNull { it.id == id }?.name ?: id
    }

    fun descripcionFiltros(): String {
        val partes = buildList {
            if (consulta.placa.isNotBlank()) add("placa «${consulta.placa}»")
            if (consulta.dueno.isNotBlank()) add("dueño «${consulta.dueno}»")
            if (consulta.camaraId.isNotBlank()) {
                add("cámara ${nombreCamara(consulta.camaraId)}")
            }
        }
        return partes.joinToString(" · ")
    }
}

class IntegraAnprViewModel(app: Application) : AndroidViewModel(app) {

    private val repo = IntegraVehiclesRepository(app.applicationContext)

    private val _state = MutableStateFlow(
        IntegraAnprUiState(consulta = consultaInicial()),
    )
    val state: StateFlow<IntegraAnprUiState> = _state

    /** Contador de peticiones: una respuesta vieja no puede pisar a una nueva. */
    private var secuencia = 0

    init {
        cargarCamaras()
        buscar(_state.value.consulta, primeraCarga = true)
    }

    private fun consultaInicial(): AnprConsulta {
        val r = rangoDeVentana(AnprVentana.UN_DIA, System.currentTimeMillis())
        return AnprConsulta(
            startMillis = r.startMillis,
            endMillis = r.endMillis,
            ventana = AnprVentana.UN_DIA,
        )
    }

    fun setVentana(v: AnprVentana) = _state.update { it.copy(borrador = it.borrador.copy(ventana = v)) }

    fun setPlaca(v: String) = _state.update {
        it.copy(borrador = it.borrador.copy(placa = v.uppercase().take(ANPR_MAX_PLATE_LEN)))
    }

    fun setDueno(v: String) = _state.update {
        it.copy(borrador = it.borrador.copy(dueno = v.take(ANPR_MAX_OWNER_LEN)))
    }

    fun setCamara(v: String) = _state.update { it.copy(borrador = it.borrador.copy(camaraId = v)) }

    fun setOrden(v: Int) = _state.update { it.copy(borrador = it.borrador.copy(orderType = v)) }

    fun alternarDetalle(clave: String) = _state.update {
        it.copy(abierta = if (it.abierta == clave) null else clave)
    }

    /** Aplica el borrador y vuelve a la página 1: los filtros son de servidor. */
    fun aplicarBorrador() {
        val s = _state.value
        val r = rangoDeVentana(s.borrador.ventana, System.currentTimeMillis())
        buscar(
            s.consulta.copy(
                startMillis = r.startMillis,
                endMillis = r.endMillis,
                ventana = s.borrador.ventana,
                placa = s.borrador.placa.trim(),
                dueno = s.borrador.dueno.trim(),
                camaraId = s.borrador.camaraId,
                orderType = s.borrador.orderType,
                pageNo = 1,
            ),
        )
    }

    fun reiniciar() {
        _state.update { it.copy(borrador = AnprBorrador(), abierta = null) }
        buscar(consultaInicial())
    }

    fun irAPagina(p: Int) {
        val s = _state.value
        buscar(s.consulta.copy(pageNo = if (p < 1) 1 else p))
    }

    fun setTamanoPagina(n: Int) {
        val s = _state.value
        buscar(s.consulta.copy(pageSize = n, pageNo = 1))
    }

    fun reintentar() = buscar(_state.value.consulta)

    private fun cargarCamaras() {
        viewModelScope.launch {
            // Que falle el catálogo de cámaras no puede tumbar la pantalla: solo
            // sirve para poner nombre al `cameraIndexCode`.
            val lista = try {
                withContext(Dispatchers.IO) { repo.camaras() }
            } catch (_: Exception) {
                emptyList()
            }
            _state.update { it.copy(camaras = lista) }
        }
    }

    private fun buscar(consulta: AnprConsulta, primeraCarga: Boolean = false) {
        val seq = ++secuencia
        _state.update {
            it.copy(
                consulta = consulta,
                loading = primeraCarga,
                buscando = true,
                error = null,
                noDisponible = false,
                abierta = null,
            )
        }
        viewModelScope.launch {
            try {
                val query = AnprQueryRequest(
                    pageNo = consulta.pageNo,
                    pageSize = consulta.pageSize,
                    startTime = toArtemisTime(consulta.startMillis),
                    endTime = toArtemisTime(consulta.endMillis),
                    cameraIndexCode = consulta.camaraId.ifBlank { null },
                    plateNo = consulta.placa.trim().ifBlank { null },
                    ownerName = consulta.dueno.trim().ifBlank { null },
                    sortField = "PassTime",
                    orderType = consulta.orderType,
                )
                val pagina = withContext(Dispatchers.IO) { repo.anpr(query) }
                if (seq != secuencia) return@launch
                _state.update {
                    it.copy(
                        loading = false,
                        buscando = false,
                        registros = pagina.registros,
                        total = pagina.total,
                    )
                }
            } catch (e: Exception) {
                if (seq != secuencia) return@launch
                val d = IntegraVehiclesRepository.diagnosticar(
                    e,
                    "No se pudieron traer los cruces de placa",
                )
                _state.update {
                    it.copy(
                        loading = false,
                        buscando = false,
                        registros = emptyList(),
                        total = null,
                        error = d.mensaje,
                        noDisponible = d.noDisponible,
                    )
                }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun IntegraAnprScreen(vm: IntegraAnprViewModel = viewModel()) {
    val s by vm.state.collectAsState()

    PullToRefreshBox(
        isRefreshing = s.buscando && !s.loading,
        onRefresh = { vm.reintentar() },
        modifier = Modifier.fillMaxSize(),
    ) {
        LazyColumn(
            contentPadding = PaddingValues(16.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            item { FiltrosAnpr(s = s, vm = vm) }

            if (s.noDisponible) {
                item { AnprNoDisponible(s.error.orEmpty()) }
                return@LazyColumn
            }

            s.error?.let { msg ->
                item {
                    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                        NxErrorBlock(msg) { vm.reintentar() }
                        Text(
                            "La búsqueda ANPR vive en el módulo PMS de HikCentral. Si el " +
                                "sitio no tiene esa licencia o la cámara de placas no está " +
                                "dada de alta, la plataforma rechaza la consulta.",
                            style = MaterialTheme.typography.labelSmall,
                            color = NxColors.Muted,
                        )
                    }
                }
            }

            when {
                s.loading -> item { NxLoadingBlock("Consultando cruces en HikCentral PMS…") }

                s.registros.isEmpty() && s.error == null -> item {
                    NxEmptyState(
                        title = if (s.conFiltroServidor) {
                            "Ningún cruce coincide con esos filtros"
                        } else {
                            "Sin cruces de placa en el rango"
                        },
                        subtitle = if (s.conFiltroServidor) {
                            "Buscaste ${s.descripcionFiltros()}. El filtro lo resuelve " +
                                "HikCentral sobre el rango completo, así que no hay " +
                                "coincidencias en ninguna página. Amplía las fechas o quita " +
                                "filtros."
                        } else {
                            "Esta pantalla lista las lecturas de placa que registró el módulo " +
                                "PMS de HikCentral en la ventana elegida. No hay ninguna entre " +
                                "esas fechas: prueba a ampliar el rango, o revisa que la cámara " +
                                "de placas del parque esté dada de alta y en línea."
                        },
                        actionLabel = "Ver las últimas 24 h",
                        onAction = { vm.reiniciar() },
                    )
                }

                else -> {
                    item { ResumenAnpr(s) }

                    // El índice va delante de la clave para que dos cruces con el
                    // mismo `crossRecordSyscode` (no debería pasar, pero la
                    // plataforma no lo garantiza) no revienten `LazyColumn`.
                    items(
                        s.registros.mapIndexed { i, r -> "$i|${r.claveDeLista(i)}" to r },
                        key = { it.first },
                    ) { (clave, r) ->
                        FilaCruce(
                            clave = clave,
                            registro = r,
                            nombreCamara = s.nombreCamara(r.cameraIndexCode),
                            abierta = s.abierta == clave,
                            onToggle = { vm.alternarDetalle(clave) },
                        )
                    }

                    item { Paginador(s = s, vm = vm) }

                    if (s.conFoto > 0) {
                        item { NotaFotos(conFoto = s.conFoto, total = s.registros.size) }
                    }
                }
            }

            item { Spacer(Modifier.height(16.dp)) }
        }
    }
}

@Composable
private fun AnprNoDisponible(mensajeServidor: String) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = NxColors.WarningSoft),
    ) {
        Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text(
                "Este sitio no tiene lectura de placas",
                style = MaterialTheme.typography.titleSmall.copy(
                    fontWeight = FontWeight.SemiBold,
                ),
                color = NxColors.Slate,
            )
            Text(
                "El ANPR se consulta contra el módulo PMS de HikCentral y solo responde en " +
                    "sitios conectados por Artemis. El sitio activo usa otro proveedor, así " +
                    "que aquí no hay cruces que enseñar — ni los habrá hasta que se conecte " +
                    "una plataforma que los tenga. No se muestra una lista vacía porque eso " +
                    "haría creer que no pasó ningún coche.",
                style = MaterialTheme.typography.bodySmall,
                color = NxColors.Slate,
            )
            Text(
                "Respuesta del servidor: $mensajeServidor",
                style = MaterialTheme.typography.labelSmall,
                color = NxColors.Muted,
            )
        }
    }
}

@Composable
private fun ResumenAnpr(s: IntegraAnprUiState) {
    Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
        Text(
            if (s.total != null) {
                "${s.registros.size} de ${s.total} cruces en el rango"
            } else {
                "${s.registros.size} cruces en esta página"
            },
            style = MaterialTheme.typography.bodySmall,
            color = NxColors.Slate,
        )
        Text(
            if (s.conFiltroServidor) {
                "Filtrado en el servidor por ${s.descripcionFiltros()}"
            } else {
                "Sin filtros: todo el parque en el rango"
            },
            style = MaterialTheme.typography.labelSmall,
            color = NxColors.Muted,
        )
    }
}

@Composable
private fun FiltrosAnpr(s: IntegraAnprUiState, vm: IntegraAnprViewModel) {
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text(
            "Ventana de búsqueda",
            style = MaterialTheme.typography.labelMedium,
            color = NxColors.Muted,
        )
        Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            AnprVentana.entries.forEach { v ->
                FilterChip(
                    selected = s.borrador.ventana == v,
                    onClick = { vm.setVentana(v) },
                    label = { Text(v.etiqueta) },
                    colors = FilterChipDefaults.filterChipColors(
                        selectedContainerColor = NxColors.TealSoft,
                        selectedLabelColor = NxColors.Teal,
                    ),
                )
            }
        }
        Text(
            "El manual de HikCentral limita la búsqueda a $ANPR_MAX_RANGE_DAYS días; " +
                "ninguna de estas ventanas lo rebasa.",
            style = MaterialTheme.typography.labelSmall,
            color = NxColors.Muted,
        )

        NxFormTextField(
            value = s.borrador.placa,
            onValueChange = vm::setPlaca,
            label = "Placa (filtro de servidor, máx. $ANPR_MAX_PLATE_LEN)",
            imeAction = ImeAction.Next,
        )
        NxFormTextField(
            value = s.borrador.dueno,
            onValueChange = vm::setDueno,
            label = "Dueño (filtro de servidor)",
            imeAction = ImeAction.Done,
            onImeAction = { vm.aplicarBorrador() },
        )

        SelectorCamara(s = s, vm = vm)
        SelectorOrden(s = s, vm = vm)

        if (s.sucio) {
            Text(
                "Has cambiado los filtros pero la lista sigue mostrando la búsqueda " +
                    "anterior. Pulsa «Buscar» para pedir los nuevos al servidor.",
                style = MaterialTheme.typography.labelSmall,
                color = NxColors.Warning,
            )
        }

        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            OutlinedButton(
                onClick = { vm.reiniciar() },
                enabled = !s.buscando,
                modifier = Modifier.weight(1f),
            ) { Text("Últimas 24 h") }
            Button(
                onClick = { vm.aplicarBorrador() },
                enabled = !s.buscando,
                modifier = Modifier.weight(1f),
                colors = ButtonDefaults.buttonColors(containerColor = NxColors.Teal),
            ) { Text(if (s.buscando) "Buscando…" else "Buscar") }
        }
    }
}

@Composable
private fun SelectorCamara(s: IntegraAnprUiState, vm: IntegraAnprViewModel) {
    var abierto by remember { mutableStateOf(false) }
    val actual = s.camaras.firstOrNull { it.id == s.borrador.camaraId }
    val etiqueta = when {
        s.borrador.camaraId.isBlank() -> "Todas las cámaras"
        actual != null -> etiquetaCamara(actual)
        else -> s.borrador.camaraId
    }

    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
        Text("Cámara", style = MaterialTheme.typography.labelMedium, color = NxColors.Muted)
        Box {
            OutlinedButton(
                onClick = { abierto = true },
                modifier = Modifier.fillMaxWidth(),
                enabled = s.camaras.isNotEmpty(),
            ) { Text(etiqueta) }
            DropdownMenu(
                expanded = abierto,
                onDismissRequest = { abierto = false },
                modifier = Modifier.heightIn(max = 360.dp),
            ) {
                DropdownMenuItem(
                    text = { Text("Todas las cámaras") },
                    onClick = { vm.setCamara(""); abierto = false },
                )
                s.camaras.forEach { c ->
                    DropdownMenuItem(
                        text = { Text(etiquetaCamara(c)) },
                        onClick = { vm.setCamara(c.id); abierto = false },
                    )
                }
            }
        }
        if (s.camaras.isEmpty()) {
            Text(
                "No se pudo cargar el catálogo de cámaras: la búsqueda sigue funcionando " +
                    "sobre todas, pero los cruces mostrarán el código en vez del nombre.",
                style = MaterialTheme.typography.labelSmall,
                color = NxColors.Muted,
            )
        }
    }
}

/**
 * `anprCapable` lo determina el servidor interrogando al equipo
 * (`isapi.discovery.ts`). Si viene `null` es que no se sabe, y eso se dice: no
 * se asume que una cámara lee placas por su nombre ni por su modelo.
 */
private fun etiquetaCamara(c: CamaraOpcion): String = when (c.anprCapable) {
    true -> "${c.name} · ANPR"
    false -> "${c.name} · sin ANPR"
    null -> c.name
}

@Composable
private fun SelectorOrden(s: IntegraAnprUiState, vm: IntegraAnprViewModel) {
    var abierto by remember { mutableStateOf(false) }
    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
        Text("Orden", style = MaterialTheme.typography.labelMedium, color = NxColors.Muted)
        Box {
            OutlinedButton(onClick = { abierto = true }, modifier = Modifier.fillMaxWidth()) {
                Text(
                    if (s.borrador.orderType == 0) {
                        "Más antiguos primero"
                    } else {
                        "Más recientes primero"
                    },
                )
            }
            DropdownMenu(expanded = abierto, onDismissRequest = { abierto = false }) {
                DropdownMenuItem(
                    text = { Text("Más recientes primero") },
                    onClick = { vm.setOrden(1); abierto = false },
                )
                DropdownMenuItem(
                    text = { Text("Más antiguos primero") },
                    onClick = { vm.setOrden(0); abierto = false },
                )
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun FilaCruce(
    clave: String,
    registro: AnprRecordDto,
    nombreCamara: String?,
    abierta: Boolean,
    onToggle: () -> Unit,
) {
    val tipo = anprVehicleType(registro.vehicleType)
    val color = anprVehicleColor(registro.vehicleColor)

    Card(
        onClick = onToggle,
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = NxColors.Card),
    ) {
        Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Row(
                Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    registro.plateNo?.takeIf { it.isNotBlank() } ?: "Sin lectura",
                    style = MaterialTheme.typography.titleMedium.copy(
                        fontWeight = FontWeight.Bold,
                    ),
                    color = if (registro.plateNo.isNullOrBlank()) {
                        NxColors.Muted
                    } else {
                        NxColors.Slate
                    },
                )
                if (!registro.vehiclePicUri.isNullOrBlank()) {
                    NxStatusChip("Con foto", NxTone.Info)
                }
            }

            Text(
                formatearCrossTime(registro.crossTime),
                style = MaterialTheme.typography.bodySmall,
                color = NxColors.Slate,
            )
            Text(
                nombreCamara ?: "Cámara sin identificar",
                style = MaterialTheme.typography.bodySmall,
                color = NxColors.Muted,
            )

            val descripcion = listOfNotNull(tipo, color).joinToString(" · ")
            if (descripcion.isNotBlank()) {
                Text(
                    descripcion,
                    style = MaterialTheme.typography.labelSmall,
                    color = NxColors.Muted,
                )
            }

            TextButton(onClick = onToggle) {
                Text(if (abierta) "Ocultar detalle" else "Ver detalle")
            }

            if (abierta) DetalleCruce(registro = registro, nombreCamara = nombreCamara)
        }
    }
}

/** Ficha con TODOS los campos documentados que la plataforma devolvió. Ni uno más. */
@Composable
private fun DetalleCruce(registro: AnprRecordDto, nombreCamara: String?) {
    val datos: List<Pair<String, String?>> = listOf(
        "Placa" to registro.plateNo?.takeIf { it.isNotBlank() },
        "Cruce" to registro.crossTime?.let { formatearCrossTime(it) },
        "Registrado" to registro.createTime?.let { formatearCrossTime(it) },
        "Cámara" to nombreCamara,
        "Tipo" to anprVehicleType(registro.vehicleType),
        "Color" to anprVehicleColor(registro.vehicleColor),
        "Sentido" to anprDirection(registro.vehicleDirectionType),
        "Velocidad" to registro.vehicleSpeed?.let { "$it km/h" },
        "Dueño" to registro.ownerName?.takeIf { it.isNotBlank() },
        "Contacto" to registro.contact?.takeIf { it.isNotBlank() },
        "Id de cruce" to registro.crossRecordSyscode?.takeIf { it.isNotBlank() },
    )
    val conocidos = datos.mapNotNull { (k, v) -> v?.let { k to it } }

    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
        conocidos.forEach { (k, v) ->
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Text(
                    k,
                    style = MaterialTheme.typography.labelSmall,
                    color = NxColors.Muted,
                    modifier = Modifier.weight(0.4f),
                )
                Text(
                    v,
                    style = MaterialTheme.typography.labelSmall,
                    color = NxColors.Slate,
                    modifier = Modifier.weight(0.6f),
                )
            }
        }

        Text(
            if (!registro.vehiclePicUri.isNullOrBlank()) {
                "Foto en la plataforma · referencia ${registro.vehiclePicUri}"
            } else {
                "Este cruce no trae foto del vehículo."
            },
            style = MaterialTheme.typography.labelSmall,
            color = NxColors.Muted,
        )

        if (conocidos.size < 4) {
            Text(
                "La plataforma devolvió pocos campos para este cruce. Los que faltan son " +
                    "opcionales en el manual (tabla A-73) y dependen de lo que sepa " +
                    "reconocer la cámara: no se inventan aquí.",
                style = MaterialTheme.typography.labelSmall,
                color = NxColors.Muted,
            )
        }
    }
}

@Composable
private fun NotaFotos(conFoto: Int, total: Int) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = NxColors.WarningSoft),
    ) {
        Text(
            "$conFoto de estos $total cruces traen foto del vehículo, pero la imagen no se " +
                "puede pintar aquí: `vehiclePicUri` es una referencia interna de HikCentral " +
                "que solo se resuelve llamando a POST /artemis/api/pms/v1/image, y la API de " +
                "NEXARA aún no expone ese proxy. En el detalle de cada cruce está la " +
                "referencia para localizarla en la plataforma.",
            modifier = Modifier.padding(12.dp),
            style = MaterialTheme.typography.labelSmall,
            color = NxColors.Slate,
        )
    }
}

@Composable
private fun Paginador(s: IntegraAnprUiState, vm: IntegraAnprViewModel) {
    var abierto by remember { mutableStateOf(false) }
    val ultimaPagina = s.total?.let { t ->
        val paginas = (t + s.consulta.pageSize - 1) / s.consulta.pageSize
        s.consulta.pageNo >= paginas
    } ?: (s.registros.size < s.consulta.pageSize)

    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Row(
            Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            OutlinedButton(
                onClick = { vm.irAPagina(s.consulta.pageNo - 1) },
                enabled = s.consulta.pageNo > 1 && !s.buscando,
                modifier = Modifier.weight(1f),
            ) { Text("Anterior") }

            Text(
                "Página ${s.consulta.pageNo}",
                style = MaterialTheme.typography.labelMedium,
                color = NxColors.Muted,
            )

            OutlinedButton(
                onClick = { vm.irAPagina(s.consulta.pageNo + 1) },
                enabled = !ultimaPagina && !s.buscando,
                modifier = Modifier.weight(1f),
            ) { Text("Siguiente") }
        }

        Box {
            TextButton(onClick = { abierto = true }) {
                Text("${s.consulta.pageSize} por página")
            }
            DropdownMenu(expanded = abierto, onDismissRequest = { abierto = false }) {
                TAMANOS_PAGINA.forEach { n ->
                    DropdownMenuItem(
                        text = { Text("$n por página") },
                        onClick = { vm.setTamanoPagina(n); abierto = false },
                    )
                }
            }
        }

        if (s.total == null) {
            Text(
                "La plataforma no dijo cuántos cruces hay en total, así que no se puede " +
                    "saber cuántas páginas quedan: «Siguiente» se apaga cuando llega una " +
                    "página incompleta.",
                style = MaterialTheme.typography.labelSmall,
                color = NxColors.Muted,
            )
        }
    }
}
