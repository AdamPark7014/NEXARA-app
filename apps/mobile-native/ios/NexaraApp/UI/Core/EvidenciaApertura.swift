import Foundation

/// «Terminar actividad» e «Iniciar» abren directo la cámara del paso: un toque menos en cada uno,
/// como pide la Ola 3. Se pide antes de navegar y lo consume el flujo de evidencia una sola vez.
/// Espejo de `EvidenciaApertura.kt`.
enum EvidenciaApertura {
    private static var pedida: Int?

    static func pedirCamara(_ activityId: Int) {
        pedida = activityId
    }

    static func tomar(_ activityId: Int) -> Bool {
        guard pedida == activityId else { return false }
        pedida = nil
        return true
    }
}
