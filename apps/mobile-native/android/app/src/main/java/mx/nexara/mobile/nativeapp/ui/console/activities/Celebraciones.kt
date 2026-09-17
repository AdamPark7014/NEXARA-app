package mx.nexara.mobile.nativeapp.ui.console.activities

import mx.nexara.mobile.nativeapp.data.api.CelebracionDto

/**
 * Textos del aviso de cumpleaños y aniversarios (arriba de Actividades). Puro,
 * sin Android. Mismo tono que los push de `apps/api/src/celebrations/celebraciones.ts`
 * y la misma regla: la edad nunca se menciona.
 */
object Celebraciones {
    const val CUMPLEANOS = "cumpleanos"
    const val ANIVERSARIO = "aniversario"

    fun esCumpleanos(c: CelebracionDto): Boolean = c.tipo?.trim()?.lowercase() == CUMPLEANOS

    fun esAniversario(c: CelebracionDto): Boolean = c.tipo?.trim()?.lowercase() == ANIVERSARIO

    /** Solo lo que la app sabe contar; un tipo nuevo del servidor no sale en blanco. */
    fun visibles(lista: List<CelebracionDto>?): List<CelebracionDto> =
        lista.orEmpty()
            .filter { esCumpleanos(it) || esAniversario(it) }
            // Lo mío primero: es a mí a quien felicitan.
            .sortedBy { if (it.soyYo == true) 0 else 1 }

    /** «Carolina», no «carolina juárez»: primera palabra con mayúscula inicial. */
    fun primerNombre(nombre: String?): String {
        val limpio = nombre?.trim()?.split(Regex("\\s+"))?.firstOrNull().orEmpty()
        return limpio.replaceFirstChar { it.uppercaseChar() }
    }

    /** «Carolina Juárez»: nombre y primer apellido, para no desbordar la tarjeta. */
    fun nombreCorto(nombre: String?): String =
        CoreActivityRules.shortName(nombre).ifBlank { "Alguien del equipo" }

    private fun tiempo(anios: Int): String = if (anios == 1) "1 año" else "$anios años"

    /** Una línea por celebración. Nunca lleva la edad: en cumpleaños `anios` se ignora. */
    fun linea(c: CelebracionDto): String {
        val yo = c.soyYo == true
        return when {
            esCumpleanos(c) && yo -> {
                val quien = primerNombre(c.nombre)
                val saludo = if (quien.isBlank()) "¡Feliz cumpleaños!" else "¡Feliz cumpleaños, $quien!"
                "$saludo 🎂 Todo el equipo te desea un gran día"
            }
            esCumpleanos(c) -> "Hoy es cumpleaños de ${nombreCorto(c.nombre)} 🎂"
            yo -> {
                val quien = primerNombre(c.nombre)
                val saludo = if (quien.isBlank()) "¡Felicidades!" else "¡Felicidades, $quien!"
                val anios = c.anios?.takeIf { it > 0 }
                if (anios != null) "$saludo 🎉 Hoy cumples ${tiempo(anios)} en NEXARA" else "$saludo 🎉 Hoy es tu aniversario en NEXARA"
            }
            else -> {
                val anios = c.anios?.takeIf { it > 0 }
                if (anios != null) {
                    "${nombreCorto(c.nombre)} cumple ${tiempo(anios)} en NEXARA 🎉"
                } else {
                    "Hoy es aniversario de ${nombreCorto(c.nombre)} en NEXARA 🎉"
                }
            }
        }
    }

    /** Texto corto de la fila horizontal: «Ana López 🎂», «Pedro Ruiz · 3 años 🎉». */
    fun etiqueta(c: CelebracionDto): String {
        val quien = if (c.soyYo == true) "Tú" else nombreCorto(c.nombre)
        if (esCumpleanos(c)) return "$quien 🎂"
        val anios = c.anios?.takeIf { it > 0 }
        return if (anios != null) "$quien · ${tiempo(anios)} en NEXARA 🎉" else "$quien 🎉"
    }

    /** El glifo del aviso: pastel si todo es cumpleaños; si hay aniversarios, confeti. */
    fun soloCumpleanos(lista: List<CelebracionDto>): Boolean {
        val principal = visibles(lista)
        val considerar = if (principal.firstOrNull()?.soyYo == true) principal.take(1) else principal
        return considerar.isNotEmpty() && considerar.all { esCumpleanos(it) }
    }

    /** Encabezado cuando hay varias: la mía manda; si no, un título de grupo. */
    fun titulo(lista: List<CelebracionDto>): String? {
        val visibles = visibles(lista)
        return when {
            visibles.isEmpty() -> null
            visibles.size == 1 -> linea(visibles.first())
            visibles.first().soyYo == true -> linea(visibles.first())
            else -> "Hoy celebramos en el equipo 🎉"
        }
    }

    /** Las que van en la fila horizontal debajo del título (todas menos la del título). */
    fun enFila(lista: List<CelebracionDto>): List<CelebracionDto> {
        val visibles = visibles(lista)
        return when {
            visibles.size <= 1 -> emptyList()
            visibles.first().soyYo == true -> visibles.drop(1)
            else -> visibles
        }
    }

    /** Cerrado con la X: se recuerda la fecha, así mañana vuelve a salir. */
    fun cerradoHoy(fechaCerrada: String?, fecha: String?): Boolean =
        !fecha.isNullOrBlank() && fechaCerrada == fecha
}
