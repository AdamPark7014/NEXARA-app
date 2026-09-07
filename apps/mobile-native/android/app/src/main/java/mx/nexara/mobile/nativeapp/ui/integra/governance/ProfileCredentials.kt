package mx.nexara.mobile.nativeapp.ui.integra.governance

/**
 * Qué credenciales tiene el usuario, qué abre cada una y de dónde sale el dato.
 *
 * El criterio es el que ya se aplicó en la ficha de personas de la web: un dato
 * sin origen se lee como si el sistema se lo hubiera inventado, y en control de
 * acceso eso es exactamente lo que no puede pasar. Por eso cada fila lleva su
 * `fuente`.
 *
 * Hecho del modelo Hikvision que la pantalla dice en voz alta: **las puertas se
 * conceden a la persona, no a la credencial**. Rostro, huella y tarjeta abren
 * el mismo juego de puertas; elegir una u otra solo cambia cómo te identificas
 * ante el terminal. Presentarlo al revés haría creer que quitar la tarjeta
 * cierra un acceso, y no lo cierra.
 */

data class Credencial(
    val nombre: String,
    val presente: Boolean,
    /** Qué hay registrado: «1 rostro», «2 huellas», «No registrada». */
    val detalle: String,
    val queAbre: String,
    val fuente: String,
)

/** Estado del vínculo ERP↔ACS en cristiano, con su consecuencia práctica. */
data class EstadoVinculo(
    val titulo: String,
    val explicacion: String,
    val vinculado: Boolean,
)

// ── Lectura tolerante del mapa de la ficha ACS ────────────────────────────────

/**
 * Moshi entrega los números JSON como `Double`; el espejo ISAPI a veces manda
 * el mismo campo como cadena. Se aceptan las tres formas antes que enseñar un
 * hueco donde hay un dato.
 */
internal fun enteroDe(m: Map<String, Any?>, vararg claves: String): Int? {
    for (k in claves) {
        when (val v = m[k]) {
            is Number -> return v.toInt()
            is String -> v.trim().toIntOrNull()?.let { return it }
            else -> Unit
        }
    }
    return null
}

internal fun booleanoDe(m: Map<String, Any?>, vararg claves: String): Boolean? {
    for (k in claves) {
        when (val v = m[k]) {
            is Boolean -> return v
            is Number -> return v.toInt() != 0
            is String -> {
                val s = v.trim().lowercase()
                if (s == "true" || s == "1") return true
                if (s == "false" || s == "0") return false
            }
            else -> Unit
        }
    }
    return null
}

internal fun textoDe(m: Map<String, Any?>, vararg claves: String): String? {
    for (k in claves) {
        val v = m[k] ?: continue
        val s = when (v) {
            is String -> v
            is Number -> v.toString()
            else -> continue
        }
        if (s.isNotBlank() && s != "null") return s
    }
    return null
}

internal fun listaDeTextos(m: Map<String, Any?>, vararg claves: String): List<String> {
    for (k in claves) {
        val v = m[k]
        if (v is List<*>) {
            val textos = v.mapNotNull { e ->
                when (e) {
                    is String -> e.takeIf { it.isNotBlank() }
                    is Number -> e.toString()
                    else -> null
                }
            }
            if (textos.isNotEmpty()) return textos
        }
    }
    return emptyList()
}

/** Puertas que el plan de accesos de la persona abre, tal como las nombra el sitio. */
fun puertasDe(person: Map<String, Any?>): List<String> =
    listaDeTextos(person, "doorNames")

/**
 * Texto de «qué abre». Un plan sin puertas resueltas no se disimula con un
 * guion: se dice que hay plan pero que el sitio no devolvió los nombres, que es
 * un problema de sincronía y no una persona sin accesos.
 */
fun descripcionPuertas(person: Map<String, Any?>): String {
    val puertas = puertasDe(person)
    if (puertas.isNotEmpty()) return puertas.joinToString(", ")
    val plan = textoDe(person, "rightPlan", "doorRight")
    if (!plan.isNullOrBlank()) {
        return "Plan «$plan» — el sitio no devolvió los nombres de las puertas"
    }
    return "Ninguna puerta asignada"
}

/** Vigencia del permiso. Es tan credencial como el rostro: caducada, no abre. */
fun descripcionVigencia(person: Map<String, Any?>): String {
    val habilitado = booleanoDe(person, "validEnable")
    val desde = textoDe(person, "validFrom")
    val hasta = textoDe(person, "validTo")
    val ventana = when {
        desde != null && hasta != null ->
            "del ${formatearFechaAbsoluta(desde)} al ${formatearFechaAbsoluta(hasta)}"
        hasta != null -> "hasta el ${formatearFechaAbsoluta(hasta)}"
        desde != null -> "desde el ${formatearFechaAbsoluta(desde)}"
        else -> "sin ventana declarada"
    }
    return when (habilitado) {
        true -> "Activa · $ventana"
        false -> "Desactivada en el terminal · $ventana"
        null -> "Estado desconocido · $ventana"
    }
}

/**
 * Las credenciales de la persona.
 *
 * Se devuelven **todas**, también las que no tiene: saber que no hay huella
 * registrada es tan útil como saber que sí, y es lo que explica por qué el
 * lector de huella no la deja pasar.
 */
fun credencialesDe(person: Map<String, Any?>): List<Credencial> {
    val abre = descripcionPuertas(person)

    val rostros = enteroDe(person, "numOfFace") ?: 0
    val rostroLocal = booleanoDe(person, "hasLocalFace") == true
    val tieneRostro = booleanoDe(person, "hasFace") == true || rostros > 0 || rostroLocal

    val huellas = enteroDe(person, "numOfFP") ?: listaDeTextos(person, "localFpIds").size
    val tarjetas = listaDeTextos(person, "cardNos")
    val numTarjetas = enteroDe(person, "numOfCard") ?: tarjetas.size
    val employeeNo = textoDe(person, "id", "employeeNo", "personId")
    val codigo = textoDe(person, "code", "personCode")

    return listOf(
        Credencial(
            nombre = "Rostro",
            presente = tieneRostro,
            detalle = when {
                rostros > 0 -> "$rostros registrado(s) en el terminal"
                rostroLocal -> "Foto guardada en NEXARA, aún sin confirmar en el terminal"
                tieneRostro -> "Registrado"
                else -> "No registrado"
            },
            queAbre = abre,
            fuente = "integra/people/{id} · numOfFace · hasLocalFace (espejo del DS-K1T)",
        ),
        Credencial(
            nombre = "Huella",
            presente = huellas > 0,
            detalle = if (huellas > 0) "$huellas registrada(s)" else "No registrada",
            queAbre = abre,
            fuente = "integra/people/{id} · numOfFP · localFpIds",
        ),
        Credencial(
            nombre = "Tarjeta",
            presente = numTarjetas > 0,
            detalle = when {
                tarjetas.isNotEmpty() -> "${tarjetas.size}: ${tarjetas.joinToString(", ")}"
                numTarjetas > 0 -> "$numTarjetas registrada(s), sin número visible"
                else -> "No registrada"
            },
            queAbre = abre,
            fuente = "integra/people/{id} · numOfCard · cardNos (tabla de tarjetas del sitio)",
        ),
        Credencial(
            nombre = "Número de empleado (employeeNo)",
            presente = !employeeNo.isNullOrBlank(),
            detalle = employeeNo?.let {
                if (!codigo.isNullOrBlank() && codigo != it) "$it · código de persona $codigo" else it
            } ?: "Sin número en el terminal",
            queAbre = abre,
            fuente = "integra/people/{id} · es la clave que une el ERP con el ACS",
        ),
        Credencial(
            nombre = "Vigencia del permiso",
            presente = booleanoDe(person, "validEnable") != false,
            detalle = descripcionVigencia(person),
            queAbre = abre,
            fuente = "integra/people/{id} · validEnable · validFrom · validTo",
        ),
    )
}

/**
 * Qué significa el `status` de `integra/identity/me`.
 *
 * Los cuatro valores salen de `identity-link.service.ts`; uno desconocido se
 * muestra tal cual en vez de fingir que todo está bien.
 */
fun estadoVinculo(status: String?, nombreAcs: String?): EstadoVinculo = when (status) {
    "linked" -> EstadoVinculo(
        titulo = "Vinculado a ${nombreAcs ?: "una persona ACS"}",
        explicacion = "Tu número de empleado coincide con el employeeNo de un terminal: los pases que registres se te atribuyen a ti.",
        vinculado = true,
    )
    "erp_only" -> EstadoVinculo(
        titulo = "Con número de empleado, sin persona en el ACS",
        explicacion = "Tienes código en el ERP pero ningún terminal tiene una persona con ese employeeNo. Los lectores no te reconocerán.",
        vinculado = false,
    )
    "acs_only" -> EstadoVinculo(
        titulo = "Con persona en el ACS, sin número en el ERP",
        explicacion = "El terminal te conoce pero el ERP no guarda tu número de empleado, así que tus pases no se cruzan con tu asistencia.",
        vinculado = false,
    )
    "unlinked" -> EstadoVinculo(
        titulo = "Sin número de empleado",
        explicacion = "No hay ningún dato con el que unir tu usuario del ERP con una persona del control de acceso.",
        vinculado = false,
    )
    null -> EstadoVinculo(
        titulo = "Estado no disponible",
        explicacion = "El servidor no devolvió el estado del vínculo.",
        vinculado = false,
    )
    else -> EstadoVinculo(
        titulo = "Estado desconocido: $status",
        explicacion = "El servidor devolvió un estado que esta versión de la app no conoce. Se muestra tal cual en vez de suponer.",
        vinculado = false,
    )
}
