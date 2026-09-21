package mx.nexara.mobile.nativeapp.ui.console.viaticos

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusDirection
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.OffsetMapping
import androidx.compose.ui.text.input.TransformedText
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import mx.nexara.mobile.nativeapp.data.api.ViaticoDto
import mx.nexara.mobile.nativeapp.data.api.ViaticoLiquidacionDto
import mx.nexara.mobile.nativeapp.ui.enterprise.NxColors
import mx.nexara.mobile.nativeapp.ui.enterprise.NxStatusChip
import mx.nexara.mobile.nativeapp.ui.enterprise.NxTone
import mx.nexara.mobile.nativeapp.ui.enterprise.fg
import kotlin.math.abs

/**
 * Piezas compartidas de Viáticos: el campo de importe y el vocabulario de
 * estados. Viven aparte porque las usan las cuatro pantallas del módulo.
 */

/** Alto mínimo de cualquier cosa que se toque: guantes y sol de mediodía. */
val AlturaToque = 48.dp

/**
 * Campo de importe: teclado numérico, moneda agrupada mientras se escribe y
 * cifra grande.
 *
 * [valor] es el texto **crudo** —dígitos y a lo sumo un punto—, que es lo que
 * se guarda y lo que [Dinero.parsearCentavos] entiende. El formato con comas
 * solo se pinta; el cursor se mantiene donde la persona lo dejó gracias al
 * mapa de posiciones de [MoneyVisualTransformation].
 *
 * Nunca se guarda el texto ya formateado: eso obligaría a limpiarlo en cada
 * lectura y bastaría un descuido para que una coma acabara en la petición.
 */
@Composable
fun CampoImporte(
    valor: String,
    onValorChange: (String) -> Unit,
    label: String,
    modifier: Modifier = Modifier.fillMaxWidth(),
    error: String? = null,
    ayuda: String? = null,
    enabled: Boolean = true,
    imeAction: ImeAction = ImeAction.Next,
    onImeAction: (() -> Unit)? = null,
) {
    val focusManager = LocalFocusManager.current
    OutlinedTextField(
        value = valor,
        onValueChange = { nuevo -> onValorChange(Dinero.sanitizarEntrada(nuevo)) },
        label = { Text(label) },
        leadingIcon = {
            Text(
                "$",
                style = MaterialTheme.typography.titleLarge.copy(fontWeight = FontWeight.Bold),
                color = NxColors.Muted,
            )
        },
        modifier = modifier.heightIn(min = 64.dp),
        enabled = enabled,
        singleLine = true,
        isError = error != null,
        textStyle = MaterialTheme.typography.headlineSmall.copy(
            fontWeight = FontWeight.Bold,
            textAlign = TextAlign.End,
        ),
        visualTransformation = MoneyVisualTransformation,
        supportingText = when {
            error != null -> {
                { Text(error, color = MaterialTheme.colorScheme.error) }
            }
            !ayuda.isNullOrBlank() -> {
                { Text(ayuda) }
            }
            else -> null
        },
        // Teclado de números con punto: nadie escribe letras en un importe.
        keyboardOptions = KeyboardOptions(
            keyboardType = KeyboardType.Decimal,
            imeAction = imeAction,
        ),
        keyboardActions = KeyboardActions(
            onNext = { onImeAction?.invoke() ?: focusManager.moveFocus(FocusDirection.Down) },
            onDone = { onImeAction?.invoke() ?: focusManager.clearFocus() },
        ),
    )
}

/**
 * Agrupa millares sin mover el cursor.
 *
 * Se construye el texto visible y, a la vez, un mapa posición-original →
 * posición-visible. Calcular las comas «a ojo» con aritmética de offsets es de
 * donde salen los saltos de cursor al editar en medio de la cifra; el mapa no
 * puede equivocarse porque se llena mientras se formatea.
 */
object MoneyVisualTransformation : VisualTransformation {
    override fun filter(text: AnnotatedString): TransformedText {
        val crudo = text.text
        val punto = crudo.indexOf('.')
        val enteros = if (punto < 0) crudo else crudo.substring(0, punto)

        val visible = StringBuilder(crudo.length + 4)
        val mapa = IntArray(crudo.length + 1)

        enteros.forEachIndexed { i, c ->
            if (i > 0 && (enteros.length - i) % 3 == 0) visible.append(',')
            mapa[i] = visible.length
            visible.append(c)
        }
        for (i in enteros.length until crudo.length) {
            mapa[i] = visible.length
            visible.append(crudo[i])
        }
        mapa[crudo.length] = visible.length

        val offsets = object : OffsetMapping {
            override fun originalToTransformed(offset: Int): Int =
                mapa[offset.coerceIn(0, crudo.length)]

            override fun transformedToOriginal(offset: Int): Int {
                // La posición original cuya marca visible queda más cerca; en
                // empate gana la mayor, que es hacia donde avanza al escribir.
                var mejor = 0
                var distancia = Int.MAX_VALUE
                for (i in mapa.indices) {
                    val d = abs(mapa[i] - offset)
                    if (d <= distancia) {
                        distancia = d
                        mejor = i
                    }
                }
                return mejor
            }
        }
        return TransformedText(AnnotatedString(visible.toString()), offsets)
    }
}

/** Color del estado del viático, igual que en la web. */
fun tonoEstatus(estatus: String?): NxTone = when (estatus?.trim()?.lowercase()) {
    "aprobado" -> NxTone.Success
    "pagado" -> NxTone.Brand
    "rechazado" -> NxTone.Danger
    "pendiente" -> NxTone.Warning
    else -> NxTone.Neutral
}

/** Categorías que acepta el servidor (`VIATIC_CATEGORIES`), con su nombre en pantalla. */
val CATEGORIAS_VIATICO: List<Pair<String, String>> = listOf(
    "COMBUSTIBLE" to "Gasolina",
    "CASETA" to "Casetas",
    "ALIMENTACION" to "Comidas",
    "HOSPEDAJE" to "Hospedaje",
    "TRANSPORTE" to "Transporte",
    "OTROS" to "Otro",
)

fun etiquetaCategoria(categoria: String?): String {
    val clave = categoria?.trim()?.uppercase().orEmpty()
    return CATEGORIAS_VIATICO.firstOrNull { it.first == clave }?.second
        ?: clave.lowercase().replaceFirstChar { it.uppercase() }.ifBlank { "Viático" }
}

/** Qué falta por hacer con este viático, en una línea. */
fun resumenLiquidacion(liquidacion: ViaticoLiquidacionDto?): Pair<String, NxTone>? {
    val estado = liquidacion?.estado?.trim()?.uppercase() ?: return null
    val saldo = Dinero.deApi(liquidacion.saldo)
    return when (estado) {
        "SIN_COMPROBAR" -> "Falta comprobar" to NxTone.Warning
        "CUADRADO" -> "Cuadrado" to NxTone.Success
        "POR_DEVOLVER" -> "Por devolver ${Dinero.pesos(abs(saldo))}" to NxTone.Info
        "POR_REEMBOLSAR" -> "Te deben ${Dinero.pesos(abs(saldo))}" to NxTone.Brand
        else -> null
    }
}

/** El texto largo de qué significa el saldo, para el detalle. */
fun explicacionLiquidacion(liquidacion: ViaticoLiquidacionDto?): String? {
    val estado = liquidacion?.estado?.trim()?.uppercase() ?: return null
    val saldo = abs(Dinero.deApi(liquidacion.saldo))
    return when (estado) {
        "SIN_COMPROBAR" -> "Todavía no subes tickets contra este anticipo."
        "CUADRADO" -> "Los tickets cuadran con lo que se entregó. No hay nada pendiente."
        "POR_DEVOLVER" -> "Sobraron ${Dinero.pesos(saldo)}: hay que devolverlos a la empresa."
        "POR_REEMBOLSAR" -> "Gastaste ${Dinero.pesos(saldo)} de más: la empresa te los debe."
        else -> null
    }
}

/** Dos importes lado a lado, grandes y con su etiqueta arriba. */
@Composable
fun ParDeImportes(
    izquierdaLabel: String,
    izquierdaCentavos: Long,
    derechaLabel: String,
    derechaCentavos: Long?,
    derechaTono: NxTone = NxTone.Neutral,
    modifier: Modifier = Modifier,
) {
    Row(
        modifier = modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        Importe(izquierdaLabel, izquierdaCentavos, NxTone.Neutral, Modifier.weight(1f))
        Importe(derechaLabel, derechaCentavos, derechaTono, Modifier.weight(1f))
    }
}

/** Un importe con su etiqueta. `null` se lee «—»: no es cero, es que no lo hay. */
@Composable
fun Importe(
    label: String,
    centavos: Long?,
    tono: NxTone = NxTone.Neutral,
    modifier: Modifier = Modifier,
) {
    val texto = centavos?.let { Dinero.pesos(it) } ?: "—"
    Column(
        modifier = modifier.clearAndSetSemantics {
            contentDescription = if (centavos == null) "$label: sin dato" else "$label: $texto"
        },
        verticalArrangement = Arrangement.spacedBy(2.dp),
    ) {
        Text(label, style = MaterialTheme.typography.labelMedium, color = NxColors.Muted)
        Text(
            texto,
            style = MaterialTheme.typography.headlineSmall.copy(fontWeight = FontWeight.Bold),
            color = if (tono == NxTone.Neutral) NxColors.Slate else tono.fg(),
        )
    }
}

/** Estado + liquidación en una fila de chips. */
@Composable
fun ChipsDeViatico(viatico: ViaticoDto) {
    Row(
        horizontalArrangement = Arrangement.spacedBy(6.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        NxStatusChip(viatico.estatus ?: "—", tonoEstatus(viatico.estatus))
        resumenLiquidacion(viatico.liquidacion)?.let { (texto, tono) ->
            NxStatusChip(texto, tono)
        }
        if (!viatico.repartos.isNullOrEmpty()) {
            NxStatusChip("Repartido en ${viatico.repartos.size}", NxTone.Info)
        }
    }
}
