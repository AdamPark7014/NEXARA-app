package mx.nexara.mobile.nativeapp.ui.console.activities

import kotlin.math.roundToInt
import mx.nexara.mobile.nativeapp.data.api.ActivityAssigneeRefDto
import mx.nexara.mobile.nativeapp.data.api.ActivityDto
import mx.nexara.mobile.nativeapp.data.api.DesgloseTiempoDto

/**
 * Tarjeta «Tiempo» y renglón «Tiempo estándar» del detalle de actividad, como la web
 * (`TiempoActividad.tsx` con `medidorDeTiempo` de `apps/web/lib/actividad-tiempos.ts`, y
 * `resumenEstandar` de `apps/web/lib/tiempo-estandar.ts`). Reglas puras: `ActividadTiempoRulesTest`.
 */
object ActividadTiempoRules {

    /** Sin tiempo máximo, el tope es el plan más este margen (el mismo de los KPI). */
    const val TOLERANCIA_DEL_PLAN = 1.25

    enum class Estado { SIN_PLAN, EN_TIEMPO, CERCA, EXCEDIDA }

    data class Medidor(
        val real: Int,
        val plan: Int?,
        val tope: Int?,
        /** real ÷ plan, de 0 a 1: el anillo da una vuelta en el plan. `null` sin plan. */
        val avance: Float?,
        val estado: Estado,
        /** «va en tiempo», «le quedan 40 min para el tope», «se pasó 25 min del tope». */
        val texto: String,
    )

    /** «2 h 35 min», «45 min», «0 min»; `null` sin dato (igual que `formatoMinutos` de la web). */
    fun formatoMinutos(min: Double?): String? {
        if (min == null || !min.isFinite() || min < 0) return null
        val total = min.roundToInt()
        val h = total / 60
        val m = total % 60
        if (h <= 0) return "$m min"
        return if (m != 0) "$h h $m min" else "$h h"
    }

    fun formatoMinutos(min: Int?): String? = formatoMinutos(min?.toDouble())

    /**
     * Lo trabajado contra lo planeado y el tope (su tiempo máximo, o el plan + 25 %).
     * «Cerca» = ya pasó el plan sin llegar al tope; «excedida» = pasó el tope.
     */
    fun medidor(minutosPlan: Double?, minutosReales: Double?, tiempoMaximoMin: Double?): Medidor {
        val real = (minutosReales?.takeIf { it.isFinite() } ?: 0.0).coerceAtLeast(0.0).roundToInt()
        val plan = minutosPlan?.takeIf { it.isFinite() }?.roundToInt()?.takeIf { it > 0 }
        val maximo = tiempoMaximoMin?.takeIf { it.isFinite() }?.roundToInt()?.takeIf { it > 0 }
        val tope = maximo ?: plan?.let { (it * TOLERANCIA_DEL_PLAN).roundToInt() }
        if (plan == null) {
            return Medidor(
                real = real,
                plan = null,
                tope = tope,
                avance = null,
                estado = Estado.SIN_PLAN,
                texto = if (real > 0) "sin tiempo planeado" else "aún sin tiempo",
            )
        }
        val avance = (real.toFloat() / plan).coerceIn(0f, 1f)
        if (tope != null && real > tope) {
            return Medidor(real, plan, tope, avance, Estado.EXCEDIDA, "se pasó ${formatoMinutos(real - tope)} del tope")
        }
        if (real > plan) {
            val texto = if (tope != null) "le quedan ${formatoMinutos(tope - real)} para el tope" else "ya pasó lo planeado"
            return Medidor(real, plan, tope, avance, Estado.CERCA, texto)
        }
        return Medidor(real, plan, tope, avance, Estado.EN_TIEMPO, "va en tiempo")
    }

    /**
     * El medidor de quien abre el detalle: su renglón del equipo si lo tiene; si no (un jefe que
     * revisa), el resumen de la actividad. Igual que la web (`miFila?.minutosPlan ?? activity.minutosPlan`).
     */
    fun medidorDe(detail: ActivityDto, miFila: ActivityAssigneeRefDto?): Medidor = medidor(
        minutosPlan = miFila?.minutosPlan ?: detail.minutosPlan,
        minutosReales = miFila?.minutosReales ?: detail.minutosReales,
        tiempoMaximoMin = detail.tiempoMaximoMin?.toDouble(),
    )

    /** Sin plan y sin nada trabajado no hay nada que contar: la tarjeta no se pinta. */
    fun visible(m: Medidor): Boolean = !(m.estado == Estado.SIN_PLAN && m.real == 0)

    /**
     * «En curso»: el reloj de CUALQUIERA del equipo que siga en la actividad, no solo el de quien
     * mira (un jefe que revisa no está en el equipo y nunca veía que el reloj corría).
     */
    fun enCurso(assignees: List<ActivityAssigneeRefDto>?): Boolean =
        assignees.orEmpty().any { it.retiradoAt.isNullOrBlank() && !it.sesionAbiertaDesde.isNullOrBlank() }

    fun realTexto(m: Medidor): String = formatoMinutos(m.real) ?: "0 min"

    fun contraTexto(m: Medidor): String =
        if (m.plan != null) "de ${formatoMinutos(m.plan)} planeadas" else "trabajadas"

    /** «Tope: 2 h 30 min (plan + 25 %)»; sin «plan + 25 %» cuando el tope es su tiempo máximo. */
    fun pieTope(m: Medidor, tiempoMaximoMin: Double?): String? {
        val tope = m.tope ?: return null
        val propio = tiempoMaximoMin != null && tiempoMaximoMin.isFinite() && tiempoMaximoMin > 0
        return "Tope: ${formatoMinutos(tope)}" + if (propio) "" else " (plan + 25 %)"
    }

    /** «Estándar: 4 h · lleva el 35 % del estándar». */
    fun pieEstandar(minutosEstandar: Double?, m: Medidor): String? {
        val estandar = minutosEstandar?.takeIf { it.isFinite() && it > 0 } ?: return null
        val base = "Estándar: ${formatoMinutos(estandar)}"
        if (m.real <= 0) return base
        return "$base · lleva el ${(m.real / estandar * 100).roundToInt()} % del estándar"
    }

    /** Lo que lee TalkBack sobre el anillo. */
    fun etiquetaAccesible(m: Medidor): String =
        if (m.plan != null) "${realTexto(m)} de ${formatoMinutos(m.plan)} planeadas: ${m.texto}" else m.texto

    // ── Tiempo estándar en «Datos de la actividad» ──────────────────────────

    data class ResumenEstandar(val valor: String, val detalle: String?)

    /**
     * «4 h» con su desglose en una línea: «Base de cotización 40 min · 50 partidas × 4 min 3 h 20 min
     * · Destino: … (en transporte) · Se cambió el tiempo: …». `null` sin tiempo estándar guardado.
     */
    fun resumenEstandar(
        tiempoEstandarMin: Double?,
        desglose: List<DesgloseTiempoDto>?,
        destinoDireccion: String?,
        trasladoModo: String?,
        motivoCambio: String?,
    ): ResumenEstandar? {
        val total = tiempoEstandarMin?.takeIf { it.isFinite() } ?: return null
        val partes = mutableListOf<String>()
        desglose.orEmpty().forEach { d ->
            val concepto = d.concepto?.trim()?.takeIf { it.isNotEmpty() } ?: return@forEach
            val min = d.minutos?.takeIf { it.isFinite() && it > 0 }
            // «Supuesto: …» llega con 0: va sin minutos.
            partes += if (min != null) "$concepto ${minutos(min)}" else concepto
        }
        destinoDireccion?.trim()?.takeIf { it.isNotEmpty() }?.let { dir ->
            val enTransporte = trasladoModo?.trim().equals("TRANSPORTE", ignoreCase = true)
            partes += "Destino: $dir" + if (enTransporte) " (en transporte)" else ""
        }
        motivoCambio?.trim()?.takeIf { it.isNotEmpty() }?.let { partes += "Se cambió el tiempo: $it" }
        return ResumenEstandar(valor = minutos(total), detalle = partes.takeIf { it.isNotEmpty() }?.joinToString(" · "))
    }

    fun resumenEstandar(a: ActivityDto): ResumenEstandar? = resumenEstandar(
        tiempoEstandarMin = a.tiempoEstandarMin,
        desglose = a.estandarDesglose,
        destinoDireccion = a.destino?.direccion,
        trasladoModo = a.trasladoModo,
        motivoCambio = a.estandarCambiadoMotivo,
    )

    private fun minutos(min: Double): String = formatoMinutos(min) ?: "${min.roundToInt()} min"
}
