package mx.nexara.mobile.nativeapp.ui.console.activities

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.AutoAwesome
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlin.coroutines.cancellation.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.withContext
import mx.nexara.mobile.nativeapp.data.api.SugerenciaComplejidadDto
import mx.nexara.mobile.nativeapp.data.api.SugerirComplejidadRequest
import mx.nexara.mobile.nativeapp.data.api.TiemposTipicosDto
import mx.nexara.mobile.nativeapp.data.console.CoreActivitiesRepository
import mx.nexara.mobile.nativeapp.ui.enterprise.NxColors

private val Borde = Color(0xFFE2E8F0)

/**
 * «Complejidad» al asignar (ComplejidadCampo.tsx de la web): cuatro niveles con el tiempo típico de
 * cada uno, la sugerencia de la IA y lo típico de ese tipo de trabajo para usarlo como tiempo
 * estimado. La IA solo sugiere: si nadie elige, se toma su nivel; si quien asigna cambia, se
 * guardan las dos. Si la API falla, no hay sugerencia y el campo sigue sirviendo a mano.
 */
@Composable
internal fun ComplejidadCampo(
    repo: CoreActivitiesRepository,
    kind: String,
    form: CoreActivityKinds.FormState,
    onForm: ((CoreActivityKinds.FormState) -> CoreActivityKinds.FormState) -> Unit,
    /** Lo que la IA leyó del título (cantidad y destino) para el tiempo estándar. */
    onSugerencia: (SugerenciaComplejidadDto?) -> Unit = {},
    /** El tiempo estándar ya fija el tiempo: lo típico queda solo como referencia, sin «Usar…». */
    estandarActivo: Boolean = false,
) {
    val tipo = Complejidad.tipoParaComplejidad(kind, form)
    val alSugerir by rememberUpdatedState(onSugerencia)
    var tiempos by remember { mutableStateOf<TiemposTipicosDto?>(null) }
    var sugerencia by remember { mutableStateOf<SugerenciaComplejidadDto?>(null) }
    var pensando by remember { mutableStateOf(false) }
    /** Quien asigna ya eligió a mano: la sugerencia ya no cambia su elección. */
    var elegidaAMano by remember { mutableStateOf(false) }
    var ultimaPregunta by remember { mutableStateOf("") }
    val alCambiar by rememberUpdatedState(onForm)

    LaunchedEffect(kind, tipo) {
        tiempos = null
        tiempos = runCatching { withContext(Dispatchers.IO) { repo.tiemposTipicos(kind, tipo) } }.getOrNull()
    }

    val titulo = form.titulo.trim()
    val indicaciones = form.indicaciones.trim()
    LaunchedEffect(kind, tipo, titulo, indicaciones) {
        if (titulo.length < Complejidad.MIN_TITULO) return@LaunchedEffect
        val pregunta = "$kind|${tipo.orEmpty()}|$titulo|$indicaciones"
        if (pregunta == ultimaPregunta) return@LaunchedEffect
        delay(Complejidad.ESPERA_SUGERENCIA_MS)
        pensando = true
        val sug = try {
            withContext(Dispatchers.IO) {
                repo.sugerirComplejidad(
                    SugerirComplejidadRequest(
                        coreKind = kind,
                        tipo = tipo,
                        titulo = titulo,
                        indicaciones = indicaciones.ifEmpty { null },
                    ),
                )
            }
        } catch (e: CancellationException) {
            // Siguió escribiendo: la pregunta nueva la reemplaza.
            throw e
        } catch (e: Exception) {
            null
        } finally {
            pensando = false
        }
        ultimaPregunta = pregunta
        sugerencia = sug
        alSugerir(sug)
        val nivel = sug?.complejidad ?: return@LaunchedEffect
        alCambiar { Complejidad.aplicarSugerencia(it, nivel, elegidaAMano) }
    }

    val elegida = form.complejidad.takeIf { Complejidad.esComplejidad(it) }
    val tipico = Complejidad.tipicoPara(tiempos, elegida)
    val textoTipico = Complejidad.textoTipico(Complejidad.etiquetaTipoTrabajo(kind, tipo), elegida, tipico)
    val estimadoActual = form.tiempoEstimadoMin.trim().toIntOrNull() ?: 0

    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text("Complejidad", fontSize = 13.sp, fontWeight = FontWeight.SemiBold, color = NxColors.Slate)
            Text(" · opcional", fontSize = 12.sp, color = NxColors.Muted)
        }
        // Dos de dos: cabe en el teléfono más angosto sin cortar la ayuda.
        Complejidad.NIVELES.chunked(2).forEach { par ->
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
                par.forEach { n ->
                    NivelBoton(
                        nivel = n,
                        detalle = Complejidad.minutosDelNivel(tiempos, n.id)?.let(Complejidad::formatoMinutos) ?: n.ayuda,
                        selected = elegida == n.id,
                        onClick = {
                            elegidaAMano = true
                            onForm { it.copy(complejidad = n.id) }
                        },
                        modifier = Modifier.weight(1f),
                    )
                }
            }
        }

        val sug = sugerencia
        if (pensando || sug != null) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(12.dp))
                    .background(NxColors.BrandSoft)
                    .padding(horizontal = 12.dp, vertical = 10.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                Icon(Icons.Outlined.AutoAwesome, contentDescription = null, tint = NxColors.BrandDark, modifier = Modifier.size(18.dp))
                Text(
                    if (sug?.complejidad != null) {
                        Complejidad.textoSugerencia(sug.complejidad, sug.motivo, elegida)
                    } else {
                        "Revisando el título para sugerir la complejidad…"
                    },
                    fontSize = 13.sp,
                    lineHeight = 18.sp,
                    color = NxColors.BrandDark,
                )
            }
        }

        if (textoTipico != null && tipico != null) {
            Column {
                Text(
                    textoTipico + if (!tipico.delNivel && elegida != null) " Aún no hay suficientes de este nivel." else "",
                    fontSize = 13.sp,
                    lineHeight = 18.sp,
                    color = NxColors.Muted,
                )
                val usar = minOf(Complejidad.TOPE_MIN, tipico.minutos)
                if (estandarActivo) {
                    Text("Referencia: el tiempo lo da el estándar.", fontSize = 12.sp, color = NxColors.Muted)
                } else if (usar != estimadoActual) {
                    TextButton(onClick = { onForm { it.copy(tiempoEstimadoMin = usar.toString()) } }) {
                        Text(
                            "Usar ${Complejidad.formatoMinutos(usar)} como tiempo estimado",
                            color = NxColors.BrandDark,
                            fontWeight = FontWeight.SemiBold,
                        )
                    }
                } else {
                    Text("Es el tiempo estimado.", fontSize = 12.sp, color = NxColors.Muted)
                }
            }
        }
    }
}

@Composable
private fun NivelBoton(
    nivel: Complejidad.Nivel,
    detalle: String,
    selected: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val shape = RoundedCornerShape(14.dp)
    Column(
        modifier = modifier
            .clip(shape)
            .border(if (selected) 2.dp else 1.dp, if (selected) NxColors.Brand else Borde, shape)
            .background(if (selected) NxColors.BrandSoft else NxColors.Card)
            .clickable(role = Role.Button, onClick = onClick)
            .semantics {
                this.selected = selected
                contentDescription = "${nivel.label}: ${nivel.definicion}"
            }
            .heightIn(min = 56.dp)
            .padding(horizontal = 12.dp, vertical = 8.dp),
        verticalArrangement = Arrangement.Center,
    ) {
        Text(
            nivel.label,
            fontSize = 14.sp,
            fontWeight = if (selected) FontWeight.Bold else FontWeight.SemiBold,
            color = NxColors.Slate,
        )
        Text(detalle, fontSize = 12.sp, color = NxColors.Muted)
    }
}
