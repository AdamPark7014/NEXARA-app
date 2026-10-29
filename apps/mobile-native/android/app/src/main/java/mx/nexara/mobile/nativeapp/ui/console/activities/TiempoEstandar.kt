package mx.nexara.mobile.nativeapp.ui.console.activities

import com.squareup.moshi.Moshi
import com.squareup.moshi.kotlin.reflect.KotlinJsonAdapterFactory
import java.text.Normalizer
import mx.nexara.mobile.nativeapp.data.api.CreateActivityRequest
import mx.nexara.mobile.nativeapp.data.api.TablaEstandarDto

/**
 * Tiempo estándar al asignar a otra persona (§8, tarifas de Adam). Espejo de
 * apps/web/lib/tiempo-estandar.ts: la tabla vive en la API (`GET ai/estandar/tabla`) y la suma se
 * hace aquí con la misma fórmula que `calcularEstandar`, para que el formulario responda al
 * instante. La IA solo propone la cantidad (y el destino); quien asigna la confirma y el tiempo lo
 * da la tabla. Reglas puras: `TiempoEstandarTest`.
 */
object TiempoEstandar {
    const val TOPE_MIN = 720

    /** Cambiar el tiempo del estándar pide un motivo de al menos esto. */
    const val MOTIVO_MINIMO = 5

    data class Unidad(
        val clave: String,
        val singular: String,
        val plural: String,
        val pregunta: String,
        val porUnidadMin: Int,
        /** Unidades que ya cubre la base; se cobran solo las de más (cotización: hasta 10 partidas). */
        val incluidas: Int = 0,
        /** «Jornadas en sitio»: cada una ya es el día completo; no se suma la base del tipo. */
        val sinBase: Boolean = false,
    )

    data class Regla(
        val clave: String,
        val nombre: String,
        val baseMin: Int,
        val unidades: List<Unidad>,
        /** `BASICA`…`CRITICA` → minutos, en los tipos sin cantidad. */
        val porComplejidad: Map<String, Int>? = null,
        val destino: Boolean = false,
        val enLugarMin: Int = 0,
        /** Juntas, cursos, guardias: dura lo que dure la agenda; no hay estándar. */
        val agenda: Boolean = false,
    )

    data class Tabla(val reglas: List<Regla>, val topeMin: Int = TOPE_MIN, val origen: String? = null)

    data class Concepto(val concepto: String, val minutos: Int)

    data class Traslado(val idaMin: Int, val vueltaMin: Int)

    enum class Faltante { CANTIDAD, DESTINO, COMPLEJIDAD }

    data class Resultado(
        val totalMin: Int?,
        val desglose: List<Concepto>,
        val faltan: List<Faltante>,
        val topado: Boolean,
    )

    /** La tabla tal como llega; lo que venga incompleto se descarta. */
    fun desde(dto: TablaEstandarDto?): Tabla? {
        if (dto == null) return null
        val reglas = dto.reglas.orEmpty().mapNotNull { r ->
            val clave = r.clave?.trim()?.takeIf { it.isNotEmpty() } ?: return@mapNotNull null
            Regla(
                clave = clave,
                nombre = r.nombre?.trim()?.takeIf { it.isNotEmpty() } ?: clave,
                baseMin = entero(r.baseMin),
                unidades = r.unidades.orEmpty().mapNotNull { u ->
                    val uc = u.clave?.trim()?.takeIf { it.isNotEmpty() } ?: return@mapNotNull null
                    val plural = u.plural?.trim()?.takeIf { it.isNotEmpty() } ?: uc
                    Unidad(
                        clave = uc,
                        singular = u.singular?.trim()?.takeIf { it.isNotEmpty() } ?: plural,
                        plural = plural,
                        pregunta = u.pregunta?.trim()?.takeIf { it.isNotEmpty() } ?: "¿Cuántos $plural?",
                        porUnidadMin = entero(u.porUnidadMin),
                        incluidas = entero(u.incluidas),
                        sinBase = u.sinBase == true,
                    )
                },
                porComplejidad = r.porComplejidad?.mapValues { entero(it.value) }?.takeIf { it.isNotEmpty() },
                destino = r.destino == true,
                enLugarMin = entero(r.enLugarMin),
                agenda = r.agenda == true,
            )
        }
        if (reglas.isEmpty()) return null
        return Tabla(
            reglas = reglas,
            topeMin = dto.topeMin?.takeIf { it > 0 }?.let { entero(it) } ?: TOPE_MIN,
            origen = dto.origen?.nombre?.trim()?.takeIf { it.isNotEmpty() },
        )
    }

    private fun entero(v: Double?): Int = v?.takeIf { it.isFinite() && it > 0 }?.let { Math.round(it).toInt() } ?: 0

    private fun normalizar(texto: String?): String =
        Normalizer.normalize(texto.orEmpty(), Normalizer.Form.NFD)
            .replace(Regex("\\p{Mn}+"), "")
            .lowercase()
            .replace(Regex("\\s+"), " ")
            .trim()

    /**
     * La clave de la tabla para lo que se asigna (`claveEstandar` web): en tarea, su subtipo del
     * catálogo; en servicio, el tipo de ticket; en lo demás, el tipo Core.
     */
    fun clave(coreKind: String?, ticketType: String?, tipoTarea: String?): String? {
        val kind = normalizar(coreKind)
        if (kind.isEmpty()) return null
        if (kind == "tarea") return tipoTarea?.takeIf { it.isNotBlank() }?.let { "tarea:$it" }
        if (kind == "servicio") return "servicio:${ticketType?.takeIf { it.isNotBlank() }?.uppercase() ?: "PREVENTIVO"}"
        return kind
    }

    /** Sin pelear con acentos ni mayúsculas; null si el tipo no tiene regla. */
    fun reglaPara(tabla: Tabla?, clave: String?): Regla? {
        if (tabla == null || clave == null) return null
        val buscada = normalizar(clave)
        return tabla.reglas.firstOrNull { normalizar(it.clave) == buscada }
    }

    /** La unidad elegida o, si no está en la regla, la primera (la de omisión). */
    fun unidad(regla: Regla?, clave: String?): Unidad? =
        regla?.unidades?.let { us -> us.firstOrNull { it.clave == clave } ?: us.firstOrNull() }

    /** La misma cuenta que la API: base + (cantidad − incluidas) × tarifa (o por complejidad) + ida y vuelta + en el lugar. */
    fun calcular(
        regla: Regla,
        cantidad: Int? = null,
        unidad: String? = null,
        complejidad: String? = null,
        traslado: Traslado? = null,
        topeMin: Int = TOPE_MIN,
    ): Resultado {
        val desglose = mutableListOf<Concepto>()
        val faltan = mutableListOf<Faltante>()
        val porComplejidad = regla.porComplejidad
        if (regla.agenda) return Resultado(null, desglose, faltan, false)
        if (regla.unidades.isNotEmpty()) {
            val u = unidad(regla, unidad)!!
            val n = (cantidad ?: 0).coerceAtLeast(0)
            val incluidas = u.incluidas.coerceAtLeast(0)
            if (regla.baseMin > 0 && !u.sinBase) {
                val hasta = if (incluidas > 0) " (hasta $incluidas ${u.plural})" else ""
                desglose += Concepto("Base de ${regla.nombre.lowercase()}$hasta", regla.baseMin)
            }
            // Lo que la base ya cubre no se cobra otra vez: solo las unidades de más.
            val extra = n - incluidas
            if (n > 0 && extra > 0) {
                val nombre = if (extra == 1) u.singular else u.plural
                desglose += Concepto("$extra $nombre${if (incluidas > 0) " más" else ""} × ${u.porUnidadMin} min", extra * u.porUnidadMin)
            }
            if (n <= 0) faltan += Faltante.CANTIDAD
        } else if (porComplejidad != null) {
            val min = complejidad?.let { porComplejidad[it] }
            if (min != null) desglose += Concepto("${regla.nombre} · complejidad", min) else faltan += Faltante.COMPLEJIDAD
        } else if (regla.baseMin > 0) {
            desglose += Concepto(regla.nombre, regla.baseMin)
        }
        if (regla.destino) {
            if (traslado != null) {
                desglose += Concepto("Ida", traslado.idaMin.coerceAtLeast(0))
                desglose += Concepto("Vuelta", traslado.vueltaMin.coerceAtLeast(0))
            } else {
                faltan += Faltante.DESTINO
            }
            if (regla.enLugarMin > 0) desglose += Concepto("En el lugar", regla.enLugarMin)
        }
        if (faltan.isNotEmpty()) return Resultado(null, desglose, faltan, false)
        val suma = desglose.sumOf { it.minutos }
        val redondeado = maxOf(5, Math.round(suma / 5.0).toInt() * 5)
        return Resultado(minOf(topeMin, redondeado), desglose, faltan, redondeado > topeMin)
    }

    /** «Para calcularlo falta la cantidad de dispositivos.» / «… falta la complejidad y el destino.» */
    fun textoFaltan(faltan: List<Faltante>, regla: Regla?): String? {
        if (faltan.isEmpty()) return null
        val nombres = faltan.map {
            when (it) {
                Faltante.CANTIDAD -> regla?.unidades?.firstOrNull()?.let { u -> "la cantidad de ${u.plural}" } ?: "la cantidad"
                Faltante.DESTINO -> "el destino"
                Faltante.COMPLEJIDAD -> "la complejidad"
            }
        }
        val lista = if (nombres.size == 1) nombres[0] else "${nombres.dropLast(1).joinToString(", ")} y ${nombres.last()}"
        return "Para calcularlo falta $lista."
    }

    /** El motivo para no usar el estándar: obligatorio y con sustancia. */
    fun motivoValido(motivo: String?): Boolean = motivo.orEmpty().trim().length >= MOTIVO_MINIMO

    /** «Sale de la complejidad: Básica 1 h · Estándar 2 h · …». */
    fun textoPorComplejidad(regla: Regla): String? {
        val tabla = regla.porComplejidad ?: return null
        val partes = Complejidad.NIVELES.mapNotNull { n -> tabla[n.id]?.let { "${n.label} ${Complejidad.formatoMinutos(it)}" } }
        return if (partes.isEmpty()) null else "Sale de la complejidad: ${partes.joinToString(" · ")}."
    }

    // ── Lo que viaja a la API ───────────────────────────────────────────────

    data class Unidades(val clave: String, val cantidad: Int)

    /**
     * Los campos del estándar para `POST activities` (los mismos nombres que la API). Cada uno solo
     * si se calculó: sin total no hay `tiempoEstandarMin` ni desglose (la API los completa), y el
     * motivo solo si quien asigna cambió el tiempo con un motivo válido.
     */
    data class Envio(
        val unidades: Unidades? = null,
        val tiempoEstandarMin: Int? = null,
        val desglose: List<Concepto>? = null,
        val motivo: String? = null,
    ) {
        val vacio: Boolean get() = unidades == null && tiempoEstandarMin == null

        fun campos(): Map<String, Any?> = buildMap {
            unidades?.let { put("unidades", mapOf("clave" to it.clave, "cantidad" to it.cantidad)) }
            tiempoEstandarMin?.let { total ->
                put("tiempoEstandarMin", total)
                put("estandarDesglose", desglose.orEmpty().map { mapOf("concepto" to it.concepto, "minutos" to it.minutos) })
                motivo?.trim()?.takeIf { it.isNotEmpty() }?.let { put("estandarCambiadoMotivo", it) }
            }
        }
    }

    /**
     * El estándar armado con lo capturado. null sin regla, en tipos de agenda o si no hay nada que
     * mandar (ni cantidad ni total).
     */
    fun envio(regla: Regla?, resultado: Resultado?, cantidad: Int?, unidad: Unidad?, cambiando: Boolean, motivo: String?): Envio? {
        if (regla == null || regla.agenda || resultado == null) return null
        val n = (cantidad ?: 0).coerceAtLeast(0)
        val total = resultado.totalMin
        val e = Envio(
            unidades = if (regla.unidades.isNotEmpty() && n > 0 && unidad != null) Unidades(unidad.clave, n) else null,
            tiempoEstandarMin = total,
            desglose = if (total != null) resultado.desglose else null,
            motivo = if (total != null && cambiando && motivoValido(motivo)) motivo!!.trim() else null,
        )
        return e.takeUnless { it.vacio }
    }

    /**
     * El tiempo que fija el estándar en «¿Cuánto tiempo toma?»: el total mientras nadie lo cambie
     * con motivo; null = el campo es libre (sin total, o cambiado con motivo).
     */
    fun minutosFijos(envio: Envio?): Int? = envio?.takeIf { it.motivo == null }?.tiempoEstandarMin

    /**
     * El cuerpo que sale. Nunca un `tiempoEstandarMin` distinto del estimado sin motivo (la API
     * responde 400): sin motivo, el estimado es el estándar.
     */
    fun ajustar(body: CreateActivityRequest, envio: Envio?): CreateActivityRequest {
        val fijo = minutosFijos(envio) ?: return body
        return if (body.tiempoEstimadoMin == fijo) body else body.copy(tiempoEstimadoMin = fijo)
    }

    private val moshi: Moshi by lazy { Moshi.Builder().add(KotlinJsonAdapterFactory()).build() }

    /** `CreateActivityRequest` + los campos del estándar, como mapa para `POST activities`. */
    fun cuerpo(body: CreateActivityRequest, envio: Envio): Map<String, Any?> {
        val ajustado = ajustar(body, envio)
        @Suppress("UNCHECKED_CAST")
        val base = moshi.adapter(CreateActivityRequest::class.java).toJsonValue(ajustado) as? Map<String, Any?> ?: emptyMap()
        return LinkedHashMap(base.filterValues { it != null }).apply { putAll(envio.campos()) }
    }
}

/** Alta lista para mandar: el cuerpo de siempre y, si se calculó, el tiempo estándar. */
data class AltaCore(val body: CreateActivityRequest, val estandar: TiempoEstandar.Envio? = null)
