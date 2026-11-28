package mx.nexara.mobile.nativeapp.ui.deshacer

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import mx.nexara.mobile.nativeapp.data.api.toUserMessage
import mx.nexara.mobile.nativeapp.data.deshacer.Deshacer
import mx.nexara.mobile.nativeapp.data.deshacer.DeshacerRepository

/** Siempre oscuro, como las barras de aviso del teléfono: se lee igual en tema claro y oscuro. */
private val Fondo = Color(0xFF151B23)
private val FondoError = Color(0xFF9F1C1C)
private val Acento = Color(0xFF5FE0C4)

private enum class Fase { Contando, Deshaciendo, Deshecho, Error }

/**
 * Envuelve la app: lo que se pida con [Deshacer.ofrecer] sale abajo con «Deshacer» y una barra que se
 * vacía en 5 s, aunque la pantalla que lo pidió ya se haya cerrado. Uno a la vez: el nuevo reemplaza al
 * anterior, que queda hecho.
 */
@Composable
fun AvisoDeshacerHost(content: @Composable () -> Unit) {
    val oferta by Deshacer.oferta.collectAsState()
    Box(Modifier.fillMaxSize()) {
        content()
        AnimatedVisibility(
            visible = oferta != null,
            enter = slideInVertically { it / 2 } + fadeIn(),
            exit = slideOutVertically { it / 2 } + fadeOut(),
            modifier = Modifier
                .align(Alignment.BottomCenter)
                .navigationBarsPadding()
                .padding(horizontal = 16.dp, vertical = 88.dp),
        ) {
            val actual = oferta
            if (actual != null) {
                // `key` por oferta: una nueva empieza su propia cuenta.
                androidx.compose.runtime.key(actual.clave) { Tarjeta(actual) }
            }
        }
    }
}

@Composable
private fun Tarjeta(oferta: Deshacer.Oferta) {
    val context = LocalContext.current
    val repo = remember(context) { DeshacerRepository(context.applicationContext) }
    val scope = rememberCoroutineScope()
    val haptic = LocalHapticFeedback.current
    var fase by remember { mutableStateOf(Fase.Contando) }
    var error by remember { mutableStateOf("") }
    var restante by remember { mutableLongStateOf(Deshacer.PLAZO_MS) }

    LaunchedEffect(fase) {
        when (fase) {
            Fase.Contando -> {
                while (restante > 0) {
                    delay(100)
                    restante = (restante - 100).coerceAtLeast(0)
                }
                Deshacer.descartar(oferta.clave)
            }
            Fase.Deshecho -> {
                delay(1_800)
                Deshacer.descartar(oferta.clave)
            }
            Fase.Error -> {
                delay(5_000)
                Deshacer.descartar(oferta.clave)
            }
            Fase.Deshaciendo -> Unit
        }
    }

    val deshacer: () -> Unit = deshacer@{
        if (fase != Fase.Contando) return@deshacer // doble toque
        haptic.performHapticFeedback(HapticFeedbackType.LongPress)
        fase = Fase.Deshaciendo
        scope.launch {
            try {
                withContext(Dispatchers.IO) { repo.deshacer(oferta.tipo, oferta.ids) }
                fase = Fase.Deshecho
                Deshacer.notificarDeshecho(oferta)
            } catch (e: Throwable) {
                error = e.toUserMessage("No se pudo deshacer. Revisa tu conexión e inténtalo otra vez.")
                fase = Fase.Error
            }
        }
    }

    val texto = when (fase) {
        Fase.Contando -> oferta.mensaje
        Fase.Deshaciendo -> "Deshaciendo…"
        Fase.Deshecho -> "Listo, se deshizo"
        Fase.Error -> error
    }
    val segundos = ((restante + 999) / 1000).coerceAtLeast(1)

    Surface(
        shape = RoundedCornerShape(14.dp),
        color = if (fase == Fase.Error) FondoError else Fondo,
        contentColor = Color.White,
        shadowElevation = 8.dp,
        modifier = Modifier
            .widthIn(max = 520.dp)
            .fillMaxWidth()
            .semantics { liveRegion = LiveRegionMode.Polite },
    ) {
        Column {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier
                    .heightIn(min = 56.dp)
                    .padding(start = 18.dp, end = 8.dp, top = 8.dp, bottom = 8.dp),
            ) {
                Column(Modifier.weight(1f)) {
                    Text(texto, fontWeight = FontWeight.SemiBold, fontSize = 15.sp)
                    if (fase == Fase.Contando && oferta.detalle != null) {
                        Text(oferta.detalle, fontSize = 13.sp, color = Color.White.copy(alpha = 0.72f))
                    }
                }
                when (fase) {
                    Fase.Contando -> TextButton(
                        onClick = deshacer,
                        modifier = Modifier
                            .heightIn(min = 48.dp)
                            .semantics { contentDescription = "Deshacer, quedan $segundos segundos" },
                    ) {
                        Text("Deshacer", color = Acento, fontWeight = FontWeight.Bold, fontSize = 15.sp)
                        Spacer(Modifier.size(8.dp))
                        Box(
                            contentAlignment = Alignment.Center,
                            modifier = Modifier
                                .size(22.dp)
                                .background(Color.White.copy(alpha = 0.12f), RoundedCornerShape(11.dp)),
                        ) {
                            Text("$segundos", color = Acento, fontSize = 12.sp, fontWeight = FontWeight.Bold)
                        }
                    }
                    Fase.Deshaciendo -> CircularProgressIndicator(
                        color = Color.White,
                        strokeWidth = 2.dp,
                        modifier = Modifier.padding(12.dp).size(20.dp),
                    )
                    else -> TextButton(onClick = { Deshacer.descartar(oferta.clave) }) {
                        Text("Cerrar", color = Color.White)
                    }
                }
            }
            if (fase == Fase.Contando) {
                LinearProgressIndicator(
                    progress = { restante.toFloat() / Deshacer.PLAZO_MS },
                    color = Acento,
                    trackColor = Color.Transparent,
                    modifier = Modifier.fillMaxWidth().heightIn(max = 3.dp),
                )
            }
        }
    }
}
