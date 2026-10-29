import UIKit

/// AppDelegate para APNs/FCM (la entrada SwiftUI sigue siendo NexaraApp.swift).
final class AppDelegate: NSObject, UIApplicationDelegate {
    func application(_ app: UIApplication,
                     didFinishLaunchingWithOptions options: [UIApplication.LaunchOptionsKey: Any]? = nil) -> Bool {
        // Color de la flecha de volver antes de que exista la primera barra (ver `NxBarraSuperior`).
        NxBarraSuperior.configurar()
        // Firebase se configura aquí, antes de pedir el token, y solo si el
        // binario trae GoogleService-Info.plist. `configure` también fija el
        // delegado de UNUserNotificationCenter, que debe quedar puesto antes de
        // que termine el arranque para recibir el toque que abrió la app.
        PushManager.shared.configure()
        Task { @MainActor in
            NetworkMonitor.shared.start()
            // Con sesión se pide el permiso si aún no se decidió; sin sesión solo
            // se registra el dispositivo y el permiso se pide al iniciar sesión.
            // Modo demostración (`-NEXARA_DEMO 1`): ni permiso de avisos ni registro de push.
            guard !DemoMode.isActive else { return }
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

    /// Latido silencioso del GPS de jornada (`gps-latido`, el servidor lleva 35 min sin un punto).
    /// Solo mide con el permiso «Siempre» (ver `ShiftGpsTracker`); se le dan unos segundos a la
    /// lectura antes de devolverle el control a iOS.
    func application(_ application: UIApplication,
                     didReceiveRemoteNotification userInfo: [AnyHashable: Any],
                     fetchCompletionHandler completionHandler: @escaping (UIBackgroundFetchResult) -> Void) {
        guard (userInfo["event"] as? String) == "gps-latido" else {
            completionHandler(.noData)
            return
        }
        Task { @MainActor in
            ShiftGpsTracker.shared.latido()
            try? await Task.sleep(nanoseconds: 8_000_000_000)
            completionHandler(.newData)
        }
    }
}
