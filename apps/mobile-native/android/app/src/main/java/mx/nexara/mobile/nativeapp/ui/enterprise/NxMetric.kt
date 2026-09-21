package mx.nexara.mobile.nativeapp.ui.enterprise

/**
 * Una celda de la tira de cifras (`MetricStrip` de la web).
 *
 * Es un dato, no un componente: vive sin Compose para que las reglas que deciden
 * qué cifras se pintan —y cuándo NO se pintan, que es la regla 7 del contrato de
 * diseño— se puedan probar en la JVM. El color va como ARGB (`Long`), igual que
 * en `CoreActivityRules` y `AttendanceBadges`, por el mismo motivo.
 *
 * La celda se lee de arriba abajo: etiqueta pequeña, cifra grande, pista de qué
 * la compone. El color tiñe **solo la cifra**, y únicamente cuando el número
 * pide que alguien haga algo (regla 6: color con significado, no de adorno).
 */
data class NxMetric(
    /** Identificador estable; la pantalla lo usa para saber qué celda se tocó. */
    val clave: String,
    val etiqueta: String,
    val valor: String,
    /** De qué se compone la cifra: «de 8 en el equipo», «1 urgente». */
    val pista: String? = null,
    /** ARGB. `null` = tinta normal, que es lo que debe pasar cuando todo va bien. */
    val color: Long? = null,
)
