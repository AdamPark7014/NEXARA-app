import Foundation

/// ¿Ya vio esta persona la bienvenida? Espejo de `OnboardingStore` de Android
/// (allá es DataStore; aquí basta `UserDefaults`).
///
/// Va en `UserDefaults` y no en el llavero a propósito: no es un secreto, y sobre
/// todo **no se borra al cerrar sesión**. Quien ya vio las tres pantallas no tiene
/// por qué verlas otra vez cada vez que vuelve a entrar; en Android tampoco pasa.
enum OnboardingStore {
    private static let key = "nexara.onboarding.completado"

    static var isCompleted: Bool {
        get { UserDefaults.standard.bool(forKey: key) }
        set { UserDefaults.standard.set(newValue, forKey: key) }
    }

    static func markCompleted() {
        isCompleted = true
    }
}
