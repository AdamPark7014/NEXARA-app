package mx.nexara.mobile.nativeapp.ui.console.vehiculos

import android.graphics.Bitmap
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.ExpandMore
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import mx.nexara.mobile.nativeapp.ui.enterprise.NxColors
import mx.nexara.mobile.nativeapp.ui.enterprise.NxLightPalette
import mx.nexara.mobile.nativeapp.ui.theme.InterTight

/**
 * Las piezas de «Cargar gasolina» y «Regreso del vehículo» (mockups `AppGasolina` y `AppRegreso`
 * del 01-11-2026, artifact 2DNGd9xCSM7fG9zAfBPijs): tarjetas sin sombra, campos con la etiqueta
 * arriba y las casillas oscuras de foto. Mismas medidas que `PiezasVehiculo.swift`.
 */
internal object ColoresVehiculo {
    val FondoFoto = Color(0xFF0C1720)
    val IconoFoto = Color(0xFF7FE3CB)
    val PieFoto = Color(0xFFC9D6DC)
    val Secundario get() = NxLightPalette.fg2
    val Contorno get() = NxLightPalette.borderStrong
}

private val FormaCampo = RoundedCornerShape(10.dp)
private val FormaTarjeta = RoundedCornerShape(14.dp)

@Composable
internal fun EncabezadoVehiculo(titulo: String, lineas: List<String>) {
    Column {
        Text(
            titulo,
            fontFamily = InterTight,
            fontWeight = FontWeight.SemiBold,
            fontSize = 24.sp,
            lineHeight = 34.sp,
            letterSpacing = (-0.36).sp,
            color = NxColors.Slate,
        )
        lineas.forEach { linea ->
            Text(linea, fontSize = 14.sp, lineHeight = 20.sp, color = ColoresVehiculo.Secundario)
        }
    }
}

@Composable
internal fun TarjetaVehiculo(
    modifier: Modifier = Modifier,
    content: @Composable ColumnScope.() -> Unit,
) {
    Column(
        modifier = modifier
            .fillMaxWidth()
            .background(NxColors.Card, FormaTarjeta)
            .padding(horizontal = 16.dp, vertical = 14.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
        content = content,
    )
}

/** «Esto leímos en las fotos», o lo que toque según vaya la lectura. */
@Composable
internal fun RotuloLectura(texto: String, leyendo: Boolean) {
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
        if (leyendo) {
            CircularProgressIndicator(
                color = NxColors.BrandDark,
                strokeWidth = 2.dp,
                modifier = Modifier.size(14.dp),
            )
        }
        Text(texto, fontSize = 13.5.sp, lineHeight = 19.sp, fontWeight = FontWeight.Medium, color = NxColors.BrandDark)
    }
}

/** Campo con la etiqueta arriba, alto de 48 y contorno fino, como el mockup. [valor] es texto crudo. */
@Composable
internal fun CampoVehiculo(
    etiqueta: String,
    valor: String,
    onValor: (String) -> Unit,
    modifier: Modifier = Modifier,
    teclado: KeyboardType = KeyboardType.Number,
    transformacion: VisualTransformation = VisualTransformation.None,
    prefijo: String? = null,
    tamano: Int = 15,
    negrita: Boolean = false,
    habilitado: Boolean = true,
) {
    var enfocado by remember { mutableStateOf(false) }
    val estilo = TextStyle(
        fontSize = tamano.sp,
        fontWeight = if (negrita) FontWeight.SemiBold else FontWeight.Normal,
        color = NxColors.Slate,
    )
    Column(modifier = modifier, verticalArrangement = Arrangement.spacedBy(4.dp)) {
        Text(etiqueta, fontSize = 13.sp, lineHeight = 18.sp, color = ColoresVehiculo.Secundario)
        BasicTextField(
            value = valor,
            onValueChange = onValor,
            enabled = habilitado,
            singleLine = true,
            textStyle = estilo,
            visualTransformation = transformacion,
            keyboardOptions = KeyboardOptions(keyboardType = teclado, imeAction = ImeAction.Next),
            cursorBrush = SolidColor(NxColors.Brand),
            modifier = Modifier
                .fillMaxWidth()
                .onFocusChanged { enfocado = it.isFocused }
                .semantics { contentDescription = etiqueta },
            decorationBox = { campo ->
                MarcoCampo(enfocado = enfocado) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        if (prefijo != null && valor.isNotEmpty()) Text(prefijo, style = estilo)
                        campo()
                    }
                }
            },
        )
    }
}

@Composable
private fun MarcoCampo(enfocado: Boolean, contenido: @Composable () -> Unit) {
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .heightIn(min = 48.dp)
            .border(
                width = if (enfocado) 2.dp else 1.dp,
                color = if (enfocado) NxColors.Brand else ColoresVehiculo.Contorno,
                shape = FormaCampo,
            )
            .padding(horizontal = 12.dp),
        contentAlignment = Alignment.CenterStart,
    ) { contenido() }
}

/** Celda de «Total» de quien no ve costos: dice que ya está, sin decir cuánto. */
@Composable
internal fun CampoSinImporte(etiqueta: String, texto: String, modifier: Modifier = Modifier) {
    Column(modifier = modifier, verticalArrangement = Arrangement.spacedBy(4.dp)) {
        Text(etiqueta, fontSize = 13.sp, lineHeight = 18.sp, color = ColoresVehiculo.Secundario)
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .heightIn(min = 48.dp)
                .background(NxLightPalette.sunken, FormaCampo)
                .border(1.dp, ColoresVehiculo.Contorno, FormaCampo)
                .padding(horizontal = 12.dp),
            contentAlignment = Alignment.CenterStart,
        ) {
            Text(texto, fontSize = 13.5.sp, color = ColoresVehiculo.Secundario)
        }
    }
}

/** El nivel se elige de la lista: el API solo acepta `E`, `1/4`, `1/2`, `3/4` y `F`. */
@Composable
internal fun CampoNivelGasolina(
    nivel: String?,
    onNivel: (String) -> Unit,
    modifier: Modifier = Modifier,
    habilitado: Boolean = true,
) {
    var abierto by remember { mutableStateOf(false) }
    Column(modifier = modifier, verticalArrangement = Arrangement.spacedBy(4.dp)) {
        Text("Gasolina", fontSize = 13.sp, lineHeight = 18.sp, color = ColoresVehiculo.Secundario)
        Box {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .heightIn(min = 48.dp)
                    .border(1.dp, ColoresVehiculo.Contorno, FormaCampo)
                    .clip(FormaCampo)
                    .clickable(enabled = habilitado, role = Role.Button, onClickLabel = "Elegir el nivel") { abierto = true }
                    .padding(horizontal = 12.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween,
            ) {
                Text(
                    GasolinaRules.textoNivel(nivel).ifEmpty { "Elegir nivel" },
                    fontSize = 15.sp,
                    color = if (nivel == null) ColoresVehiculo.Secundario else NxColors.Slate,
                )
                Icon(
                    Icons.Outlined.ExpandMore,
                    contentDescription = null,
                    tint = ColoresVehiculo.Secundario,
                    modifier = Modifier.size(20.dp),
                )
            }
            DropdownMenu(expanded = abierto, onDismissRequest = { abierto = false }) {
                ChecklistVehiculoRules.NIVELES.forEach { valor ->
                    DropdownMenuItem(
                        text = { Text(GasolinaRules.textoNivel(valor)) },
                        onClick = {
                            abierto = false
                            onNivel(valor)
                        },
                    )
                }
            }
        }
    }
}

/**
 * Casilla oscura para tomar una foto. Con foto, la foto llena la casilla y el pie va encima de un
 * degradado; así se lee igual sobre un tablero oscuro que sobre un ticket blanco.
 */
@Composable
internal fun CasillaFotoVehiculo(
    etiqueta: String,
    icono: ImageVector,
    foto: Bitmap?,
    leyendo: Boolean,
    onTomar: () -> Unit,
    alto: Dp,
    modifier: Modifier = Modifier,
    tamanoIcono: Dp = 24.dp,
    pie: String? = null,
    habilitada: Boolean = true,
) {
    val forma = FormaTarjeta
    Box(
        modifier = modifier
            .fillMaxWidth()
            .height(alto)
            .clip(forma)
            .background(ColoresVehiculo.FondoFoto)
            .clickable(
                enabled = habilitada,
                role = Role.Button,
                onClickLabel = if (foto == null) "Tomar foto" else "Repetir foto",
            ) { onTomar() },
    ) {
        if (foto != null) {
            Image(
                bitmap = foto.asImageBitmap(),
                contentDescription = etiqueta,
                contentScale = ContentScale.Crop,
                modifier = Modifier.fillMaxSize(),
            )
            Box(
                Modifier
                    .fillMaxSize()
                    .background(
                        Brush.verticalGradient(
                            0.45f to Color.Transparent,
                            1f to ColoresVehiculo.FondoFoto.copy(alpha = 0.92f),
                        ),
                    ),
            )
            Column(
                modifier = Modifier
                    .align(Alignment.BottomCenter)
                    .fillMaxWidth()
                    .padding(horizontal = 10.dp, vertical = 8.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                Text(etiqueta, color = Color.White, fontSize = 14.sp, fontWeight = FontWeight.Medium, textAlign = TextAlign.Center)
                if (pie != null) {
                    Text(pie, color = ColoresVehiculo.PieFoto, fontSize = 13.sp, textAlign = TextAlign.Center)
                }
            }
        } else {
            Column(
                modifier = Modifier.align(Alignment.Center).padding(10.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(4.dp),
            ) {
                Icon(icono, contentDescription = null, tint = ColoresVehiculo.IconoFoto, modifier = Modifier.size(tamanoIcono))
                Text(etiqueta, color = Color.White, fontSize = 14.sp, fontWeight = FontWeight.Medium, textAlign = TextAlign.Center)
                if (pie != null) {
                    Text(pie, color = ColoresVehiculo.PieFoto, fontSize = 13.sp, textAlign = TextAlign.Center)
                }
            }
        }
        if (leyendo) {
            CircularProgressIndicator(
                color = ColoresVehiculo.IconoFoto,
                strokeWidth = 2.dp,
                modifier = Modifier.align(Alignment.TopEnd).padding(10.dp).size(18.dp),
            )
        }
    }
}

/** La acción de la pantalla: alto de 52 y esquinas de 12, como el mockup. */
@Composable
internal fun BotonVehiculo(texto: String, habilitado: Boolean, onClick: () -> Unit, modifier: Modifier = Modifier) {
    Button(
        onClick = onClick,
        enabled = habilitado,
        shape = RoundedCornerShape(12.dp),
        colors = ButtonDefaults.buttonColors(containerColor = NxColors.Brand),
        modifier = modifier.fillMaxWidth().heightIn(min = 52.dp),
    ) {
        Text(texto, fontSize = 15.sp, fontWeight = FontWeight.SemiBold, color = Color.White)
    }
}

/** Un aviso de la lectura, sin tumbar nada: lo demás se captura a mano. */
@Composable
internal fun AvisoLectura(texto: String) {
    Text(
        texto,
        fontSize = 13.sp,
        lineHeight = 18.sp,
        color = NxLightPalette.warningText,
        modifier = Modifier
            .fillMaxWidth()
            .background(NxColors.WarningSoft, RoundedCornerShape(10.dp))
            .padding(horizontal = 12.dp, vertical = 8.dp),
    )
}
