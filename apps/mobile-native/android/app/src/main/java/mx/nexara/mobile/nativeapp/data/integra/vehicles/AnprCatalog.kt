package mx.nexara.mobile.nativeapp.data.integra.vehicles

import java.util.Calendar
import java.util.Date
import java.util.Locale
import java.util.TimeZone

/**
 * Contrato real de `POST /artemis/api/pms/v1/crossRecords/page`, tal y como lo
 * reexpone `POST /api/integra/anpr/cross-records`.
 *
 * Espejo de `apps/web/app/(panels)/integra/anpr/_anpr.ts`. Fuente: HikCentral
 * Professional OpenAPI V3.0.1 Developer Guide, §5.8.2 y anexo A.1.71
 * `PassVehicleRecord`. `apps/api` reenvía el cuerpo tal cual
 * (`integra.controller.ts` → `anprRecords`) y `HikCentralArtemisClient.post` ya
 * desenvuelve `data`, así que lo que llega aquí es el objeto `data` del manual.
 *
 * **Nada de esto está inventado.** Si un campo no aparece en la tabla A-73, no
 * se pinta. La web ya tuvo una columna «Entrada» leyendo `entranceName`, un
 * campo que NO existe en `PassVehicleRecord`, y siempre salía «—».
 *
 * Y lo que esta app **no** hace: no simula lecturas de placa. `anprCrossRecords`
 * solo existe en el cliente Artemis (`apps/api/src/hikvision-artemis/
 * artemis.client.ts:333`); en un sitio con proveedor ISAPI —el parque de
 * Oficinas, con la PTZ .179— `IntegraArtemisService.client()` lanza
 * `BadRequestException`. La pantalla lo enseña como «no disponible en este
 * sitio», no como una lista vacía.
 */

/** El manual limita la ventana de búsqueda a 31 días. */
const val ANPR_MAX_RANGE_DAYS = 31

/** `pageSize` documentado: entre 1 y 500. */
const val ANPR_MAX_PAGE_SIZE = 500

/** `plateNo` documentado: hasta 16 caracteres. */
const val ANPR_MAX_PLATE_LEN = 16

/** `ownerName` documentado: hasta 64 caracteres. */
const val ANPR_MAX_OWNER_LEN = 64

/** Enum «Vehicle Type» del manual, traducido. */
private val VEHICLE_TYPE: Map<Int, String> = mapOf(
    0 to "Otro",
    1 to "Vehículo de pasajeros",
    2 to "Camión",
    3 to "Sedán",
    4 to "Minivan",
    5 to "Camioneta ligera",
    6 to "Peatón",
    7 to "Motocicleta",
    8 to "Triciclo",
    9 to "SUV / MPV",
    10 to "Autobús mediano",
    11 to "Vehículo de motor",
    12 to "Vehículo sin motor",
    13 to "Sedán compacto",
    14 to "Sedán mini",
    15 to "Pick-up",
    16 to "Tráiler de contenedor",
    17 to "Camioneta de redilas",
    18 to "Camión de volteo",
    19 to "Grúa / vehículo de obra",
    20 to "Pipa (cisterna)",
    21 to "Revolvedora de concreto",
    22 to "Grúa de plataforma",
    23 to "Hatchback",
    24 to "Sedán salón",
    25 to "Sedán deportivo",
    26 to "Microbús",
)

/** Enum «Vehicle Color» del manual, traducido. */
private val VEHICLE_COLOR: Map<Int, String> = mapOf(
    0 to "Otro color",
    1 to "Blanco",
    2 to "Plata",
    3 to "Gris",
    4 to "Negro",
    5 to "Rojo",
    6 to "Azul oscuro",
    7 to "Azul",
    8 to "Amarillo",
    9 to "Verde",
    10 to "Café",
    11 to "Rosa",
    12 to "Morado",
    13 to "Gris oscuro",
    14 to "Cian",
)

/** `vehicleDirectionType` del manual, en lenguaje de operador. */
private val DIRECTION: Map<Int, String> = mapOf(
    0 to "Otra dirección",
    1 to "Acercándose a la cámara",
    2 to "Alejándose de la cámara",
)

private fun decode(table: Map<Int, String>, v: Int?): String? {
    if (v == null) return null
    // Un código fuera de tabla se enseña tal cual: mentir con «Otro» esconde que
    // la plataforma devolvió algo que aquí no sabemos leer.
    return table[v] ?: "Código $v"
}

fun anprVehicleType(v: Int?): String? = decode(VEHICLE_TYPE, v)

fun anprVehicleColor(v: Int?): String? = decode(VEHICLE_COLOR, v)

fun anprDirection(v: Int?): String? = decode(DIRECTION, v)

private fun pad2(n: Int): String {
    val abs = if (n < 0) -n else n
    return if (abs < 10) "0$abs" else abs.toString()
}

/**
 * ISO 8601 con desplazamiento local — `2026-09-04T18:30:00-06:00`.
 *
 * El manual pide literalmente «+current zone» y da ese ejemplo. La forma UTC con
 * `Z` es equivalente en el estándar, pero HikCentral es quisquilloso con el
 * formato y la pantalla web venía fallando siempre por eso.
 *
 * Se construye a mano en vez de con `SimpleDateFormat("…XXX")` porque ese patrón
 * emite `Z` cuando el desplazamiento es cero, y aquí queremos `+00:00`.
 *
 * No usa `java.time`: `minSdk` es 24 y el módulo no tiene desugaring de la
 * librería del núcleo (ver hallazgos), así que `Calendar` es lo que de verdad
 * corre en un teléfono con API 24.
 */
fun toArtemisTime(epochMillis: Long, zone: TimeZone = TimeZone.getDefault()): String {
    val cal = Calendar.getInstance(zone, Locale.US)
    cal.time = Date(epochMillis)
    val offsetMin = (cal.get(Calendar.ZONE_OFFSET) + cal.get(Calendar.DST_OFFSET)) / 60_000
    val signo = if (offsetMin >= 0) "+" else "-"
    val offset = "$signo${pad2(offsetMin / 60)}:${pad2(offsetMin % 60)}"
    return buildString {
        append(cal.get(Calendar.YEAR))
        append('-').append(pad2(cal.get(Calendar.MONTH) + 1))
        append('-').append(pad2(cal.get(Calendar.DAY_OF_MONTH)))
        append('T').append(pad2(cal.get(Calendar.HOUR_OF_DAY)))
        append(':').append(pad2(cal.get(Calendar.MINUTE)))
        append(':').append(pad2(cal.get(Calendar.SECOND)))
        append(offset)
    }
}

/** Días (con decimales) entre dos instantes. Negativo = rango invertido. */
fun rangeDays(startMillis: Long, endMillis: Long): Double =
    (endMillis - startMillis) / 86_400_000.0

/** Ventanas que ofrece la pantalla. Ninguna se pasa del tope de 31 días. */
enum class AnprVentana(val etiqueta: String, val horas: Long) {
    ULTIMA_HORA("Última hora", 1),
    UN_DIA("24 horas", 24),
    SIETE_DIAS("7 días", 24 * 7),
    TREINTA_DIAS("30 días", 24 * 30),
}

data class AnprRango(val startMillis: Long, val endMillis: Long) {
    val dias: Double get() = rangeDays(startMillis, endMillis)
    val invertido: Boolean get() = dias < 0
    val demasiadoLargo: Boolean get() = dias > ANPR_MAX_RANGE_DAYS
}

fun rangoDeVentana(ventana: AnprVentana, ahoraMillis: Long): AnprRango =
    AnprRango(
        startMillis = ahoraMillis - ventana.horas * 3_600_000L,
        endMillis = ahoraMillis,
    )

/**
 * Hora legible de un `crossTime` ISO 8601 de la plataforma.
 *
 * Devuelve el texto crudo si no se puede interpretar: enseñar `2018-07-26T…`
 * es más honesto que enseñar «—» y hacer creer que el campo venía vacío.
 */
fun formatearCrossTime(iso: String?, zone: TimeZone = TimeZone.getDefault()): String {
    if (iso.isNullOrBlank()) return "—"
    val millis = parsearIso8601(iso) ?: return iso
    val cal = Calendar.getInstance(zone, Locale.US)
    cal.time = Date(millis)
    return buildString {
        append(pad2(cal.get(Calendar.DAY_OF_MONTH)))
        append('/').append(pad2(cal.get(Calendar.MONTH) + 1))
        append('/').append(cal.get(Calendar.YEAR))
        append(' ').append(pad2(cal.get(Calendar.HOUR_OF_DAY)))
        append(':').append(pad2(cal.get(Calendar.MINUTE)))
        append(':').append(pad2(cal.get(Calendar.SECOND)))
    }
}

private val ISO_8601 = Regex(
    "^(\\d{4})-(\\d{2})-(\\d{2})[T ](\\d{2}):(\\d{2})(?::(\\d{2}))?(?:\\.\\d+)?" +
        "(Z|[+-]\\d{2}:?\\d{2})?$",
)

/**
 * Parser de ISO 8601 sin `java.time`. Acepta lo que documenta el manual
 * (`2018-07-26T15:00:00+08:00`) y las variantes con `Z`, sin segundos y con
 * milisegundos. Devuelve `null` si no encaja; nadie inventa una fecha.
 */
fun parsearIso8601(texto: String): Long? {
    val m = ISO_8601.matchEntire(texto.trim()) ?: return null
    val (y, mo, d, h, mi) = m.destructured
    val s = m.groupValues[6].ifEmpty { "0" }
    val zonaTexto = m.groupValues[7]

    val cal = Calendar.getInstance(TimeZone.getTimeZone("UTC"), Locale.US)
    cal.clear()
    // Sin esto, `Calendar` es indulgente: el mes 13 se convierte en enero del
    // año siguiente y la hora 99 en el día de al lado. Preferimos decir «no sé
    // leer esta fecha» a enseñar una inventada.
    cal.isLenient = false
    cal.set(y.toInt(), mo.toInt() - 1, d.toInt(), h.toInt(), mi.toInt(), s.toInt())
    val utcNaive = try {
        cal.timeInMillis
    } catch (_: IllegalArgumentException) {
        return null
    }

    if (zonaTexto.isEmpty() || zonaTexto == "Z") return utcNaive

    val signo = if (zonaTexto[0] == '-') -1 else 1
    val cuerpo = zonaTexto.substring(1).replace(":", "")
    if (cuerpo.length != 4) return null
    val horas = cuerpo.substring(0, 2).toIntOrNull() ?: return null
    val minutos = cuerpo.substring(2, 4).toIntOrNull() ?: return null
    val offsetMillis = signo * (horas * 3_600_000L + minutos * 60_000L)
    return utcNaive - offsetMillis
}
