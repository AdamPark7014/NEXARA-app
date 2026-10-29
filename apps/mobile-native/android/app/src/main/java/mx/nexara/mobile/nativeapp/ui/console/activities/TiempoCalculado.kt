package mx.nexara.mobile.nativeapp.ui.console.activities

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import java.time.Instant
import java.time.ZoneId
import kotlin.coroutines.cancellation.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.withContext
import mx.nexara.mobile.nativeapp.data.api.TiempoCalculadoDto
import mx.nexara.mobile.nativeapp.data.api.TiempoCalculadoRequest
import mx.nexara.mobile.nativeapp.data.console.CoreActivitiesRepository
import mx.nexara.mobile.nativeapp.ui.enterprise.NxColors

/**
 * Autoasignación (regla de Adam, 29-10): el tiempo, la complejidad y la entrega los fija el sistema
 * desde el título y el tipo; solo un superior los ajusta al asignar a alguien de su equipo. En el
 * alta propia se enseñan en solo lectura con su desglose (`POST me/activities/tiempo-calculado`).
 * Reglas puras: `TiempoCalculadoTest`.
 */
object TiempoCalculado {
    data class Linea(val texto: String, val minutos: String?)

    /** El desglose: «Supuesto: …» va sin minutos (llega con 0). */
    fun lineas(t: TiempoCalculadoDto): List<Linea> =
        t.desglose.orEmpty().mapNotNull { d ->
            val concepto = d.concepto?.trim()?.takeIf { it.isNotEmpty() } ?: return@mapNotNull null
            val min = d.minutos?.takeIf { it > 0 && !concepto.startsWith("Supuesto", ignoreCase = true) }
            Linea(concepto, min?.let { CoreActivityRules.formatMinutes(it) })
        }

    /** «Entrega a más tardar 17:20» (o con el día si no es el del inicio). */
    fun entrega(t: TiempoCalculadoDto, inicioIso: String?, zone: ZoneId = CoreActivityKinds.MEXICO): String? {
        val fin = t.fechaEntregaEsperada?.let { runCatching { Instant.parse(it) }.getOrNull() } ?: return null
        val local = fin.atZone(zone)
        val hora = CoreActivityKinds.formatHora(local.hour, local.minute)
        val mismoDia = inicioIso?.let { runCatching { Instant.parse(it).atZone(zone).toLocalDate() }.getOrNull() } == local.toLocalDate()
        return if (mismoDia || inicioIso == null) {
            "Entrega a más tardar $hora"
        } else {
            "Entrega a más tardar el ${local.dayOfMonth}/${local.monthValue} a las $hora"
        }
    }

    /** «Estándar 2 h 20 min · Compleja». */
    fun resumen(t: TiempoCalculadoDto): String? {
        val tiempo = t.tiempoEstandarMin?.takeIf { it > 0 }?.let { "Estándar ${CoreActivityRules.formatMinutes(it)}" }
        val nivel = Complejidad.nivel(t.complejidad)?.label
        return listOfNotNull(tiempo, nivel).joinToString(" · ").ifEmpty { null }
    }

    /** Qué se pregunta: el mismo título y tipo dan lo mismo (la API guarda la lectura 30 min). */
    fun pregunta(form: CoreActivityKinds.FormState): String =
        listOf(form.coreKind, form.ticketType, form.ticketTypeCustom, form.titulo.trim(), form.indicaciones.trim(), form.fecha, form.hora)
            .joinToString("|")

    fun request(form: CoreActivityKinds.FormState): TiempoCalculadoRequest = TiempoCalculadoRequest(
        titulo = form.titulo.trim(),
        indicaciones = form.indicaciones.trim().ifEmpty { null },
        coreKind = form.coreKind,
        ticketType = form.ticketType.ifEmpty { null },
        ticketTypeCustom = form.ticketTypeCustom.trim().ifEmpty { null },
        fechaInicio = CoreActivityKinds.scheduleIso(form.fecha, form.hora),
    )
}

/**
 * Tarjeta «Tiempo y entrega · los fija el sistema» del alta propia. Pide la vista previa ~0.9 s
 * después de dejar de escribir; sin respuesta, dice que se calculan al guardar.
 */
@Composable
internal fun TiempoCalculadoCard(repo: CoreActivitiesRepository, form: CoreActivityKinds.FormState) {
    var dato by remember { mutableStateOf<TiempoCalculadoDto?>(null) }
    var pensando by remember { mutableStateOf(false) }
    val listo = form.titulo.trim().length >= Complejidad.MIN_TITULO &&
        (form.coreKind != CoreActivityKinds.TAREA || CoreActivityKinds.tareaTipo(form).let { it.isNotEmpty() && it != CoreActivityKinds.TAREA_OTRO })
    val pregunta = TiempoCalculado.pregunta(form)

    LaunchedEffect(pregunta, listo) {
        if (!listo) {
            dato = null
            return@LaunchedEffect
        }
        delay(Complejidad.ESPERA_SUGERENCIA_MS)
        pensando = true
        dato = try {
            withContext(Dispatchers.IO) { repo.tiempoCalculado(TiempoCalculado.request(form)) }
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            null
        } finally {
            pensando = false
        }
    }

    val shape = RoundedCornerShape(14.dp)
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(shape)
            .background(NxColors.BrandSoft)
            .padding(horizontal = 14.dp, vertical = 12.dp),
        verticalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        Text("Tiempo y entrega · los fija el sistema", fontSize = 13.sp, fontWeight = FontWeight.SemiBold, color = NxColors.BrandDark)
        val t = dato
        when {
            !listo -> Text(
                "Escribe el título y elige el tipo: con eso se calculan el tiempo, la complejidad y la entrega.",
                fontSize = 13.sp,
                lineHeight = 18.sp,
                color = NxColors.Slate,
            )
            t == null -> Text(
                if (pensando) "Calculando con el título…" else "Se calculan al guardar con el título y el tipo.",
                fontSize = 13.sp,
                color = NxColors.Slate,
            )
            else -> {
                TiempoCalculado.resumen(t)?.let { Text(it, fontSize = 15.sp, fontWeight = FontWeight.SemiBold, color = NxColors.Slate) }
                TiempoCalculado.entrega(t, TiempoCalculado.request(form).fechaInicio)?.let {
                    Text(it, fontSize = 13.sp, color = NxColors.Slate)
                }
                TiempoCalculado.lineas(t).forEach { l ->
                    Row(Modifier.fillMaxWidth()) {
                        Text(l.texto, fontSize = 12.5.sp, color = NxColors.Muted, modifier = Modifier.weight(1f))
                        l.minutos?.let { Text(it, fontSize = 12.5.sp, color = NxColors.Muted) }
                    }
                }
                t.supuestos.orEmpty().filter { it.isNotBlank() }.forEach {
                    Text("Supuesto: ${it.removePrefix("Supuesto:").trim()}", fontSize = 12.5.sp, color = NxColors.Muted)
                }
                Text(
                    "Solo tu jefe puede ajustarlo al asignarte una actividad.",
                    fontSize = 12.sp,
                    color = NxColors.Muted,
                )
            }
        }
    }
}
