package mx.nexara.mobile.nativeapp.ui.console.activities

import mx.nexara.mobile.nativeapp.data.api.EvidencePhotoGeoRequest

/**
 * Fotos libres de evidencia («fotos en sitio») con la cola offline de por medio.
 *
 * Cada foto viaja sola a `…/evidence-photos/draft` y quitarla es
 * `…/evidence-photo/{índice}/remove`, con el índice **de la lista del servidor**. Sin red
 * esas llamadas se quedan en la cola y salen después, en orden. La pantalla tiene que
 * enseñar la lista como va a quedar cuando la cola termine de salir —no solo lo que ya
 * contestó el servidor—, o el conteo miente y «Quitar» borra la foto equivocada.
 *
 * Sin una sola línea de Android: se prueba en la JVM (`EvidenciaLibreColaTest`).
 */
object EvidenciaLibreCola {

    sealed interface Op {
        /** Id de la mutación en la cola offline. */
        val colaId: String

        data class Agregar(override val colaId: String) : Op
        data class Quitar(override val colaId: String, val index: Int) : Op
        data class Enviar(override val colaId: String) : Op
    }

    /** Una foto de la lista. `colaId != null`: sigue en la cola, el servidor todavía no la tiene. */
    data class Foto(
        val url: String,
        val geo: EvidencePhotoGeoRequest?,
        val colaId: String? = null,
    ) {
        val enCola: Boolean get() = colaId != null
    }

    data class Estado(
        val fotos: List<Foto>,
        /** El envío final (`evidence-photos`) ya está en la cola: el paso se cierra solo al volver la red. */
        val envioEnCola: Boolean,
        /** Mutaciones de fotos libres de esta actividad que siguen en la cola. */
        val pendientes: List<Op>,
    )

    private val QUITAR = Regex("evidence-photo/(\\d+)/remove")

    /** Qué hace una mutación de la cola sobre las fotos libres de [activityId]; `null` si no las toca. */
    fun op(activityId: Long, colaId: String, method: String, url: String): Op? {
        if (!method.equals("POST", ignoreCase = true)) return null
        val ruta = url.substringBefore('?').trimEnd('/')
        val base = "/activity-evidence/$activityId/"
        val inicio = ruta.indexOf(base)
        if (inicio < 0) return null
        val resto = ruta.substring(inicio + base.length)
        return when {
            resto == "evidence-photos/draft" -> Op.Agregar(colaId)
            resto == "evidence-photos" -> Op.Enviar(colaId)
            else -> QUITAR.matchEntire(resto)?.let { Op.Quitar(colaId, it.groupValues[1].toInt()) }
        }
    }

    /**
     * La lista del servidor con la cola aplicada encima, en el mismo orden en que va a salir.
     * [fotoDe] da la foto que lleva cada «Agregar» (data URL recuperada del disco); si ya no
     * se puede leer, la foto queda con `url` vacía: cuenta, pero no se puede reenviar.
     */
    fun simular(servidor: List<Foto>, ops: List<Op>, fotoDe: (colaId: String) -> Foto?): Estado {
        val fotos = servidor.map { it.copy(colaId = null) }.toMutableList()
        var envio = false
        for (op in ops) {
            when (op) {
                is Op.Agregar -> fotos += (fotoDe(op.colaId) ?: Foto(url = "", geo = null)).copy(colaId = op.colaId)
                is Op.Quitar -> if (op.index in fotos.indices) fotos.removeAt(op.index)
                is Op.Enviar -> envio = true
            }
        }
        return Estado(fotos = fotos, envioEnCola = envio, pendientes = ops)
    }

    /** Qué hacer al tocar «Quitar» en la foto [index]. */
    sealed interface Quitar {
        /** Todavía no sale de la cola: se saca de la cola y ya, el servidor nunca la vio. */
        data class DeLaCola(val colaId: String) : Quitar

        /** Ya está en el servidor en esa posición: `evidence-photo/{indiceServidor}/remove`. */
        data class EnServidor(val indiceServidor: Int) : Quitar

        /**
         * En línea con la cola a medio salir: el índice del servidor de ahora no es el de la
         * lista que se ve. Hay que esperar a que la cola termine.
         */
        data object Esperar : Quitar

        data object Nada : Quitar
    }

    /**
     * Sin red, el «quitar» se encola detrás de lo pendiente y al salir encuentra la lista tal
     * como se ve: el índice de pantalla es el bueno. En línea, sale ya, antes que la cola.
     */
    fun comoQuitar(estado: Estado, index: Int, enLinea: Boolean): Quitar {
        val foto = estado.fotos.getOrNull(index) ?: return Quitar.Nada
        foto.colaId?.let { return Quitar.DeLaCola(it) }
        if (enLinea && estado.pendientes.isNotEmpty()) return Quitar.Esperar
        return Quitar.EnServidor(index)
    }

    /** Las fotos que se pueden mandar en el envío final, o `null` si alguna en cola ya no se puede leer. */
    fun paraEnviar(estado: Estado): List<Foto>? =
        estado.fotos.takeIf { fotos -> fotos.none { it.url.isBlank() } }
}
