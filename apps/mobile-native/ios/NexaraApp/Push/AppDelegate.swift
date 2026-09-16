import UIKit

/// AppDelegate para APNs/FCM (la entrada SwiftUI sigue siendo NexaraApp.swift).
final class AppDelegate: NSObject, UIApplicationDelegate {
    func application(_ app: UIApplication,
                     didFinishLaunchingWithOptions options: [UIApplication.LaunchOptionsKey: Any]? = nil) -> Bool {
        // Firebase se configura aquí, antes de pedir el token, y solo si el
        // binario trae GoogleService-Info.plist. `configure` también fija el
        // delegado de UNUserNotificationCenter, que debe quedar puesto antes de
        // que termine el arranque para recibir el toque que abrió la app.
        PushManager.shared.configure()
        Task { @MainActor in
            NetworkMonitor.shared.start()
            // Con sesión se pide el permiso si aún no se decidió; sin sesión solo
            // se registra el dispositivo y el permiso se pide al iniciar sesión.
            let signedIn = SessionStore.shared.currentUser != nil
            await PushManager.shared.requestPermissionAndRegister(prompt: signedIn)
        }
        return true
    }

    func application(_ application: UIApplication,
                     didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        PushManager.shared.didRegisterForRemoteNotifications(deviceToken: deviceToken)
    }

    func application(_ application: UIApplication,
                     didFailToRegisterForRemoteNotificationsWithError error: Error) {
        print("APNs: fallo de registro - \(error.localizedDescription)")
    }
}
