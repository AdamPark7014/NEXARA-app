import UIKit

/// AppDelegate solo para recibir callbacks de APNs (SwiftUI App entry sigue siendo NexaraApp.swift).
final class AppDelegate: NSObject, UIApplicationDelegate {
    func application(_ app: UIApplication,
                     didFinishLaunchingWithOptions options: [UIApplication.LaunchOptionsKey: Any]? = nil) -> Bool {
        PushManager.shared.configure()
        Task { @MainActor in
            NetworkMonitor.shared.start()
            await PushManager.shared.requestPermissionAndRegister()
        }
        return true
    }

    func application(_ application: UIApplication,
                     didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        Task { await PushManager.shared.registerDeviceTokenWithBackend(deviceToken) }
    }

    func application(_ application: UIApplication,
                     didFailToRegisterForRemoteNotificationsWithError error: Error) {
        print("APNs: fallo de registro - \(error.localizedDescription)")
    }
}
