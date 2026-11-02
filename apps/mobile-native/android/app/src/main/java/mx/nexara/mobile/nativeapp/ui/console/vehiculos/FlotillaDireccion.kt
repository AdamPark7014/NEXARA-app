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
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.KeyboardArrowLeft
import androidx.compose.material.icons.automirrored.outlined.KeyboardArrowRight
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
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
import mx.nexara.mobile.nativeapp.data.api.VehiculoDelMesDto
import mx.nexara.mobile.nativeapp.data.api.VehiculoFlotaDto
import mx.nexara.mobile.nativeapp.data.api.toUserMessage
import mx.nexara.mobile.nativeapp.data.vehicles.VehiclesRepository
import mx.nexara.mobile.nativeapp.ui.enterprise.NxAlert
import mx.nexara.mobile.nativeapp.ui.enterprise.NxAlertBanner
import mx.nexara.mobile.nativeapp.ui.enterprise.NxColors
import mx.nexara.mobile.nativeapp.ui.enterprise.NxEmptyState
import mx.nexara.mobile.nativeapp.ui.enterprise.NxErrorBlock
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
            _state.update { s ->
                s.copy(
                    cargando = false,
                    vehiculos = lista.getOrNull() ?: s.vehiculos,
                    datos = datos.getOrNull(),
                    error = (lista.exceptionOrNull() ?: datos.exceptionOrNull())
                        ?.toUserMessage("No se pudo cargar la flotilla"),
                )
            }
        }
    }

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

/** Vehículos para el CEO. [encabezado] es la tarjeta de lo que él traiga, si trae algo. */
@Composable
internal fun FlotillaDireccionScreen(encabezado: (@Composable () -> Unit)? = null) {
    val vm: FlotillaDireccionViewModel = viewModel()
    val state by vm.state.collectAsState()
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
