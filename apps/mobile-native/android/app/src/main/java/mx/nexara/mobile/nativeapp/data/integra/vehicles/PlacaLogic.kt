package mx.nexara.mobile.nativeapp.data.integra.vehicles

/**
 * Lógica del inventario de placas de INTEGRA — espejo exacto de
 * `apps/web/app/(panels)/integra/vehicles/_placas.ts`.
 *
 * ── Lo que hace el servidor y hay que respetar ───────────────────────────────
 * `POST /integra/vehicles` (`integra-artemis.service.ts` → `addVehicle`) en la
 * rama ISAPI hace:
 *
 *     const plate = body.plateNo.trim().toUpperCase();
 *     if (!plate) throw new BadRequestException('Placa requerida');
 *     const vehicleId = `local-${plate.replace(/[^A-Z0-9]/gi, '')}`;
 *     await this.prisma.integraVehicle.upsert({ where: { siteId_vehicleId: … } … })
 *
 * De ahí salen las dos reglas que importan y que no son opinión:
 *
 * 1. La identidad de un vehículo es su placa **sin nada que no sea letra o
 *    número**. `ABC-123` y `ABC 123` son el mismo vehículo para el servidor.
 * 2. Es un `upsert`, no un `create`: dar de alta una placa que ya existe
 *    **sobrescribe la ficha anterior en silencio**, dueño incluido. Por eso la
 *    pantalla lo detecta antes y lo dice, en vez de dejar que pase.
 *
 * Verificado contra `apps/api/src/integra/integra-artemis.service.ts:2242` el
 * 2026-09-06: el `upsert` sigue ahí. Esta protección es de cliente; no arregla
 * el servidor y no pretende hacerlo.
 *
 * `plateNo` es `VARCHAR(40)` en `integra_vehicles`.
 */

/** `integra_vehicles.plateNo` es VARCHAR(40): más no cabe. */
private const val PLACA_MAX = 40

/**
 * Por debajo de esto la placa es casi seguro un dedazo, pero se deja guardar:
 * avisar es correcto, bloquear un dato que el servidor sí acepta no lo es.
 */
private const val PLACA_ALFANUM_ESPERADOS = 5

/** Los mismos límites, expuestos para la UI y para las pruebas. */
object PlacaLimites {
    const val MAX = PLACA_MAX
    const val ALFANUM_ESPERADOS = PLACA_ALFANUM_ESPERADOS
}

/**
 * Vehículo ya saneado. `id` y `plate` nunca son nulos aquí porque
 * [VehiculoDto.aDominio] los rellena; lo que puede faltar de verdad —el dueño—
 * se queda nulable.
 */
data class Vehiculo(
    val id: String,
    val plate: String,
    val personId: String? = null,
    val personName: String? = null,
)

data class PersonaResumen(
    val id: String,
    val name: String,
    val code: String? = null,
    val orgName: String? = null,
)

private val ESPACIOS = Regex("\\s+")
private val NO_ALFANUM = Regex("[^A-Z0-9]")
private val PERMITIDOS = Regex("^[A-Z0-9 -]+$")

/**
 * Lo mismo que hace el servidor antes de guardar: recortar y mayúsculas.
 *
 * `uppercase()` sin `Locale` usa la regla invariante; con la del dispositivo,
 * una `i` en turco se convierte en `İ` y la placa dejaría de coincidir con la
 * que guardó el servidor.
 */
fun normalizarPlaca(bruta: String): String =
    bruta.trim().replace(ESPACIOS, " ").uppercase()

/**
 * La clave con la que el servidor identifica al vehículo. Replica exactamente
 * `plate.replace(/[^A-Z0-9]/gi, '')`: dos placas con la misma clave son, para
 * el backend, el mismo vehículo.
 */
fun claveDePlaca(placa: String): String =
    normalizarPlaca(placa).replace(NO_ALFANUM, "")

data class ValidacionPlaca(
    /** Si se puede mandar al servidor. */
    val valida: Boolean = false,
    /** Tal y como quedará guardada. */
    val normalizada: String,
    /** Motivo por el que no se puede mandar. */
    val error: String? = null,
    /** Se puede mandar, pero huele raro. No bloquea. */
    val aviso: String? = null,
)

fun validarPlaca(bruta: String): ValidacionPlaca {
    val normalizada = normalizarPlaca(bruta)

    if (normalizada.isEmpty()) {
        return ValidacionPlaca(normalizada = normalizada, error = "Escribe una placa.")
    }
    if (normalizada.length > PLACA_MAX) {
        return ValidacionPlaca(
            normalizada = normalizada,
            error = "La placa no puede pasar de $PLACA_MAX caracteres; " +
                "esta tiene ${normalizada.length}.",
        )
    }
    if (!PERMITIDOS.matches(normalizada)) {
        return ValidacionPlaca(
            normalizada = normalizada,
            error = "Solo se admiten letras, números, espacios y guiones.",
        )
    }

    val alfanumericos = claveDePlaca(normalizada).length
    if (alfanumericos == 0) {
        // Sin letras ni números el servidor construiría el id `local-`, el mismo
        // para todas: la siguiente alta pisaría a esta.
        return ValidacionPlaca(
            normalizada = normalizada,
            error = "Una placa necesita alguna letra o número: el servidor los usa " +
                "para construir su identificador.",
        )
    }

    return ValidacionPlaca(
        valida = true,
        normalizada = normalizada,
        aviso = if (alfanumericos < PLACA_ALFANUM_ESPERADOS) {
            "Solo $alfanumericos caracteres útiles. Se puede guardar, pero una placa " +
                "suele tener $PLACA_ALFANUM_ESPERADOS o más."
        } else {
            null
        },
    )
}

/**
 * Busca si otra ficha ya ocupa esa placa.
 *
 * `exceptoId` deja fuera la que se está editando: no es un duplicado de sí
 * misma. Compara por clave, no por texto, porque `ABC-123` y `ABC 123` son la
 * misma placa para el servidor.
 */
fun placaDuplicada(
    placa: String,
    vehiculos: List<Vehiculo>,
    exceptoId: String? = null,
): Vehiculo? {
    val clave = claveDePlaca(placa)
    if (clave.isEmpty()) return null
    return vehiculos.firstOrNull { it.id != exceptoId && claveDePlaca(it.plate) == clave }
}

/** El aviso literal que ve el operador cuando la placa ya existe. */
fun avisoDuplicado(duplicado: Vehiculo): String =
    "Ya existe una ficha con esa placa (${duplicado.plate}). Guardarla otra vez no " +
        "crearía otra: el servidor sobrescribiría la actual, dueño incluido."

enum class FiltroDueno(val raw: String) {
    TODAS(""),
    CON("con"),
    SIN("sin"),
}

/** La URL o un estado guardado pueden traer basura: solo se aceptan los tres valores. */
fun filtroDuenoDe(v: String?): FiltroDueno =
    FiltroDueno.entries.firstOrNull { it.raw == v } ?: FiltroDueno.TODAS

fun esFiltroDueno(v: String?): Boolean = FiltroDueno.entries.any { it.raw == v }

data class FiltrosVehiculos(
    val q: String = "",
    val dueno: FiltroDueno = FiltroDueno.TODAS,
)

fun tieneDueno(v: Vehiculo): Boolean =
    !v.personId.isNullOrBlank() || !v.personName.isNullOrBlank()

fun filtrarVehiculos(items: List<Vehiculo>, filtros: FiltrosVehiculos): List<Vehiculo> {
    val q = filtros.q.trim().lowercase()
    val claveQ = claveDePlaca(filtros.q)
    return items.filter { v ->
        when (filtros.dueno) {
            FiltroDueno.CON -> if (!tieneDueno(v)) return@filter false
            FiltroDueno.SIN -> if (tieneDueno(v)) return@filter false
            FiltroDueno.TODAS -> Unit
        }
        if (q.isEmpty()) return@filter true
        val enTexto =
            v.plate.lowercase().contains(q) ||
                v.personName.orEmpty().lowercase().contains(q) ||
                v.personId.orEmpty().lowercase().contains(q)
        // Buscar «ABC123» también tiene que encontrar «ABC-123».
        val enClave = claveQ.isNotEmpty() && claveDePlaca(v.plate).contains(claveQ)
        enTexto || enClave
    }
}

fun hayFiltroVehiculos(filtros: FiltrosVehiculos): Boolean =
    filtros.q.trim().isNotEmpty() || filtros.dueno != FiltroDueno.TODAS

/**
 * Cruce del vehículo con el padrón de personas.
 *
 * `personName` que guarda el servidor es una foto del momento del alta: si la
 * persona se dio de baja del ACS, el nombre sigue ahí y la persona no. Eso se
 * dice, no se disimula, porque una placa cuyo dueño ya no existe es justo lo
 * que hay que revisar.
 */
sealed class Dueno {
    data object SinDueno : Dueno()

    /** Persona presente en el padrón que se acaba de cargar. */
    data class Conocido(
        val id: String,
        val nombre: String,
        val persona: PersonaResumen,
    ) : Dueno()

    /** Hay `personId` (o un nombre suelto), pero esa persona ya no está en el padrón. */
    data class Ausente(val id: String, val nombre: String?) : Dueno()
}

fun resolverDueno(v: Vehiculo, personas: List<PersonaResumen>): Dueno {
    val id = v.personId?.trim().orEmpty()
    if (id.isEmpty()) {
        // Puede haber nombre sin id si vino de la plataforma; se trata como suelto.
        val nombre = v.personName?.trim().orEmpty()
        return if (nombre.isNotEmpty()) Dueno.Ausente(id = "", nombre = nombre) else Dueno.SinDueno
    }
    val persona = personas.firstOrNull { it.id == id }
    return if (persona != null) {
        // Gana el nombre vivo del padrón, no la foto guardada en el vehículo.
        Dueno.Conocido(id = id, nombre = persona.name, persona = persona)
    } else {
        Dueno.Ausente(id = id, nombre = v.personName?.trim()?.ifBlank { null })
    }
}

/** Nombre + lo que haga falta para distinguir a dos personas que se llaman igual. */
fun etiquetaPersona(p: PersonaResumen): String {
    val extras = listOfNotNull(p.code, p.orgName).filter { it.isNotBlank() }
    return if (extras.isNotEmpty()) "${p.name} (${extras.joinToString(" · ")})" else p.name
}

fun contarSinDueno(items: List<Vehiculo>): Int = items.count { !tieneDueno(it) }
