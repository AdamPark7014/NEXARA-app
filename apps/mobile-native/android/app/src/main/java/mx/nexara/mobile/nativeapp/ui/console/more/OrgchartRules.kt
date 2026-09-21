package mx.nexara.mobile.nativeapp.ui.console.more

import mx.nexara.mobile.nativeapp.data.api.OrgNodeDto

/**
 * El organigrama en un teléfono **no es el árbol de la web**.
 *
 * La web dibuja un lienzo con zoom: cajas conectadas por líneas, que a 375 px
 * obligan a alejar hasta que los nombres son de seis puntos y no se leen. Aquí
 * el mismo dato se recorre como un explorador de carpetas: se ve a UNA persona
 * con su equipo directo debajo, migas de pan hasta la dirección para subir de un
 * toque, y una búsqueda que salta a cualquiera enseñando su cadena de mando.
 *
 * Se pierde la foto completa de un vistazo, que en una pantalla de un palmo no
 * existía de todas formas; se gana que cada renglón ocupa el ancho entero, que
 * hay dónde poner el dedo, y dos cosas que el lienzo hace mal: buscar, y saber
 * cuánta gente cuelga de alguien sin contarla con la vista.
 *
 * Sin Android: se prueba en la JVM (`OrgchartRulesTest`).
 */
object OrgchartRules {

    /** Una persona del organigrama, ya plana y con su sitio en el árbol. */
    data class Persona(
        val id: Long,
        val nombre: String,
        val puesto: String?,
        val avatarUrl: String?,
        val rol: String?,
        val departamento: String?,
        val jefeId: Long?,
        /** Colocación al costado en el dibujo de la web; no es jerarquía. */
        val lateralDeId: Long?,
        /** Ids de quien le reporta directo, en el orden en que llegaron. */
        val equipoDirecto: List<Long>,
        /** De la raíz hasta su jefe, sin incluirse. Vacío si es raíz. */
        val cadena: List<Long>,
        /** Cuánta gente cuelga de ella en total (directos e indirectos). */
        val aCargo: Int,
    ) {
        val esHoja: Boolean get() = equipoDirecto.isEmpty()
    }

    /** El árbol entero, indexado por id, más quién está arriba del todo. */
    data class Indice(
        val porId: Map<Long, Persona>,
        val raices: List<Long>,
    ) {
        val vacio: Boolean get() = porId.isEmpty()
        val total: Int get() = porId.size

        operator fun get(id: Long?): Persona? = id?.let { porId[it] }
    }

    /**
     * Aplana lo que devuelve `users/orgchart`.
     *
     * Un nodo sin `id` no se puede referenciar y se ignora con toda su rama: no
     * hay forma de navegar hasta él ni de volver. Un id repetido se queda con la
     * primera aparición — así una respuesta rara no mete a alguien dos veces en
     * la lista ni provoca un recorrido infinito.
     */
    fun construir(raices: List<OrgNodeDto>?): Indice {
        val porId = LinkedHashMap<Long, Persona>()
        val topes = mutableListOf<Long>()

        fun recorrer(nodo: OrgNodeDto, cadena: List<Long>): Int {
            val id = nodo.id ?: return 0
            if (porId.containsKey(id)) return 0
            // Se reserva el sitio antes de bajar: un hijo que apunte de vuelta al
            // padre encuentra la clave ya puesta y corta el recorrido.
            porId[id] = Persona(
                id = id,
                nombre = nodo.nombre?.trim().orEmpty().ifEmpty { "Sin nombre" },
                puesto = nodo.puesto?.trim()?.ifEmpty { null },
                avatarUrl = nodo.avatarUrl?.trim()?.ifEmpty { null },
                rol = nodo.role?.nombre?.trim()?.ifEmpty { null },
                departamento = nodo.department?.nombre?.trim()?.ifEmpty { null },
                jefeId = nodo.managerId,
                lateralDeId = nodo.lateralDeId,
                equipoDirecto = emptyList(),
                cadena = cadena,
                aCargo = 0,
            )
            val propia = cadena + id
            val hijos = mutableListOf<Long>()
            var bajo = 0
            nodo.children.orEmpty().forEach { hijo ->
                val hijoId = hijo.id
                // Solo cuelga de aquí quien ENTRA aquí: a alguien ya colocado en
                // otra rama no se le cambia de sitio, o su cadena de mando diría
                // una cosa y la lista otra.
                val esNuevo = hijoId != null && !porId.containsKey(hijoId)
                bajo += recorrer(hijo, propia)
                if (esNuevo && hijoId != null && porId.containsKey(hijoId)) hijos += hijoId
            }
            porId[id] = porId.getValue(id).copy(equipoDirecto = hijos, aCargo = bajo)
            return bajo + 1
        }

        raices.orEmpty().forEach { raiz ->
            val id = raiz.id
            recorrer(raiz, emptyList())
            if (id != null && porId.containsKey(id) && !topes.contains(id)) topes += id
        }
        return Indice(porId = porId, raices = topes)
    }

    /** Lo que se pinta con una persona enfocada (o con nadie, al entrar). */
    data class Vista(
        /** `null` = la cúpula: se enseñan las raíces como lista. */
        val foco: Persona?,
        /** Migas: de la raíz hasta el jefe del foco. Vacío en la cúpula. */
        val migas: List<Persona>,
        /** Quien le reporta directo (o las raíces si no hay foco). */
        val equipo: List<Persona>,
        /** Colocados al costado del foco en el dibujo de la web. */
        val laterales: List<Persona>,
    ) {
        val sinEquipo: Boolean get() = equipo.isEmpty()
    }

    /**
     * Un foco que ya no existe (llegó por enlace, o el organigrama cambió bajo
     * los pies) se trata como si no hubiera foco: la cúpula, nunca una pantalla
     * en blanco.
     */
    fun vista(indice: Indice, focoId: Long?): Vista {
        val foco = indice[focoId]
        if (foco == null) {
            return Vista(
                foco = null,
                migas = emptyList(),
                equipo = indice.raices.mapNotNull { indice[it] },
                laterales = emptyList(),
            )
        }
        return Vista(
            foco = foco,
            migas = foco.cadena.mapNotNull { indice[it] },
            equipo = foco.equipoDirecto.mapNotNull { indice[it] },
            laterales = indice.porId.values.filter { it.lateralDeId == foco.id },
        )
    }

    /** Subir un escalón: al jefe, o a la cúpula si ya estaba en una raíz. */
    fun arriba(indice: Indice, focoId: Long?): Long? = indice[focoId]?.cadena?.lastOrNull()

    /**
     * Búsqueda en TODO el organigrama, no solo en el nivel que se está viendo —
     * es lo que el lienzo de la web no deja hacer con el dedo. Ordena por
     * nombre; hace falta al menos una letra.
     */
    fun buscar(indice: Indice, consulta: String): List<Persona> {
        val q = consulta.trim().lowercase()
        if (q.isEmpty()) return emptyList()
        return indice.porId.values
            .filter { persona ->
                listOfNotNull(persona.nombre, persona.puesto, persona.rol, persona.departamento)
                    .any { it.lowercase().contains(q) }
            }
            .sortedBy { it.nombre.lowercase() }
    }

    /** «Christian › Ana › Luis» — la cadena de mando de alguien, en una línea. */
    fun cadenaTexto(indice: Indice, persona: Persona): String {
        val nombres = persona.cadena.mapNotNull { indice[it]?.nombre }
        return if (nombres.isEmpty()) "Arriba del todo" else nombres.joinToString(" › ")
    }

    /** «4 directos · 11 en total» · «Sin equipo a su cargo». */
    fun equipoTexto(persona: Persona): String {
        val directos = persona.equipoDirecto.size
        if (directos == 0) return "Sin equipo a su cargo"
        val base = "$directos ${if (directos == 1) "directo" else "directos"}"
        return if (persona.aCargo > directos) "$base · ${persona.aCargo} en total" else base
    }

    /** «CG» para el círculo cuando no hay foto. Dos letras como mucho. */
    fun iniciales(nombre: String): String {
        val partes = nombre.trim().split(Regex("\\s+")).filter { it.isNotBlank() }
        if (partes.isEmpty()) return "?"
        val letras = partes.take(2).mapNotNull { it.firstOrNull() }
        return letras.joinToString("").uppercase().ifEmpty { "?" }
    }

    /** Qué no hace esta pantalla, dicho de frente. */
    const val LIMITE =
        "Consulta. Reasignar jefes y mover el organigrama se hace desde la computadora."
}
