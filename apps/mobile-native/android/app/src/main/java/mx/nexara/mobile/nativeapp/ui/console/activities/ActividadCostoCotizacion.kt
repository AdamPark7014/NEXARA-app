package mx.nexara.mobile.nativeapp.ui.console.activities

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.PictureAsPdf
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import java.io.File
import kotlin.coroutines.cancellation.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import mx.nexara.mobile.nativeapp.data.api.ActivityCotizacionDto
import mx.nexara.mobile.nativeapp.data.api.isForbidden
import mx.nexara.mobile.nativeapp.data.api.toUserMessage
import mx.nexara.mobile.nativeapp.data.console.ConsoleRepository
import mx.nexara.mobile.nativeapp.data.console.CotizacionesRepository
import mx.nexara.mobile.nativeapp.data.viaticos.ViaticosRepository
import mx.nexara.mobile.nativeapp.ui.common.DocumentoDialog
import mx.nexara.mobile.nativeapp.ui.common.guardarEnCache
import mx.nexara.mobile.nativeapp.ui.console.cotizaciones.CotizacionesRules
import mx.nexara.mobile.nativeapp.ui.enterprise.NxPanelShell
import mx.nexara.mobile.nativeapp.ui.enterprise.NxSecondaryButton
import mx.nexara.mobile.nativeapp.ui.enterprise.NxTheme

/**
 * «Costo directo» (web `CostoActividad.tsx`): viáticos imputados y material del almacén. Solo
 * para quien la web la enseña ([puedeVer], `ActividadCostoRules.puedeVer`); si una de las dos
 * consultas falla cuenta como vacía, y sin nada que sumar la tarjeta no se pinta.
 */
@Composable
fun ActividadCostoCard(
    activityId: Long,
    puedeVer: Boolean,
    refreshKey: Any? = null,
    modifier: Modifier = Modifier,
) {
    if (!puedeVer) return
    val context = LocalContext.current
    val consola = remember(context) { ConsoleRepository(context) }
    val viaticosRepo = remember(context) { ViaticosRepository(context) }
    var costo by remember(activityId) { mutableStateOf<ActividadCostoRules.Costo?>(null) }

    LaunchedEffect(activityId, refreshKey) {
        costo = withContext(Dispatchers.IO) {
            coroutineScope {
                val viaticos = async { cargarONulo { viaticosRepo.lista() } }
                val materiales = async { cargarONulo { consola.activityMaterials(activityId) } }
                ActividadCostoRules.costo(viaticos.await(), activityId, materiales.await())
            }
        }
    }

    val c = costo ?: return
    if (!ActividadCostoRules.visible(c)) return
    val colores = NxTheme.colors
    NxPanelShell(modifier = modifier) {
        Text(
            ActividadCostoRules.TITULO,
            style = MaterialTheme.typography.titleSmall.copy(fontWeight = FontWeight.Bold),
            color = colores.fg,
        )
        Column(Modifier.padding(top = 10.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            RenglonCosto(ActividadCostoRules.etiquetaViaticos(c), ActividadCostoRules.pesos(c.viaticosCentavos))
            RenglonCosto(ActividadCostoRules.etiquetaMaterial(c), ActividadCostoRules.pesos(c.materialCentavos))
            HorizontalDivider(color = colores.borderSubtle)
            RenglonCosto("Total", ActividadCostoRules.pesos(c.totalCentavos), total = true)
        }
        Text(
            ActividadCostoRules.NOTA,
            fontSize = 11.5.sp,
            lineHeight = 16.sp,
            color = colores.muted,
            modifier = Modifier.padding(top = 10.dp),
        )
    }
}

/** Una consulta opcional: si falla (403, red), la tarjeta la cuenta como vacía. */
private suspend fun <T> cargarONulo(bloque: suspend () -> T): T? =
    try {
        bloque()
    } catch (e: CancellationException) {
        throw e
    } catch (_: Exception) {
        null
    }

@Composable
private fun RenglonCosto(etiqueta: String, monto: String, total: Boolean = false) {
    val c = NxTheme.colors
    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
        Text(
            etiqueta,
            fontSize = 14.sp,
            fontWeight = if (total) FontWeight.SemiBold else FontWeight.Normal,
            color = if (total) c.fg else c.fg2,
            modifier = Modifier.weight(1f),
        )
        Text(
            monto,
            fontSize = 14.sp,
            fontWeight = if (total) FontWeight.SemiBold else FontWeight.Medium,
            color = c.fg,
            style = TextStyle(fontFeatureSettings = "tnum"),
        )
    }
}

/**
 * La cotización ligada de una actividad comercial (web `CotizacionDeActividad.tsx` y
 * `PropuestaEmbebida.tsx`): folio · estado · total, y la propuesta en PDF abierta dentro de la
 * app (`GET cotizaciones/:id/pdf`) con Guardar y Compartir. Con 403: «No tienes acceso a cotizaciones».
 */
@Composable
fun ActividadCotizacionCard(
    cotizacion: ActivityCotizacionDto,
    modifier: Modifier = Modifier,
) {
    val id = cotizacion.id ?: return
    val context = LocalContext.current
    val repo = remember(context) { CotizacionesRepository(context) }
    val scope = rememberCoroutineScope()
    var abriendo by remember(id) { mutableStateOf(false) }
    var error by remember(id) { mutableStateOf<String?>(null) }
    var abierto by remember(id) { mutableStateOf<File?>(null) }
    val folio = ActividadCotizacionRules.folio(cotizacion)
    val titulo = CotizacionesRules.tituloPdf(cotizacion.quoteNumber)
    val c = NxTheme.colors

    fun abrir() {
        if (abriendo) return
        abriendo = true
        error = null
        scope.launch {
            try {
                val bytes = repo.pdf(id)
                val nombre = CotizacionesRules.nombreArchivoPdf(id, cotizacion.quoteNumber)
                abierto = withContext(Dispatchers.IO) { guardarEnCache(context, nombre, bytes, "pdf") }
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                error = ActividadCotizacionRules.error(
                    prohibido = e.isForbidden(),
                    mensaje = e.toUserMessage(ActividadCotizacionRules.FALLO),
                )
            } finally {
                abriendo = false
            }
        }
    }

    NxPanelShell(modifier = modifier) {
        Text(
            ActividadCotizacionRules.TITULO,
            style = MaterialTheme.typography.titleSmall.copy(fontWeight = FontWeight.Bold),
            color = c.fg,
        )
        Text(
            ActividadCotizacionRules.linea(cotizacion),
            fontSize = 14.sp,
            fontWeight = FontWeight.SemiBold,
            color = c.fg,
            modifier = Modifier.padding(top = 6.dp),
        )
        Text(
            ActividadCotizacionRules.NOTA,
            fontSize = 12.5.sp,
            lineHeight = 17.sp,
            color = c.muted,
            modifier = Modifier.padding(top = 4.dp),
        )
        NxSecondaryButton(
            text = if (abriendo) ActividadCotizacionRules.ABRIENDO else ActividadCotizacionRules.BOTON,
            onClick = { abrir() },
            loading = abriendo,
            icon = Icons.Outlined.PictureAsPdf,
            modifier = Modifier.fillMaxWidth().padding(top = 10.dp),
        )
        error?.let {
            Text(it, fontSize = 13.sp, color = c.danger, modifier = Modifier.padding(top = 8.dp))
        }
    }

    abierto?.let { archivo ->
        DocumentoDialog(
            archivo = archivo,
            titulo = titulo.ifBlank { folio },
            mime = "application/pdf",
            onClose = { abierto = null },
        )
    }
}
