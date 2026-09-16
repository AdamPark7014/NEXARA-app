import Foundation
import Combine
import SocketIO

struct EntityUpdatedEvent: Equatable {
    let model: String?
    let action: String?
    let timestamp: String?
}

/// Evento del workspace de chat tal cual llega del socket
/// (`chat:message`, `chat:typing`, … y `connect` al reconectar).
struct ChatSocketEvent {
    let name: String
    let payload: [String: Any]
}

/// Conexión Socket.IO única — paridad Android `RealtimeBus`.
final class RealtimeBus: ObservableObject {
    static let shared = RealtimeBus()

    let events = PassthroughSubject<EntityUpdatedEvent, Never>()
    /// Mismos eventos que escucha `apps/web/components/WorkspaceChat.tsx`.
    let chatEvents = PassthroughSubject<ChatSocketEvent, Never>()

    /// Eventos de chat que emite el gateway (`realtime.gateway.ts`).
    private static let chatEventNames = [
        "chat:message",
        "chat:message-updated",
        "chat:message-deleted",
        "chat:channel-activity",
        "chat:typing",
        "chat:presence",
        "chat:channel-updated",
        "chat:members-changed",
    ]

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
        for name in Self.chatEventNames {
            sock?.on(name) { [weak self] data, _ in
                self?.chatEvents.send(
                    ChatSocketEvent(name: name, payload: data.first as? [String: Any] ?? [:])
                )
            }
        }
        // Al (re)conectar, la vista vuelve a unirse al canal y rellena el hueco.
        sock?.on(clientEvent: .connect) { [weak self] _, _ in
            self?.chatEvents.send(ChatSocketEvent(name: "connect", payload: [:]))
        }
        sock?.connect(withPayload: ["token": token])
    }

    /// `chat:join` / `chat:leave` / `chat:typing` / `chat:presence` hacia el gateway.
    func emitChat(_ event: String, _ payload: [String: Any]) {
        guard let socket, socket.status == .connected else { return }
        socket.emit(event, payload)
    }

    func stop() {
        socket?.disconnect()
        socket?.removeAllHandlers()
        manager = nil
        socket = nil
        activeToken = nil
    }
}
