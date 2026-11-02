package mx.nexara.mobile.nativeapp.ui.console.activities

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material.icons.outlined.Add
import androidx.compose.material.icons.outlined.Close
import androidx.compose.material.icons.outlined.Remove
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.pointer.PointerEventPass
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import java.time.DayOfWeek
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.util.UUID
import kotlin.math.ceil
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import mx.nexara.mobile.nativeapp.data.SessionUser
import mx.nexara.mobile.nativeapp.data.api.AplicarFormatoRequest
import mx.nexara.mobile.nativeapp.data.api.FormatoActividadDto
import mx.nexara.mobile.nativeapp.data.api.ProcesoTiempoRequest
import mx.nexara.mobile.nativeapp.data.api.RenglonAplicarDto
import mx.nexara.mobile.nativeapp.data.api.RenglonFormatoDto
import mx.nexara.mobile.nativeapp.data.api.ResultadoAplicarDto
import mx.nexara.mobile.nativeapp.data.api.SalesClientDto
import mx.nexara.mobile.nativeapp.data.api.VisibleUserDto
import mx.nexara.mobile.nativeapp.data.api.toUserMessage
import mx.nexara.mobile.nativeapp.data.console.ConsoleRepository
import mx.nexara.mobile.nativeapp.data.console.CoreActivitiesRepository
import mx.nexara.mobile.nativeapp.ui.enterprise.NxTheme

/** Reglas de los formatos en la app, espejo de `lib/formatos-actividad.ts` en la web. */
object FormatosRules {
    /** Con 3 días laborales de cronómetro para comparar: viernes 06-11 a las 6:00 de México. */
    private val VISIBLES_DESDE_MS = Instant.parse("2026-11-06T12:00:00Z").toEpochMilli()

    private val ROLES = setOf(
        "ceo", "dir_admin", "dir_operaciones", "arquitecto", "coord_operaciones", "coord_admin", "enc_soporte",
    )

    /** Solo decide si se enseña el acceso; quien manda es la API. */
    fun visible(user: SessionUser?, ahoraMs: Long = System.currentTimeMillis()): Boolean {
        if (ahoraMs < VISIBLES_DESDE_MS || user == null) return false
        return user.isSuperAdmin || "activities.manage" in user.permissions || user.roleKey in ROLES
    }

    fun minutos(r: RenglonFormatoDto, cantidad: Int): Int =
        (r.minutosBase + r.minutosPorUnidad * cantidad.coerceAtLeast(0)).coerceAtLeast(5)

    /** Una jornada de 10 a 18 con una hora de comida. */
    fun jornadas(totalMin: Int): Int = ceil(totalMin / 420.0).toInt().coerceAtLeast(1)

    fun duracion(min: Int): String {
        val h = min / 60
        val m = min % 60
        return when {
            h == 0 -> "$m min"
            m == 0 -> "$h h"
            else -> "$h h $m min"
        }
    }

    fun total(totalMin: Int): String {
        val j = jornadas(totalMin)
        return "Total ${duracion(totalMin)} · cabe en $j ${if (j == 1) "jornada" else "jornadas"}"
    }

    fun evidencia(r: RenglonFormatoDto): String =
        r.puntos.map { it.nombre }.filter { it.isNotBlank() }.joinToString(", ").ifBlank { "${r.fotos} fotos" }

    /** Mañana, o el lunes si mañana cae en fin de semana. */
    fun siguienteDiaLaboral(hoy: LocalDate): LocalDate {
        var d = hoy.plusDays(1)
        while (d.dayOfWeek == DayOfWeek.SATURDAY || d.dayOfWeek == DayOfWeek.SUNDAY) d = d.plusDays(1)
        return d
    }

    fun faltante(responsableId: Long?, clienteId: Long?, renglones: List<RenglonEditable>): String? = when {
        renglones.isEmpty() -> "Deja al menos una actividad"
        renglones.any { it.titulo.isBlank() } -> "A una actividad le falta el título"
        renglones.any { it.base.coreKind == "servicio" } && clienteId == null -> "Elige el cliente: lleva actividades de servicio"
        responsableId == null -> "Elige quién la lleva"
        else -> null
    }

    fun etiqueta(n: Int): String = if (n == 1) "Asignar 1 actividad" else "Asignar $n actividades"
}

/** Un renglón en pantalla: lo que se edita al asignar no cambia el formato. */
data class RenglonEditable(
    val base: RenglonFormatoDto,
    val titulo: String,
    val minutos: Int,
    val minutosEditado: Boolean = false,
)

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun FormatosScreen(onBack: () -> Unit, onOpenActivity: (Long) -> Unit) {
    val context = LocalContext.current
    val repo = remember(context) { CoreActivitiesRepository(context) }
    val consola = remember(context) { ConsoleRepository(context) }
    val scope = rememberCoroutineScope()
    val c = NxTheme.colors
    val zona = remember { ZoneId.of("America/Mexico_City") }

    var formatos by remember { mutableStateOf<List<FormatoActividadDto>?>(null) }
    var error by remember { mutableStateOf<String?>(null) }
    var personas by remember { mutableStateOf<List<VisibleUserDto>>(emptyList()) }
    var clientes by remember { mutableStateOf<List<SalesClientDto>>(emptyList()) }

    var elegido by remember { mutableStateOf<FormatoActividadDto?>(null) }
    var cantidad by remember { mutableIntStateOf(1) }
    var renglones by remember { mutableStateOf<List<RenglonEditable>>(emptyList()) }
    var cliente by remember { mutableStateOf<SalesClientDto?>(null) }
    var clienteServicioId by remember { mutableStateOf<Long?>(null) }
    var buscaCliente by remember { mutableStateOf("") }
    var sucursal by remember { mutableStateOf("") }
    var responsable by remember { mutableStateOf<VisibleUserDto?>(null) }
    var fecha by remember { mutableStateOf(FormatosRules.siguienteDiaLaboral(LocalDate.now(zona))) }
    var abreQuien by remember { mutableStateOf(false) }
    var intento by remember { mutableStateOf(false) }
    var enviando by remember { mutableStateOf(false) }
    var resultado by remember { mutableStateOf<ResultadoAplicarDto?>(null) }
    var clave by remember { mutableStateOf(UUID.randomUUID().toString()) }

    var inicioMs by remember { mutableLongStateOf(0L) }
    var toques by remember { mutableIntStateOf(0) }
    var segundos by remember { mutableIntStateOf(0) }

    fun elegir(f: FormatoActividadDto) {
        val n = if (f.receta.unidad != null) f.receta.cantidadPorOmision else 1
        elegido = f
        cantidad = n
        renglones = f.receta.renglones.map { RenglonEditable(it, it.titulo, FormatosRules.minutos(it, n)) }
    }

    LaunchedEffect(Unit) {
        try {
            val lista = withContext(Dispatchers.IO) { repo.formatosActividad() }
            formatos = lista
            lista.firstOrNull()?.let { elegir(it) }
            personas = withContext(Dispatchers.IO) { runCatching { consola.usersFetch() }.getOrDefault(emptyList()) }
            clientes = withContext(Dispatchers.IO) { runCatching { repo.salesClientsTodos() }.getOrDefault(emptyList()) }
        } catch (e: Exception) {
            error = e.toUserMessage("No se pudieron cargar los formatos")
        }
    }

    fun cambiarCantidad(n: Int) {
        cantidad = n.coerceIn(1, 200)
        renglones = renglones.map {
            if (it.minutosEditado) it else it.copy(minutos = FormatosRules.minutos(it.base, cantidad))
        }
    }

    val total = renglones.sumOf { it.minutos }
    val faltante = FormatosRules.faltante(responsable?.id, clienteServicioId, renglones)

    fun asignar() {
        val f = elegido ?: return
        intento = true
        val quien = responsable?.id
        if (faltante != null || quien == null) return
        enviando = true
        error = null
        scope.launch {
            try {
                val r = withContext(Dispatchers.IO) {
                    repo.aplicarFormato(
                        f.id,
                        AplicarFormatoRequest(
                            clave = clave,
                            responsableId = quien,
                            fecha = fecha.toString(),
                            clientId = clienteServicioId,
                            sucursal = sucursal.trim().ifBlank { null },
                            renglones = renglones.map {
                                RenglonAplicarDto(
                                    titulo = it.titulo.trim(),
                                    coreKind = it.base.coreKind,
                                    tipo = it.base.tipo,
                                    minutos = it.minutos.coerceAtLeast(5),
                                    minutosBase = it.base.minutosBase,
                                    minutosPorUnidad = it.base.minutosPorUnidad,
                                    fotos = it.base.fotos,
                                    indicaciones = it.base.indicaciones,
                                    puntos = it.base.puntos,
                                    herramientas = it.base.herramientas,
                                )
                            },
                        ),
                    )
                }
                resultado = r
                val ms = if (inicioMs > 0) System.currentTimeMillis() - inicioMs else 0L
                segundos = (ms / 1000).toInt()
                if (r.actividades.isNotEmpty()) {
                    withContext(Dispatchers.IO) {
                        repo.registrarTiempo(
                            ProcesoTiempoRequest(
                                proceso = "asignar_formato",
                                duracionMs = ms,
                                clics = toques,
                                entidadId = r.actividades.first().id,
                                detalle = "${r.actividades.size} actividades · app",
                            ),
                        )
                    }
                }
            } catch (e: Exception) {
                error = e.toUserMessage("No se pudo asignar")
            } finally {
                enviando = false
            }
        }
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(c.surface)
            .pointerInput(Unit) {
                awaitEachGesture {
                    awaitFirstDown(requireUnconsumed = false, pass = PointerEventPass.Initial)
                    toques += 1
                    if (inicioMs == 0L) inicioMs = System.currentTimeMillis()
                }
            },
    ) {
        Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(horizontal = 4.dp, vertical = 4.dp)) {
            IconButton(onClick = onBack) {
                Icon(Icons.AutoMirrored.Outlined.ArrowBack, contentDescription = "Volver", tint = c.fg)
            }
            Text("Asignar con un formato", fontSize = 18.sp, fontWeight = FontWeight.Bold, color = c.fg)
        }
        Column(
            modifier = Modifier
                .weight(1f)
                .fillMaxWidth()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 16.dp, vertical = 8.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            error?.let { Text(it, fontSize = 13.sp, color = c.danger) }
            val lista = formatos
            if (lista == null && error == null) Text("Cargando formatos…", fontSize = 13.sp, color = c.muted)
            if (lista != null) {
                FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    lista.forEach { f ->
                        FilterChip(
                            selected = f.id == elegido?.id,
                            onClick = { elegir(f) },
                            enabled = resultado == null,
                            label = { Text(f.nombre) },
                        )
                    }
                }
            }
            elegido?.let { f ->
                Etiqueta("Cliente${if (renglones.any { it.base.coreKind == "servicio" }) " *" else ""}")
                if (cliente != null) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(cliente?.name.orEmpty(), fontSize = 14.sp, color = c.fg, modifier = Modifier.weight(1f))
                        IconButton(onClick = {
                            cliente = null
                            clienteServicioId = null
                        }) {
                            Icon(Icons.Outlined.Close, contentDescription = "Quitar cliente", tint = c.muted)
                        }
                    }
                } else {
                    OutlinedTextField(
                        value = buscaCliente,
                        onValueChange = { buscaCliente = it },
                        placeholder = { Text("Buscar cliente") },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth(),
                    )
                    val texto = buscaCliente.trim().lowercase()
                    if (texto.length >= 2) {
                        clientes.filter { it.name.orEmpty().lowercase().contains(texto) }.take(5).forEach { op ->
                            Text(
                                op.name.orEmpty(),
                                fontSize = 14.sp,
                                color = c.fg,
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .clickable {
                                        cliente = op
                                        buscaCliente = ""
                                        clienteServicioId = op.serviceClientId
                                        if (op.serviceClientId == null) {
                                            scope.launch {
                                                clienteServicioId = withContext(Dispatchers.IO) {
                                                    runCatching { repo.provisionServiceClient(op.id) }.getOrNull()
                                                }
                                            }
                                        }
                                    }
                                    .padding(vertical = 8.dp),
                            )
                        }
                    }
                }
                OutlinedTextField(
                    value = sucursal,
                    onValueChange = { sucursal = it.take(160) },
                    label = { Text("Sucursal (opcional)") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                )
                Etiqueta("Quién *")
                Column {
                    OutlinedButton(
                        onClick = { abreQuien = true },
                        modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp),
                        shape = RoundedCornerShape(12.dp),
                    ) {
                        Text(responsable?.nombre ?: "Elige a la persona", color = c.fg)
                    }
                    DropdownMenu(expanded = abreQuien, onDismissRequest = { abreQuien = false }) {
                        personas.forEach { p ->
                            DropdownMenuItem(text = { Text(p.nombre) }, onClick = {
                                responsable = p
                                abreQuien = false
                            })
                        }
                    }
                }
                if (intento && responsable == null) Text("Elige quién la lleva", fontSize = 12.sp, color = c.danger)
                Etiqueta("Cuándo")
                val hoy = LocalDate.now(zona)
                val manana = FormatosRules.siguienteDiaLaboral(hoy)
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    FilterChip(selected = fecha == manana, onClick = { fecha = manana }, label = { Text("Siguiente día") })
                    FilterChip(selected = fecha == hoy, onClick = { fecha = hoy }, label = { Text("Hoy") })
                    val otro = FormatosRules.siguienteDiaLaboral(manana)
                    FilterChip(selected = fecha == otro, onClick = { fecha = otro }, label = { Text("$otro".takeLast(5)) })
                }
                f.receta.unidad?.let { unidad ->
                    Etiqueta(unidad)
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        OutlinedButton(onClick = { cambiarCantidad(cantidad - 1) }, enabled = cantidad > 1) {
                            Icon(Icons.Outlined.Remove, contentDescription = "Menos")
                        }
                        Text("$cantidad", fontSize = 16.sp, fontWeight = FontWeight.SemiBold, color = c.fg)
                        OutlinedButton(onClick = { cambiarCantidad(cantidad + 1) }) {
                            Icon(Icons.Outlined.Add, contentDescription = "Más")
                        }
                    }
                }
                renglones.forEachIndexed { i, r ->
                    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                            OutlinedTextField(
                                value = r.titulo,
                                onValueChange = { v ->
                                    renglones = renglones.mapIndexed { j, x -> if (j == i) x.copy(titulo = v) else x }
                                },
                                isError = intento && r.titulo.isBlank(),
                                modifier = Modifier.weight(1f),
                            )
                            OutlinedTextField(
                                value = "${r.minutos}",
                                onValueChange = { v ->
                                    val m = v.filter { it.isDigit() }.take(4).toIntOrNull() ?: 0
                                    renglones = renglones.mapIndexed { j, x ->
                                        if (j == i) x.copy(minutos = m, minutosEditado = true) else x
                                    }
                                },
                                singleLine = true,
                                suffix = { Text("min", fontSize = 11.sp) },
                                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                                modifier = Modifier.width(92.dp),
                            )
                            IconButton(onClick = { renglones = renglones.filterIndexed { j, _ -> j != i } }) {
                                Icon(Icons.Outlined.Close, contentDescription = "Quitar ${r.titulo}", tint = c.muted)
                            }
                        }
                        Text(FormatosRules.evidencia(r.base), fontSize = 12.sp, color = c.brand)
                    }
                }
                resultado?.let { res ->
                    Column(
                        verticalArrangement = Arrangement.spacedBy(6.dp),
                        modifier = Modifier
                            .fillMaxWidth()
                            .clip(RoundedCornerShape(12.dp))
                            .background(c.successSoft)
                            .padding(12.dp),
                    ) {
                        if (res.actividades.isNotEmpty()) {
                            Text(
                                "Listo en $segundos s y $toques toques: ${res.actividades.size} actividades para " +
                                    "${responsable?.nombre.orEmpty()}${cliente?.name?.let { " en $it" }.orEmpty()}.",
                                fontSize = 14.sp,
                                color = c.fg,
                            )
                        }
                        res.actividades.forEach { a ->
                            Text(
                                "${a.anNumber.orEmpty()} ${a.titulo}",
                                fontSize = 13.sp,
                                color = c.brand,
                                modifier = Modifier.clickable { onOpenActivity(a.id) }.padding(vertical = 4.dp),
                            )
                        }
                        res.fallidas.forEach { x ->
                            Text("No se pudo crear: ${x.titulo} (${x.motivo})", fontSize = 13.sp, color = c.danger)
                        }
                        OutlinedButton(onClick = {
                            resultado = null
                            intento = false
                            clave = UUID.randomUUID().toString()
                            inicioMs = 0L
                            toques = 0
                            cliente = null
                            clienteServicioId = null
                            sucursal = ""
                            responsable = null
                            elegido?.let { elegir(it) }
                        }) {
                            Text("Asignar otro", color = c.fg)
                        }
                    }
                }
            }
        }
        if (elegido != null) {
            Column(
                modifier = Modifier.fillMaxWidth().background(c.card).padding(horizontal = 16.dp, vertical = 10.dp),
                verticalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                Text(
                    FormatosRules.total(total) + if (intento && faltante != null) " · $faltante" else "",
                    fontSize = 13.sp,
                    color = if (intento && faltante != null) c.danger else c.fg2,
                )
                Button(
                    onClick = { asignar() },
                    enabled = !enviando && resultado == null && renglones.isNotEmpty(),
                    modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp),
                    shape = RoundedCornerShape(12.dp),
                    colors = ButtonDefaults.buttonColors(containerColor = c.brand, contentColor = Color.White),
                ) {
                    Text(if (enviando) "Asignando…" else FormatosRules.etiqueta(renglones.size), fontWeight = FontWeight.SemiBold)
                }
            }
        }
    }
}

@Composable
private fun Etiqueta(texto: String) {
    Text(texto, fontSize = 13.sp, fontWeight = FontWeight.SemiBold, color = NxTheme.colors.fg)
}
