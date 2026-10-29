package mx.nexara.mobile.nativeapp.ui.console.inicio

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.Login
import androidx.compose.material.icons.outlined.Campaign
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import java.time.LocalDate
import mx.nexara.mobile.nativeapp.data.api.FestivoDto
import mx.nexara.mobile.nativeapp.data.api.FestivosMioDto
import mx.nexara.mobile.nativeapp.ui.enterprise.NxColors
import mx.nexara.mobile.nativeapp.ui.enterprise.NxDimens
import mx.nexara.mobile.nativeapp.ui.enterprise.NxTheme
import mx.nexara.mobile.nativeapp.ui.enterprise.nxFlotante
import mx.nexara.mobile.nativeapp.ui.theme.InterTight

/** Naranja de «festivo trabajado» (tablero «App · a quien le toca laborar»). */
private val FestivoTrabajadoFondo = Color(0xFFFDF0E1)
private val FestivoTrabajadoTexto = Color(0xFF8A4A00)

/**
 * «Hoy descansas»: la banda oscura con el festivo, el siguiente día de trabajo y los próximos
 * festivos. Sustituye a la tarjeta de la jornada: ese día no se checa.
 */
@Composable
internal fun FestivoDescansaContenido(f: FestivosMioDto) {
    val hoy = f.festivoHoy ?: return
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        FestivoDescansaBanda(hoy)
        val dia = f.hoy?.take(10)?.let { runCatching { LocalDate.parse(it) }.getOrNull() }
        val siguiente = FestivoRules.siguienteDiaDeTrabajo(f)
        if (dia != null && siguiente != null) SiguienteDiaTarjeta(dia, siguiente)
        ProximosFestivosTarjeta(FestivoRules.proximos(f))
    }
}

@Composable
private fun FestivoDescansaBanda(f: FestivoDto) {
    val shape = RoundedCornerShape(24.dp)
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .nxFlotante(shape, 14.dp)
            .clip(shape)
            .background(Color(0xFF0D0F12))
            .drawBehind {
                drawRect(Brush.radialGradient(listOf(Color(0xFF168570).copy(alpha = 0.6f), Color.Transparent), Offset(size.width, 0f), size.width * 0.85f))
                drawRect(Brush.radialGradient(listOf(Color(0xFF0060F0).copy(alpha = 0.45f), Color.Transparent), Offset(0f, size.height * 1.2f), size.width * 0.75f))
            }
            .padding(horizontal = 20.dp, vertical = 22.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Chip(FestivoRules.chip(f, FestivoRules.Estado.DESCANSA), Color.White.copy(alpha = 0.14f), Color.White)
        Text(
            FestivoRules.TITULO_DESCANSA,
            fontFamily = InterTight,
            fontSize = 30.sp,
            lineHeight = 33.sp,
            fontWeight = FontWeight.Bold,
            color = Color.White,
            modifier = Modifier.semantics { heading() },
        )
        Text(FestivoRules.TEXTO_DESCANSA, fontSize = 14.sp, lineHeight = 21.sp, color = Color(0xFFD7DBE3))
    }
}

@Composable
private fun SiguienteDiaTarjeta(hoy: LocalDate, siguiente: LocalDate) {
    val c = NxTheme.colors
    Tarjeta {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(14.dp)) {
            Column(
                modifier = Modifier
                    .width(48.dp)
                    .height(52.dp)
                    .clip(RoundedCornerShape(12.dp))
                    .background(NxColors.BrandSoft),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.Center,
            ) {
                Text(FestivoRules.mesCorto(siguiente), fontSize = 11.sp, fontWeight = FontWeight.Bold, color = NxColors.BrandDark, lineHeight = 12.sp)
                Text(
                    siguiente.dayOfMonth.toString(),
                    fontFamily = InterTight,
                    fontSize = 19.sp,
                    fontWeight = FontWeight.Bold,
                    color = NxColors.BrandDark,
                    lineHeight = 21.sp,
                )
                Text(FestivoRules.diaSemanaCorto(siguiente), fontSize = 11.sp, color = NxColors.BrandDark, lineHeight = 12.sp)
            }
            Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                Text("Siguiente día de trabajo", fontSize = 13.sp, color = c.muted)
                Text(FestivoRules.vuelves(hoy, siguiente), fontSize = 15.sp, fontWeight = FontWeight.SemiBold, color = c.fg)
            }
        }
    }
}

@Composable
private fun ProximosFestivosTarjeta(proximos: List<FestivoRules.Proximo>) {
    if (proximos.isEmpty()) return
    val c = NxTheme.colors
    Tarjeta {
        Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Text("Próximos festivos", fontSize = 13.sp, fontWeight = FontWeight.Bold, color = c.fg2, modifier = Modifier.semantics { heading() })
            proximos.forEach { p ->
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    Text(p.dia, fontSize = 14.sp, color = c.muted, modifier = Modifier.width(76.dp))
                    Text(p.nombre, fontSize = 14.sp, fontWeight = FontWeight.Medium, color = c.fg, modifier = Modifier.weight(1f))
                    val labora = p.como != "No se labora"
                    Chip(
                        p.como,
                        if (labora) FestivoTrabajadoFondo else c.sunken,
                        if (labora) FestivoTrabajadoTexto else c.fg2,
                        chico = true,
                    )
                }
            }
        }
    }
}

/**
 * «Hoy te toca de 10:00 a 14:00»: el festivo trabajado con su horario y, mientras no haya
 * entrada, el botón de checar (la misma checada con foto de la tarjeta de la jornada).
 */
@Composable
internal fun FestivoLaboraTarjeta(
    f: FestivoDto,
    onEntrada: (() -> Unit)?,
    loading: Boolean = false,
) {
    val c = NxTheme.colors
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Tarjeta(radio = 24.dp, padding = 20.dp) {
            Column(verticalArrangement = Arrangement.spacedBy(14.dp)) {
                Chip(FestivoRules.chip(f, FestivoRules.Estado.LABORA), FestivoTrabajadoFondo, FestivoTrabajadoTexto)
                Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Text(
                        FestivoRules.tituloLabora(f),
                        fontFamily = InterTight,
                        fontSize = 28.sp,
                        lineHeight = 31.sp,
                        fontWeight = FontWeight.Bold,
                        color = c.fg,
                        modifier = Modifier.semantics { heading() },
                    )
                    FestivoRules.textoLabora(f)?.let { Text(it, fontSize = 14.sp, lineHeight = 21.sp, color = c.fg2) }
                }
                val cifras = FestivoRules.cifras(f)
                if (cifras.isNotEmpty()) {
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        cifras.forEach { cifra ->
                            Column(
                                modifier = Modifier
                                    .weight(1f)
                                    .clip(RoundedCornerShape(14.dp))
                                    .background(c.sunken)
                                    .padding(horizontal = 12.dp, vertical = 10.dp),
                                verticalArrangement = Arrangement.spacedBy(2.dp),
                            ) {
                                Text(cifra.etiqueta, fontSize = 12.sp, color = c.muted)
                                Text(cifra.valor, fontFamily = InterTight, fontSize = 18.sp, fontWeight = FontWeight.Bold, color = c.fg)
                            }
                        }
                    }
                }
                if (onEntrada != null) {
                    Button(
                        onClick = onEntrada,
                        enabled = !loading,
                        modifier = Modifier.fillMaxWidth().height(52.dp),
                        shape = RoundedCornerShape(16.dp),
                        colors = ButtonDefaults.buttonColors(containerColor = NxColors.Brand, contentColor = Color.White),
                    ) {
                        if (loading) {
                            CircularProgressIndicator(color = Color.White, strokeWidth = 2.dp, modifier = Modifier.size(20.dp))
                        } else {
                            Icon(Icons.AutoMirrored.Outlined.Login, contentDescription = null, modifier = Modifier.size(20.dp))
                            Text("Checar entrada", fontSize = 16.sp, fontWeight = FontWeight.SemiBold, modifier = Modifier.padding(start = 10.dp))
                        }
                    }
                }
            }
        }
        FestivoRules.nota(f)?.let { nota ->
            Tarjeta {
                Row(horizontalArrangement = Arrangement.spacedBy(12.dp), verticalAlignment = Alignment.Top) {
                    Box(
                        modifier = Modifier.size(34.dp).clip(CircleShape).background(Color(0xFF0D0F12)),
                        contentAlignment = Alignment.Center,
                    ) {
                        Icon(Icons.Outlined.Campaign, contentDescription = null, tint = Color.White, modifier = Modifier.size(18.dp))
                    }
                    Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                        Text("Nota de dirección", fontSize = 13.sp, color = c.muted)
                        Text(nota, fontSize = 14.sp, lineHeight = 21.sp, color = c.fg2)
                    }
                }
            }
        }
    }
}

@Composable
private fun Tarjeta(
    radio: androidx.compose.ui.unit.Dp = NxDimens.PanelRadius,
    padding: androidx.compose.ui.unit.Dp = 16.dp,
    contenido: @Composable () -> Unit,
) {
    val shape = RoundedCornerShape(radio)
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .nxFlotante(shape)
            .clip(shape)
            .background(NxTheme.colors.card)
            .padding(horizontal = padding + 2.dp, vertical = padding),
    ) { contenido() }
}

@Composable
private fun Chip(texto: String, fondo: Color, color: Color, chico: Boolean = false) {
    Text(
        texto,
        fontSize = 12.sp,
        fontWeight = FontWeight.SemiBold,
        color = color,
        modifier = Modifier
            .clip(RoundedCornerShape(999.dp))
            .background(fondo)
            .padding(horizontal = if (chico) 9.dp else 10.dp, vertical = if (chico) 3.dp else 4.dp),
    )
}
