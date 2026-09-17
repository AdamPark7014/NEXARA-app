package mx.nexara.mobile.nativeapp.ui.console.activities

import android.content.Context
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import mx.nexara.mobile.nativeapp.R
import mx.nexara.mobile.nativeapp.data.api.CelebracionesHoyDto
import mx.nexara.mobile.nativeapp.data.console.CoreActivitiesRepository
import mx.nexara.mobile.nativeapp.ui.enterprise.NxColors

private const val CELEBRACIONES_PREFS = "nexara_celebraciones"

/** Fecha (AAAA-MM-DD) en que se cerró el aviso: ese día ya no vuelve a salir. */
private const val CERRADA_KEY = "cerrada_fecha"

private val Rosa = Color(0xFFDB2777)
private val Ambar = Color(0xFFD97706)

/**
 * Cumpleaños y aniversarios de hoy, arriba de Actividades. Compacto y festivo;
 * sin celebraciones (o sin red) no ocupa lugar. Se cierra con la X por ese día.
 */
@Composable
fun CelebracionesBanner(
    repo: CoreActivitiesRepository,
    modifier: Modifier = Modifier,
) {
    val context = LocalContext.current
    val prefs = remember(context) { context.getSharedPreferences(CELEBRACIONES_PREFS, Context.MODE_PRIVATE) }
    var hoy by remember { mutableStateOf<CelebracionesHoyDto?>(null) }
    var cerrada by remember { mutableStateOf(runCatching { prefs.getString(CERRADA_KEY, null) }.getOrNull()) }

    LaunchedEffect(repo) {
        // Un aviso opcional: si falla, simplemente no aparece.
        hoy = withContext(Dispatchers.IO) { runCatching { repo.celebracionesHoy() }.getOrNull() }
    }

    val datos = hoy ?: return
    val lista = datos.celebraciones.orEmpty()
    val titulo = Celebraciones.titulo(lista) ?: return
    if (Celebraciones.cerradoHoy(cerrada, datos.fecha)) return

    val fila = Celebraciones.enFila(lista)
    val pastel = Celebraciones.soloCumpleanos(lista)
    val acento = if (pastel) Rosa else Ambar
    val shape = RoundedCornerShape(14.dp)

    Column(
        modifier = modifier
            .fillMaxWidth()
            .clip(shape)
            .background(Brush.horizontalGradient(listOf(Color(0xFFFCE7F3), Color(0xFFFEF3C7))))
            .border(1.dp, acento.copy(alpha = 0.25f), shape)
            .padding(start = 12.dp, top = 8.dp, bottom = 8.dp, end = 2.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Box(
                modifier = Modifier.size(32.dp).clip(CircleShape).background(acento),
                contentAlignment = Alignment.Center,
            ) {
                Icon(
                    painter = painterResource(if (pastel) R.drawable.ic_nx_cake else R.drawable.ic_nx_celebration),
                    contentDescription = null,
                    tint = Color.White,
                    modifier = Modifier.size(18.dp),
                )
            }
            Text(
                titulo,
                modifier = Modifier.weight(1f).padding(horizontal = 10.dp),
                fontSize = 14.sp,
                fontWeight = FontWeight.Bold,
                color = NxColors.Slate,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
            )
            IconButton(
                onClick = {
                    cerrada = datos.fecha
                    runCatching { prefs.edit().putString(CERRADA_KEY, datos.fecha).apply() }
                },
            ) {
                Icon(Icons.Default.Close, contentDescription = "Cerrar aviso de celebraciones", tint = NxColors.Muted)
            }
        }
        if (fila.isNotEmpty()) {
            LazyRow(
                modifier = Modifier.padding(top = 6.dp, end = 10.dp),
                horizontalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                items(fila) { c ->
                    val color = if (Celebraciones.esCumpleanos(c)) Rosa else Ambar
                    Row(
                        modifier = Modifier
                            .clip(RoundedCornerShape(999.dp))
                            .background(Color.White)
                            .border(1.dp, color.copy(alpha = 0.30f), RoundedCornerShape(999.dp))
                            .padding(start = 3.dp, end = 10.dp, top = 3.dp, bottom = 3.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(6.dp),
                    ) {
                        PersonAvatar(nombre = c.nombre, url = c.avatarUrl, size = 22.dp)
                        Text(
                            Celebraciones.etiqueta(c),
                            fontSize = 12.sp,
                            fontWeight = FontWeight.SemiBold,
                            color = NxColors.Slate,
                            maxLines = 1,
                        )
                    }
                }
            }
        }
    }
}
