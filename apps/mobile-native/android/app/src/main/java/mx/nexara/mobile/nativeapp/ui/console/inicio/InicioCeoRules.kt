package mx.nexara.mobile.nativeapp.ui.console.inicio

import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import kotlin.math.roundToInt
import mx.nexara.mobile.nativeapp.data.api.AprobacionPendienteDto
import mx.nexara.mobile.nativeapp.data.api.KpisEquipoDto
import mx.nexara.mobile.nativeapp.data.api.PagoEmpleadoDto
import mx.nexara.mobile.nativeapp.data.api.RevisionPendienteDto
import mx.nexara.mobile.nativeapp.data.api.TeamBoardUserDto
import mx.nexara.mobile.nativeapp.ui.console.activities.EnEsperaRevision
import mx.nexara.mobile.nativeapp.ui.console.activities.EquipoEstado
import mx.nexara.mobile.nativeapp.ui.console.more.KpisEquipoRules
import mx.nexara.mobile.nativeapp.ui.console.pagos.PagosRules
import mx.nexara.mobile.nativeapp.ui.console.viaticos.Dinero

/**
 * Inicio de dirección general en el teléfono (canvas «App · Inicio CEO», 29-10): lo que ve en la
 * web, con los mismos endpoints que ya usa la app — `me/board` (equipo de hoy), `me/revisiones`
 * (por validar), `workflow/my-pending` (aprobaciones), `employee-payments` (pagos en borrador) y
 * `me/kpis/equipo` (desempeño de 7 días, índice v2 por pilares con `KpisEquipoRules`). Cada
 * sección es opcional: si su endpoint falla o el rol
 * no lo ve, no se pinta. Sin Android: `InicioCeoRulesTest`.
 */
object InicioCeoRules {
    data class EquipoHoy(
        val enJornada: Int,
        val total: Int,
        val trabajando: Int,
        val sinActividad: Int,
        val atrasadas: Int,
    )

    fun equipoHoy(users: List<TeamBoardUserDto>): EquipoHoy? {
        if (users.isEmpty()) return null
        val r = EquipoEstado.resumen(users)
        return EquipoHoy(
            enJornada = (r.total - r.sinEntrada).coerceAtLeast(0),
            total = r.total,
            trabajando = r.trabajando,
            sinActividad = r.sinNada,
            atrasadas = r.atrasados,
        )
    }

    data class Pendiente(val clave: String, val titulo: String, val detalle: String, val cuenta: Int)

    /** «Requiere tu atención»: solo lo que tiene algo; en orden de lo que más se acumula. */
    fun pendientes(
        revisiones: List<RevisionPendienteDto>?,
        aprobaciones: List<AprobacionPendienteDto>?,
        pagos: List<PagoEmpleadoDto>?,
        ahora: Instant = Instant.now(),
    ): List<Pendiente> {
        val out = mutableListOf<Pendiente>()
        revisiones?.takeIf { it.isNotEmpty() }?.let { lista ->
            val vieja = EnEsperaRevision.ordenar(lista).firstOrNull()
            val espera = EnEsperaRevision.minutosEsperando(vieja?.enviadaAt, ahora)
                ?.let { "La más vieja, de ${EnEsperaRevision.textoEspera(it)}" }
                ?: "Lo que tu equipo envió"
            out += Pendiente(CLAVE_REVISION, "Evidencias por validar", espera, lista.size)
        }
        aprobaciones?.takeIf { it.isNotEmpty() }?.let {
            out += Pendiente(CLAVE_APROBACIONES, "Aprobaciones", "Solicitudes que esperan tu firma", it.size)
        }
        pagos?.filter { PagosRules.estadoDe(it) == PagosRules.Estado.BORRADOR }?.takeIf { it.isNotEmpty() }?.let { borradores ->
            val total = borradores.sumOf { PagosRules.centavosDe(it) ?: 0L }
            val detalle = "${borradores.size} en borrador" + if (total > 0) " · ${Dinero.pesos(total)}" else ""
            out += Pendiente(CLAVE_PAGOS, "Pagos por autorizar", detalle, borradores.size)
        }
        return out
    }

    data class Desempeno(
        /** Índice v2 del equipo (0–100) para el anillo; null si el rango no tuvo nada que medir. */
        val indicePct: Int?,
        /** Menos de 10 entregas medidas: confianza baja, el índice es provisional. */
        val provisional: Boolean,
        val renglones: List<String>,
        /** Color del anillo: `semaforoIndice` del API; sin él, el corte 90/75. */
        val tono: KpisEquipoRules.Semaforo = KpisEquipoRules.Semaforo.SIN_DATOS,
    )

    /**
     * La tarjeta «Desempeño · 7 días»: el anillo es el índice v2 del equipo y los renglones son
     * sus cuatro pilares, como la tabla de la web («Confiabilidad 94 · Calidad 88»,
     * «Rendimiento 62 · Disciplina 91»). Sin partes del índice (API anterior), las entregas a
     * tiempo. Con confianza baja, el anillo se marca provisional.
     */
    fun desempeno(k: KpisEquipoDto?): Desempeno? {
        val t = k?.equipo?.totales ?: return null
        val pct = t.cumplimientoPct?.takeIf { it.isFinite() }?.roundToInt()?.coerceIn(0, 100)
        val provisional = pct != null && KpisEquipoRules.confianza(t) == KpisEquipoRules.Confianza.BAJA
        val pilares = KpisEquipoRules.pilares(t)
        val renglones = buildList {
            if (pilares.any { it.pct != null }) {
                pilares.chunked(2).forEach { par ->
                    add(par.joinToString(" · ") { "${it.etiqueta} ${it.pct ?: "—"}" })
                }
            } else {
                t.entregas?.let { e ->
                    val medidas = e.medidas ?: 0
                    if (medidas > 0) add("Entregas a tiempo ${e.aTiempo ?: 0} de $medidas")
                }
            }
            if (provisional) {
                val medidas = t.entregas?.medidas ?: 0
                add(
                    if (medidas > 0) {
                        "Índice provisional: ${medidas} ${if (medidas == 1) "entrega medida" else "entregas medidas"}"
                    } else {
                        "Índice provisional: sin entregas medidas"
                    },
                )
            }
        }
        if (pct == null && renglones.isEmpty()) return null
        return Desempeno(pct, provisional, renglones, KpisEquipoRules.tonoIndice(t))
    }

    /** Lo que lee el lector de pantalla del anillo: «Índice 86 de 100», «Índice sin datos». */
    fun descripcionAnillo(d: Desempeno): String = when {
        d.indicePct == null -> "Índice sin datos"
        d.provisional -> "Índice ${d.indicePct} de 100, provisional"
        else -> "Índice ${d.indicePct} de 100"
    }

    /** Los últimos 7 días, de hoy hacia atrás, en hora de México (`desde`, `hasta`). */
    fun rangoSieteDias(hoy: LocalDate = LocalDate.now(ZoneId.of("America/Mexico_City"))): Pair<String, String> =
        hoy.minusDays(6).toString() to hoy.toString()

    const val CLAVE_REVISION = "revision"
    const val CLAVE_APROBACIONES = "aprobaciones"
    const val CLAVE_PAGOS = "pagos"
}
