import SwiftUI

/// Tablero de despacho OT — paridad web `/ops/dispatch`.
struct DispatchBoardView: View {
    @State private var board: [String: Any] = [:]
    @State private var loading = true
    @State private var error: String?

    private let columns: [(String, String)] = [
        ("pendiente", "Pendiente"),
        ("en_curso", "En curso"),
        ("por_validar", "Por validar"),
        ("completadas_hoy", "Completadas hoy"),
    ]

    var body: some View {
        Group {
            if loading {
                ProgressView("Cargando despacho…")
            } else if let error {
                VStack(spacing: 12) {
                    Text(error).foregroundStyle(.red)
                    Button("Reintentar") { Task { await load() } }
                }
            } else {
                List {
                    ForEach(columns, id: \.0) { key, title in
                        Section(title) {
                            let cards = (board["columns"] as? [String: Any])?[key] as? [[String: Any]] ?? []
                            if cards.isEmpty {
                                Text("Sin OT").foregroundStyle(.secondary)
                            } else {
                                ForEach(cards.indices, id: \.self) { idx in
                                    let card = cards[idx]
                                    let activityId = ConsoleHelpers.mapInt64(card, "id") ?? 0
                                    if activityId > 0 {
                                        NavigationLink(value: activityId) {
                                            dispatchCardBody(card)
                                        }
                                    } else {
                                        dispatchCardBody(card)
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
        .navigationTitle("Despacho OT")
        .navigationDestination(for: Int64.self) { id in
            ActivityDetailByIdView(activityId: id)
        }
        .task { await load() }
    }

    @ViewBuilder
    private func dispatchCardBody(_ card: [String: Any]) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack {
                Text(ConsoleHelpers.mapStr(card, "anNumber").isEmpty
                     ? "OT #\(ConsoleHelpers.mapStr(card, "id"))"
                     : ConsoleHelpers.mapStr(card, "anNumber"))
                    .font(.subheadline.bold())
                Spacer()
                let priority = ConsoleHelpers.mapStr(card, "prioridad")
                if !priority.isEmpty {
                    Text(priority).font(.caption2).foregroundStyle(.secondary)
                }
            }
            Text(ConsoleHelpers.mapStr(card, "titulo"))
                .font(.caption)
            let location = ConsoleHelpers.mapStr(card, "branchName", "branchCity")
            if location.isEmpty, let client = card["client"] as? [String: Any] {
                Text(ConsoleHelpers.mapStr(client, "name"))
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            } else if !location.isEmpty {
                Text(location)
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }
            let responsable = (card["responsable"] as? [String: Any]).map {
                ConsoleHelpers.mapStr($0, "nombre", "name")
            } ?? ConsoleHelpers.mapStr(card, "responsableNombre")
            if !responsable.isEmpty {
                Text("👷 \(responsable)").font(.caption2)
            }
            Text(ConsoleHelpers.mapStr(card, "estatus"))
                .font(.caption2)
                .foregroundStyle(.secondary)
        }
    }

    private func load() async {
        loading = true
        error = nil
        do {
            let data = try await ApiClient.shared.get("activities/dispatch-board")
            board = ConsoleHelpers.decodeMap(data)
        } catch {
            self.error = error.localizedDescription
        }
        loading = false
    }
}
