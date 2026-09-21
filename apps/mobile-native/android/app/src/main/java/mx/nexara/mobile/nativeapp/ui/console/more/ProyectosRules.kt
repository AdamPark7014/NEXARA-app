package mx.nexara.mobile.nativeapp.ui.console.more

import java.time.LocalDate
import java.time.format.DateTimeFormatter
import java.util.Locale
import mx.nexara.mobile.nativeapp.data.api.ProyectoResumenDto

/**
 * Proyectos en el teléfono: una tarjeta por proyecto en vez de la tabla de la
 * web. Lo primero que se lee es la salud (el semáforo que pidió dirección), y
 * debajo qué toca —el próximo hito— y cuánto va.
 *
 * Sin Android: se prueba en la JVM (`ProyectosRulesTest`).
 */
object ProyectosRules {

    /** `SaludProyecto` del servidor (`apps/api/src/projects/proyecto-salud.ts`). */
    enum class Salud(val clave: String, val etiqueta: String) {
        EN_RIESGO("EN_RIESGO", "En riesgo"),
        RETRASADO("RETRASADO", "Retrasado"),
        EN_TIEMPO("EN_TIEMPO", "En tiempo"),
        PLANEADO("PLANEADO", "Planeado"),
        SIN_PLAN("SIN_PLAN", "Sin fecha de fin"),
        TERMINADO("TERMINADO", "Terminado"),
        CANCELADO("CANCELADO", "Cancelado"),
        DESCONOCIDA("", "Sin clasificar"),
    }

    fun salud(valor: String?): Salud {
        val clave = valor?.trim()?.uppercase().orEmpty()
        return Salud.entries.firstOrNull { it.clave == clave && it != Salud.DESCONOCIDA } ?: Salud.DESCONOCIDA
    }

    fun saludDe(proyecto: ProyectoResumenDto): Salud = salud(proyecto.resumen?.salud)

    /**
     * Lo que arde primero. En la web se ordena por fecha de inicio porque la
     * tabla deja barrer veinte filas de un vistazo; en una columna de tarjetas
     * eso esconde el proyecto retrasado en el puesto catorce.
     */
    private fun peso(s: Salud): Int = when (s) {
        Salud.RETRASADO -> 0
        Salud.EN_RIESGO -> 1
        Salud.SIN_PLAN -> 2
        Salud.EN_TIEMPO -> 3
        Salud.PLANEADO -> 4
        Salud.DESCONOCIDA -> 5
        Salud.TERMINADO -> 6
        Salud.CANCELADO -> 7
    }

    fun ordenar(proyectos: List<ProyectoResumenDto>): List<ProyectoResumenDto> =
        proyectos.sortedWith(
            compareBy(
                { peso(saludDe(it)) },
                { it.title?.lowercase().orEmpty() },
            ),
        )

    /** Los filtros de arriba. `TODOS` no filtra; `ATENCION` junta retrasado y en riesgo. */
    enum class Filtro(val etiqueta: String) {
        TODOS("Todos"),
        ATENCION("Necesitan atención"),
        ACTIVOS("Activos"),
        CERRADOS("Cerrados"),
    }

    fun cumple(proyecto: ProyectoResumenDto, filtro: Filtro): Boolean {
        val s = saludDe(proyecto)
        return when (filtro) {
            Filtro.TODOS -> true
            Filtro.ATENCION -> s == Salud.RETRASADO || s == Salud.EN_RIESGO ||
                proyecto.resumen?.enRiesgo == true
            Filtro.ACTIVOS -> s != Salud.TERMINADO && s != Salud.CANCELADO
            Filtro.CERRADOS -> s == Salud.TERMINADO || s == Salud.CANCELADO
        }
    }

    /** Filtro + búsqueda por título, cliente o responsable, ya ordenado. */
    fun aplicar(
        proyectos: List<ProyectoResumenDto>,
        filtro: Filtro,
        consulta: String,
    ): List<ProyectoResumenDto> {
        val q = consulta.trim().lowercase()
        return ordenar(
            proyectos.filter { p ->
                cumple(p, filtro) && (
                    q.isEmpty() || listOfNotNull(p.title, p.client?.name, p.responsable?.nombre)
                        .any { it.lowercase().contains(q) }
                    )
            },
        )
    }

    /** Cuántos hay en cada filtro, para poner el número en la pastilla. */
    fun conteos(proyectos: List<ProyectoResumenDto>): Map<Filtro, Int> =
        Filtro.entries.associateWith { filtro -> proyectos.count { cumple(it, filtro) } }

    // ── Textos de la tarjeta ─────────────────────────────────────────────────

    /** Etiqueta del semáforo: la del servidor si viene, si no la nuestra. */
    fun etiquetaSalud(proyecto: ProyectoResumenDto): String =
        proyecto.resumen?.etiqueta?.trim()?.ifEmpty { null } ?: saludDe(proyecto).etiqueta

    /** 0–100, o `null` cuando el avance es desconocido (que no es cero). */
    fun avancePct(proyecto: ProyectoResumenDto): Int? =
        proyecto.resumen?.avance?.porcentaje?.coerceIn(0, 100)

    /** «8 de 12 actividades» · «Sin actividades ligadas». */
    fun avanceTexto(proyecto: ProyectoResumenDto): String {
        val avance = proyecto.resumen?.avance ?: return "Sin avance que calcular"
        val total = avance.total ?: 0
        if (total <= 0) {
            return if (avance.origen == "hitos") "Avance por cronograma" else "Sin actividades ligadas"
        }
        val cerradas = avance.cerradas ?: 0
        return "$cerradas de $total ${if (total == 1) "actividad" else "actividades"}"
    }

    /**
     * «Retrasado 6 días» · «Quedan 3 días» · el motivo del servidor. Es la línea
     * que se puede enseñar al cliente sin traducir nada.
     */
    fun plazoTexto(proyecto: ProyectoResumenDto): String {
        val r = proyecto.resumen ?: return "Sin plan de fechas"
        val retraso = r.diasDeRetraso ?: 0
        if (retraso > 0) return "Retrasado $retraso ${if (retraso == 1) "día" else "días"}"
        val faltan = r.diasRestantes
        if (faltan != null) {
            return when {
                faltan <= 0 -> "Vence hoy"
                faltan == 1 -> "Queda 1 día"
                else -> "Quedan $faltan días"
            }
        }
        return r.motivo?.trim()?.ifEmpty { null } ?: "Sin fecha de fin"
    }

    /** «Próximo: Entrega de equipos · 25 sep» · `null` si no hay cronograma. */
    fun proximoHitoTexto(proyecto: ProyectoResumenDto): String? {
        val hito = proyecto.proximoHito ?: return null
        val nombre = hito.name?.trim()?.ifEmpty { null } ?: return null
        val fecha = fechaCorta(hito.plannedDate)
        return if (fecha == null) "Próximo: $nombre" else "Próximo: $nombre · $fecha"
    }

    /** Cliente y responsable en una línea; «Sin cliente» no se dice si hay uno. */
    fun contextoTexto(proyecto: ProyectoResumenDto): String {
        val partes = listOfNotNull(
            proyecto.client?.name?.trim()?.ifEmpty { null },
            proyecto.responsable?.nombre?.trim()?.ifEmpty { null },
        )
        return if (partes.isEmpty()) "Sin cliente ni responsable" else partes.joinToString(" · ")
    }

    /**
     * «25 sep» de una fecha ISO del API (`2026-09-25` o con hora). Devuelve
     * `null` si no se puede leer: antes ninguna fecha que una inventada.
     */
    fun fechaCorta(iso: String?): String? {
        val texto = iso?.trim()?.takeIf { it.length >= 10 } ?: return null
        val fecha = runCatching {
            LocalDate.parse(texto.substring(0, 10), DateTimeFormatter.ISO_LOCAL_DATE)
        }.getOrNull() ?: return null
        return fecha.format(DateTimeFormatter.ofPattern("d MMM", Locale.forLanguageTag("es-MX")))
    }

    /** Qué no hace esta pantalla. */
    const val LIMITE =
        "Consulta. Crear proyectos, mover hitos y subir documentos se hacen desde la computadora."
}
