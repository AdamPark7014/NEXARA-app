package mx.nexara.mobile.nativeapp.ui.console.vehiculos

import android.app.Application
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.KeyboardArrowLeft
import androidx.compose.material.icons.automirrored.outlined.KeyboardArrowRight
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
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
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.compose.viewModel
import java.time.LocalDate
import java.time.ZoneId
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import mx.nexara.mobile.nativeapp.data.api.FichaDireccionDto
import mx.nexara.mobile.nativeapp.data.api.FlotillaMesDto
import mx.nexara.mobile.nativeapp.data.api.SolicitudVehiculoDto
import mx.nexara.mobile.nativeapp.data.api.VehiculoDelMesDto
import mx.nexara.mobile.nativeapp.data.api.VehiculoFlotaDto
import mx.nexara.mobile.nativeapp.data.api.toUserMessage
import mx.nexara.mobile.nativeapp.data.vehicles.VehiclesRepository
import mx.nexara.mobile.nativeapp.ui.enterprise.NxAlert
import mx.nexara.mobile.nativeapp.ui.enterprise.NxAlertBanner
import mx.nexara.mobile.nativeapp.ui.enterprise.NxColors
import mx.nexara.mobile.nativeapp.ui.enterprise.NxEmptyState
import mx.nexara.mobile.nativeapp.ui.enterprise.NxErrorBlock
import mx.nexara.mobile.nativeapp.ui.enterprise.NxFormat
import mx.nexara.mobile.nativeapp.ui.enterprise.NxFormTextField
import mx.nexara.mobile.nativeapp.ui.enterprise.NxKpi
import mx.nexara.mobile.nativeapp.ui.enterprise.NxKpiGrid
import mx.nexara.mobile.nativeapp.ui.enterprise.NxListRow
import mx.nexara.mobile.nativeapp.ui.enterprise.NxPanelShell
import mx.nexara.mobile.nativeapp.ui.enterprise.NxSectionHeader
import mx.nexara.mobile.nativeapp.ui.enterprise.NxSkeletonList
import mx.nexara.mobile.nativeapp.ui.enterprise.NxTone

private val ZONA_MEXICO: ZoneId = ZoneId.of("America/Mexico_City")

private fun mesDeHoy(): String {
    val hoy = LocalDate.now(ZONA_MEXICO)
    return "%04d-%02d".format(hoy.year, hoy.monthValue)
}

data class FlotillaDireccionUi(
    val mes: String = mesDeHoy(),
    val vehiculos: List<VehiculoFlotaDto> = emptyList(),
    val datos: FlotillaMesDto? = null,
    val cargando: Boolean = true,
    val error: String? = null,
    val abierto: VehiculoFlotaDto? = null,
    val ficha: FichaDireccionDto? = null,
    val cargandoFicha: Boolean = false,
    val errorFicha: String? = null,
    /** Solo lo pendiente: si no hay nada, la sección no sale. */
    val solicitudes: List<SolicitudVehiculoDto> = emptyList(),
    val decidiendo: Boolean = false,
    val errorDecision: String? = null,
    val aviso: String? = null,
)

class FlotillaDireccionViewModel(app: Application) : AndroidViewModel(app) {
    private val repo = VehiclesRepository(app.applicationContext)
    private val _state = MutableStateFlow(FlotillaDireccionUi())
    val state: StateFlow<FlotillaDireccionUi> = _state

    init {
        cargar()
    }

    fun cargar() {
        val mes = _state.value.mes
        _state.update { it.copy(cargando = true, error = null) }
        viewModelScope.launch {
            // Van aparte: si falla el mes, la lista de quién trae qué se sigue viendo.
            val lista = withContext(Dispatchers.IO) { intento { repo.flotilla().vehiculos.orEmpty() } }
            val datos = withContext(Dispatchers.IO) { intento { repo.flotillaMes(mes) } }
            val solicitudes = withContext(Dispatchers.IO) { intento { repo.solicitudes() } }
            _state.update { s ->
                s.copy(
                    cargando = false,
                    vehiculos = lista.getOrNull() ?: s.vehiculos,
                    datos = datos.getOrNull(),
                    solicitudes = solicitudes.getOrNull()?.let(FlotillaRules::porAprobar) ?: s.solicitudes,
                    error = (lista.exceptionOrNull() ?: datos.exceptionOrNull() ?: solicitudes.exceptionOrNull())
                        ?.toUserMessage("No se pudo cargar la flotilla"),
                )
            }
        }
    }

    /** Lo decide el servidor: se relee al terminar, y si contesta error se enseña su mensaje. */
    fun decidir(solicitud: SolicitudVehiculoDto, aprobar: Boolean, nota: String?, onListo: () -> Unit) {
        val id = solicitud.id ?: return
        if (_state.value.decidiendo) return
        _state.update { it.copy(decidiendo = true, errorDecision = null) }
        viewModelScope.launch {
            val r = withContext(Dispatchers.IO) { intento { repo.decidirSolicitud(id, aprobar, nota) } }
            r.fold(
                onSuccess = { hecha ->
                    _state.update {
                        it.copy(decidiendo = false, aviso = FlotillaRules.avisoDecision(aprobar, hecha.estatusAprobacion))
                    }
                    onListo()
                    cargar()
                },
                onFailure = { e ->
                    _state.update {
                        it.copy(decidiendo = false, errorDecision = e.toUserMessage("No se pudo decidir la solicitud"))
                    }
                },
            )
        }
    }

    fun limpiarDecision() = _state.update { it.copy(errorDecision = null) }

    fun limpiarAviso() = _state.update { it.copy(aviso = null) }

    fun cambiarMes(mes: String) {
        _state.update { it.copy(mes = mes, datos = null) }
        cargar()
    }

    fun abrir(v: VehiculoFlotaDto) {
        _state.update { it.copy(abierto = v, ficha = null, cargandoFicha = true, errorFicha = null) }
        cargarFicha()
    }

    fun cargarFicha() {
        val id = _state.value.abierto?.id ?: return
        _state.update { it.copy(cargandoFicha = true, errorFicha = null) }
        viewModelScope.launch {
            val r = withContext(Dispatchers.IO) { intento { repo.fichaDireccion(id) } }
            _state.update { s ->
                s.copy(
                    cargandoFicha = false,
                    ficha = r.getOrNull(),
                    errorFicha = r.exceptionOrNull()?.toUserMessage("No se pudo abrir la ficha del vehículo"),
                )
            }
        }
    }

    fun cerrar() = _state.update { it.copy(abierto = null, ficha = null, errorFicha = null) }

    private inline fun <T> intento(bloque: () -> T): Result<T> = try {
        Result.success(bloque())
    } catch (e: CancellationException) {
        throw e
    } catch (e: Throwable) {
        Result.failure(e)
    }
}

/**
 * Vehículos para el CEO. [encabezado] es la tarjeta de lo que él traiga, si trae algo; [onAviso] lleva
 * a la cinta de la pantalla el resultado de decidir una solicitud.
 */
@Composable
internal fun FlotillaDireccionScreen(
    encabezado: (@Composable () -> Unit)? = null,
    onAviso: (String) -> Unit = {},
) {
    val vm: FlotillaDireccionViewModel = viewModel()
    val state by vm.state.collectAsState()
    var rechazando by remember { mutableStateOf<SolicitudVehiculoDto?>(null) }

    LaunchedEffect(state.aviso) {
        val aviso = state.aviso ?: return@LaunchedEffect
        vm.limpiarAviso()
        onAviso(aviso)
    }

    rechazando?.let { solicitud ->
        DialogoRechazarSolicitud(
            solicitud = solicitud,
            enviando = state.decidiendo,
            error = state.errorDecision,
            onCerrar = {
                rechazando = null
                vm.limpiarDecision()
            },
            onConfirmar = { nota -> vm.decidir(solicitud, aprobar = false, nota = nota) { rechazando = null } },
        )
    }

    val abierto = state.abierto
    if (abierto != null) {
        BackHandler(onBack = vm::cerrar)
        FichaDireccionContenido(
            vehiculo = abierto,
            ficha = state.ficha,
            cargando = state.cargandoFicha,
            error = state.errorFicha,
            onVolver = vm::cerrar,
            onReintentar = vm::cargarFicha,
        )
        return
    }
    FlotillaDireccionContenido(
        mes = state.mes,
        puedeAvanzar = state.mes < mesDeHoy(),
        vehiculos = state.vehiculos,
        datos = state.datos,
        cargando = state.cargando,
        error = state.error,
        encabezado = encabezado,
        onMes = vm::cambiarMes,
        onAbrir = vm::abrir,
        onReintentar = vm::cargar,
        solicitudes = state.solicitudes,
        decidiendo = state.decidiendo,
        errorDecision = state.errorDecision.takeIf { rechazando == null },
        onAprobar = { vm.decidir(it, aprobar = true, nota = null) {} },
        onRechazar = {
            vm.limpiarDecision()
            rechazando = it
        },
    )
}

/** Lo que pintan las capturas: sin red ni ViewModel. */
@Composable
internal fun FlotillaDireccionContenido(
    mes: String,
    puedeAvanzar: Boolean,
    vehiculos: List<VehiculoFlotaDto>,
    datos: FlotillaMesDto?,
    cargando: Boolean,
    error: String?,
    encabezado: (@Composable () -> Unit)?,
    onMes: (String) -> Unit,
    onAbrir: (VehiculoFlotaDto) -> Unit,
    onReintentar: () -> Unit,
    solicitudes: List<SolicitudVehiculoDto> = emptyList(),
    decidiendo: Boolean = false,
    errorDecision: String? = null,
    onAprobar: (SolicitudVehiculoDto) -> Unit = {},
    onRechazar: (SolicitudVehiculoDto) -> Unit = {},
) {
    val delMes = datos?.vehiculos.orEmpty().associateBy { it.id }
    val reparto = FlotillaRules.repartoDelMes(datos?.reparto)
    val ocupados = vehiculos.count { !it.conductor?.nombre.isNullOrBlank() }
    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        item {
            NxSectionHeader(
                title = FlotillaRules.nombreMes(mes),
                subtitle = "Lo que cuesta la flotilla y a dónde se fue",
                trailing = {
                    Row {
                        IconButton(onClick = { onMes(FlotillaRules.mesAnterior(mes)) }) {
                            Icon(Icons.AutoMirrored.Outlined.KeyboardArrowLeft, contentDescription = "Mes anterior", tint = NxColors.Slate)
                        }
                        IconButton(onClick = { onMes(FlotillaRules.mesSiguiente(mes)) }, enabled = puedeAvanzar) {
                            Icon(
                                Icons.AutoMirrored.Outlined.KeyboardArrowRight,
                                contentDescription = "Mes siguiente",
                                tint = if (puedeAvanzar) NxColors.Slate else NxColors.Muted.copy(alpha = 0.35f),
                            )
                        }
                    }
                },
            )
        }
        encabezado?.let { tarjeta -> item { tarjeta() } }
        if (solicitudes.isNotEmpty()) {
            item(key = "solicitudes-cabecera") {
                NxSectionHeader(title = "Solicitudes por aprobar", subtitle = "${solicitudes.size} esperando tu visto bueno")
            }
            errorDecision?.let { mensaje ->
                item(key = "solicitudes-error") { Text(mensaje, fontSize = 13.sp, color = NxColors.Danger) }
            }
            items(solicitudes, key = { "solicitud-${it.id}" }) { solicitud ->
                TarjetaSolicitud(
                    solicitud = solicitud,
                    decidiendo = decidiendo,
                    onAprobar = { onAprobar(solicitud) },
                    onRechazar = { onRechazar(solicitud) },
                )
            }
        }
        if (cargando && vehiculos.isEmpty()) {
            item { NxSkeletonList(itemCount = 3, itemHeight = 96.dp) }
        }
        error?.let { item { NxErrorBlock(it, onRetry = onReintentar) } }
        datos?.resumen?.let { r ->
            item {
                NxKpiGrid(
                    items = listOf(
                        NxKpi(label = "Costo del mes", value = FlotillaRules.pesos(r.costoMes)),
                        NxKpi(label = "Recorridos", value = FlotillaRules.km(r.km)),
                        NxKpi(label = "Por kilómetro", value = FlotillaRules.pesos2(r.porKm)),
                        NxKpi(label = "A indirectos", value = FlotillaRules.pesos(r.aIndirectos), tone = NxTone.Warning),
                    ),
                )
            }
        }
        items(datos?.avisos.orEmpty(), key = { "${it.vehicleId}-${it.titulo}" }) { aviso ->
            NxAlertBanner(
                NxAlert(
                    id = "${aviso.vehicleId}-${aviso.titulo}",
                    title = aviso.titulo.orEmpty(),
                    subtitle = aviso.texto,
                    tone = when (aviso.tono) {
                        "danger" -> NxTone.Danger
                        "warning" -> NxTone.Warning
                        else -> NxTone.Info
                    },
                ),
            )
        }
        if (reparto.isNotEmpty()) {
            item {
                NxPanelShell {
                    Text("A dónde se fue", fontWeight = FontWeight.Bold, color = NxColors.Slate)
                    Spacer(Modifier.height(6.dp))
                    reparto.forEach { r ->
                        FilaImporte(
                            titulo = r.nombre,
                            detalle = r.nota,
                            importe = FlotillaRules.pesos(r.importe),
                            extra = listOfNotNull(
                                r.km?.takeIf { it > 0 }?.let(FlotillaRules::km),
                                "${r.pct} %",
                            ).joinToString(" · "),
                        )
                    }
                }
            }
        }
        item {
            NxSectionHeader(
                title = "Flotilla",
                subtitle = if (vehiculos.isEmpty()) null else "${vehiculos.size} en total, $ocupados afuera",
            )
        }
        items(vehiculos, key = { it.id ?: 0L }) { v ->
            FilaVehiculo(v, delMes[v.id], onClick = { onAbrir(v) })
        }
        if (!cargando && error == null && vehiculos.isEmpty()) {
            item { NxEmptyState(title = "Sin vehículos", subtitle = "Todavía no hay vehículos dados de alta.") }
        }
        item { Spacer(Modifier.height(16.dp)) }
    }
}

@Composable
private fun TarjetaSolicitud(
    solicitud: SolicitudVehiculoDto,
    decidiendo: Boolean,
    onAprobar: () -> Unit,
    onRechazar: () -> Unit,
) {
    NxPanelShell {
        Text(FlotillaRules.nombreSolicitud(solicitud), fontWeight = FontWeight.Bold, color = NxColors.Slate)
        Text(FlotillaRules.quienPide(solicitud), fontSize = 14.sp, color = NxColors.Slate)
        solicitud.actividad?.titulo?.takeIf { it.isNotBlank() }?.let {
            Text(it, fontSize = 12.5.sp, color = NxColors.Muted)
        }
        val fechas = listOfNotNull(
            solicitud.fechaInicioSolicitada?.takeIf { it.isNotBlank() }?.let(NxFormat::dateTime),
            solicitud.fechaFinSolicitada?.takeIf { it.isNotBlank() }?.let(NxFormat::dateTime),
        ).joinToString(" → ")
        if (fechas.isNotBlank()) Text(fechas, fontSize = 12.5.sp, color = NxColors.Muted)
        solicitud.motivoUso?.takeIf { it.isNotBlank() }?.let {
            Text("«$it»", fontSize = 12.5.sp, color = NxColors.Muted)
        }
        Spacer(Modifier.height(10.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Button(
                onClick = onAprobar,
                enabled = !decidiendo,
                colors = ButtonDefaults.buttonColors(containerColor = NxColors.Brand),
                modifier = Modifier.weight(1f).heightIn(min = 46.dp),
            ) { Text("Aprobar", fontWeight = FontWeight.Bold) }
            OutlinedButton(
                onClick = onRechazar,
                enabled = !decidiendo,
                modifier = Modifier.weight(1f).heightIn(min = 46.dp),
            ) { Text("Rechazar") }
        }
    }
}

@Composable
private fun DialogoRechazarSolicitud(
    solicitud: SolicitudVehiculoDto,
    enviando: Boolean,
    error: String?,
    onCerrar: () -> Unit,
    onConfirmar: (String) -> Unit,
) {
    var nota by remember { mutableStateOf("") }
    AlertDialog(
        onDismissRequest = { if (!enviando) onCerrar() },
        title = { Text("Rechazar solicitud", fontWeight = FontWeight.Bold, color = NxColors.Slate) },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Text(
                    "${FlotillaRules.nombreSolicitud(solicitud)} para ${FlotillaRules.quienPide(solicitud)}.",
                    fontSize = 14.sp,
                    color = NxColors.Slate,
                )
                NxFormTextField(
                    value = nota,
                    onValueChange = { nota = it.take(300) },
                    label = "¿Por qué?",
                    singleLine = false,
                    minLines = 2,
                )
                error?.let { Text(it, fontSize = 12.5.sp, color = NxColors.Danger) }
            }
        },
        confirmButton = {
            Button(
                onClick = { onConfirmar(nota) },
                enabled = !enviando && nota.isNotBlank(),
                colors = ButtonDefaults.buttonColors(containerColor = NxColors.Brand),
            ) { Text(if (enviando) "Enviando…" else "Rechazar") }
        },
        dismissButton = {
            TextButton(onClick = onCerrar, enabled = !enviando) { Text("Mejor no") }
        },
    )
}

@Composable
private fun FilaVehiculo(v: VehiculoFlotaDto, delMes: VehiculoDelMesDto?, onClick: () -> Unit) {
    val servicio = delMes?.proximoServicio
    val vencido = servicio?.estado == "VENCIDO"
    NxListRow(
        title = FlotillaRules.nombre(v),
        subtitle = FlotillaRules.quienLoTrae(v),
        meta = listOfNotNull(
            delMes?.kmDelMes?.takeIf { it > 0 }?.let { "${FlotillaRules.km(it)} este mes" },
            delMes?.porKm?.let { "${FlotillaRules.pesos2(it)} por km" },
        ).joinToString(" · ").ifBlank { null },
        chipText = when {
            vencido -> "Servicio vencido"
            servicio?.estado == "PRONTO" -> "Servicio pronto"
            else -> null
        },
        chipTone = if (vencido) NxTone.Danger else NxTone.Warning,
        onClick = onClick,
    )
}

/** Un renglón con su importe a la derecha. El nombre va en su propia línea, como en toda la app. */
@Composable
private fun FilaImporte(titulo: String, detalle: String?, importe: String, extra: String? = null) {
    Row(
        modifier = Modifier.fillMaxWidth().padding(vertical = 6.dp),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
        verticalAlignment = Alignment.Top,
    ) {
        Column(modifier = Modifier.weight(1f)) {
            Text(titulo, fontSize = 14.sp, fontWeight = FontWeight.SemiBold, color = NxColors.Slate)
            if (!detalle.isNullOrBlank()) {
                Text(detalle, fontSize = 12.5.sp, lineHeight = 17.sp, color = NxColors.Muted)
            }
        }
        Column(horizontalAlignment = Alignment.End) {
            Text(importe, fontSize = 14.sp, fontWeight = FontWeight.SemiBold, color = NxColors.Slate)
            if (!extra.isNullOrBlank()) {
                Text(extra, fontSize = 12.5.sp, color = NxColors.Muted, textAlign = TextAlign.End)
            }
        }
    }
}

/** La ficha de un vehículo para el CEO: solo lectura. Editarla sigue en la web. */
@Composable
internal fun FichaDireccionContenido(
    vehiculo: VehiculoFlotaDto,
    ficha: FichaDireccionDto?,
    cargando: Boolean,
    error: String?,
    onVolver: () -> Unit,
    onReintentar: () -> Unit,
) {
    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        item {
            TextButton(onClick = onVolver) { Text("‹ Flotilla") }
            NxSectionHeader(title = FlotillaRules.nombre(vehiculo), subtitle = FlotillaRules.quienLoTrae(vehiculo))
        }
        if (cargando && ficha == null) {
            item { NxSkeletonList(itemCount = 3, itemHeight = 96.dp) }
        }
        error?.let { item { NxErrorBlock(it, onRetry = onReintentar) } }
        ficha?.let { f ->
            item {
                NxKpiGrid(
                    items = listOf(
                        NxKpi(label = "Cada kilómetro", value = FlotillaRules.pesos2(f.costos?.porKm)),
                        NxKpi(label = "Rendimiento", value = FlotillaRules.kmPorLitro(f.rendimiento?.usado)),
                        NxKpi(label = "Odómetro", value = FlotillaRules.km(f.odometro?.km?.toDouble())),
                        NxKpi(label = "Próximo servicio", value = FlotillaRules.textoServicio(f.proximoServicio)),
                    ),
                )
            }
            f.costos?.desglose?.takeIf { it.isNotEmpty() }?.let { partes ->
                item {
                    NxPanelShell {
                        Text("En qué se va cada kilómetro", fontWeight = FontWeight.Bold, color = NxColors.Slate)
                        Spacer(Modifier.height(6.dp))
                        partes.forEach { p ->
                            FilaImporte(titulo = p.nombre.orEmpty(), detalle = null, importe = FlotillaRules.pesos2(p.importe))
                        }
                    }
                }
            }
            item {
                NxPanelShell {
                    Text("Gasolina", fontWeight = FontWeight.Bold, color = NxColors.Slate)
                    Spacer(Modifier.height(6.dp))
                    val cargas = f.cargas.orEmpty()
                    if (cargas.isEmpty()) TextoVacio("Sin cargas todavía.")
                    cargas.forEach { c ->
                        FilaImporte(
                            titulo = FlotillaRules.fechaCorta(c.fecha),
                            detalle = listOf(
                                FlotillaRules.litros(c.litros),
                                FlotillaRules.km(c.odometro?.toDouble()),
                                if (c.tanqueLleno == true) "Lleno" else "Parcial",
                            ).joinToString(" · "),
                            importe = FlotillaRules.pesos2(c.importe),
                        )
                    }
                }
            }
            item {
                NxPanelShell {
                    Text("Viajes", fontWeight = FontWeight.Bold, color = NxColors.Slate)
                    Spacer(Modifier.height(6.dp))
                    val viajes = f.viajes.orEmpty()
                    if (viajes.isEmpty()) TextoVacio("Sin viajes registrados.")
                    viajes.forEach { t ->
                        FilaImporte(
                            titulo = t.destino?.nombre ?: t.actividad?.titulo ?: "Sin ligar",
                            detalle = listOfNotNull(
                                FlotillaRules.fechaCorta(t.fecha),
                                FlotillaRules.km(t.km),
                                "Sin foto".takeIf { t.sinFoto == true },
                            ).joinToString(" · "),
                            importe = FlotillaRules.pesos(t.importe),
                        )
                    }
                }
            }
            item {
                NxPanelShell {
                    Text("Mantenimiento", fontWeight = FontWeight.Bold, color = NxColors.Slate)
                    Spacer(Modifier.height(6.dp))
                    f.costos?.mantenimiento?.let { m ->
                        FilaImporte(
                            titulo = "Gastado",
                            detalle = "Apartado ${FlotillaRules.pesos(m.apartado)}",
                            importe = FlotillaRules.pesos(m.gastado),
                        )
                    }
                    val servicios = f.servicios.orEmpty()
                    if (servicios.isEmpty()) TextoVacio("Sin servicios registrados.")
                    servicios.forEach { s ->
                        FilaImporte(
                            titulo = s.concepto.orEmpty(),
                            detalle = listOfNotNull(FlotillaRules.fechaCorta(s.fecha), s.proveedor?.takeIf { it.isNotBlank() })
                                .joinToString(" · "),
                            importe = FlotillaRules.pesos(s.costo),
                        )
                    }
                }
            }
            if (f.costos == null) {
                item {
                    Text(
                        "Falta llenar su ficha de costos: se hace en la web, en Vehículos.",
                        fontSize = 13.sp,
                        color = NxColors.Muted,
                    )
                }
            }
        }
        item { Spacer(Modifier.height(16.dp)) }
    }
}

@Composable
private fun TextoVacio(texto: String) {
    Text(texto, fontSize = 13.sp, color = NxColors.Muted)
}
