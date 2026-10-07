package mx.nexara.mobile.nativeapp.ui.console.activities

import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.AttachFile
import androidx.compose.material.icons.outlined.Delete
import androidx.compose.material.icons.outlined.Description
import androidx.compose.material.icons.outlined.Image
import androidx.compose.material.icons.outlined.InsertDriveFile
import androidx.compose.material.icons.outlined.PictureAsPdf
import androidx.compose.material.icons.outlined.Slideshow
import androidx.compose.material.icons.outlined.TableChart
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import java.io.File
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import mx.nexara.mobile.nativeapp.data.api.AdjuntoDto
import mx.nexara.mobile.nativeapp.data.api.toUserMessage
import mx.nexara.mobile.nativeapp.data.console.ActividadAdjuntosRepository
import mx.nexara.mobile.nativeapp.ui.common.DocumentoDialog
import mx.nexara.mobile.nativeapp.ui.common.guardarEnCache
import mx.nexara.mobile.nativeapp.ui.enterprise.NxColors
import mx.nexara.mobile.nativeapp.ui.enterprise.NxErrorBlock
import mx.nexara.mobile.nativeapp.ui.enterprise.NxLoadingBlock
import mx.nexara.mobile.nativeapp.ui.enterprise.NxPanelShell
import mx.nexara.mobile.nativeapp.ui.enterprise.NxSectionHeader

/**
 * «Archivos de evidencia» del detalle de una actividad comercial.
 *
 * Adam (07-10): las evidencias de una visita comercial son Excel, Word o PDF —la propuesta,
 * la minuta, lo que manda el cliente— y no solo fotos. Se adjuntan varios a la vez desde el
 * selector de Android y se ven **dentro de la app** ([DocumentoDialog]: PDF, imagen o la vista
 * previa HTML que arma el API para Excel/CSV/Word), con Guardar, Compartir y Abrir con….
 * Quitar solo aparece en los renglones que el API marca con `puedeQuitar`.
 */
@Composable
fun ActividadAdjuntosSection(
    activityId: Long,
    modifier: Modifier = Modifier,
    /** Cambia para volver a pedir la lista (p. ej. al recargar el detalle). */
    refreshKey: Int = 0,
    /** Avisos breves (snackbar de la pantalla): «Archivo adjuntado», «Archivo quitado»… */
    onAviso: (String) -> Unit = {},
) {
    val context = LocalContext.current
    val repo = remember(context) { ActividadAdjuntosRepository(context) }
    val scope = rememberCoroutineScope()

    var lista by remember(activityId) { mutableStateOf<List<AdjuntoDto>?>(null) }
    var cargando by remember(activityId) { mutableStateOf(true) }
    var error by remember(activityId) { mutableStateOf<String?>(null) }
    var recarga by remember(activityId) { mutableIntStateOf(0) }

    /** Cuántos archivos van subiendo (0 = ninguno). */
    var subiendo by remember(activityId) { mutableIntStateOf(0) }
    var errorSubida by remember(activityId) { mutableStateOf<String?>(null) }
    var rechazos by remember(activityId) { mutableStateOf<List<String>>(emptyList()) }

    var abriendoId by remember(activityId) { mutableStateOf<Long?>(null) }
    var abierto by remember(activityId) { mutableStateOf<Pair<AdjuntoDto, File>?>(null) }
    var porQuitar by remember(activityId) { mutableStateOf<AdjuntoDto?>(null) }
    var quitandoId by remember(activityId) { mutableStateOf<Long?>(null) }

    LaunchedEffect(activityId, refreshKey, recarga) {
        cargando = true
        error = null
        try {
            lista = repo.lista(activityId)
        } catch (e: Exception) {
            // Con la lista vieja en pantalla, un refresco fallido no la borra.
            if (lista == null) error = e.toUserMessage("No se pudieron cargar los archivos")
        } finally {
            cargando = false
        }
    }

    fun subir(uris: List<Uri>) {
        if (uris.isEmpty() || subiendo > 0) return
        scope.launch {
            subiendo = uris.size
            errorSubida = null
            rechazos = emptyList()
            try {
                val preparacion = repo.preparar(uris)
                rechazos = preparacion.rechazos
                if (preparacion.listos.isEmpty()) return@launch
                subiendo = preparacion.listos.size
                val resultado = repo.subir(activityId, preparacion.listos)
                if (resultado.subidos.isNotEmpty()) {
                    lista = ActividadAdjuntosRules.conNuevos(lista.orEmpty(), resultado.subidos)
                    error = null
                    onAviso(ActividadAdjuntosRules.textoSubidos(resultado.subidos.size))
                }
                resultado.error?.let { errorSubida = it.toUserMessage("No se pudo adjuntar el archivo") }
            } catch (e: Exception) {
                errorSubida = e.toUserMessage("No se pudo adjuntar el archivo")
            } finally {
                subiendo = 0
            }
        }
    }

    val selector = rememberLauncherForActivityResult(ActivityResultContracts.OpenMultipleDocuments()) { uris ->
        subir(uris)
    }

    fun abrir(adjunto: AdjuntoDto) {
        if (abriendoId != null) return
        scope.launch {
            abriendoId = adjunto.id
            try {
                val bytes = repo.archivo(activityId, adjunto.id)
                val archivo = withContext(Dispatchers.IO) {
                    guardarEnCache(context, ActividadAdjuntosRules.nombre(adjunto), bytes)
                }
                abierto = adjunto to archivo
            } catch (e: Exception) {
                onAviso(e.toUserMessage("No se pudo abrir el archivo"))
            } finally {
                abriendoId = null
            }
        }
    }

    fun quitar(adjunto: AdjuntoDto) {
        scope.launch {
            quitandoId = adjunto.id
            try {
                repo.quitar(activityId, adjunto.id)
                lista = lista.orEmpty().filter { it.id != adjunto.id }
                onAviso("Archivo quitado")
            } catch (e: Exception) {
                onAviso(e.toUserMessage("No se pudo quitar el archivo"))
            } finally {
                quitandoId = null
            }
        }
    }

    NxPanelShell(modifier = modifier) {
        val archivos = lista.orEmpty()
        val cuantos: (@Composable () -> Unit)? = if (archivos.isNotEmpty()) {
            { ToneChip("${archivos.size}", CoreActivityRules.GRIS) }
        } else {
            null
        }
        NxSectionHeader(
            title = ActividadAdjuntosRules.TITULO,
            subtitle = ActividadAdjuntosRules.SUBTITULO,
            trailing = cuantos,
        )
        Spacer(Modifier.height(8.dp))

        when {
            cargando && lista == null -> NxLoadingBlock("Cargando archivos…")
            error != null && lista == null -> NxErrorBlock(error!!, onRetry = { recarga++ })
            archivos.isEmpty() -> Text(
                ActividadAdjuntosRules.VACIO,
                fontSize = 13.sp,
                color = NxColors.Muted,
                modifier = Modifier.padding(vertical = 6.dp),
            )
            else -> archivos.forEachIndexed { indice, adjunto ->
                if (indice > 0) HorizontalDivider(color = Color(0xFFEEF2F6))
                RenglonDeAdjunto(
                    adjunto = adjunto,
                    abriendo = abriendoId == adjunto.id,
                    quitando = quitandoId == adjunto.id,
                    onAbrir = { abrir(adjunto) },
                    onQuitar = { porQuitar = adjunto },
                )
            }
        }

        Spacer(Modifier.height(10.dp))
        if (subiendo > 0) {
            Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                LinearProgressIndicator(
                    modifier = Modifier.fillMaxWidth(),
                    color = NxColors.Brand,
                    trackColor = Color(0xFFE2E8F0),
                )
                Text(
                    ActividadAdjuntosRules.textoSubiendo(subiendo),
                    fontSize = 12.5.sp,
                    fontWeight = FontWeight.SemiBold,
                    color = NxColors.Muted,
                )
            }
        } else {
            OutlinedButton(
                onClick = { selector.launch(ActividadAdjuntosRules.MIMES_SELECTOR) },
                modifier = Modifier.fillMaxWidth().heightIn(min = 44.dp),
            ) {
                Icon(Icons.Outlined.AttachFile, contentDescription = null, modifier = Modifier.size(18.dp))
                Spacer(Modifier.size(8.dp))
                Text(ActividadAdjuntosRules.BOTON, fontWeight = FontWeight.SemiBold)
            }
        }
        rechazos.forEach { aviso ->
            Spacer(Modifier.height(8.dp))
            SoftNote(text = aviso, color = CoreActivityRules.NARANJA)
        }
        errorSubida?.let { mensaje ->
            Spacer(Modifier.height(8.dp))
            SoftNote(title = "No se pudo adjuntar", text = mensaje, color = CoreActivityRules.ROJO)
        }
    }

    abierto?.let { (adjunto, archivo) ->
        DocumentoDialog(
            archivo = archivo,
            titulo = ActividadAdjuntosRules.nombre(adjunto),
            mime = ActividadAdjuntosRules.mime(adjunto),
            vistaPreviaHtml = if (adjunto.vistaPrevia) {
                { repo.vistaPrevia(activityId, adjunto.id) }
            } else {
                null
            },
            onClose = { abierto = null },
        )
    }

    porQuitar?.let { adjunto ->
        AlertDialog(
            onDismissRequest = { porQuitar = null },
            title = { Text("¿Quitar este archivo?") },
            text = { Text("«${ActividadAdjuntosRules.nombre(adjunto)}» se quitará de la actividad.") },
            confirmButton = {
                TextButton(onClick = {
                    porQuitar = null
                    quitar(adjunto)
                }) { Text("Quitar", color = Color(CoreActivityRules.ROJO), fontWeight = FontWeight.Bold) }
            },
            dismissButton = {
                TextButton(onClick = { porQuitar = null }) { Text("Cancelar") }
            },
        )
    }
}

/** Icono por tipo, nombre en 1–2 líneas y «2.3 MB · Luis Joel · hoy 13:39». */
@Composable
private fun RenglonDeAdjunto(
    adjunto: AdjuntoDto,
    abriendo: Boolean,
    quitando: Boolean,
    onAbrir: () -> Unit,
    onQuitar: () -> Unit,
) {
    val nombre = ActividadAdjuntosRules.nombre(adjunto)
    val tipo = ActividadAdjuntosRules.tipo(adjunto.tipo, nombre)
    val color = Color(tipo.color)
    val pie = remember(adjunto) { ActividadAdjuntosRules.pie(adjunto) }

    Row(
        Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(10.dp))
            .clickable(enabled = !abriendo && !quitando, onClickLabel = "Ver archivo", onClick = onAbrir)
            .padding(vertical = 8.dp),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(
            Modifier
                .size(40.dp)
                .clip(RoundedCornerShape(10.dp))
                .background(color.copy(alpha = 0.10f)),
            contentAlignment = Alignment.Center,
        ) {
            Icon(
                iconoDe(ActividadAdjuntosRules.icono(tipo, nombre)),
                contentDescription = null,
                tint = color,
                modifier = Modifier.size(22.dp),
            )
        }
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Text(
                nombre,
                fontSize = 13.5.sp,
                fontWeight = FontWeight.SemiBold,
                color = NxColors.Slate,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
            )
            if (pie.isNotEmpty()) {
                Text(pie, fontSize = 11.5.sp, color = NxColors.Muted, maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
        }
        when {
            abriendo || quitando -> CircularProgressIndicator(
                modifier = Modifier.padding(horizontal = 12.dp).size(20.dp),
                strokeWidth = 2.dp,
                color = NxColors.Brand,
            )
            adjunto.puedeQuitar -> IconButton(onClick = onQuitar) {
                Icon(Icons.Outlined.Delete, contentDescription = "Quitar $nombre", tint = NxColors.Muted)
            }
        }
    }
}

private fun iconoDe(icono: ActividadAdjuntosRules.Icono): ImageVector = when (icono) {
    ActividadAdjuntosRules.Icono.PDF -> Icons.Outlined.PictureAsPdf
    ActividadAdjuntosRules.Icono.HOJA -> Icons.Outlined.TableChart
    ActividadAdjuntosRules.Icono.DOCUMENTO -> Icons.Outlined.Description
    ActividadAdjuntosRules.Icono.IMAGEN -> Icons.Outlined.Image
    ActividadAdjuntosRules.Icono.PRESENTACION -> Icons.Outlined.Slideshow
    ActividadAdjuntosRules.Icono.ARCHIVO -> Icons.Outlined.InsertDriveFile
}
