package mx.nexara.mobile.nativeapp.ui.console.vehiculos

import android.graphics.Bitmap
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.PhotoCamera
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import mx.nexara.mobile.nativeapp.ui.console.viaticos.MoneyVisualTransformation
import mx.nexara.mobile.nativeapp.ui.enterprise.NxColors
import mx.nexara.mobile.nativeapp.ui.enterprise.NxErrorBlock
import mx.nexara.mobile.nativeapp.ui.theme.InterTight

/** Cómo va la lectura de la foto del tablero. */
internal enum class LecturaTablero { SIN_FOTO, LEYENDO, LEIDA, NO_SE_PUDO }

/**
 * El último paso del regreso (mockup `AppRegreso`): foto del tablero, lo que se leyó de ella y
 * cuánto se recorrió. Las otras seis fotos ya se tomaron en el paso anterior: la API las exige, es
 * la evidencia 360° que pidió la dirección.
 */
@Composable
internal fun RegresoVehiculoContenido(
    encabezado: List<String>,
    foto: Bitmap?,
    /** «18:12». */
    horaFoto: String?,
    lectura: LecturaTablero,
    km: String,
    nivel: String?,
    kmInicio: Int?,
    aviso: String?,
    error: String?,
    enviando: Boolean,
    onFoto: () -> Unit,
    onKm: (String) -> Unit,
    onNivel: (String) -> Unit,
    onConfirmar: () -> Unit,
) {
    Column(modifier = Modifier.fillMaxSize().imePadding()) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .weight(1f)
                .verticalScroll(rememberScrollState())
                .padding(start = 16.dp, top = 20.dp, end = 16.dp, bottom = 6.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            EncabezadoVehiculo(titulo = "Regreso del vehículo", lineas = encabezado)
            CasillaFotoVehiculo(
                etiqueta = "Foto del tablero",
                icono = Icons.Outlined.PhotoCamera,
                foto = foto,
                leyendo = lectura == LecturaTablero.LEYENDO,
                onTomar = onFoto,
                alto = 210.dp,
                tamanoIcono = 30.dp,
                pie = horaFoto?.let { "Tomada a las $it · toca para repetir" } ?: "Toca para tomarla",
                habilitada = !enviando,
            )
            TarjetaVehiculo {
                RotuloLectura(
                    texto = when (lectura) {
                        LecturaTablero.LEYENDO -> "Leyendo la foto…"
                        LecturaTablero.LEIDA -> "Esto leímos en la foto"
                        LecturaTablero.NO_SE_PUDO -> "No se pudo leer la foto: escríbelo aquí"
                        LecturaTablero.SIN_FOTO -> "Odómetro y gasolina"
                    },
                    leyendo = lectura == LecturaTablero.LEYENDO,
                )
                CampoVehiculo(
                    etiqueta = "Odómetro",
                    valor = km,
                    onValor = { onKm(GasolinaRules.soloDigitos(it)) },
                    transformacion = MoneyVisualTransformation,
                    tamano = 20,
                    negrita = true,
                    habilitado = !enviando,
                )
                CampoNivelGasolina(nivel = nivel, onNivel = onNivel, habilitado = !enviando)
                if (kmInicio != null) {
                    KmDelViaje(kmInicio = kmInicio, kmFinal = km.toIntOrNull())
                }
            }
            Text(
                "Si la foto no se lee o el número no cuadra, lo corriges aquí y queda la foto de respaldo.",
                fontSize = 13.sp,
                lineHeight = 18.sp,
                color = ColoresVehiculo.Secundario,
                modifier = Modifier.padding(horizontal = 2.dp),
            )
            aviso?.let { AvisoLectura(it) }
            error?.let { NxErrorBlock(it) }
        }
        BotonVehiculo(
            texto = if (enviando) "Enviando…" else "Confirmar regreso",
            habilitado = !enviando && lectura != LecturaTablero.LEYENDO,
            onClick = onConfirmar,
            modifier = Modifier.padding(start = 16.dp, top = 8.dp, end = 16.dp, bottom = 20.dp),
        )
    }
}

@Composable
private fun KmDelViaje(kmInicio: Int, kmFinal: Int?) {
    val recorridos = GasolinaRules.kmDelViaje(kmInicio, kmFinal)
    Row(
        modifier = Modifier.fillMaxWidth().padding(top = 2.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.Bottom,
    ) {
        Text(
            "Salió con ${GasolinaRules.km(kmInicio)}",
            fontSize = 14.sp,
            color = ColoresVehiculo.Secundario,
        )
        Text(
            when {
                recorridos != null -> GasolinaRules.km(recorridos)
                kmFinal != null -> "Revisa el número"
                else -> "—"
            },
            fontFamily = InterTight,
            fontWeight = FontWeight.SemiBold,
            fontSize = if (recorridos != null) 20.sp else 15.sp,
            color = if (recorridos == null && kmFinal != null) NxColors.Danger else NxColors.Slate,
        )
    }
}
