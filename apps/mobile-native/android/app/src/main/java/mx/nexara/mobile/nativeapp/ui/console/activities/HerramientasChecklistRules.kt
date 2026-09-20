package mx.nexara.mobile.nativeapp.ui.console.activities

import mx.nexara.mobile.nativeapp.data.api.HerramientaRequisitoDto

/**
 * Checklist de herramientas de una OT, del lado de la app.
 *
 * Regla del dueño: «antes de atender una instalación/servicio asignado, realizar en la
 * OT check list de herramientas a ocupar». Quien asigna dice qué hay que llevar; quien
 * ejecuta palomea cada renglón antes de poder iniciar.
 *
 * Espejo de `estadoChecklist` y `mensajeChecklistPendiente` en
 * apps/api/src/activities/tools/herramientas-checklist.helpers.ts. El API manda ya
 * `pendientes`/`listos`/`completo`, pero la app los recalcula para pintar sin esperar
 * la respuesta y para decir lo mismo que el servidor cuando no hay red.
 */
object HerramientasChecklistRules {

    /** Cuántos nombres se enumeran antes de cortar con «y N más». */
    const val MAX_NOMBRES_EN_MENSAJE = 4

    /**
     * Descripciones que faltan por revisar o que se marcaron mal. Un renglón cuenta
     * como listo SOLO con un palomeo en `ok`: marcarlo «falta o está dañado» es
     * justamente lo que no deja arrancar.
     */
    fun pendientes(requisitos: List<HerramientaRequisitoDto>?): List<String> =
        requisitos.orEmpty()
            .filter { it.check?.ok != true }
            .map { it.descripcion?.trim().orEmpty() }

    /** Renglones con palomeo «lo traigo y sirve». */
    fun listos(requisitos: List<HerramientaRequisitoDto>?): Int =
        requisitos.orEmpty().count { it.check?.ok == true }

    /** true cuando no queda nada pendiente (o cuando la OT no pide nada). */
    fun completo(requisitos: List<HerramientaRequisitoDto>?): Boolean =
        pendientes(requisitos).isEmpty()

    /** «3 de 5 listas» para la línea de avance. */
    fun progresoTexto(requisitos: List<HerramientaRequisitoDto>?): String {
        val total = requisitos.orEmpty().size
        return "${listos(requisitos)} de $total ${if (total == 1) "lista" else "listas"}"
    }

    /**
     * El mismo texto que devuelve el API en el 400 de `iniciar`. Dice exactamente qué
     * falta: «no puedes iniciar» a secas manda al técnico a llamar por teléfono.
     */
    fun mensajePendiente(pendientes: List<String>): String {
        if (pendientes.isEmpty()) return ""
        val muestra = pendientes.take(MAX_NOMBRES_EN_MENSAJE).joinToString(", ")
        val resto =
            if (pendientes.size > MAX_NOMBRES_EN_MENSAJE) {
                " y ${pendientes.size - MAX_NOMBRES_EN_MENSAJE} más"
            } else {
                ""
            }
        val falta = if (pendientes.size == 1) "Falta" else "Faltan"
        return "$falta palomear el checklist de herramientas antes de iniciar: " +
            "$muestra$resto. Si algo no lo traes o está dañado, márcalo y avisa a tu supervisor."
    }
}
