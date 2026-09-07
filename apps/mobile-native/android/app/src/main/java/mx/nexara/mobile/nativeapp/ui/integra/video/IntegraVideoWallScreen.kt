package mx.nexara.mobile.nativeapp.ui.integra.video

import android.app.Application
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.GridItemSpan
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FilterChipDefaults
import androidx.compose.material3.MaterialTheme
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
import androidx.compose.ui.text.style.TextOverflow
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
import mx.nexara.mobile.nativeapp.data.integra.IntegraRepository
import mx.nexara.mobile.nativeapp.data.integra.video.FramePacing
import mx.nexara.mobile.nativeapp.data.integra.video.Go2rtcFrame
import mx.nexara.mobile.nativeapp.data.integra.video.IntegraCamera
import mx.nexara.mobile.nativeapp.data.integra.video.IntegraVideoRepository
import mx.nexara.mobile.nativeapp.data.integra.video.motivoSinImagen
import mx.nexara.mobile.nativeapp.ui.enterprise.NxColors
import mx.nexara.mobile.nativeapp.ui.enterprise.NxEmptyState
import mx.nexara.mobile.nativeapp.ui.enterprise.NxErrorBlock
import mx.nexara.mobile.nativeapp.ui.enterprise.NxLoadingBlock
import mx.nexara.mobile.nativeapp.ui.enterprise.NxSearchField

/**
 * Rejilla de cámaras de INTEGRA.
 *
 * **Qué es y qué no.** Esto NO es video. Son fotogramas JPEG pedidos de uno en
 * uno a go2rtc, aproximadamente uno por segundo y por celda, y la interfaz lo
 * dice con esas palabras. El muro web sí reproduce video (MSE sobre WebSocket) y
 * durante un tiempo puso «LIVE» encima de un respaldo de 1 img/s: de ahí salió
 * la queja «se traba mucho». La imagen no era el problema; la etiqueta sí.
 * Aquí no hay ninguna insignia que diga «en vivo».
 */

// ── Estado ────────────────────────────────────────────────────────────────────

/** En qué punto está una celda. Ninguno de estos estados se llama «en vivo». */
enum class FaseCelda {
    /** Esperando turno: aún no se ha pedido su primer fotograma. */
    EnCola,

    /** Petición en curso, sin imagen todavía. */
    Pidiendo,

    /** Hay un fotograma en pantalla. */
    ConImagen,

    /** Se pidió y falló; se reintenta con retroceso. */
    Fallando,

    /** No se puede pedir imagen en absoluto, y [CeldaVideo.motivo] dice por qué. */
    SinImagen,
}

/**
 * Una celda de la rejilla.
 *
 * `nonce` es el contador que dispara la siguiente petición: cambiarlo cambia la
 * URL y por tanto la imagen. Nada más lo mueve; no hay temporizador de fondo.
 */
data class CeldaVideo(
    val camara: IntegraCamera,
    val hls: String? = null,
    val nonce: Long = 0L,
    val fase: FaseCelda = FaseCelda.EnCola,
    val motivo: String = "",
    val fallosSeguidos: Int = 0,
) {
    val urlFotograma: String?
        get() = if (fase == FaseCelda.SinImagen) null else Go2rtcFrame.frameUrl(hls, nonce)
}

data class MuroVideoUiState(
    val cargando: Boolean = true,
    val abriendo: Boolean = false,
    val error: String? = null,
    val celdas: List<CeldaVideo> = emptyList(),
    val busqueda: String = "",
    val sitios: List<Pair<Int, String>> = emptyList(),
    val sitioId: Int? = null,
    val pausado: Boolean = false,
) {
    val visibles: List<CeldaVideo>
        get() {
            val q = busqueda.trim().lowercase()
            if (q.isEmpty()) return celdas
            return celdas.filter { c ->
                c.camara.name.lowercase().contains(q) ||
                    c.camara.region.orEmpty().lowercase().contains(q)
            }
        }

    val conImagen: Int get() = celdas.count { it.fase == FaseCelda.ConImagen }
    val sinImagen: Int get() = celdas.count { it.fase == FaseCelda.SinImagen }
}

// ── ViewModel ─────────────────────────────────────────────────────────────────

class IntegraVideoWallViewModel(app: Application) : AndroidViewModel(app) {

    private val repo = IntegraVideoRepository(app.applicationContext)

    /** Reutiliza el repositorio existente solo para la lista de sitios. */
    private val integraRepo = IntegraRepository(app.applicationContext)

    private val _state = MutableStateFlow(MuroVideoUiState())
    val state: StateFlow<MuroVideoUiState> = _state

    /**
     * Un bucle vivo por cámara, como mucho.
     *
     * Guardarlos permite cancelarlos al cambiar de sitio, al refrescar y al
     * salir de la pantalla. Sin esto, cambiar de sitio dejaría los bucles del
     * sitio anterior pidiendo fotogramas de cámaras que ya no se ven — y esa
     * fuga es justo la forma de volver a llenar el servidor de peticiones
     * abortadas.
     */
    private val bucles = mutableMapOf<String, Job>()

    init {
        cargar()
    }

    fun setBusqueda(v: String) = _state.update { it.copy(busqueda = v) }

    fun cambiarSitio(id: Int?) {
        if (_state.value.sitioId == id) return
        detenerTodo()
        _state.update { it.copy(sitioId = id, celdas = emptyList()) }
        cargar()
    }

    /**
     * Pausa/reanuda con el ciclo de vida.
     *
     * Con la app al fondo nadie mira la rejilla, pero los bucles seguirían
     * pidiendo un JPEG por cámara y por segundo contra el equipo del cliente. Se
     * paran al salir y se reanudan al volver.
     */
    fun pausar() {
        if (_state.value.pausado) return
        _state.update { it.copy(pausado = true) }
        detenerTodo()
    }

    fun reanudar() {
        if (!_state.value.pausado) return
        _state.update { it.copy(pausado = false) }
        _state.value.celdas.forEach { celda ->
            if (celda.fase != FaseCelda.SinImagen) arrancarBucle(celda.camara.id, inmediato = true)
        }
    }

    fun cargar() {
        detenerTodo()
        _state.update { it.copy(cargando = it.celdas.isEmpty(), error = null, abriendo = true) }
        viewModelScope.launch {
            try {
                val sitioId = _state.value.sitioId
                val (camaras, sitios) = withContext(Dispatchers.IO) {
                    val cams = repo.cameras(siteId = sitioId)
                    // Los sitios se piden una sola vez; si fallan, el filtro
                    // simplemente no aparece y la rejilla sigue funcionando.
                    val sts = if (_state.value.sitios.isEmpty()) leerSitios() else _state.value.sitios
                    cams to sts
                }

                if (camaras.isEmpty()) {
                    _state.update {
                        it.copy(cargando = false, abriendo = false, celdas = emptyList(), sitios = sitios)
                    }
                    return@launch
                }

                _state.update { st ->
                    st.copy(
                        cargando = false,
                        sitios = sitios,
                        celdas = camaras.map { CeldaVideo(camara = it) },
                    )
                }

                // Un solo viaje para abrir todas: N peticiones sueltas son N
                // autenticaciones y N resoluciones de sitio para pintar una rejilla.
                val slots = withContext(Dispatchers.IO) {
                    repo.openStreams(camaras.map { it.id }, siteId = sitioId)
                }

                _state.update { st ->
                    st.copy(
                        abriendo = false,
                        celdas = st.celdas.map { celda ->
                            val slot = slots[celda.camara.id]
                            val motivo = motivoSinImagen(slot)
                            if (motivo.isEmpty()) {
                                celda.copy(hls = slot?.hls, fase = FaseCelda.EnCola, motivo = "")
                            } else {
                                celda.copy(hls = null, fase = FaseCelda.SinImagen, motivo = motivo)
                            }
                        },
                    )
                }

                if (!_state.value.pausado) {
                    _state.value.celdas
                        .filter { it.fase != FaseCelda.SinImagen }
                        .forEach { arrancarBucle(it.camara.id, inmediato = true) }
                }
            } catch (e: Exception) {
                _state.update {
                    it.copy(
                        cargando = false,
                        abriendo = false,
                        error = e.toUserMessage("No se pudieron cargar las cámaras"),
                    )
                }
            }
        }
    }

    private suspend fun leerSitios(): List<Pair<Int, String>> = try {
        integraRepo.sites().mapNotNull { m ->
            val id = (m["id"] as? Number)?.toInt() ?: return@mapNotNull null
            val nombre = (m["label"] ?: m["name"]) as? String ?: return@mapNotNull null
            id to nombre
        }
    } catch (_: Exception) {
        emptyList()
    }

    /**
     * El bucle autorregulado de una celda.
     *
     * Pide un fotograma, **espera a que la interfaz diga qué pasó con él**
     * ([fotogramaLlego] / [fotogramaFallo]) y solo entonces programa el
     * siguiente. Aquí no hay ningún `setInterval` ni equivalente: el bucle no
     * puede adelantar al servidor porque nunca hay dos peticiones vivas para la
     * misma cámara. Esa es la diferencia exacta con los 2 254 «broken pipe» del
     * muro web.
     */
    private fun arrancarBucle(cameraId: String, inmediato: Boolean) {
        bucles.remove(cameraId)?.cancel()
        val celda = _state.value.celdas.firstOrNull { it.camara.id == cameraId } ?: return
        if (celda.fase == FaseCelda.SinImagen) return

        bucles[cameraId] = viewModelScope.launch {
            if (!inmediato) delay(FramePacing.nextDelayMs(celda.fallosSeguidos))
            _state.update { st ->
                st.copy(
                    celdas = st.celdas.map {
                        if (it.camara.id != cameraId) {
                            it
                        } else {
                            it.copy(
                                nonce = it.nonce + 1,
                                fase = if (it.fase == FaseCelda.ConImagen) it.fase else FaseCelda.Pidiendo,
                            )
                        }
                    },
                )
            }
        }
    }

    /** La interfaz consiguió pintar el fotograma. Se pide el siguiente. */
    fun fotogramaLlego(cameraId: String) {
        _state.update { st ->
            st.copy(
                celdas = st.celdas.map {
                    if (it.camara.id == cameraId) {
                        it.copy(fase = FaseCelda.ConImagen, fallosSeguidos = 0, motivo = "")
                    } else {
                        it
                    }
                },
            )
        }
        if (!_state.value.pausado) arrancarBucle(cameraId, inmediato = false)
    }

    /**
     * El fotograma no llegó. Se reintenta con retroceso, y a partir del tercer
     * fallo seguido la celda deja de decir «pidiendo» y admite que no está
     * entrando imagen: mantener el gesto de carga eternamente es la forma
     * educada de mentir.
     */
    fun fotogramaFallo(cameraId: String) {
        _state.update { st ->
            st.copy(
                celdas = st.celdas.map {
                    if (it.camara.id != cameraId) {
                        it
                    } else {
                        val fallos = it.fallosSeguidos + 1
                        it.copy(
                            fase = FaseCelda.Fallando,
                            fallosSeguidos = fallos,
                            motivo = if (fallos >= 3) {
                                "Sin respuesta del equipo. Reintentando cada " +
                                    "${FramePacing.nextDelayMs(fallos) / 1000} s."
                            } else {
                                it.motivo
                            },
                        )
                    }
                },
            )
        }
        if (!_state.value.pausado) arrancarBucle(cameraId, inmediato = false)
    }

    private fun detenerTodo() {
        bucles.values.forEach { it.cancel() }
        bucles.clear()
    }

    override fun onCleared() {
        detenerTodo()
        super.onCleared()
    }
}

// ── Pantalla ──────────────────────────────────────────────────────────────────

/**
 * Punto de entrada del muro. [onOpenCamera] recibe el `cameraIndexCode`.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun IntegraVideoWallScreen(
    onOpenCamera: (String) -> Unit,
    vm: IntegraVideoWallViewModel = viewModel(),
) {
    val s by vm.state.collectAsState()

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
        onDispose {
            lifecycleOwner.lifecycle.removeObserver(observer)
            vm.pausar()
        }
    }

    when {
        s.cargando -> NxLoadingBlock("Cargando cámaras…")
        s.error != null -> NxErrorBlock(s.error.orEmpty(), onRetry = vm::cargar)
        s.celdas.isEmpty() -> NxEmptyState(
            title = "Sin cámaras",
            subtitle = "Este sitio no tiene cámaras en el espejo. Corre la sincronización de INTEGRA.",
        )

        else -> LazyVerticalGrid(
            columns = GridCells.Fixed(2),
            modifier = Modifier.fillMaxSize().background(NxColors.Surface),
            contentPadding = PaddingValues(12.dp),
            horizontalArrangement = Arrangement.spacedBy(10.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            item(span = { GridItemSpan(maxLineSpan) }) {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    AvisoDeQueEsEsto(conImagen = s.conImagen, total = s.celdas.size, abriendo = s.abriendo)
                    if (s.sitios.isNotEmpty()) {
                        FiltroSitios(
                            sitios = s.sitios,
                            seleccionado = s.sitioId,
                            onSelect = vm::cambiarSitio,
                        )
                    }
                    NxSearchField(
                        value = s.busqueda,
                        onValueChange = vm::setBusqueda,
                        placeholder = "Buscar cámara o zona",
                    )
                }
            }

            items(s.visibles, key = { it.camara.id }) { celda ->
                CeldaCamara(
                    celda = celda,
                    onFrameLoaded = { vm.fotogramaLlego(celda.camara.id) },
                    onFrameFailed = { vm.fotogramaFallo(celda.camara.id) },
                    onClick = { onOpenCamera(celda.camara.id) },
                )
            }
        }
    }
}

@Composable
private fun AvisoDeQueEsEsto(conImagen: Int, total: Int, abriendo: Boolean) {
    Card(
        colors = CardDefaults.cardColors(containerColor = NxColors.InfoSoft),
        shape = RoundedCornerShape(12.dp),
        modifier = Modifier.fillMaxWidth(),
    ) {
        Column(Modifier.padding(12.dp)) {
            Text(
                "Imágenes, no video",
                fontWeight = FontWeight.Bold,
                fontSize = 13.sp,
                color = NxColors.Slate,
            )
            Text(
                "Cada celda pide un fotograma nuevo cuando llega el anterior: alrededor " +
                    "de uno por segundo, según responda el equipo. Para video continuo, " +
                    "el muro de la web.",
                fontSize = 11.sp,
                color = NxColors.Slate,
            )
            Text(
                when {
                    abriendo -> "Abriendo cámaras…"
                    else -> "$conImagen de $total con imagen"
                },
                fontSize = 11.sp,
                fontWeight = FontWeight.SemiBold,
                color = NxColors.Muted,
                modifier = Modifier.padding(top = 4.dp),
            )
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun FiltroSitios(
    sitios: List<Pair<Int, String>>,
    seleccionado: Int?,
    onSelect: (Int?) -> Unit,
) {
    Row(
        horizontalArrangement = Arrangement.spacedBy(6.dp),
        modifier = Modifier.fillMaxWidth(),
    ) {
        FilterChip(
            selected = seleccionado == null,
            onClick = { onSelect(null) },
            label = { Text("Todos", fontSize = 12.sp) },
            colors = FilterChipDefaults.filterChipColors(),
        )
        sitios.take(4).forEach { (id, nombre) ->
            FilterChip(
                selected = seleccionado == id,
                onClick = { onSelect(id) },
                label = { Text(nombre, fontSize = 12.sp, maxLines = 1, overflow = TextOverflow.Ellipsis) },
            )
        }
    }
}

/**
 * Una celda. Tres cosas que no se negocian:
 *
 * 1. La insignia nunca dice «en vivo»; dice qué es de verdad.
 * 2. Si no hay imagen, se ve el motivo escrito, no un hueco negro.
 * 3. `onSuccess`/`onError` de Coil son los que mueven el bucle: sin ese aviso
 *    de vuelta, el ViewModel no pide el siguiente fotograma.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun CeldaCamara(
    celda: CeldaVideo,
    onFrameLoaded: () -> Unit,
    onFrameFailed: () -> Unit,
    onClick: () -> Unit,
) {
    Card(
        onClick = onClick,
        shape = RoundedCornerShape(12.dp),
        colors = CardDefaults.cardColors(containerColor = NxColors.Card),
    ) {
        Column {
            Box(
                Modifier
                    .fillMaxWidth()
                    .aspectRatio(16f / 9f)
                    .clip(RoundedCornerShape(topStart = 12.dp, topEnd = 12.dp))
                    .background(Color(0xFF0F172A)),
            ) {
                val url = celda.urlFotograma
                if (url != null) {
                    val contexto = LocalContext.current
                    AsyncImage(
                        model = remember(url) {
                            ImageRequest.Builder(contexto)
                                .data(url)
                                // Sin caché, ni en memoria ni en disco. Cada
                                // fotograma lleva un `?t=` distinto, así que
                                // cachearlos guardaría una imagen nueva por
                                // segundo y por cámara que nunca se va a volver
                                // a pedir: llena la memoria y escribe en disco
                                // sin que nada lo lea jamás.
                                .memoryCachePolicy(CachePolicy.DISABLED)
                                .diskCachePolicy(CachePolicy.DISABLED)
                                // Los fotogramas se sustituyen, no se funden: un
                                // cruce de 100 ms en cada imagen es justo lo que
                                // se percibe como parpadeo.
                                .crossfade(false)
                                .build()
                        },
                        contentDescription = "Fotograma de ${celda.camara.name}",
                        modifier = Modifier.fillMaxSize(),
                        contentScale = ContentScale.Crop,
                        onSuccess = { onFrameLoaded() },
                        onError = { onFrameFailed() },
                    )
                }

                if (celda.fase == FaseCelda.SinImagen ||
                    (celda.fase == FaseCelda.Fallando && celda.fallosSeguidos >= 3)
                ) {
                    Box(
                        Modifier.fillMaxSize().padding(10.dp),
                        contentAlignment = Alignment.Center,
                    ) {
                        Text(
                            celda.motivo.ifBlank { "Sin imagen." },
                            color = Color(0xFFE2E8F0),
                            fontSize = 10.sp,
                            maxLines = 4,
                            overflow = TextOverflow.Ellipsis,
                        )
                    }
                }

                InsigniaCelda(
                    celda = celda,
                    modifier = Modifier.align(Alignment.TopStart).padding(6.dp),
                )
            }

            Column(Modifier.padding(horizontal = 10.dp, vertical = 8.dp)) {
                Text(
                    celda.camara.name,
                    fontWeight = FontWeight.SemiBold,
                    fontSize = 13.sp,
                    color = NxColors.Slate,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                Text(
                    buildString {
                        append(celda.camara.region ?: "Sin zona")
                        if (celda.camara.isPtz) append(" · PTZ")
                    },
                    fontSize = 11.sp,
                    color = NxColors.Muted,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
        }
    }
}

/**
 * La insignia honesta.
 *
 * «IMÁGENES ~1/s» es literal: es lo que está pasando. La tentación de poner
 * «EN VIVO» encima de esto es exactamente el error que hizo que el muro web se
 * viviera como roto — el operador comparaba lo que leía con lo que veía.
 */
@Composable
private fun InsigniaCelda(celda: CeldaVideo, modifier: Modifier = Modifier) {
    val (texto, fondo) = when (celda.fase) {
        FaseCelda.ConImagen -> "IMÁGENES ~1/s" to Color(0xCC0D9488)
        FaseCelda.Pidiendo -> "PIDIENDO…" to Color(0xCC475569)
        FaseCelda.EnCola -> "EN COLA" to Color(0xCC475569)
        FaseCelda.Fallando -> "REINTENTANDO" to Color(0xCCF59E0B)
        FaseCelda.SinImagen -> "SIN IMAGEN" to Color(0xCCDC2626)
    }
    Text(
        text = texto,
        modifier = modifier
            .clip(RoundedCornerShape(4.dp))
            .background(fondo)
            .padding(horizontal = 6.dp, vertical = 2.dp),
        color = Color.White,
        fontSize = 9.sp,
        fontWeight = FontWeight.Bold,
    )
}
