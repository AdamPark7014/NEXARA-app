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
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import mx.nexara.mobile.nativeapp.data.api.KpiPersonaFilaDto
import mx.nexara.mobile.nativeapp.data.api.KpiTotalesDto
import mx.nexara.mobile.nativeapp.ui.console.activities.BoardRange
import mx.nexara.mobile.nativeapp.ui.console.activities.PersonAvatar
import mx.nexara.mobile.nativeapp.ui.enterprise.NxColors
import mx.nexara.mobile.nativeapp.ui.enterprise.NxEmptyState
import mx.nexara.mobile.nativeapp.ui.enterprise.NxErrorBlock
import mx.nexara.mobile.nativeapp.ui.enterprise.NxSearchField
import mx.nexara.mobile.nativeapp.ui.enterprise.NxScreenScaffold
import mx.nexara.mobile.nativeapp.ui.enterprise.NxSkeletonList

/**
 * Desempeño del equipo (`/erp/asistencias/indicadores`) en el teléfono, con el índice v2.
 *
 * La web pone una banda con el índice del equipo, una tabla por persona con los cuatro
 * pilares y la lectura de quien se elija. Aquí, arriba, la banda en datos (índice del
 * equipo, entregas a tiempo, tiempo en actividades y extra por decidir); abajo, una
 * tarjeta por persona con su semáforo, tres números a la vista (índice, entregas y
 * disciplina) y, al desplegarla, la lectura: horas estándar ganadas, calificación,
 * disciplina, «Su equipo» si coordina, de qué sale el índice pilar por pilar y el
 * diagnóstico aparte. El orden es el de la web: el índice más alto arriba. Con una API
 * que aún no manda el índice, todo queda como antes (de peor a mejor).
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
                        subtitulo = KpisEquipoRules.subtituloLista(datos.personas.orEmpty()),
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

                if (datos.personas.orEmpty().any { KpisEquipoRules.conCumplimiento(it.totales) }) {
                    item(key = "nota-indice") { MoreNotaDeAlcance(KpisEquipoRules.NOTA_INDICE) }
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
 * Una persona. Cerrada enseña nombre, puesto y confianza, semáforo y tres números;
 * abierta, la lectura de la web (resumen, horas estándar ganadas, calificación,
 * disciplina, «Su equipo»), de qué sale su índice pilar por pilar, el diagnóstico que
 * no pesa, el tiempo extra, las jornadas sin cerrar y por qué su semáforo está en ese
 * color.
 */
@Composable
private fun TarjetaDePersona(fila: KpiPersonaFilaDto) {
    var abierta by rememberSaveable(fila.persona?.id) { mutableStateOf(false) }
    val semaforo = KpisEquipoRules.semaforo(fila.semaforo)
    val nombre = fila.persona?.nombre?.trim()?.ifEmpty { null } ?: "Sin nombre"
    val totales = fila.totales
    val conIndice = KpisEquipoRules.conCumplimiento(totales)

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
                val subtitulo = KpisEquipoRules.subtituloPersona(fila)
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

        MoreRejillaDeDatos(KpisEquipoRules.datosPersona(fila), columnas = 3)

        AnimatedVisibility(visible = abierta) {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                if (conIndice) {
                    Text(KpisEquipoRules.resumen(totales), style = MaterialTheme.typography.bodySmall, color = NxColors.Slate)
                }
                // Con la API vieja viene vacía: esos números siguen en la tarjeta.
                KpisEquipoRules.lineasDesplegadas(totales).forEach { linea ->
                    DetalleLinea(linea.etiqueta, linea.valor)
                }
                if (conIndice) {
                    PilaresDelIndice(totales)
                    Diagnostico(KpisEquipoRules.diagnostico(totales))
                }
                DetalleLinea("Horario", fila.horario?.etiqueta ?: "Sin horario")
                if (!conIndice) {
                    // Con índice, el uniforme ya va en la lectura.
                    DetalleLinea("Uniforme", "${KpisEquipoRules.pct(totales?.uniforme?.pct)} · ${KpisEquipoRules.uniformePie(totales)}")
                }
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

/**
 * «De qué sale el 86»: los cuatro pilares, cada uno con su número, su barra y las partes
 * que lo forman con lo que pesan. Un pilar sin dato no pesa y lo dice.
 */
@Composable
private fun PilaresDelIndice(totales: KpiTotalesDto?) {
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text(
            KpisEquipoRules.tituloPilares(totales),
            style = MaterialTheme.typography.labelMedium.copy(fontWeight = FontWeight.SemiBold),
            color = NxColors.Slate,
        )
        KpisEquipoRules.pilares(totales).forEach { pilar ->
            Column(
                verticalArrangement = Arrangement.spacedBy(4.dp),
                modifier = Modifier.semantics(mergeDescendants = true) {},
            ) {
                Row(modifier = Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        pilar.etiqueta,
                        style = MaterialTheme.typography.bodySmall.copy(fontWeight = FontWeight.SemiBold),
                        color = NxColors.Slate,
                        modifier = Modifier.weight(1f),
                    )
                    Text(
                        pilar.pct?.toString() ?: "—",
                        style = MaterialTheme.typography.bodySmall.copy(fontWeight = FontWeight.Bold),
                        color = NxColors.Slate,
                    )
                }
                MoreBarra(
                    progreso = pilar.pct?.let { it / 100f },
                    etiqueta = KpisEquipoRules.partesDelPilar(pilar),
                    tono = pilar.tono.tono(),
                )
            }
        }
    }
}

/** El diagnóstico (peso 0): se lee, pero no pesa en el índice ni lo multiplica. */
@Composable
private fun Diagnostico(lineas: List<KpisEquipoRules.Linea>) {
    if (lineas.isEmpty()) return
    Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
        Text(
            "No pesa, para leer",
            style = MaterialTheme.typography.labelMedium.copy(fontWeight = FontWeight.SemiBold),
            color = NxColors.Slate,
        )
        lineas.forEach { linea ->
            Text("· ${linea.etiqueta}: ${linea.valor}", style = MaterialTheme.typography.bodySmall, color = NxColors.Muted)
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
