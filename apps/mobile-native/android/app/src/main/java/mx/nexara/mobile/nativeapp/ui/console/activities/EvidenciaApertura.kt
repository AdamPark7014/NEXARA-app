package mx.nexara.mobile.nativeapp.ui.console.activities

/**
 * «Terminar actividad» e «Iniciar» abren directo la cámara del paso: un toque menos en cada uno, como
 * pide la Ola 3. Se pide antes de navegar y lo consume el flujo de evidencia una sola vez.
 */
object EvidenciaApertura {
    private var pedida: Long? = null

    fun pedirCamara(activityId: Long) {
        pedida = activityId
    }

    fun tomar(activityId: Long): Boolean {
        if (pedida != activityId) return false
        pedida = null
        return true
    }
}
