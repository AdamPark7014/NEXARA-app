package mx.nexara.mobile.nativeapp.ui.console.screens

import mx.nexara.mobile.nativeapp.ui.enterprise.NxMetric

/**
 * Decisiones de presentación de Asistencias que no dependen de Compose: qué
 * cifras se pintan, cuáles NO, qué dice la barra de filtros y cuánto suma la
 * jornada del equipo. No cambia quién ve a quién ni cómo se registra la checada.
 *
 * Sin Android: se prueba en la JVM (`AttendanceUxTest`).
 */
object AttendanceUx {

    /**
     * Ya no se pinta en la tira (sobraba: el encabezado y la pastilla «Todos»
     * dicen lo mismo), pero la constante se queda porque `estadoDeMetrica`
     * tiene que seguir sabiendo que «total» no filtra por ningún estado.
     */
    const val METRICA_TOTAL = "total"
    const val METRICA_EN_JORNADA = "en_jornada"
    const val METRICA_COMPLETARON = "completaron"
    const val METRICA_SIN_CHECADA = "sin_checada"

    /** Los colores del estado como ARGB, para no arrastrar Compose a las pruebas. */
    const val VERDE = 0xFF16A34AL
    const val AZUL = 0xFF2563EBL
    const val MORADO = 0xFF7C3AEDL
    const val GRIS = 0xFF94A3B8L
    const val ROJO = 0xFFDC2626L

    fun colorDe(estado: AttendanceEstado): Long = when (estado) {
        AttendanceEstado.PRESENTE -> VERDE
        AttendanceEstado.COMPLETO -> AZUL
        AttendanceEstado.JUSTIFICADA -> MORADO
        AttendanceEstado.AUSENTE -> GRIS
    }

    /**
     * La tira de cifras del día.
     *
     * Regla 7 del contrato de diseño: sin nadie en el alcance **no se pinta
     * nada**. Cuatro celdas en `0` encima de un «Sin registros» tapan lo único
     * que ayuda ahí, que es la frase que explica de dónde saldría la primera
     * fila. Un día real en el que faltaron todos SÍ se enseña, porque eso es
     * información.
     */
    fun metricas(personas: List<AttendancePersona>): List<NxMetric> {
        if (personas.isEmpty()) return emptyList()
        val porEstado = personas.groupingBy { it.estado }.eachCount()
        val enJornada = porEstado[AttendanceEstado.PRESENTE] ?: 0
        val completaron = porEstado[AttendanceEstado.COMPLETO] ?: 0
        val sinChecada = porEstado[AttendanceEstado.AUSENTE] ?: 0
        // Tres y no cuatro: `NxMetricStrip` pasa a dos filas a partir de la
        // cuarta, y dos filas empujaban a la primera persona fuera de la
        // pantalla. El total del equipo no se pierde —lo dicen el encabezado
        // de la lista y la pastilla «Todos»—, así que la celda que se va es la
        // única que no aportaba nada que no estuviera ya escrito dos veces.
        return listOf(
            NxMetric(
                clave = METRICA_EN_JORNADA,
                etiqueta = "En jornada",
                valor = enJornada.toString(),
                pista = if (enJornada == 0) "nadie dentro" else "checaron entrada",
            ),
            NxMetric(
                clave = METRICA_COMPLETARON,
                etiqueta = "Completaron",
                valor = completaron.toString(),
                pista = "entrada y salida",
            ),
            NxMetric(
                clave = METRICA_SIN_CHECADA,
                etiqueta = "Sin checada",
                valor = sinChecada.toString(),
                // Solo se tiñe si alguien falta: si no falta nadie, la tira va en gris y tranquila.
                pista = if (sinChecada == 0) "todos registrados" else "hay que preguntar",
                color = ROJO.takeIf { sinChecada > 0 },
            ),
        )
    }

    /**
     * La celda de la tira que corresponde a cada filtro de la lista, y al revés:
     * tocar «Sin checada» en la tira y tocar la pastilla «Sin checada» de la
     * barra tienen que hacer lo mismo y quedar marcadas las dos.
     */
    fun estadoDeMetrica(clave: String): AttendanceEstado? = when (clave) {
        METRICA_EN_JORNADA -> AttendanceEstado.PRESENTE
        METRICA_COMPLETARON -> AttendanceEstado.COMPLETO
        METRICA_SIN_CHECADA -> AttendanceEstado.AUSENTE
        else -> null
    }

    fun metricaDeEstado(estado: AttendanceEstado?): String? = when (estado) {
        AttendanceEstado.PRESENTE -> METRICA_EN_JORNADA
        AttendanceEstado.COMPLETO -> METRICA_COMPLETARON
        AttendanceEstado.AUSENTE -> METRICA_SIN_CHECADA
        // «Falta justificada» no tiene celda propia: vive solo en la barra de filtros.
        else -> null
    }

    data class Filtro(val estado: AttendanceEstado?, val etiqueta: String, val conteo: Int, val color: Long?)

    /**
     * La única barra de filtros (regla 8). «Falta justificada» solo aparece si
     * ese día hay alguna: un filtro que siempre da cero es ruido.
     */
    fun filtros(personas: List<AttendancePersona>): List<Filtro> {
        if (personas.isEmpty()) return emptyList()
        val porEstado = personas.groupingBy { it.estado }.eachCount()
        return buildList {
            add(Filtro(null, "Todos", personas.size, null))
            AttendanceEstado.entries.forEach { estado ->
                val n = porEstado[estado] ?: 0
                val siempre = estado != AttendanceEstado.JUSTIFICADA
                if (siempre || n > 0) add(Filtro(estado, estado.etiqueta, n, colorDe(estado)))
            }
        }
    }

    /**
     * Suma de las jornadas del día («Productividad del día» de la web): las
     * cerradas por su duración y las abiertas contra la hora actual.
     */
    fun jornadaEquipoMs(
        personas: List<AttendancePersona>,
        ahoraMs: Long,
        entradaMs: (AttendancePersona) -> Long?,
        salidaMs: (AttendancePersona) -> Long?,
    ): Long = personas.sumOf { p ->
        val inicio = entradaMs(p) ?: return@sumOf 0L
        val fin = when (p.estado) {
            AttendanceEstado.PRESENTE -> ahoraMs
            else -> salidaMs(p) ?: return@sumOf 0L
        }
        (fin - inicio).coerceAtLeast(0L)
    }

    /** Mientras alguien tenga la jornada abierta, el reloj tiene que latir. */
    fun hayJornadaAbierta(personas: List<AttendancePersona>, miJornadaAbierta: Boolean): Boolean =
        miJornadaAbierta || personas.any { it.estado == AttendanceEstado.PRESENTE }

    /** Título de la sección: «Equipo del día (8)» o «Sin checada (2)» cuando hay filtro. */
    fun tituloLista(filtro: AttendanceEstado?, visibles: Int): String =
        if (filtro == null) "Equipo del día ($visibles)" else "${filtro.etiqueta} ($visibles)"
}
