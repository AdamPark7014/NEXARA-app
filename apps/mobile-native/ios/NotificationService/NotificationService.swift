import UserNotifications
import UIKit

// UNNotificationServiceExtension para enriquecer notificaciones (estilo chat/WhatsApp cuando sea posible).
// Requiere que el payload incluya "mutable-content": 1 en APS.
final class NotificationService: UNNotificationServiceExtension {
    private var contentHandler: ((UNNotificationContent) -> Void)?
    private var bestAttemptContent: UNMutableNotificationContent?

    override func didReceive(_ request: UNNotificationRequest, with contentHandler: @escaping (UNNotificationContent) -> Void) {
        self.contentHandler = contentHandler
        guard let content = (request.content.mutableCopy() as? UNMutableNotificationContent) else {
            contentHandler(request.content)
            return
        }
        bestAttemptContent = content

        // Mapear algunos campos comunes del backend
        let userInfo = content.userInfo
        let data = (userInfo["data"] as? [String: Any]) ?? userInfo
        if let sender = data["sender"] as? String {
            content.subtitle = sender
            content.summaryArgument = sender
        }
        if let thread = data["chatId"] as? String ?? data["thread"] as? String ?? data["channel"] as? String {
            content.threadIdentifier = thread
        }
        if let category = data["category"] as? String ?? data["channel"] as? String {
            content.categoryIdentifier = category
        }
        if let title = data["title"] as? String, content.title.isEmpty {
            content.title = title
        }
        if let body = data["body"] as? String, content.body.isEmpty {
            content.body = body
        }

        // Adjuntar imagen si viene "image" o "imageUrl"
        if let imageUrlStr = data["image"] as? String ?? data["imageUrl"] as? String,
           let url = URL(string: imageUrlStr) {
            fetchAttachment(from: url) { [weak self] attachment in
                if let att = attachment {
                    self?.bestAttemptContent?.attachments = [att]
                }
                if let modified = self?.bestAttemptContent {
                    contentHandler(modified)
                } else {
                    contentHandler(request.content)
                }
            }
            return
        }

        contentHandler(content)
    }

    override func serviceExtensionTimeWillExpire() {
        // Llamado por iOS si el tiempo se agota — entregar lo mejor que tengamos.
        if let handler = contentHandler, let content = bestAttemptContent {
            handler(content)
        }
    }

    private func fetchAttachment(from url: URL, completion: @escaping (UNNotificationAttachment?) -> Void) {
        let task = URLSession.shared.downloadTask(with: url) { tempUrl, _, _ in
            guard let tempUrl = tempUrl else { return completion(nil) }
            let fileMgr = FileManager.default
            let target = URL(fileURLWithPath: NSTemporaryDirectory()).appendingPathComponent(url.lastPathComponent)
            try? fileMgr.removeItem(at: target)
            do {
                try fileMgr.copyItem(at: tempUrl, to: target)
                let attachment = try UNNotificationAttachment(identifier: "image", url: target, options: nil)
                completion(attachment)
            } catch {
                completion(nil)
            }
        }
        task.resume()
    }
}

