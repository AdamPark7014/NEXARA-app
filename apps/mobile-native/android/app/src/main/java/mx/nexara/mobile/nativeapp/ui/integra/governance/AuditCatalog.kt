package mx.nexara.mobile.nativeapp.ui.integra.governance

import mx.nexara.mobile.nativeapp.data.integra.governance.AuditEntryDto
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Date
import java.util.Locale
import java.util.TimeZone

/**
 * Lógica de la bitácora de INTEGRA para Android.
 *
 * Espejo de `apps/web/app/(panels)/integra/audit/_bitacora.ts`. Vive aparte de
 * la pantalla porque es lo que hay que poder probar sin emulador: decidir si
 * `integra.door.open` es crítica, o si una fecha de la API es legible, se rompe
 * en silencio y nadie lo nota hasta que alguien tiene que reconstruir qué pasó
 * un martes por la tarde.
 *
 * ── Qué hace el servidor y qué no ────────────────────────────────────────────
 * `GET /api/integra/audit` (integra.controller.ts → `auditLog`) ya admite
 * `limit`, `skip`, `from`, `to`, `action`, `userId`, `q` y `order`, y su `total`
 * sale de un `count` sobre el mismo filtro — no del tamaño de la página. Por eso
 * aquí NO hay filtrado en memoria: todo lo que el usuario elige viaja al
 * servidor y la paginación es real. `q` filtra **solo el código de acción**
 * (`action contains`), y así se etiqueta en pantalla; `changes` es JSON y
 * filtrarlo en SQL exigiría un índice que hoy no existe.
 *
 * Sin `java.time`: el módulo tiene `minSdk 24` y el build no activa
 * desugaring de la librería estándar, así que `Instant`/`ZonedDateTime`
 * reventarían en API 24-25. Todo va con `Calendar`/`SimpleDateFormat`.
 */

// ── Catálogo de acciones ──────────────────────────────────────────────────────

enum class CategoriaAuditoria(val clave: String, val etiqueta: String) {
    PUERTAS("puertas", "Puertas"),
    PERSONAS("personas", "Personas"),
    VEHICULOS("vehiculos", "Vehículos"),
    HORARIOS("horarios", "Horarios"),
    VISITAS("visitas", "Visitas"),
    CAMARAS("camaras", "Cámaras"),
    PRIVILEGIOS("privilegios", "Privilegios"),
    OTRO("otro", "Otras"),
}

data class FichaAccion(
    val etiqueta: String,
    val categoria: CategoriaAuditoria,
    /**
     * Deja rastro de algo que altera quién puede entrar dónde. Son las que se
     * buscan al reconstruir un incidente, y por eso van marcadas.
     */
    val critica: Boolean = false,
)

/**
 * Solo acciones que el backend escribe de verdad — salen de las llamadas a
 * `auditMut(...)` y `audit.log({ action: ... })` de `apps/api`. Una acción que
 * no esté aquí se muestra con su código crudo; nunca se esconde ni rompe la
 * pantalla. Ya pasó en la consola web: `AUTH_FAILURE_BURST` aterrizó a mitad de
 * turno y no rompió nada porque estaba previsto.
 */
val ACCIONES_BITACORA: Map<String, FichaAccion> = mapOf(
    "integra.door.open" to FichaAccion("Puerta abierta a distancia", CategoriaAuditoria.PUERTAS, true),
    "integra.door.control" to FichaAccion("Puerta controlada a distancia", CategoriaAuditoria.PUERTAS, true),
    "integra.person.add" to FichaAccion("Alta de persona", CategoriaAuditoria.PERSONAS, true),
    "integra.person.update" to FichaAccion("Cambio en persona", CategoriaAuditoria.PERSONAS),
    "integra.person.delete" to FichaAccion("Baja de persona", CategoriaAuditoria.PERSONAS, true),
    "integra.person.access.patch" to FichaAccion("Cambio de accesos de persona", CategoriaAuditoria.PERSONAS, true),
    "integra.person.face.upload" to FichaAccion("Alta de rostro", CategoriaAuditoria.PERSONAS),
    "integra.person.face.delete" to FichaAccion("Baja de rostro", CategoriaAuditoria.PERSONAS),
    "integra.person.fp.enroll" to FichaAccion("Alta de huella", CategoriaAuditoria.PERSONAS),
    "integra.person.fp.delete" to FichaAccion("Baja de huella", CategoriaAuditoria.PERSONAS),
    "integra.person.fp.fetch" to FichaAccion("Lectura de huella", CategoriaAuditoria.PERSONAS),
    "integra.privilege.assign" to FichaAccion("Personas asignadas a grupo", CategoriaAuditoria.PRIVILEGIOS, true),
    "integra.privilege.apply" to FichaAccion("Reaplicación de privilegios", CategoriaAuditoria.PRIVILEGIOS, true),
    "integra.schedule.template.put" to FichaAccion("Cambio de plantilla horaria", CategoriaAuditoria.HORARIOS, true),
    "integra.schedule.weekPlan.put" to FichaAccion("Cambio de plan semanal", CategoriaAuditoria.HORARIOS, true),
    "integra.schedule.preset.ensure" to FichaAccion("Alta de preset horario", CategoriaAuditoria.HORARIOS, true),
    "integra.visitor.register" to FichaAccion("Registro de visita", CategoriaAuditoria.VISITAS),
    "integra.visitor.recurring.create" to FichaAccion("Alta de visita recurrente", CategoriaAuditoria.VISITAS),
    "integra.visitor.recurring.cancel" to FichaAccion("Baja de visita recurrente", CategoriaAuditoria.VISITAS),
    "integra.vehicle.add" to FichaAccion("Alta de vehículo", CategoriaAuditoria.VEHICULOS),
    "integra.vehicle.update" to FichaAccion("Cambio en vehículo", CategoriaAuditoria.VEHICULOS),
    "integra.vehicle.delete" to FichaAccion("Baja de vehículo", CategoriaAuditoria.VEHICULOS),
    "integra.camera.audio" to FichaAccion("Audio de cámara", CategoriaAuditoria.CAMARAS),
    "integra.ptz.preset" to FichaAccion("Preset PTZ", CategoriaAuditoria.CAMARAS),
)

/** El código crudo si no está en el catálogo: mejor eso que ocultarlo. */
fun etiquetaAccion(action: String?): String {
    val codigo = action?.trim().orEmpty()
    if (codigo.isEmpty()) return "Acción sin código"
    return ACCIONES_BITACORA[codigo]?.etiqueta ?: codigo
}

private val CATEGORIA_POR_FAMILIA: Map<String, CategoriaAuditoria> = mapOf(
    "door" to CategoriaAuditoria.PUERTAS,
    "person" to CategoriaAuditoria.PERSONAS,
    "vehicle" to CategoriaAuditoria.VEHICULOS,
    "schedule" to CategoriaAuditoria.HORARIOS,
    "visitor" to CategoriaAuditoria.VISITAS,
    "camera" to CategoriaAuditoria.CAMARAS,
    "ptz" to CategoriaAuditoria.CAMARAS,
    "privilege" to CategoriaAuditoria.PRIVILEGIOS,
)

/**
 * Si la acción no está catalogada se deduce del segundo tramo de
 * `integra.<familia>.<verbo>`, así una acción nueva del backend cae en su sitio
 * sin tocar este archivo. Lo que no encaje en el patrón cae en «Otras», que es
 * una casilla legítima, no un error.
 */
fun categoriaAccion(action: String?): CategoriaAuditoria {
    val codigo = action?.trim().orEmpty()
    ACCIONES_BITACORA[codigo]?.let { return it.categoria }
    val familia = codigo.split(".").getOrNull(1).orEmpty()
    return CATEGORIA_POR_FAMILIA[familia] ?: CategoriaAuditoria.OTRO
}

fun esAccionCritica(action: String?): Boolean =
    ACCIONES_BITACORA[action?.trim().orEmpty()]?.critica == true

/**
 * Quién lo hizo.
 *
 * `userId` es opcional en `audit_logs`: si la mutación la disparó un proceso sin
 * sesión, la fila llega sin usuario. Decirlo así es información; poner «—» hace
 * pensar que se perdió el dato.
 */
fun describirActor(userName: String?, userEmail: String?): String {
    val nombre = userName?.trim().orEmpty()
    val correo = userEmail?.trim().orEmpty()
    if (nombre.isNotEmpty() && correo.isNotEmpty()) return "$nombre · $correo"
    if (nombre.isNotEmpty()) return nombre
    if (correo.isNotEmpty()) return correo
    return "Proceso automático (sin usuario)"
}

// ── Fechas ────────────────────────────────────────────────────────────────────

private val PATRONES_ISO = listOf(
    "yyyy-MM-dd'T'HH:mm:ss.SSSXXX",
    "yyyy-MM-dd'T'HH:mm:ssXXX",
    "yyyy-MM-dd'T'HH:mm:ss.SSS",
    "yyyy-MM-dd'T'HH:mm:ss",
    "yyyy-MM-dd HH:mm:ss",
    "yyyy-MM-dd",
)

/**
 * Milisegundos de una fecha de la API, o `null` si no hay forma de leerla.
 *
 * La API devuelve `createdAt` como ISO con `Z`, pero la bitácora también recibe
 * filas viejas migradas con otros formatos. Devolver `null` en vez de lanzar
 * deja que quien llama decida: una fila con fecha ilegible se pinta igual y se
 * marca, porque es justo la que más raro huele.
 */
fun instanteDeIso(iso: String?): Long? {
    val texto = iso?.trim().orEmpty()
    if (texto.isEmpty()) return null
    for (patron in PATRONES_ISO) {
        val fmt = SimpleDateFormat(patron, Locale.US)
        fmt.isLenient = false
        // Sin offset explícito el patrón se interpreta en UTC: es lo que manda
        // el servidor y suponer la zona del teléfono correría la hora.
        if (!patron.endsWith("XXX")) fmt.timeZone = TimeZone.getTimeZone("UTC")
        try {
            return fmt.parse(texto)?.time
        } catch (_: java.text.ParseException) {
            // Siguiente patrón.
        }
    }
    return null
}

/** Fecha absoluta en hora local. Una fecha ilegible se dice, no se disimula. */
fun formatearFechaAbsoluta(iso: String?): String {
    val ms = instanteDeIso(iso) ?: return "Fecha ilegible"
    val fmt = SimpleDateFormat("dd/MM/yyyy HH:mm:ss", Locale("es", "MX"))
    return fmt.format(Date(ms))
}

/** Solo la hora local, para la lista cronológica agrupada por día. */
fun formatearHora(iso: String?): String {
    val ms = instanteDeIso(iso) ?: return "--:--"
    return SimpleDateFormat("HH:mm:ss", Locale("es", "MX")).format(Date(ms))
}

/** Encabezado de día de la lista: «martes, 02/09/2026». */
fun etiquetaDia(iso: String?): String {
    val ms = instanteDeIso(iso) ?: return "Sin fecha legible"
    val fmt = SimpleDateFormat("EEEE, dd/MM/yyyy", Locale("es", "MX"))
    return fmt.format(Date(ms)).replaceFirstChar { it.uppercase(Locale("es", "MX")) }
}

/**
 * Antigüedad en cristiano, para no tener que restar fechas de cabeza al leer.
 * Cadena vacía si no aporta (fecha ilegible o de hace más de un mes).
 */
fun haceCuanto(iso: String?, ahoraMs: Long = System.currentTimeMillis()): String {
    val t = instanteDeIso(iso) ?: return ""
    val ms = ahoraMs - t
    // Una entrada con fecha futura es justo la que interesa ver marcada.
    if (ms < -60_000L) return "fecha futura"
    if (ms < 60_000L) return "hace instantes"
    val min = ms / 60_000L
    if (min < 60L) return "hace $min min"
    val h = min / 60L
    if (h < 24L) return "hace $h h"
    val d = h / 24L
    if (d <= 30L) return "hace $d día${if (d == 1L) "" else "s"}"
    return ""
}

// ── Rango: «el martes por la tarde» ───────────────────────────────────────────

/**
 * Franjas del día. Existen porque la pregunta que da sentido a esta pantalla no
 * es «dame del 2026-09-02T12:00 al 2026-09-02T18:00», es «qué pasó el martes por
 * la tarde». En un teléfono, dos toques valen más que dos selectores de fecha.
 */
enum class FranjaDia(val etiqueta: String, val horaInicio: Int, val horaFin: Int) {
    TODO_EL_DIA("Todo el día", 0, 24),
    MANANA("Mañana", 0, 12),
    TARDE("Tarde", 12, 18),
    NOCHE("Noche", 18, 24),
}

/** Rangos rápidos relativos a ahora. */
enum class PresetRango(val etiqueta: String, val horas: Int) {
    H24("24 h", 24),
    H48("48 h", 48),
    D7("7 días", 24 * 7),
    D30("30 días", 24 * 30),
    TODO("Todo", 0),
}

/** Los dos extremos que viajan al servidor como `from` / `to`. Null = sin límite. */
data class RangoConsulta(val desdeMs: Long?, val hastaMs: Long?)

private fun formateadorIsoUtc(): SimpleDateFormat {
    val fmt = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US)
    fmt.timeZone = TimeZone.getTimeZone("UTC")
    return fmt
}

/** ISO-8601 en UTC, que es lo que `new Date(v)` del controlador entiende sin ambigüedad. */
fun aIsoUtc(ms: Long?): String? = ms?.let { formateadorIsoUtc().format(Date(it)) }

fun rangoDePreset(preset: PresetRango, ahoraMs: Long = System.currentTimeMillis()): RangoConsulta {
    if (preset == PresetRango.TODO) return RangoConsulta(null, null)
    // `hasta` se deja abierto a propósito: acotarlo a «ahora» escondería una
    // entrada escrita entre que se pulsa el chip y se pinta la lista.
    return RangoConsulta(ahoraMs - preset.horas * 3_600_000L, null)
}

/**
 * Rango de un día concreto y una franja, en hora local del teléfono.
 *
 * `diaMs` es cualquier instante dentro del día buscado (lo que devuelve el
 * `DatePicker`). El extremo superior es exclusivo por un milisegundo para que
 * las 18:00:00.000 caigan en «Tarde» y no en dos franjas a la vez.
 */
fun rangoDeDia(diaMs: Long, franja: FranjaDia, zona: TimeZone = TimeZone.getDefault()): RangoConsulta {
    val cal = Calendar.getInstance(zona)
    cal.timeInMillis = diaMs
    cal.set(Calendar.HOUR_OF_DAY, 0)
    cal.set(Calendar.MINUTE, 0)
    cal.set(Calendar.SECOND, 0)
    cal.set(Calendar.MILLISECOND, 0)
    val medianoche = cal.timeInMillis
    val desde = medianoche + franja.horaInicio * 3_600_000L
    val hasta = medianoche + franja.horaFin * 3_600_000L - 1L
    return RangoConsulta(desde, hasta)
}

/**
 * Traduce el valor del `DatePicker` a un instante del día correcto.
 *
 * `DatePickerState.selectedDateMillis` es medianoche **UTC** del día elegido.
 * Al oeste de Greenwich —México lo está— ese instante cae en el día anterior en
 * hora local, así que usarlo tal cual consultaría el lunes cuando el usuario
 * tocó el martes. Se toma el año/mes/día en UTC y se ancla al mediodía local,
 * que es inmune a horarios de verano.
 */
fun anclaLocalDeDiaUtc(utcMs: Long, zona: TimeZone = TimeZone.getDefault()): Long {
    val utc = Calendar.getInstance(TimeZone.getTimeZone("UTC"))
    utc.timeInMillis = utcMs
    val local = Calendar.getInstance(zona)
    local.clear()
    local.set(
        utc.get(Calendar.YEAR),
        utc.get(Calendar.MONTH),
        utc.get(Calendar.DAY_OF_MONTH),
        12,
        0,
        0,
    )
    return local.timeInMillis
}

/** Etiqueta corta del día elegido para el chip de filtro: «martes 02/09». */
fun etiquetaDiaCorto(diaMs: Long): String =
    SimpleDateFormat("EEEE dd/MM", Locale("es", "MX"))
        .format(Date(diaMs))
        .replaceFirstChar { it.uppercase(Locale("es", "MX")) }

// ── Paginación real ───────────────────────────────────────────────────────────

/**
 * Lo que hay que enseñar bajo la lista.
 *
 * `total` viene del `count` del servidor, no del tamaño de la página. Es la
 * diferencia entre «hay 1.240 y ves 50» y mentir con «hay 50» — que es
 * exactamente lo que hacía este endpoint antes de arreglarse.
 */
data class ResumenPagina(
    val pagina: Int,
    val paginas: Int,
    val primero: Int,
    val ultimo: Int,
    val total: Int,
    val hayAnterior: Boolean,
    val haySiguiente: Boolean,
) {
    val texto: String
        get() = if (total == 0) "Sin entradas" else "$primero–$ultimo de $total"
}

fun resumenPagina(total: Int, skip: Int, limit: Int, recibidas: Int): ResumenPagina {
    val tam = if (limit > 0) limit else 1
    val totalSeguro = maxOf(total, 0)
    val salto = maxOf(skip, 0)
    val paginas = maxOf(1, (totalSeguro + tam - 1) / tam)
    val pagina = minOf(salto / tam + 1, paginas)
    val primero = if (recibidas == 0) 0 else salto + 1
    val ultimo = if (recibidas == 0) 0 else salto + recibidas
    return ResumenPagina(
        pagina = pagina,
        paginas = paginas,
        primero = primero,
        ultimo = ultimo,
        total = totalSeguro,
        hayAnterior = salto > 0,
        // No se mira `recibidas >= limit`: con el total real se sabe de verdad
        // si queda algo detrás, aunque la última página venga corta.
        haySiguiente = salto + recibidas < totalSeguro,
    )
}

// ── `changes` y `previousData` ────────────────────────────────────────────────

data class CampoDetalle(
    val clave: String,
    val etiqueta: String,
    val valor: String,
    /** Campos que cuentan la historia: qué puerta, con qué orden y por qué. */
    val destacado: Boolean,
)

data class DetalleCambios(
    val campos: List<CampoDetalle>,
    /** El objeto completo, indentado. Nunca recortado. */
    val json: String?,
    val vacio: Boolean,
)

private val ETIQUETA_CAMPO: Map<String, String> = mapOf(
    "doorIndexCode" to "Puerta",
    "controlType" to "Tipo de control",
    "cmd" to "Comando ISAPI",
    "reason" to "Motivo",
    "email" to "Correo del actor",
    "provider" to "Proveedor",
    "personId" to "Persona (ACS)",
    "personIds" to "Personas",
    "privilegeGroupId" to "Grupo de privilegios",
    "cameraIndexCode" to "Cámara",
    "enabled" to "Activado",
    "preset" to "Preset PTZ",
    "plate" to "Placa",
    "plateNo" to "Placa",
    "vehicleId" to "Vehículo",
    "deviceSync" to "Empujado al equipo",
    "deviceIp" to "IP del equipo",
    "fingerPrintID" to "Huella",
    "templateKey" to "Plantilla",
)

/** Espejo de `DOOR_CONTROL_OPTIONS` de `apps/web/app/(panels)/integra/_lib.ts`. */
private val ETIQUETA_CONTROL: Map<String, String> = mapOf(
    "2" to "Abrir (momentáneo)",
    "1" to "Cerrar",
    "0" to "Quedar abierta",
    "3" to "Quedar cerrada",
)

private val DESTACADOS = setOf("doorIndexCode", "controlType", "reason", "personIds", "personId")

/**
 * Moshi deserializa todo número JSON como `Double`, así que un `personId: 41`
 * llegaría como «41.0» a la ficha. Se corrige aquí y no en cada pantalla.
 */
private fun numeroLegible(v: Number): String {
    val d = v.toDouble()
    return if (d == Math.floor(d) && !d.isInfinite() && Math.abs(d) < 1e15) {
        d.toLong().toString()
    } else {
        v.toString()
    }
}

private fun valorLegible(clave: String, v: Any?): String = when (v) {
    null -> "—"
    is Boolean -> if (v) "sí" else "no"
    is Number -> numeroLegible(v)
    is String -> when {
        clave == "controlType" -> ETIQUETA_CONTROL[v]?.let { "$it ($v)" } ?: v
        v.isEmpty() -> "(vacío)"
        else -> v
    }
    is List<*> -> when {
        v.isEmpty() -> "(lista vacía)"
        v.all { it is String || it is Number || it is Boolean } ->
            v.joinToString(", ") { valorLegible(clave, it) }
        else -> aJsonCompacto(v)
    }
    else -> aJsonCompacto(v)
}

private fun escaparJson(s: String): String {
    val sb = StringBuilder(s.length + 8)
    for (c in s) {
        when (c) {
            '"' -> sb.append("\\\"")
            '\\' -> sb.append("\\\\")
            '\n' -> sb.append("\\n")
            '\r' -> sb.append("\\r")
            '\t' -> sb.append("\\t")
            else -> if (c < ' ') sb.append(String.format(Locale.US, "\\u%04x", c.code)) else sb.append(c)
        }
    }
    return sb.toString()
}

/**
 * JSON sin `org.json`: esa clase está stubbeada en las pruebas unitarias de
 * Android y devolvería vacío justo donde hay que verificar el texto.
 */
fun aJsonCompacto(v: Any?): String = when (v) {
    null -> "null"
    is Boolean -> v.toString()
    is Number -> numeroLegible(v)
    is String -> "\"${escaparJson(v)}\""
    is Map<*, *> -> v.entries.joinToString(",", "{", "}") {
        "\"${escaparJson(it.key?.toString().orEmpty())}\":${aJsonCompacto(it.value)}"
    }
    is List<*> -> v.joinToString(",", "[", "]") { aJsonCompacto(it) }
    else -> "\"${escaparJson(v.toString())}\""
}

/** Igual que el anterior pero indentado, para el bloque «JSON completo». */
fun aJsonBonito(v: Any?, nivel: Int = 0): String {
    val sangria = "  ".repeat(nivel)
    val sangriaHija = "  ".repeat(nivel + 1)
    return when (v) {
        is Map<*, *> -> if (v.isEmpty()) "{}" else v.entries.joinToString(
            separator = ",\n",
            prefix = "{\n",
            postfix = "\n$sangria}",
        ) { "$sangriaHija\"${escaparJson(it.key?.toString().orEmpty())}\": ${aJsonBonito(it.value, nivel + 1)}" }
        is List<*> -> if (v.isEmpty()) "[]" else v.joinToString(
            separator = ",\n",
            prefix = "[\n",
            postfix = "\n$sangria]",
        ) { "$sangriaHija${aJsonBonito(it, nivel + 1)}" }
        else -> aJsonCompacto(v)
    }
}

/**
 * Desmonta `changes` (o `previousData`) en campos legibles.
 *
 * Lo que sustituye en la web era `JSON.stringify(changes).slice(0, 120)`: un
 * JSON cortado a la mitad, ilegible y encima mentiroso, porque el corte se
 * comía el final del objeto sin avisar.
 */
fun describirCambios(changes: Any?): DetalleCambios {
    if (changes == null) return DetalleCambios(emptyList(), null, true)
    val json = aJsonBonito(changes)
    return when (changes) {
        is Map<*, *> -> DetalleCambios(
            campos = changes.entries.map { (k, v) ->
                val clave = k?.toString().orEmpty()
                CampoDetalle(
                    clave = clave,
                    etiqueta = ETIQUETA_CAMPO[clave] ?: clave,
                    valor = valorLegible(clave, v),
                    destacado = clave in DESTACADOS,
                )
            },
            json = json,
            // Un `{}` es lo que escribe `integra.privilege.apply`: hay entrada,
            // no hay campos. Es distinto de no tener `changes`.
            vacio = changes.isEmpty(),
        )
        is List<*> -> DetalleCambios(
            campos = changes.mapIndexed { i, v ->
                CampoDetalle(
                    clave = i.toString(),
                    etiqueta = "#${i + 1}",
                    valor = valorLegible(i.toString(), v),
                    destacado = false,
                )
            },
            json = json,
            vacio = changes.isEmpty(),
        )
        else -> DetalleCambios(
            campos = listOf(
                CampoDetalle("valor", "Valor", valorLegible("valor", changes), false),
            ),
            json = json,
            vacio = false,
        )
    }
}

/**
 * Resumen de una línea para la fila de la lista. Se muestran campos enteros
 * —los que cuentan la historia primero— y si quedan fuera se dice cuántos, en
 * vez de cortar el texto a mitad de palabra.
 */
fun resumenDeCambios(changes: Any?, cuantos: Int = 2): String {
    val detalle = describirCambios(changes)
    if (detalle.campos.isEmpty()) return ""
    val ordenados = detalle.campos.sortedByDescending { it.destacado }
    val tope = maxOf(1, cuantos)
    val mostrados = ordenados.take(tope)
    val texto = mostrados.joinToString(" · ") { "${it.etiqueta}: ${it.valor}" }
    val restantes = ordenados.size - mostrados.size
    return if (restantes > 0) {
        "$texto · +$restantes campo${if (restantes == 1) "" else "s"}"
    } else {
        texto
    }
}

// ── Compartir una ficha ───────────────────────────────────────────────────────

/**
 * La ficha entera como texto plano, para pegarla en un informe de incidente.
 *
 * En la web esto es un CSV que se descarga; en un teléfono un archivo suelto no
 * lleva a ninguna parte, y lo que se hace de verdad es mandar la entrada por
 * WhatsApp o correo. Se incluyen IP y user-agent a propósito: son el motivo de
 * que la ficha exista.
 */
fun fichaComoTexto(e: AuditEntryDto): String {
    val lineas = mutableListOf<String>()
    lineas += "Bitácora INTEGRA · entrada ${e.id ?: "sin id"}"
    lineas += "Fecha: ${formatearFechaAbsoluta(e.createdAt)}${haceCuanto(e.createdAt).let { if (it.isBlank()) "" else " ($it)" }}"
    lineas += "Acción: ${etiquetaAccion(e.action)} [${e.action.orEmpty().ifBlank { "sin código" }}]"
    lineas += "Categoría: ${categoriaAccion(e.action).etiqueta}${if (esAccionCritica(e.action)) " · crítica" else ""}"
    lineas += "Actor: ${describirActor(e.userName, e.userEmail)}${e.userId?.let { " (usuario #$it)" } ?: ""}"
    lineas += "Sitio (entityId): ${e.entityId?.toString() ?: "—"}"
    lineas += "IP de origen: ${e.ipAddress?.takeIf { it.isNotBlank() } ?: "no registrada"}"
    lineas += "Dispositivo (user-agent): ${e.userAgent?.takeIf { it.isNotBlank() } ?: "no registrado"}"
    val cambios = describirCambios(e.changes)
    lineas += "Cambios: ${cambios.json ?: "—"}"
    val previos = describirCambios(e.previousData)
    lineas += "Valor anterior: ${previos.json ?: "—"}"
    return lineas.joinToString("\n")
}
