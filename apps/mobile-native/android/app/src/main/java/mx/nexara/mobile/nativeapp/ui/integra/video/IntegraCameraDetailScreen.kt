package mx.nexara.mobile.nativeapp.ui.integra.video

import android.app.Application
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.KeyboardArrowDown
import androidx.compose.material.icons.filled.KeyboardArrowLeft
import androidx.compose.material.icons.filled.KeyboardArrowRight
import androidx.compose.material.icons.filled.KeyboardArrowUp
import androidx.compose.material3.AssistChip
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.compose.viewModel
import coil.compose.AsyncImage
import coil.request.CachePolicy
import coil.request.ImageRequest
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import mx.nexara.mobile.nativeapp.data.api.toUserMessage
import mx.nexara.mobile.nativeapp.data.integra.video.FramePacing
import mx.nexara.mobile.nativeapp.data.integra.video.Go2rtcFrame
import mx.nexara.mobile.nativeapp.data.integra.video.IntegraCamera
import mx.nexara.mobile.nativeapp.data.integra.video.IntegraPtzPreset
import mx.nexara.mobile.nativeapp.data.integra.video.IntegraVideoRepository
import mx.nexara.mobile.nativeapp.data.integra.video.motivoSinImagen
import mx.nexara.mobile.nativeapp.ui.enterprise.NxColors
import mx.nexara.mobile.nativeapp.ui.enterprise.NxErrorBlock
import mx.nexara.mobile.nativeapp.ui.enterprise.NxLoadingBlock
import mx.nexara.mobile.nativeapp.ui.enterprise.NxSectionHeader

/**
 * Detalle de una cámara: imagen grande, PTZ con presets y captura.
 *
 * Mismo trato honesto que en la rejilla — aquí tampoco hay «en vivo», porque
 * sigue siendo el mismo fotograma JPEG, solo que más grande y con un ritmo algo
 * más suelto porque es una sola celda en pantalla.
 */

data class DetalleCamaraUiState(
    val cargando: Boolean = true,
    val error: String? = null,
    val camara: IntegraCamera? = null,
    val hls: String? = null,
    val motivo: String = "",
    val nonce: Long = 0L,
    val fallosSeguidos: Int = 0,
    val conImagen: Boolean = false,
    val pausado: Boolean = false,
    val presets: List<IntegraPtzPreset> = emptyList(),
    val presetsConsultados: Boolean = false,
    val moviendo: Boolean = false,
    val capturando: Boolean = false,
    val mensaje: String? = null,
    val errorAccion: String? = null,
    val rtsp: String? = null,
) {
    val urlFotograma: String?
        get() = if (motivo.isNotEmpty()) null else Go2rtcFrame.frameUrl(hls, nonce)

    /** El control PTZ solo se ofrece si la cámara lo declara. */
    val muestraPtz: Boolean get() = camara?.isPtz == true
}

class IntegraCameraDetailViewModel(app: Application) : AndroidViewModel(app) {

    private val repo = IntegraVideoRepository(app.applicationContext)
    private val _state = MutableStateFlow(DetalleCamaraUiState())
    val state: StateFlow<DetalleCamaraUiState> = _state

    private var cameraId: String = ""
    private var bucle: Job? = null

    fun cargar(id: String) {
        if (id.isBlank()) {
            _state.update { it.copy(cargando = false, error = "Cámara sin identificador") }
            return
        }
        cameraId = id
        bucle?.cancel()
        _state.update { it.copy(cargando = true, error = null) }

        viewModelScope.launch {
            try {
                val camara = withContext(Dispatchers.IO) {
                    // El inventario es la única fuente de los metadatos (PTZ,
                    // audio, zona). No hay endpoint de una sola cámara.
                    repo.cameras().firstOrNull { it.id == id }
                }
                val slot = withContext(Dispatchers.IO) { repo.openStream(id) }
                val motivo = motivoSinImagen(slot)

                _state.update {
                    it.copy(
                        cargando = false,
                        camara = camara,
                        hls = slot.hls,
                        rtsp = slot.rtsp,
                        motivo = motivo,
                    )
                }

                if (motivo.isEmpty() && !_state.value.pausado) siguienteFotograma(inmediato = true)
                if (camara?.isPtz == true) cargarPresets()
            } catch (e: Exception) {
                _state.update {
                    it.copy(cargando = false, error = e.toUserMessage("No se pudo abrir la cámara"))
                }
            }
        }
    }

    /**
     * Los presets son ISAPI. En un sitio que no lo sea el servidor responde
     * error, y aquí eso se traduce en «no hay presets» —no en una pantalla rota—
     * porque no tener posiciones memorizadas es un resultado normal.
     */
    private fun cargarPresets() {
        viewModelScope.launch {
            val lista = try {
                withContext(Dispatchers.IO) { repo.ptzPresets(cameraId) }
            } catch (_: Exception) {
                emptyList()
            }
            _state.update { it.copy(presets = lista, presetsConsultados = true) }
        }
    }

    /** Ver [IntegraVideoWallViewModel]: el siguiente se pide al llegar el anterior. */
    private fun siguienteFotograma(inmediato: Boolean) {
        bucle?.cancel()
        bucle = viewModelScope.launch {
            if (!inmediato) delay(FramePacing.nextDelayMs(_state.value.fallosSeguidos))
            _state.update { it.copy(nonce = it.nonce + 1) }
        }
    }

    fun fotogramaLlego() {
        _state.update { it.copy(conImagen = true, fallosSeguidos = 0) }
        if (!_state.value.pausado) siguienteFotograma(inmediato = false)
    }

    fun fotogramaFallo() {
        _state.update { it.copy(fallosSeguidos = it.fallosSeguidos + 1) }
        if (!_state.value.pausado) siguienteFotograma(inmediato = false)
    }

    fun pausar() {
        _state.update { it.copy(pausado = true) }
        bucle?.cancel()
        bucle = null
    }

    fun reanudar() {
        if (!_state.value.pausado) return
        _state.update { it.copy(pausado = false) }
        if (_state.value.motivo.isEmpty()) siguienteFotograma(inmediato = true)
    }

    /**
     * Movimiento discreto de la domo.
     *
     * Mover cámaras exige el mismo permiso que abrir una puerta
     * (`integraCanControlDoors`); un 403 llega aquí como «Sin permisos para esta
     * acción» y se enseña tal cual, en vez de dejar el botón fingiendo que hizo
     * algo.
     */
    fun mover(pan: Int = 0, tilt: Int = 0, zoom: Int = 0) {
        if (_state.value.moviendo) return
        _state.update { it.copy(moviendo = true, errorAccion = null, mensaje = null) }
        viewModelScope.launch {
            try {
                withContext(Dispatchers.IO) { repo.ptzMove(cameraId, pan = pan, tilt = tilt, zoom = zoom) }
                _state.update { it.copy(moviendo = false) }
            } catch (e: Exception) {
                _state.update {
                    it.copy(moviendo = false, errorAccion = e.toUserMessage("No se pudo mover la cámara"))
                }
            }
        }
    }

    fun irAPreset(preset: IntegraPtzPreset) {
        if (_state.value.moviendo) return
        _state.update { it.copy(moviendo = true, errorAccion = null, mensaje = null) }
        viewModelScope.launch {
            try {
                withContext(Dispatchers.IO) { repo.ptzGoToPreset(cameraId, preset.id) }
                _state.update { it.copy(moviendo = false, mensaje = "Moviendo a «${preset.name}»") }
            } catch (e: Exception) {
                _state.update {
                    it.copy(moviendo = false, errorAccion = e.toUserMessage("No se pudo ir al preset"))
                }
            }
        }
    }

    fun detener() {
        viewModelScope.launch {
            try {
                withContext(Dispatchers.IO) { repo.ptzStop(cameraId) }
                _state.update { it.copy(mensaje = "Domo detenida") }
            } catch (e: Exception) {
                _state.update { it.copy(errorAccion = e.toUserMessage("No se pudo detener la domo")) }
            }
        }
    }

    /**
     * Captura.
     *
     * Importante para no prometer de más: **la guarda el equipo**, no el
     * teléfono. La API devuelve tal cual lo que dijo Artemis y la URL que trae
     * suele apuntar a la LAN del cliente, así que no se intenta descargarla ni
     * se dice «guardada en tu galería».
     */
    fun capturar() {
        if (_state.value.capturando) return
        _state.update { it.copy(capturando = true, errorAccion = null, mensaje = null) }
        viewModelScope.launch {
            try {
                val res = withContext(Dispatchers.IO) { repo.capture(cameraId) }
                _state.update {
                    it.copy(
                        capturando = false,
                        mensaje = if (res.picUrl != null) {
                            "Captura solicitada. El equipo la guardó en su almacenamiento."
                        } else {
                            "Captura solicitada al equipo."
                        },
                    )
                }
            } catch (e: Exception) {
                _state.update {
                    it.copy(capturando = false, errorAccion = e.toUserMessage("No se pudo capturar"))
                }
            }
        }
    }

    override fun onCleared() {
        bucle?.cancel()
        super.onCleared()
    }
}

// ── Pantalla ──────────────────────────────────────────────────────────────────

@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
fun IntegraCameraDetailScreen(
    cameraId: String,
    vm: IntegraCameraDetailViewModel = viewModel(),
) {
    val s by vm.state.collectAsState()

    DisposableEffect(cameraId) {
        vm.cargar(cameraId)
        onDispose { vm.pausar() }
    }

    val lifecycleOwner = LocalLifecycleOwner.current
    DisposableEffect(lifecycleOwner) {
        val observer = LifecycleEventObserver { _, event ->
            when (event) {
                Lifecycle.Event.ON_STOP -> vm.pausar()
                Lifecycle.Event.ON_START -> vm.reanudar()
                else -> Unit
            }
        }
        lifecycleOwner.lifecycle.addObserver(observer)
        onDispose { lifecycleOwner.lifecycle.removeObserver(observer) }
    }

    if (s.cargando) {
        NxLoadingBlock("Abriendo cámara…")
        return
    }
    if (s.error != null) {
        NxErrorBlock(s.error.orEmpty(), onRetry = { vm.cargar(cameraId) })
        return
    }

    LazyColumn(
        Modifier.fillMaxSize().background(NxColors.Surface),
        contentPadding = androidx.compose.foundation.layout.PaddingValues(12.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        item {
            Box(
                Modifier
                    .fillMaxWidth()
                    .aspectRatio(16f / 9f)
                    .clip(RoundedCornerShape(12.dp))
                    .background(Color(0xFF0F172A)),
            ) {
                val url = s.urlFotograma
                if (url != null) {
                    val contexto = LocalContext.current
                    AsyncImage(
                        model = remember(url) {
                            ImageRequest.Builder(contexto)
                                .data(url)
                                .memoryCachePolicy(CachePolicy.DISABLED)
                                .diskCachePolicy(CachePolicy.DISABLED)
                                .crossfade(false)
                                .build()
                        },
                        contentDescription = "Fotograma de ${s.camara?.name ?: cameraId}",
                        modifier = Modifier.fillMaxSize(),
                        contentScale = ContentScale.Fit,
                        onSuccess = { vm.fotogramaLlego() },
                        onError = { vm.fotogramaFallo() },
                    )
                }

                if (s.motivo.isNotEmpty() || (s.fallosSeguidos >= 3 && !s.conImagen)) {
                    Box(Modifier.fillMaxSize().padding(16.dp), contentAlignment = Alignment.Center) {
                        Text(
                            s.motivo.ifBlank { "Sin respuesta del equipo. Reintentando." },
                            color = Color(0xFFE2E8F0),
                            fontSize = 12.sp,
                        )
                    }
                }

                Text(
                    text = if (s.conImagen) "IMÁGENES ~1/s" else "SIN IMAGEN",
                    modifier = Modifier
                        .align(Alignment.TopStart)
                        .padding(8.dp)
                        .clip(RoundedCornerShape(4.dp))
                        .background(if (s.conImagen) Color(0xCC0D9488) else Color(0xCCDC2626))
                        .padding(horizontal = 8.dp, vertical = 3.dp),
                    color = Color.White,
                    fontSize = 10.sp,
                    fontWeight = FontWeight.Bold,
                )
            }
        }

        item {
            Column {
                Text(
                    s.camara?.name ?: cameraId,
                    style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.SemiBold),
                    color = NxColors.Slate,
                )
                Text(
                    buildString {
                        append(s.camara?.region ?: "Sin zona")
                        s.camara?.model?.let { append(" · ").append(it) }
                        s.camara?.sourceIp?.let { append(" · ").append(it) }
                    },
                    fontSize = 12.sp,
                    color = NxColors.Muted,
                )
                Text(
                    "Esta pantalla muestra fotogramas sueltos, no video continuo. " +
                        "El video en vivo sigue estando solo en el muro de la web.",
                    fontSize = 11.sp,
                    color = NxColors.Muted,
                    modifier = Modifier.padding(top = 4.dp),
                )
            }
        }

        s.mensaje?.let { msg ->
            item { Text(msg, color = NxColors.Success, fontSize = 12.sp) }
        }
        s.errorAccion?.let { err ->
            item { Text(err, color = NxColors.Danger, fontSize = 12.sp) }
        }

        item {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
                Button(
                    onClick = vm::capturar,
                    enabled = !s.capturando,
                    modifier = Modifier.weight(1f),
                ) {
                    Text(if (s.capturando) "Capturando…" else "Captura")
                }
                if (s.muestraPtz) {
                    OutlinedButton(onClick = vm::detener, modifier = Modifier.weight(1f)) {
                        Text("Detener domo")
                    }
                }
            }
        }

        if (s.muestraPtz) {
            item { NxSectionHeader(title = "Control PTZ", subtitle = "Cada toque mueve medio segundo") }
            item { MandoPtz(habilitado = !s.moviendo, onMove = vm::mover) }

            item {
                if (s.presets.isEmpty()) {
                    Text(
                        if (s.presetsConsultados) {
                            "Esta cámara no declara posiciones memorizadas, o el sitio " +
                                "no es ISAPI (los presets solo existen ahí)."
                        } else {
                            "Consultando presets…"
                        },
                        fontSize = 11.sp,
                        color = NxColors.Muted,
                    )
                } else {
                    FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        s.presets.forEach { p ->
                            AssistChip(
                                onClick = { vm.irAPreset(p) },
                                enabled = !s.moviendo,
                                label = { Text(p.name, fontSize = 12.sp) },
                            )
                        }
                    }
                }
            }
        } else {
            item {
                Text(
                    "Esta cámara no está marcada como PTZ en el inventario, así que no " +
                        "se ofrece control de movimiento.",
                    fontSize = 11.sp,
                    color = NxColors.Muted,
                )
            }
        }

        item { DatosTecnicos(rtsp = s.rtsp, hls = s.hls) }
        item { Spacer(Modifier.height(24.dp)) }
    }
}

/** Cruceta de 8 direcciones más zoom. Toques discretos, sin mantener pulsado. */
@Composable
private fun MandoPtz(habilitado: Boolean, onMove: (pan: Int, tilt: Int, zoom: Int) -> Unit) {
    val paso = 60
    Card(
        colors = CardDefaults.cardColors(containerColor = NxColors.Card),
        shape = RoundedCornerShape(12.dp),
        modifier = Modifier.fillMaxWidth(),
    ) {
        Column(
            Modifier.fillMaxWidth().padding(12.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            BotonPtz(Icons.Default.KeyboardArrowUp, "Arriba", habilitado) { onMove(0, paso, 0) }
            Row(horizontalArrangement = Arrangement.spacedBy(24.dp)) {
                BotonPtz(Icons.Default.KeyboardArrowLeft, "Izquierda", habilitado) { onMove(-paso, 0, 0) }
                BotonPtz(Icons.Default.KeyboardArrowRight, "Derecha", habilitado) { onMove(paso, 0, 0) }
            }
            BotonPtz(Icons.Default.KeyboardArrowDown, "Abajo", habilitado) { onMove(0, -paso, 0) }

            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.padding(top = 6.dp)) {
                OutlinedButton(onClick = { onMove(0, 0, paso) }, enabled = habilitado) { Text("Zoom +") }
                OutlinedButton(onClick = { onMove(0, 0, -paso) }, enabled = habilitado) { Text("Zoom −") }
            }
        }
    }
}

@Composable
private fun BotonPtz(
    icono: androidx.compose.ui.graphics.vector.ImageVector,
    descripcion: String,
    habilitado: Boolean,
    onClick: () -> Unit,
) {
    OutlinedButton(
        onClick = onClick,
        enabled = habilitado,
        modifier = Modifier.size(56.dp),
        contentPadding = androidx.compose.foundation.layout.PaddingValues(0.dp),
    ) {
        Icon(icono, contentDescription = descripcion)
    }
}

/**
 * Datos técnicos. El RTSP se enseña porque sirve para diagnosticar desde un
 * equipo con VLC, pero **no se ofrece un botón de reproducir**: la app no lleva
 * motor de RTSP y un botón que no reproduce nada es peor que ningún botón.
 */
@Composable
private fun DatosTecnicos(rtsp: String?, hls: String?) {
    if (rtsp.isNullOrBlank() && hls.isNullOrBlank()) return
    Card(
        colors = CardDefaults.cardColors(containerColor = Color(0xFFF1F5F9)),
        shape = RoundedCornerShape(12.dp),
        modifier = Modifier.fillMaxWidth(),
    ) {
        Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text("Datos técnicos", fontWeight = FontWeight.SemiBold, fontSize = 12.sp, color = NxColors.Slate)
            hls?.let { Text("HLS: $it", fontSize = 10.sp, color = NxColors.Muted) }
            rtsp?.let {
                Text("RTSP: $it", fontSize = 10.sp, color = NxColors.Muted)
                Text(
                    "La app no reproduce RTSP; este dato es para diagnóstico.",
                    fontSize = 10.sp,
                    color = NxColors.Muted,
                )
            }
        }
    }
}
