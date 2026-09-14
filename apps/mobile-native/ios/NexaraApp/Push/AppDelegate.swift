import UIKit

/// AppDelegate para APNs/FCM (la entrada SwiftUI sigue siendo NexaraApp.swift).
final class AppDelegate: NSObject, UIApplicationDelegate {
    func application(_ app: UIApplication,
                     didFinishLaunchingWithOptions options: [UIApplication.LaunchOptionsKey: Any]? = nil) -> Bool {
        // Firebase se configura aquí, antes de pedir el token, y solo si el
        // binario trae GoogleService-Info.plist.
        PushManager.shared.configure()
        Task { @MainActor in
            NetworkMonitor.shared.start()
            await PushManager.shared.requestPermissionAndRegister()
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
