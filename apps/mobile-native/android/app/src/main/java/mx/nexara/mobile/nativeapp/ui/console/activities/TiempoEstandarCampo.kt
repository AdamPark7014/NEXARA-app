package mx.nexara.mobile.nativeapp.ui.console.activities

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.AutoAwesome
import androidx.compose.material3.Icon
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
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
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import mx.nexara.mobile.nativeapp.data.api.SugerenciaComplejidadDto
import mx.nexara.mobile.nativeapp.data.console.CoreActivitiesRepository
import mx.nexara.mobile.nativeapp.ui.enterprise.NxColors

private val BordeEstandar = Color(0xFFE2E8F0)

/**
 * Tiempo estándar al asignar a otra persona (`TiempoEstandarCampo.tsx` de la web): lo que se
 * cuenta en ese tipo de trabajo, con la cantidad que propone la IA, y la tarjeta con el total y su
 * desglose. El total fija «¿Cuánto tiempo toma?»; cambiarlo pide motivo y queda registrado.
 *
 * En el teléfono no hay mapa: si el tipo va a otro lugar, la ida y la vuelta no se calculan aquí
 * y el estándar lo completa la API al guardar. Sin tabla (API caída) o sin regla para el tipo, no
 * se pinta nada y el tiempo se captura a mano como antes.
 *
 * [onCambio] recibe lo que se manda (null = nada que mandar).
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
internal fun TiempoEstandarCampo(
    repo: CoreActivitiesRepository,
    kind: String,
    form: CoreActivityKinds.FormState,
    sugerencia: SugerenciaComplejidadDto?,
    onCambio: (TiempoEstandar.Envio?) -> Unit,
) {
    var tabla by remember { mutableStateOf<TiempoEstandar.Tabla?>(null) }
    var unidadClave by remember { mutableStateOf("") }
    var cantidad by remember { mutableStateOf("") }
    /** La cantidad la puso la IA (se dice) hasta que alguien la toca. */
    var cantidadDeIA by remember { mutableStateOf(false) }
    var cantidadAMano by remember { mutableStateOf(false) }
    var cambiando by remember { mutableStateOf(false) }
    var motivo by remember { mutableStateOf("") }
    val alCambiar by rememberUpdatedState(onCambio)

    LaunchedEffect(Unit) {
        tabla = runCatching { withContext(Dispatchers.IO) { repo.tablaEstandar() } }.getOrNull()
    }

    val regla = TiempoEstandar.reglaPara(
        tabla,
        TiempoEstandar.clave(kind, form.ticketType, Complejidad.tipoParaComplejidad(kind, form)),
    )
    val unidad = TiempoEstandar.unidad(regla, unidadClave)

    // La IA leyó una cantidad del título: se pone mientras nadie la haya escrito a mano.
    LaunchedEffect(sugerencia?.cantidad, regla?.unidades?.size) {
        val n = sugerencia?.cantidad ?: return@LaunchedEffect
        if (regla?.unidades.isNullOrEmpty() || n <= 0 || cantidadAMano) return@LaunchedEffect
        cantidad = n.toString()
        cantidadDeIA = true
    }

    val n = cantidad.toIntOrNull() ?: 0
    val resultado = regla?.let {
        TiempoEstandar.calcular(
            it,
            cantidad = n,
            unidad = unidad?.clave,
            complejidad = form.complejidad.takeIf { c -> Complejidad.esComplejidad(c) },
            traslado = null,
            topeMin = tabla?.topeMin ?: TiempoEstandar.TOPE_MIN,
        )
    }
    val envio = TiempoEstandar.envio(regla, resultado, n, unidad, cambiando, motivo)

    LaunchedEffect(envio) { alCambiar(envio) }
    DisposableEffect(Unit) { onDispose { alCambiar(null) } }

    if (regla == null) return
    if (regla.agenda) {
        Text(
            "${regla.nombre}: dura lo que dure la agenda, así que no hay tiempo estándar. Pon su duración en «¿Cuánto tiempo toma?».",
            fontSize = 13.sp,
            lineHeight = 18.sp,
            color = NxColors.Muted,
        )
        return
    }

    fun escribir(texto: String) {
        cantidadAMano = true
        cantidadDeIA = false
        cantidad = texto
    }

    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text("Tiempo estándar · ${regla.nombre}", fontSize = 13.sp, fontWeight = FontWeight.SemiBold, color = NxColors.Slate)

        if (cantidadDeIA && n > 0 && unidad != null) {
            AvisoIA("La IA leyó el título: $n ${if (n == 1) unidad.singular else unidad.plural}. Confírmalo o corrige la cantidad; el tiempo lo calcula la tabla, no la IA.")
        }

        if (regla.unidades.size > 1) {
            FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                regla.unidades.forEach { u ->
                    Segmento(
                        texto = u.plural.replaceFirstChar { it.uppercaseChar() },
                        selected = unidad?.clave == u.clave,
                        onClick = { unidadClave = u.clave },
                    )
                }
            }
        }

        if (unidad != null) {
            Text(unidad.pregunta, fontSize = 13.sp, fontWeight = FontWeight.SemiBold, color = NxColors.Slate)
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedButton(
                    onClick = { escribir((n - 1).coerceAtLeast(0).takeIf { it > 0 }?.toString().orEmpty()) },
                    contentPadding = PaddingValues(0.dp),
                    modifier = Modifier.size(48.dp),
                ) { Text("−", fontSize = 20.sp) }
                OutlinedTextField(
                    value = cantidad,
                    onValueChange = { escribir(it.filter(Char::isDigit).take(4)) },
                    placeholder = { Text("0") },
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                    modifier = Modifier.width(96.dp),
                )
                OutlinedButton(
                    onClick = { escribir((n + 1).coerceAtMost(9999).toString()) },
                    contentPadding = PaddingValues(0.dp),
                    modifier = Modifier.size(48.dp),
                ) { Text("+", fontSize = 20.sp) }
            }
            Text(
                "${unidad.porUnidadMin} min por ${unidad.singular}${if (regla.baseMin > 0) " + ${regla.baseMin} min de base" else ""}.",
                fontSize = 12.sp,
                color = NxColors.Muted,
            )
        }

        TiempoEstandar.textoPorComplejidad(regla)?.let { Text(it, fontSize = 12.sp, lineHeight = 16.sp, color = NxColors.Muted) }

        if (regla.destino) {
            val destinoIA = sugerencia?.destino?.trim()?.takeIf { it.isNotEmpty() }
            Text(
                (destinoIA?.let { "La IA leyó el destino: «$it». " }.orEmpty()) +
                    "En el teléfono no se marca en el mapa: al guardar, el sistema completa el estándar con la ida y la vuelta.",
                fontSize = 12.sp,
                lineHeight = 16.sp,
                color = NxColors.Muted,
            )
        }

        TarjetaEstandar(
            regla = regla,
            resultado = resultado,
            cambiando = cambiando,
            motivo = motivo,
            onCambiar = { cambiando = true },
            onMotivo = { motivo = it },
            onUsarEstandar = {
                cambiando = false
                motivo = ""
            },
        )
    }
}

@Composable
private fun TarjetaEstandar(
    regla: TiempoEstandar.Regla,
    resultado: TiempoEstandar.Resultado?,
    cambiando: Boolean,
    motivo: String,
    onCambiar: () -> Unit,
    onMotivo: (String) -> Unit,
    onUsarEstandar: () -> Unit,
) {
    val total = resultado?.totalMin
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(14.dp))
            .background(NxColors.BrandSoft)
            .padding(horizontal = 14.dp, vertical = 12.dp),
        verticalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        Text("Tiempo estándar", fontSize = 13.sp, fontWeight = FontWeight.SemiBold, color = NxColors.BrandDark)
        Text(total?.let { Complejidad.formatoMinutos(it) } ?: "—", fontSize = 22.sp, fontWeight = FontWeight.ExtraBold, color = NxColors.Slate)
        resultado?.desglose.orEmpty().forEach { d ->
            Row(Modifier.fillMaxWidth()) {
                Text(d.concepto, fontSize = 12.5.sp, color = NxColors.Muted, modifier = Modifier.weight(1f))
                Text(Complejidad.formatoMinutos(d.minutos), fontSize = 12.5.sp, color = NxColors.Muted)
            }
        }
        TiempoEstandar.textoFaltan(resultado?.faltan.orEmpty(), regla)?.let {
            Text(it, fontSize = 12.5.sp, color = NxColors.Slate)
        }
        if (resultado?.topado == true) {
            Text("Pasa de 12 h: queda en el tope de 12 h.", fontSize = 12.5.sp, color = NxColors.Slate)
        }
        if (total != null) {
            if (cambiando) {
                val valido = TiempoEstandar.motivoValido(motivo)
                OutlinedTextField(
                    value = motivo,
                    onValueChange = onMotivo,
                    label = { Text("¿Por qué otro tiempo?") },
                    placeholder = { Text("Ej.: el sitio está en obra negra y hay que abrir muro") },
                    isError = motivo.isNotEmpty() && !valido,
                    minLines = 2,
                    modifier = Modifier.fillMaxWidth(),
                )
                Text(
                    if (valido) {
                        "Ahora el tiempo lo pones tú en «¿Cuánto tiempo toma?»; el estándar queda guardado con este motivo."
                    } else {
                        "Escribe el motivo (mínimo ${TiempoEstandar.MOTIVO_MINIMO} letras) y luego ajusta «¿Cuánto tiempo toma?»."
                    },
                    fontSize = 12.sp,
                    lineHeight = 16.sp,
                    color = NxColors.Muted,
                )
                TextButton(onClick = onUsarEstandar) {
                    Text("Usar el estándar", color = NxColors.BrandDark, fontWeight = FontWeight.SemiBold)
                }
            } else {
                TextButton(onClick = onCambiar) {
                    Text("Cambiar el tiempo (pide motivo)", color = NxColors.BrandDark, fontWeight = FontWeight.SemiBold)
                }
            }
        }
    }
}

@Composable
private fun AvisoIA(texto: String) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(12.dp))
            .background(NxColors.BrandSoft)
            .padding(horizontal = 12.dp, vertical = 10.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Icon(Icons.Outlined.AutoAwesome, contentDescription = null, tint = NxColors.BrandDark, modifier = Modifier.size(18.dp))
        Text(texto, fontSize = 13.sp, lineHeight = 18.sp, color = NxColors.BrandDark)
    }
}

@Composable
private fun Segmento(texto: String, selected: Boolean, onClick: () -> Unit) {
    val shape = RoundedCornerShape(50)
    Text(
        texto,
        fontSize = 13.sp,
        fontWeight = if (selected) FontWeight.Bold else FontWeight.Normal,
        color = if (selected) NxColors.BrandDark else NxColors.Slate,
        modifier = Modifier
            .clip(shape)
            .border(if (selected) 2.dp else 1.dp, if (selected) NxColors.Brand else BordeEstandar, shape)
            .background(if (selected) NxColors.BrandSoft else NxColors.Card)
            .clickable(role = Role.Button, onClick = onClick)
            .semantics { this.selected = selected }
            .heightIn(min = 40.dp)
            .padding(horizontal = 14.dp, vertical = 10.dp),
    )
}
