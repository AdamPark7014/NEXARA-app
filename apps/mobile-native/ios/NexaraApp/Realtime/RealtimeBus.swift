import Foundation
import Combine
import SocketIO

struct EntityUpdatedEvent: Equatable {
    let model: String?
    let action: String?
    let timestamp: String?
}

/// Conexión Socket.IO única — paridad Android `RealtimeBus`.
final class RealtimeBus: ObservableObject {
    static let shared = RealtimeBus()

    let events = PassthroughSubject<EntityUpdatedEvent, Never>()

    private var manager: SocketManager?
    private var socket: SocketIOClient?
    private var activeToken: String?

    private init() {}

    func start(token: String) {
        guard !token.isEmpty else { return }
        if activeToken == token, socket?.status == .connected { return }
        stop()

        guard let url = URL(string: ApiUrls.assetOrigin) else { return }
        activeToken = token
        manager = SocketManager(
            socketURL: url,
            config: [
                .log(false),
                .compress,
                .forceWebsockets(true),
                .connectParams(["token": token]),
                .extraHeaders(["Authorization": "Bearer \(token)"]),
            ]
        )
        let sock = manager?.defaultSocket
        socket = sock
        sock?.on("entity:updated") { [weak self] data, _ in
            guard let self else { return }
            let obj = data.first as? [String: Any]
            let ev = EntityUpdatedEvent(
                model: obj?["model"] as? String,
                action: obj?["action"] as? String,
                timestamp: obj?["timestamp"] as? String
            )
            self.events.send(ev)
        }
        sock?.connect()
    }

    func stop() {
        socket?.disconnect()
        socket?.removeAllHandlers()
        manager = nil
        socket = nil
        activeToken = nil
    }
}
