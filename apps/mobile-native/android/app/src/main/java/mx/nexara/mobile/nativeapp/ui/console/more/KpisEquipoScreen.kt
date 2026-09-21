package mx.nexara.mobile.nativeapp.ui.console.more

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ExpandLess
import androidx.compose.material.icons.filled.ExpandMore
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import mx.nexara.mobile.nativeapp.data.api.KpiPersonaFilaDto
import mx.nexara.mobile.nativeapp.ui.console.activities.BoardRange
import mx.nexara.mobile.nativeapp.ui.console.activities.PersonAvatar
import mx.nexara.mobile.nativeapp.ui.enterprise.NxColors
import mx.nexara.mobile.nativeapp.ui.enterprise.NxEmptyState
import mx.nexara.mobile.nativeapp.ui.enterprise.NxErrorBlock
import mx.nexara.mobile.nativeapp.ui.enterprise.NxSearchField
import mx.nexara.mobile.nativeapp.ui.enterprise.NxScreenScaffold
import mx.nexara.mobile.nativeapp.ui.enterprise.NxSkeletonList

/**
 * KPIs del equipo (`/erp/asistencias/indicadores`) en el teléfono.
 *
 * La web pone una tabla: una fila por persona con doce columnas. Aquí manda el
 * semáforo. Arriba, cómo va el equipo entero en el periodo; abajo, una tarjeta
 * por persona ordenada de peor a mejor, con tres números a la vista y el resto
 * al desplegarla. Quien está en rojo aparece primero porque en una columna de
 * tarjetas nadie baja hasta la número catorce.
 *
 * Toda la aritmética vive en [KpisEquipoRules], que se prueba sin Android.
 */
@Composable
fun KpisEquipoScreen(vm: KpisEquipoViewModel = viewModel()) {
    val state by vm.state.collectAsState()
    val rango by vm.rango.collectAsState()
    val consulta by vm.consulta.collectAsState()

    LaunchedEffect(Unit) { vm.arrancar() }

    val datos = state.datos
    val personas = remember(datos, consulta) {
        KpisEquipoRules.ordenar(KpisEquipoRules.filtrar(datos?.personas.orEmpty(), consulta))
    }
    val totalPersonas = datos?.personas?.size ?: 0

    NxScreenScaffold(isRefreshing = state.refrescando, onRefresh = vm::refrescar) {
        LazyColumn(
            modifier = Modifier.fillMaxSize(),
            contentPadding = androidx.compose.foundation.layout.PaddingValues(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            item(key = "rango") {
                Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    MoreFilaDePastillas(
                        BoardRange.entries.map { opcion ->
                            MorePastilla(
                                etiqueta = opcion.etiqueta,
                                seleccionada = opcion == rango,
                                onClick = { vm.cambiarRango(opcion) },
                            )
                        },
                    )
                    Text(
                        vm.descripcionRango(),
                        style = MaterialTheme.typography.labelMedium,
                        color = NxColors.Muted,
                        modifier = Modifier.padding(horizontal = 2.dp),
                    )
                }
            }

            state.avisoRefresco?.let { aviso ->
                item(key = "aviso") {
                    MoreAvisoDesactualizado(aviso, onCerrar = vm::descartarAviso)
                }
            }

            if (state.cargando && !state.hayDatos) {
                item(key = "esqueleto") { NxSkeletonList(itemCount = 5, itemHeight = 104.dp) }
            }

            state.error?.takeIf { !state.hayDatos }?.let { error ->
                item(key = "error") { NxErrorBlock(error, onRetry = vm::reintentar) }
            }

            if (datos != null) {
                item(key = "equipo") { ResumenDelEquipo(datos) }

                if (totalPersonas > 6) {
                    item(key = "buscar") {
                        NxSearchField(
                            value = consulta,
                            onValueChange = vm::buscar,
                            placeholder = "Buscar a alguien del equipo",
                        )
                    }
                }

                item(key = "cabecera-personas") {
                    MoreCabecera(
                        titulo = "Persona por persona",
                        subtitulo = "De peor a mejor, para no tener que buscarlo",
                        trailing = if (consulta.isBlank()) "$totalPersonas" else "${personas.size} de $totalPersonas",
                    )
                }

                if (personas.isEmpty()) {
                    item(key = "vacio") {
                        if (consulta.isBlank()) {
                            NxEmptyState(
                                title = "Nadie en tu alcance",
                                subtitle = "En este periodo no hay personas de las que puedas ver indicadores.",
                            )
                        } else {
                            NxEmptyState(
                                title = "Sin coincidencias",
                                subtitle = "Nadie del equipo coincide con «$consulta».",
                                actionLabel = "Limpiar búsqueda",
                                onAction = { vm.buscar("") },
                            )
                        }
                    }
                } else {
                    items(personas, key = { it.persona?.id ?: it.hashCode().toLong() }) { fila ->
                        TarjetaDePersona(fila)
                    }
                }

                val supuestos = datos.supuestos.orEmpty()
                if (supuestos.isNotEmpty()) {
                    item(key = "supuestos") { Supuestos(supuestos) }
                }
            }

            item(key = "alcance") { MoreNotaDeAlcance(KpisEquipoRules.LIMITE) }
        }
    }
}

/** Cómo va el equipo entero: el semáforo, cuatro números y por qué está así. */
@Composable
private fun ResumenDelEquipo(datos: mx.nexara.mobile.nativeapp.data.api.KpisEquipoDto) {
    val semaforo = KpisEquipoRules.semaforo(datos.equipo?.semaforo)
    val motivos = datos.equipo?.motivos.orEmpty()
    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        MoreTarjeta {
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        KpisEquipoRules.alcance(datos.scope),
                        style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Bold),
                        color = NxColors.Slate,
                    )
                    Text(
                        "${datos.personas?.size ?: 0} personas en el periodo",
                        style = MaterialTheme.typography.labelMedium,
                        color = NxColors.Muted,
                    )
                }
                MoreChipSemaforo(semaforo)
            }
            if (motivos.isNotEmpty()) {
                Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                    motivos.forEach { motivo ->
                        Text("· $motivo", style = MaterialTheme.typography.bodySmall, color = NxColors.Slate)
                    }
                }
            }
        }
        MoreRejillaDeDatos(KpisEquipoRules.datosEquipo(datos))
    }
}

/**
 * Una persona. Cerrada enseña nombre, puesto, semáforo y tres números; abierta,
 * el uniforme, el tiempo extra, las jornadas sin cerrar y por qué su semáforo
 * está en ese color.
 */
@Composable
private fun TarjetaDePersona(fila: KpiPersonaFilaDto) {
    var abierta by rememberSaveable(fila.persona?.id) { mutableStateOf(false) }
    val semaforo = KpisEquipoRules.semaforo(fila.semaforo)
    val nombre = fila.persona?.nombre?.trim()?.ifEmpty { null } ?: "Sin nombre"
    val totales = fila.totales

    MoreTarjeta(onClick = { abierta = !abierta }) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            PersonAvatar(nombre, fila.persona?.avatarUrl, 40.dp)
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    nombre,
                    style = MaterialTheme.typography.bodyLarge.copy(fontWeight = FontWeight.SemiBold),
                    color = NxColors.Slate,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                )
                val subtitulo = fila.persona?.puesto?.trim()?.ifEmpty { null }
                    ?: fila.horario?.etiqueta?.trim()?.ifEmpty { null }
                if (subtitulo != null) {
                    Text(
                        subtitulo,
                        style = MaterialTheme.typography.labelMedium,
                        color = NxColors.Muted,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
            }
            MoreChipSemaforo(semaforo)
            Icon(
                if (abierta) Icons.Default.ExpandLess else Icons.Default.ExpandMore,
                contentDescription = if (abierta) "Ocultar el detalle de $nombre" else "Ver el detalle de $nombre",
                tint = NxColors.Muted,
                modifier = Modifier.size(20.dp),
            )
        }

        MoreRejillaDeDatos(KpisEquipoRules.datosPersona(totales), columnas = 3)

        AnimatedVisibility(visible = abierta) {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                DetalleLinea("Horario", fila.horario?.etiqueta ?: "Sin horario")
                DetalleLinea("Uniforme", "${KpisEquipoRules.pct(totales?.uniforme?.pct)} · ${KpisEquipoRules.uniformePie(totales)}")
                DetalleLinea("Tiempo extra", "${KpisEquipoRules.horas(totales?.minutosExtra)} · ${KpisEquipoRules.extraPie(totales)}")
                DetalleLinea("Inactividad", KpisEquipoRules.horas(totales?.minutosInactivos))
                val abiertas = totales?.jornadasAbiertas ?: 0
                val sinSalida = totales?.jornadasSinSalida ?: 0
                val automaticos = totales?.cierresAutomaticos ?: 0
                if (abiertas > 0 || sinSalida > 0 || automaticos > 0) {
                    DetalleLinea(
                        "Jornadas",
                        listOfNotNull(
                            abiertas.takeIf { it > 0 }?.let { "$it abierta${if (it == 1) "" else "s"}" },
                            sinSalida.takeIf { it > 0 }?.let { "$it sin salida" },
                            automaticos.takeIf { it > 0 }?.let { "$it cerrada${if (it == 1) "" else "s"} sola${if (it == 1) "" else "s"}" },
                        ).joinToString(" · "),
                    )
                }
                val motivos = fila.motivos.orEmpty()
                if (motivos.isNotEmpty()) {
                    Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                        Text(
                            "Por qué está en ${semaforo.etiqueta.lowercase()}",
                            style = MaterialTheme.typography.labelMedium.copy(fontWeight = FontWeight.SemiBold),
                            color = NxColors.Slate,
                        )
                        motivos.forEach { motivo ->
                            Text("· $motivo", style = MaterialTheme.typography.bodySmall, color = NxColors.Muted)
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun DetalleLinea(etiqueta: String, valor: String) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
        verticalAlignment = Alignment.Top,
    ) {
        Text(
            etiqueta,
            style = MaterialTheme.typography.labelMedium,
            color = NxColors.Muted,
            modifier = Modifier.weight(0.4f),
        )
        Text(
            valor,
            style = MaterialTheme.typography.bodySmall,
            color = NxColors.Slate,
            modifier = Modifier.weight(0.6f),
        )
    }
}

/** Lo que se dio por supuesto al contar; el API lo manda en español. */
@Composable
private fun Supuestos(supuestos: List<String>) {
    var abierto by rememberSaveable { mutableStateOf(false) }
    MoreTarjeta(onClick = { abierto = !abierto }) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Text(
                "Cómo se calculan estos números",
                style = MaterialTheme.typography.bodyMedium.copy(fontWeight = FontWeight.SemiBold),
                color = NxColors.Slate,
                modifier = Modifier.weight(1f),
            )
            Icon(
                if (abierto) Icons.Default.ExpandLess else Icons.Default.ExpandMore,
                contentDescription = if (abierto) "Ocultar los supuestos" else "Ver los supuestos",
                tint = NxColors.Muted,
                modifier = Modifier.size(20.dp),
            )
        }
        AnimatedVisibility(visible = abierto) {
            Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                supuestos.forEach { texto ->
                    Text("· $texto", style = MaterialTheme.typography.bodySmall, color = NxColors.Muted)
                }
            }
        }
    }
}
