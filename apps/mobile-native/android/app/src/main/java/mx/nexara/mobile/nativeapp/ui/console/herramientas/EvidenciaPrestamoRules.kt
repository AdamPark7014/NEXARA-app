package mx.nexara.mobile.nativeapp.ui.console.herramientas

import mx.nexara.mobile.nativeapp.data.api.FotoEvidenciaDto
import mx.nexara.mobile.nativeapp.data.api.PrestamoHerramientaDto

/**
 * Evidencia de un préstamo (21-11-2026): la herramienta sale con fotos de cómo va y vuelve con
 * fotos de cómo llegó y en qué condición. Reglas puras, se prueban en la JVM.
 *
 * Son las mismas que aplica el servidor (`apps/api/src/tool-requests/evidencia-prestamo.ts`):
 * aquí se validan antes para decir qué falta sin gastar un viaje con media raya de señal; quien
 * decide al final es la API.
 */
object EvidenciaPrestamoRules {

    /** Tope de fotos por entrega o por entrada (el del `FilesInterceptor`). */
    const val MAX_FOTOS = 6

    /** Cómo volvió la herramienta. [api] es lo que viaja en `condicion`. */
    enum class Condicion(val api: String, val etiqueta: String, val ayuda: String) {
        BIEN("BIEN", "Bien", "Vuelve como salió."),
        DESGASTE("DESGASTE", "Con desgaste", "Uso normal: sigue sirviendo."),
        DANADA("DANADA", "Dañada", "No sirve así: pasa a reparación."),
        INCOMPLETA("INCOMPLETA", "Incompleta", "Le falta una pieza o accesorio: pasa a revisión."),
        EXTRAVIADA("EXTRAVIADA", "Extraviada", "No regresó: se da de baja del inventario."),
        ;

        /** Hay que contar qué le pasó. */
        val pideExplicacion: Boolean get() = this == DANADA || this == INCOMPLETA || this == EXTRAVIADA

        /** Hay algo que fotografiar. De lo que no regresó no hay foto. */
        val pideFoto: Boolean get() = this != EXTRAVIADA

        companion object {
            fun deApi(valor: String?): Condicion? =
                entries.firstOrNull { it.api.equals(valor?.trim(), ignoreCase = true) }
        }
    }

    /** Qué le falta a la entrega; `null` si ya se puede registrar. */
    fun faltaParaEntregar(pideCodigo: Boolean, codigo: String, fotos: Int): String? = when {
        pideCodigo && codigo.isBlank() -> "Teclea el código que enseña quien la recoge."
        fotos <= 0 -> "Toma al menos una foto de cómo sale la herramienta."
        else -> null
    }

    /** Qué le falta a la entrada; `null` si ya se puede registrar. */
    fun faltaParaRecibir(condicion: Condicion?, descripcion: String, fotos: Int): String? = when {
        condicion == null -> "Elige cómo volvió."
        condicion.pideExplicacion && descripcion.isBlank() -> when (condicion) {
            Condicion.INCOMPLETA -> "Escribe qué le falta."
            Condicion.EXTRAVIADA -> "Escribe qué pasó con la herramienta."
            else -> "Describe el daño."
        }
        condicion.pideFoto && fotos <= 0 -> "Toma al menos una foto de cómo volvió."
        else -> null
    }

    /** La pregunta del campo de texto según la condición. */
    fun preguntaDescripcion(condicion: Condicion?): String = when (condicion) {
        Condicion.DANADA -> "¿Qué daño trae?"
        Condicion.INCOMPLETA -> "¿Qué le falta?"
        Condicion.EXTRAVIADA -> "¿Qué pasó?"
        else -> "Observaciones (opcional)"
    }

    /** El aviso cuando la entrada quedó registrada. */
    fun avisoEntrada(condicion: Condicion): String = when (condicion) {
        Condicion.BIEN, Condicion.DESGASTE -> "Entrada registrada."
        Condicion.DANADA -> "Entrada registrada con daño: queda en reparación."
        Condicion.INCOMPLETA -> "Entrada registrada incompleta: queda en revisión."
        Condicion.EXTRAVIADA -> "Registrada como extraviada: se dio de baja del inventario."
    }

    /** Las direcciones de las fotos que sí traen una. */
    fun urls(fotos: List<FotoEvidenciaDto>?): List<String> =
        fotos.orEmpty().mapNotNull { it.url?.trim()?.takeIf { url -> url.isNotEmpty() } }

    /** «Cómo volvió» de un préstamo ya recibido; `null` en los de antes de la evidencia. */
    fun etiquetaCondicion(prestamo: PrestamoHerramientaDto): String? =
        Condicion.deApi(prestamo.returnCondition)?.etiqueta

    /**
     * Lo que le falta de evidencia a un préstamo, para decirlo en su tarjeta: una herramienta que
     * ya salió sin foto de salida, o que ya volvió sin foto de entrada (lo registró una versión
     * vieja de la app). `null` si no falta nada o todavía no sale.
     */
    fun faltaEvidencia(prestamo: PrestamoHerramientaDto): String? {
        val salio = prestamo.status in setOf("IN_USE", "RETURNED", "DAMAGED")
        val volvio = prestamo.status in setOf("RETURNED", "DAMAGED")
        val sinSalida = salio && urls(prestamo.deliveryPhotos).isEmpty()
        val sinEntrada = volvio &&
            Condicion.deApi(prestamo.returnCondition) != Condicion.EXTRAVIADA &&
            urls(prestamo.returnPhotos).isEmpty()
        return when {
            sinSalida && sinEntrada -> "Sin fotos de salida ni de entrada"
            sinSalida -> "Salió sin foto"
            sinEntrada -> "Volvió sin foto"
            else -> null
        }
    }

    /** «Entregó Iván · Recibió Christian», con lo que se sepa. Vacío si no se sabe nada. */
    fun quienesFirmaron(prestamo: PrestamoHerramientaDto): String = listOfNotNull(
        prestamo.deliveredBy?.nombre?.trim()?.takeIf { it.isNotEmpty() }?.let { "Entregó $it" },
        prestamo.receivedBy?.nombre?.trim()?.takeIf { it.isNotEmpty() }?.let { "Recibió $it" },
    ).joinToString(" · ")
}
