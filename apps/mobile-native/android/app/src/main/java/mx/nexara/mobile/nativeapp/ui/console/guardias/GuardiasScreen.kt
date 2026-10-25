package mx.nexara.mobile.nativeapp.ui.console.guardias

import android.app.Activity
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowRight
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.core.view.WindowCompat
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.launch
import mx.nexara.mobile.nativeapp.data.api.GuardiaDto
import mx.nexara.mobile.nativeapp.data.api.GuardiasRangoDto
import mx.nexara.mobile.nativeapp.data.api.PersonaGuardiaDto
import mx.nexara.mobile.nativeapp.data.api.toUserMessage
import mx.nexara.mobile.nativeapp.data.console.GuardiasRepository
import mx.nexara.mobile.nativeapp.ui.enterprise.NxColors

private val Linea = Color(0xFFE2E8F0)
private const val NOTA_MAX = 300

/** Renglón de Asistencias que abre esta pantalla. */
@Composable
fun GuardiasEntrada(onClick: () -> Unit) {
    Column(Modifier.fillMaxWidth().background(NxColors.Surface)) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .clickable(role = Role.Button, onClick = onClick)
                .padding(horizontal = 16.dp, vertical = 14.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                "Guardias",
                modifier = Modifier.weight(1f),
                color = NxColors.Slate,
                fontSize = 16.sp,
                fontWeight = FontWeight.SemiBold,
            )
            Icon(
                Icons.AutoMirrored.Filled.KeyboardArrowRight,
                contentDescription = null,
                tint = NxColors.Muted,
            )
        }
        HorizontalDivider(color = Linea)
    }
}

/**
 * Programar guardias de sábado y domingo.
 *
 * La barra es de esta pantalla (clara, con volver): el shell de Asistencias
 * sigue con la suya. Las personas salen de `GET /guardias`.
 */
@Composable
fun GuardiasScreen(onBack: () -> Unit) {
    val context = LocalContext.current
    val repo = remember(context) { GuardiasRepository(context) }
    val scope = rememberCoroutineScope()
    var datos by remember { mutableStateOf<GuardiasRangoDto?>(null) }
    var cargando by remember { mutableStateOf(true) }
    var error by remember { mutableStateOf<String?>(null) }
    var personaId by remember { mutableStateOf<Long?>(null) }
    var fecha by remember { mutableStateOf("") }
    var nota by remember { mutableStateOf("") }
    var guardando by remember { mutableStateOf(false) }
    var errorForm by remember { mutableStateOf<String?>(null) }
    var aviso by remember { mutableStateOf<String?>(null) }
    var quitar by remember { mutableStateOf<GuardiaDto?>(null) }
    var quitando by remember { mutableStateOf(false) }
    var eligiendo by remember { mutableStateOf<String?>(null) }

    fun cargar() {
        scope.launch {
            if (datos == null) cargando = true
            error = null
            try {
                datos = repo.listar()
            } catch (e: Exception) {
                if (e is CancellationException) throw e
                error = e.toUserMessage(GuardiasTextos.ERROR_CARGA)
            } finally {
                cargando = false
            }
        }
    }

    LaunchedEffect(Unit) { cargar() }

    val rango = datos
    val dias = if (rango == null) emptyList() else GuardiasFechas.diasProgramables(rango.desde, rango.hasta, rango.hoy)
    val fines = if (rango == null) emptyList() else GuardiasFechas.finesDeSemana(rango.desde, rango.hasta)
    LaunchedEffect(rango?.personas, dias) {
        if (personaId != null && rango?.personas?.none { it.id == personaId } == true) personaId = null
        if (fecha.isNotEmpty() && fecha !in dias) fecha = ""
    }

    IconosDeBarraClara()

    Column(Modifier.fillMaxSize().background(Color.White)) {
        BarraClara(onBack = onBack)
        Box(
            Modifier
                .weight(1f)
                .fillMaxWidth()
                .background(NxColors.Surface),
        ) {
            when {
                cargando && rango == null -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator(color = NxColors.Brand, modifier = Modifier.size(28.dp))
                }
                error != null && rango == null -> Frase(
                    texto = error ?: GuardiasTextos.ERROR_CARGA,
                    accion = "Reintentar",
                    onAccion = { cargar() },
                )
                rango != null && GuardiasFechas.mostrarVacio(rango.puedeProgramar, rango.items.size) ->
                    Frase(texto = GuardiasTextos.VACIO)
                rango != null -> LazyColumn(Modifier.fillMaxSize()) {
                    if (error != null) {
                        item(key = "error") {
                            Frase(
                                texto = error ?: GuardiasTextos.ERROR_CARGA,
                                accion = "Reintentar",
                                onAccion = { cargar() },
                                centrada = false,
                            )
                        }
                    }
                    if (rango.puedeProgramar) {
                        item(key = "form") {
                            Formulario(
                                personas = rango.personas,
                                dias = dias,
                                personaId = personaId,
                                fecha = fecha,
                                nota = nota,
                                guardando = guardando,
                                error = errorForm,
                                aviso = aviso,
                                onNota = { nota = it.take(NOTA_MAX) },
                                onElegir = { eligiendo = it },
                                onProgramar = programar@{
                                    val id = personaId ?: return@programar
                                    if (fecha.isBlank() || guardando) return@programar
                                    scope.launch {
                                        guardando = true
                                        errorForm = null
                                        aviso = null
                                        try {
                                            val enCola = repo.programar(id, fecha, nota)
                                            personaId = null
                                            nota = ""
                                            if (enCola) aviso = GuardiasTextos.EN_COLA else cargar()
                                        } catch (e: Exception) {
                                            if (e is CancellationException) throw e
                                            errorForm = e.toUserMessage(GuardiasTextos.ERROR_PROGRAMAR)
                                        } finally {
                                            guardando = false
                                        }
                                    }
                                },
                            )
                        }
                    }
                    items(fines, key = { (it.sabado ?: it.domingo).orEmpty() }) { fin ->
                        FinBloque(
                            fin = fin,
                            items = rango.items,
                            hoy = rango.hoy,
                            puedeProgramar = rango.puedeProgramar,
                            onDia = { dia ->
                                if (rango.puedeProgramar && dia >= rango.hoy) {
                                    fecha = dia
                                    errorForm = null
                                }
                            },
                            onQuitar = { quitar = it },
                        )
                    }
                    item { Spacer(Modifier.height(24.dp)) }
                }
            }
        }
    }

    val modo = eligiendo
    if (modo != null && rango != null) {
        val opciones = if (modo == "persona") {
            rango.personas.map { it.id.toString() to etiquetaPersona(it) }
        } else {
            dias.map { it to GuardiasFechas.diaCorto(it) }
        }
        Selector(
            titulo = if (modo == "persona") "Persona" else "Día",
            opciones = opciones,
            onElegir = { valor ->
                if (modo == "persona") personaId = valor.toLongOrNull() else fecha = valor
                errorForm = null
                aviso = null
                eligiendo = null
            },
            onCerrar = { eligiendo = null },
        )
    }

    val pendiente = quitar
    if (pendiente != null) {
        val nombre = pendiente.persona?.nombre?.takeIf { it.isNotBlank() } ?: "Esta persona"
        AlertDialog(
            onDismissRequest = { if (!quitando) quitar = null },
            title = { Text("Quitar guardia") },
            text = { Text(GuardiasTextos.confirmarQuitar(nombre, GuardiasFechas.diaCorto(pendiente.fecha))) },
            confirmButton = {
                TextButton(
                    enabled = !quitando,
                    onClick = {
                        scope.launch {
                            quitando = true
                            try {
                                val enCola = repo.quitar(pendiente.id)
                                quitar = null
                                if (enCola) aviso = GuardiasTextos.EN_COLA else cargar()
                            } catch (e: Exception) {
                                if (e is CancellationException) throw e
                                error = e.toUserMessage(GuardiasTextos.ERROR_QUITAR)
                                quitar = null
                            } finally {
                                quitando = false
                            }
                        }
                    },
                ) { Text("Quitar", color = NxColors.Danger) }
            },
            dismissButton = {
                TextButton(enabled = !quitando, onClick = { quitar = null }) { Text("Cancelar") }
            },
        )
    }
}

@Composable
private fun IconosDeBarraClara() {
    val view = LocalView.current
    if (view.isInEditMode) return
    DisposableEffect(view) {
        val window = (view.context as? Activity)?.window
        val controller = window?.let { WindowCompat.getInsetsController(it, view) }
        val antes = controller?.isAppearanceLightStatusBars
        controller?.isAppearanceLightStatusBars = true
        onDispose {
            if (controller != null && antes != null) controller.isAppearanceLightStatusBars = antes
        }
    }
}

@Composable
private fun BarraClara(onBack: () -> Unit) {
    Column(Modifier.background(Color.White)) {
        Row(
            Modifier.fillMaxWidth().height(56.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            IconButton(onClick = onBack) {
                Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Volver", tint = NxColors.Slate)
            }
            Text(
                "Guardias",
                color = NxColors.Slate,
                fontSize = 17.sp,
                fontWeight = FontWeight.SemiBold,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
        HorizontalDivider(color = Linea)
    }
}

@Composable
private fun Frase(
    texto: String,
    accion: String? = null,
    onAccion: (() -> Unit)? = null,
    centrada: Boolean = true,
) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .then(
                if (centrada) Modifier.fillMaxSize().padding(horizontal = 28.dp)
                else Modifier.padding(horizontal = 20.dp, vertical = 16.dp),
            ),
        horizontalAlignment = if (centrada) Alignment.CenterHorizontally else Alignment.Start,
        verticalArrangement = if (centrada) Arrangement.Center else Arrangement.spacedBy(4.dp),
    ) {
        Text(
            texto,
            color = NxColors.Slate,
            fontSize = 16.sp,
            textAlign = if (centrada) TextAlign.Center else TextAlign.Start,
        )
        if (accion != null && onAccion != null) {
            TextButton(onClick = onAccion) { Text(accion, color = NxColors.Brand, fontWeight = FontWeight.SemiBold) }
        }
    }
}

@Composable
private fun Formulario(
    personas: List<PersonaGuardiaDto>,
    dias: List<String>,
    personaId: Long?,
    fecha: String,
    nota: String,
    guardando: Boolean,
    error: String?,
    aviso: String?,
    onNota: (String) -> Unit,
    onElegir: (String) -> Unit,
    onProgramar: () -> Unit,
) {
    val persona = personas.firstOrNull { it.id == personaId }
    Column(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp)) {
        Campo(etiqueta = "Persona", valor = persona?.let { etiquetaPersona(it) }.orEmpty(), vacio = "Elige a quién") {
            onElegir("persona")
        }
        Campo(
            etiqueta = "Día",
            valor = if (fecha.isBlank()) "" else GuardiasFechas.diaCorto(fecha),
            vacio = "Sábado o domingo",
        ) { onElegir("dia") }
        CampoNota(nota = nota, onNota = onNota)
        if (!error.isNullOrBlank()) {
            Text(error, color = NxColors.Danger, fontSize = 14.sp, modifier = Modifier.padding(top = 8.dp))
        }
        if (!aviso.isNullOrBlank()) {
            Text(aviso, color = NxColors.Muted, fontSize = 14.sp, modifier = Modifier.padding(top = 8.dp))
        }
        Spacer(Modifier.height(14.dp))
        Button(
            onClick = onProgramar,
            enabled = personaId != null && fecha.isNotBlank() && !guardando && dias.isNotEmpty(),
            modifier = Modifier.fillMaxWidth().height(52.dp),
            shape = RoundedCornerShape(12.dp),
            colors = ButtonDefaults.buttonColors(containerColor = NxColors.Brand, contentColor = Color.White),
        ) {
            if (guardando) {
                CircularProgressIndicator(color = Color.White, modifier = Modifier.size(18.dp), strokeWidth = 2.dp)
            } else {
                Text("Programar", fontWeight = FontWeight.SemiBold)
            }
        }
        HorizontalDivider(color = Linea, modifier = Modifier.padding(top = 18.dp))
    }
}

@Composable
private fun Campo(etiqueta: String, valor: String, vacio: String, onClick: () -> Unit) {
    Column(
        Modifier
            .fillMaxWidth()
            .clickable(role = Role.Button, onClick = onClick)
            .padding(vertical = 10.dp),
    ) {
        Text(etiqueta, color = NxColors.Muted, fontSize = 12.sp)
        Spacer(Modifier.height(2.dp))
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(
                if (valor.isBlank()) vacio else valor,
                modifier = Modifier.weight(1f),
                color = if (valor.isBlank()) NxColors.Muted else NxColors.Slate,
                fontSize = 16.sp,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            Icon(Icons.AutoMirrored.Filled.KeyboardArrowRight, contentDescription = null, tint = NxColors.Muted)
        }
    }
    HorizontalDivider(color = Linea)
}

@Composable
private fun CampoNota(nota: String, onNota: (String) -> Unit) {
    Column(Modifier.fillMaxWidth().padding(vertical = 10.dp)) {
        Text("Nota", color = NxColors.Muted, fontSize = 12.sp)
        Spacer(Modifier.height(2.dp))
        androidx.compose.foundation.text.BasicTextField(
            value = nota,
            onValueChange = onNota,
            singleLine = true,
            textStyle = androidx.compose.ui.text.TextStyle(color = NxColors.Slate, fontSize = 16.sp),
            modifier = Modifier.fillMaxWidth(),
            decorationBox = { inner ->
                Box {
                    if (nota.isEmpty()) Text("Opcional", color = NxColors.Muted, fontSize = 16.sp)
                    inner()
                }
            },
        )
    }
    HorizontalDivider(color = Linea)
}

@Composable
private fun FinBloque(
    fin: FinDeSemana,
    items: List<GuardiaDto>,
    hoy: String,
    puedeProgramar: Boolean,
    onDia: (String) -> Unit,
    onQuitar: (GuardiaDto) -> Unit,
) {
    val dias = listOfNotNull(fin.sabado, fin.domingo)
    if (!puedeProgramar && dias.none { d -> items.any { it.fecha == d } }) return
    Column(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp)) {
        Text(
            GuardiasFechas.tituloFin(fin),
            color = NxColors.Muted,
            fontSize = 13.sp,
            fontWeight = FontWeight.SemiBold,
            modifier = Modifier.padding(bottom = 4.dp),
        )
        for (dia in dias) {
            val lista = items.filter { it.fecha == dia }
            if (!puedeProgramar && lista.isEmpty()) continue
            Row(
                Modifier
                    .fillMaxWidth()
                    .clickable(enabled = puedeProgramar && dia >= hoy, onClick = { onDia(dia) })
                    .padding(vertical = 8.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    GuardiasFechas.diaCorto(dia),
                    modifier = Modifier.width(92.dp),
                    color = NxColors.Slate,
                    fontWeight = FontWeight.SemiBold,
                    fontSize = 15.sp,
                )
                if (lista.isEmpty()) {
                    Text(GuardiasTextos.NADIE, color = NxColors.Muted, fontSize = 15.sp)
                }
            }
            for (g in lista) {
                Row(
                    Modifier.fillMaxWidth().padding(start = 92.dp, bottom = 8.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Column(Modifier.weight(1f)) {
                        Text(
                            g.persona?.nombre?.takeIf { it.isNotBlank() } ?: "Persona",
                            color = NxColors.Slate,
                            fontSize = 16.sp,
                            fontWeight = FontWeight.Medium,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                        val nota = g.nota?.trim().orEmpty()
                        if (nota.isNotEmpty()) {
                            Text(nota, color = NxColors.Muted, fontSize = 13.sp, maxLines = 2, overflow = TextOverflow.Ellipsis)
                        }
                    }
                    if (g.puedeQuitar) {
                        TextButton(onClick = { onQuitar(g) }) {
                            Text("Quitar", color = NxColors.Danger, fontWeight = FontWeight.SemiBold)
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun Selector(
    titulo: String,
    opciones: List<Pair<String, String>>,
    onElegir: (String) -> Unit,
    onCerrar: () -> Unit,
) {
    Dialog(onDismissRequest = onCerrar) {
        Surface(shape = RoundedCornerShape(16.dp), color = Color.White) {
            Column {
                Text(
                    titulo,
                    modifier = Modifier.padding(horizontal = 20.dp, vertical = 16.dp),
                    color = NxColors.Slate,
                    fontWeight = FontWeight.SemiBold,
                    fontSize = 17.sp,
                )
                HorizontalDivider(color = Linea)
                if (opciones.isEmpty()) {
                    Text(
                        if (titulo == "Día") "No hay sábado ni domingo por programar." else "No hay personas.",
                        modifier = Modifier.padding(20.dp),
                        color = NxColors.Muted,
                    )
                } else {
                    Column(
                        Modifier
                            .heightIn(max = 420.dp)
                            .verticalScroll(rememberScrollState()),
                    ) {
                        for ((id, etiqueta) in opciones) {
                            Text(
                                etiqueta,
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .clickable { onElegir(id) }
                                    .padding(horizontal = 20.dp, vertical = 14.dp),
                                color = NxColors.Slate,
                                fontSize = 16.sp,
                            )
                        }
                    }
                }
            }
        }
    }
}

private fun etiquetaPersona(p: PersonaGuardiaDto): String {
    val nombre = p.nombre?.trim().orEmpty().ifBlank { "Persona" }
    val puesto = p.puesto?.trim().orEmpty()
    return if (puesto.isEmpty()) nombre else "$nombre · $puesto"
}
