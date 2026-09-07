import SwiftUI

struct IntegraAuditEntry: Identifiable, Hashable {
    let id: String
    var when: String
    var actor: String
    var action: String
    var target: String?
    var ip: String?
    var userAgent: String?
    var previousValue: String?
}

struct IntegraNotificationRow: Identifiable, Hashable {
    let id: String
    var title: String
    var body: String?
    var createdAt: String?
    var read: Bool
}

struct IntegraIdentitySnapshot {
    var displayName: String?
    var email: String?
    var acsPersonId: String?
    var acsSiteId: Int?
}

struct IntegraCredentialRow: Identifiable, Hashable {
    let id: String
    var kind: String
    var label: String
    var status: String
}

/// Bitácora: reconstruir qué pasó un día/franja. No es tabla de escritorio.
struct IntegraAuditView: View {
    @State private var day = Date()
    @State private var entries: [IntegraAuditEntry] = []
    @State private var isLoading = true
    @State private var errorText: String?
    @State private var selected: IntegraAuditEntry?

    var body: some View {
        Group {
            if let selected {
                auditDetail(selected)
            } else if isLoading {
                ProgressView("Cargando bitácora…")
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if let errorText, entries.isEmpty {
                VStack(spacing: 12) {
                    Text(errorText).foregroundStyle(.secondary)
                    Button("Reintentar") { Task { await reload() } }
                }
            } else {
                List {
                    Section {
                        DatePicker("Día", selection: $day, displayedComponents: .date)
                            .onChange(of: day) { _, _ in Task { await reload() } }
                        Text(
                            "Quién abrió una puerta a distancia o cambió un horario. "
                                + "Orden cronológico; toca una fila para IP, user-agent y valor anterior."
                        )
                        .font(.caption)
                        .foregroundStyle(.secondary)
                    }
                    if entries.isEmpty {
                        NxEmptyState(
                            title: "Sin eventos",
                            subtitle: "No hay entradas de auditoría en este día."
                        )
                    } else {
                        ForEach(entries) { e in
                            Button { selected = e } label: {
                                VStack(alignment: .leading, spacing: 4) {
                                    Text(e.action).font(.headline)
                                    Text("\(e.when) · \(e.actor)")
                                        .font(.caption)
                                        .foregroundStyle(.secondary)
                                    if let target = e.target {
                                        Text(target).font(.caption2).foregroundStyle(.secondary)
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
        .navigationTitle("Bitácora y auditoría")
        .task { await reload() }
        .refreshable { await reload() }
    }

    private func auditDetail(_ e: IntegraAuditEntry) -> some View {
        List {
            Section {
                Button("Volver") { selected = nil }
                Text(e.action).font(.title3.weight(.semibold))
                Text(e.when).foregroundStyle(.secondary)
            }
            Section("Actor") {
                Text(e.actor)
                if let ip = e.ip { Text("IP: \(ip)").font(.caption.monospaced()) }
                if let ua = e.userAgent { Text(ua).font(.caption2).foregroundStyle(.secondary) }
            }
            if let target = e.target {
                Section("Objetivo") { Text(target) }
            }
            if let prev = e.previousValue {
                Section("Valor anterior") {
                    Text(prev).font(.caption.monospaced())
                }
            }
            Section {
                ShareLink(item: shareText(e)) {
                    Label("Compartir ficha", systemImage: "square.and.arrow.up")
                }
            }
        }
    }

    private func shareText(_ e: IntegraAuditEntry) -> String {
        [
            e.when, e.actor, e.action, e.target, e.ip, e.previousValue
        ]
        .compactMap { $0 }
        .joined(separator: "\n")
    }

    private func reload() async {
        isLoading = true
        errorText = nil
        defer { isLoading = false }
        do {
            let cal = Calendar.current
            let start = cal.startOfDay(for: day)
            let end = cal.date(byAdding: .day, value: 1, to: start) ?? start
            let iso = ISO8601DateFormatter()
            var consulta = IntegraGovernanceRepository.ConsultaBitacora()
            consulta.fromIso = iso.string(from: start)
            consulta.toIso = iso.string(from: end)
            consulta.limit = 100
            let page = try await IntegraGovernanceRepository.shared.audit(consulta)
            entries = page.items.enumerated().map { i, m in
                IntegraAuditEntry(
                    id: m.integraStr("id") ?? "\(i)",
                    when: m.integraStr("createdAt", "timestamp", "at") ?? "",
                    actor: m.integraStr("actor", "user", "userName") ?? "—",
                    action: m.integraStr("action", "type", "event") ?? "acción",
                    target: m.integraStr("target", "resource"),
                    ip: m.integraStr("ip", "ipAddress"),
                    userAgent: m.integraStr("userAgent"),
                    previousValue: m.integraStr("previousValue", "before")
                )
            }
        } catch {
            errorText = error.localizedDescription
        }
    }
}
