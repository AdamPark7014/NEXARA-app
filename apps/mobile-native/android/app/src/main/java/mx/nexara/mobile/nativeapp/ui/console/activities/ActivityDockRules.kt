package mx.nexara.mobile.nativeapp.ui.console.activities

import mx.nexara.mobile.nativeapp.data.api.EvidenceCampoDto
import mx.nexara.mobile.nativeapp.data.api.EvidenceFlowDto

/**
 * Dock inferior y lista de pasos del detalle de actividad (rediseño v2).
 *
 * Decide QUÉ dice el botón grande al alcance del pulgar y cómo va cada paso de
 * evidencia (hecho · actual · pendiente). No captura nada: la cámara, el PDF y
 * el formulario siguen viviendo en `EvidenceCaptureFlow`; el dock solo lleva ahí
 * o, cuando ese flujo está en pantalla, repite su botón.
 *
 * Sin Android: se prueba en la JVM (`ActivityDockRulesTest`).
 */
object ActivityDockRules {

    enum class Kind {
        /** `me/activities/:id/iniciar`: marca la hora real y abre Evidencias. */
        INICIAR,

        /** `me/activities/:id/reanudar`. */
        REANUDAR,

        /** Abre la pestaña Evidencias en el paso actual. */
        EVIDENCIAS,

        /** Enviada o aprobada: solo consultar. */
        VER,
    }

    data class Dock(
        val kind: Kind,
        val label: String,
        /** Una línea bajo el dock: qué falta o qué pasa al tocar. */
        val hint: String?,
        /** Se ofrece «Pausar» como secundaria. */
        val pausable: Boolean,
    )

    enum class PasoEstado { HECHO, ACTUAL, PENDIENTE }

    data class Paso(
        val step: String,
        val label: String,
        val estado: PasoEstado,
        val detalle: String,
    )

    /**
     * Acción principal del dock en las pestañas Detalle e Historial. En Evidencias
     * la manda el propio flujo de captura. `null` = sin dock (cerrada, o quien
     * mira no ejecuta ni puede iniciar).
     */
    fun principal(
        puedeIniciar: Boolean,
        sesion: SesionActividad?,
        despachador: Boolean,
        estatus: String?,
        captura: Boolean,
        flow: EvidenceFlowDto?,
        coreKind: String?,
        fotosRequeridas: Int,
    ): Dock? {
        if (SesionActividadRules.cerrada(estatus)) return null
        if (puedeIniciar) {
            return Dock(Kind.INICIAR, ActivitySemaforo.ACCION_INICIAR, "Queda registrada tu hora real de inicio.", pausable = false)
        }
        if (sesion != null && SesionActividadRules.puedeReanudar(sesion, despachador, estatus)) {
            return Dock(
                Kind.REANUDAR,
                "Reanudar actividad",
                SesionActividadRules.textoPausa(sesion, propia = true) ?: "Tu reloj vuelve a correr.",
                pausable = false,
            )
        }
        if (!captura) return null
        val pausable = sesion != null && !despachador && SesionActividadRules.puedePausar(sesion, estatus)
        val step = flow?.status ?: CoreActivityRules.STEP_ENTRY
        val reviewStatus = flow?.reviewStatus
        if (CoreActivityRules.isEvidenceLocked(step, reviewStatus)) {
            return Dock(
                Kind.VER,
                "Ver evidencias",
                if (reviewStatus == "APPROVED") "Tu evidencia fue aprobada." else "Enviada: tu superior la aprueba o te la devuelve.",
                pausable = false,
            )
        }
        val correccion = reviewStatus == "REJECTED"
        val steps = CoreActivityRules.evidenceStepsForKind(coreKind)
        val campos = CoreActivityRules.camposOrdenados(flow?.campos)
        val porCampos = campos.isNotEmpty()
        val fotos = flow?.evidencePhotos.orEmpty().size
        val faltan = (fotosRequeridas - fotos).coerceAtLeast(0)
        val comercial = CoreActivityRules.esComercial(coreKind)
        val label = when (step) {
            CoreActivityRules.STEP_ENTRY -> if (comercial) "Tomar foto de inicio" else "Tomar foto de entrada"
            CoreActivityRules.STEP_PHOTOS -> when {
                porCampos -> "Fotos por campo"
                faltan > 0 -> "Tomar fotos · $fotos de $fotosRequeridas"
                else -> "Enviar fotos · $fotos de $fotosRequeridas"
            }
            CoreActivityRules.STEP_PDF -> "Cargar hoja de servicio"
            CoreActivityRules.STEP_DATA -> "Llenar formulario"
            CoreActivityRules.STEP_EXIT -> if (comercial) "Tomar foto de conclusión" else "Tomar foto de salida"
            else -> "Continuar evidencias"
        }
        val numero = steps.indexOf(step) + 1
        val hint = when (step) {
            CoreActivityRules.STEP_PHOTOS -> when {
                porCampos -> CoreActivityRules.camposBloqueoSalida(campos)
                    ?: "Ya documentaste todos los campos: sigue al siguiente paso."
                faltan > 0 -> "Faltan $faltan foto${if (faltan == 1) "" else "s"} para seguir."
                else -> "Ya tienes las fotos: envíalas para seguir."
            }
            CoreActivityRules.STEP_EXIT -> "Con la foto de salida mandas la actividad a revisión."
            else -> if (numero > 0) "Paso $numero de ${steps.size}" else null
        }
        return Dock(Kind.EVIDENCIAS, if (correccion) "Corregir · $label" else label, hint, pausable)
    }

    /**
     * Pasos de evidencia para la lista del detalle. `null` flujo = nada
     * empezado: todo pendiente salvo el primero, que es el actual.
     */
    fun pasos(
        flow: EvidenceFlowDto?,
        coreKind: String?,
        fotosRequeridas: Int,
    ): List<Paso> {
        val steps = CoreActivityRules.evidenceStepsForKind(coreKind)
        val current = flow?.status ?: CoreActivityRules.STEP_ENTRY
        val locked = CoreActivityRules.isEvidenceLocked(current, flow?.reviewStatus)
        val rejected = CoreActivityRules.rejectedStepsList(flow?.rejectedSteps, flow?.rejectedStep)
        val campos = CoreActivityRules.camposOrdenados(flow?.campos)
        val fotos = flow?.evidencePhotos.orEmpty().size
        return steps.map { s ->
            val done = when (s) {
                CoreActivityRules.STEP_ENTRY -> !flow?.entryPhotoUrl.isNullOrBlank()
                CoreActivityRules.STEP_PHOTOS -> !flow?.evidencePhotos.isNullOrEmpty() || (campos.isNotEmpty() && CoreActivityRules.camposListos(campos))
                CoreActivityRules.STEP_PDF -> !flow?.serviceSheetPdfUrl.isNullOrBlank()
                CoreActivityRules.STEP_DATA -> flow?.serviceSheetData != null
                else -> !flow?.exitPhotoUrl.isNullOrBlank()
            }
            val estado = when {
                locked -> PasoEstado.HECHO
                s in rejected && flow?.reviewStatus == "REJECTED" && s == current -> PasoEstado.ACTUAL
                s == current -> PasoEstado.ACTUAL
                done -> PasoEstado.HECHO
                else -> PasoEstado.PENDIENTE
            }
            val detalle = when {
                locked && s == CoreActivityRules.STEP_EXIT -> "Enviada a revisión"
                estado == PasoEstado.HECHO && s == CoreActivityRules.STEP_PHOTOS ->
                    if (campos.isNotEmpty()) "Campos completos" else "$fotos foto${if (fotos == 1) "" else "s"}"
                estado == PasoEstado.HECHO -> "Listo"
                s in rejected && flow?.reviewStatus == "REJECTED" -> "Por corregir"
                estado == PasoEstado.ACTUAL && s == CoreActivityRules.STEP_PHOTOS ->
                    if (campos.isNotEmpty()) CoreActivityRules.camposResumen(campos)
                    else "$fotos de $fotosRequeridas fotos"
                estado == PasoEstado.ACTUAL -> "Sigue"
                else -> "Pendiente"
            }
            Paso(step = s, label = CoreActivityRules.stepLabel(s, coreKind), estado = estado, detalle = detalle)
        }
    }

    /** «3 de 5» para el encabezado de la lista de pasos. */
    fun hechos(pasos: List<Paso>): Int = pasos.count { it.estado == PasoEstado.HECHO }

    /** Fotos de campo pendientes, para el aviso del dock. */
    fun camposFaltantes(campos: List<EvidenceCampoDto>?): Int = CoreActivityRules.camposFaltantes(campos)
}
