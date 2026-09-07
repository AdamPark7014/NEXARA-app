import SwiftUI

struct IntegraPanoramaSnapshot {
    var linkConnected: Bool?
    var linkLabel: String
    var doorsOnline: Int?
    var doorsTotal: Int?
    var camerasOnline: Int?
    var camerasTotal: Int?
    var openAlarms: Int?
    var occupancy: Int?
    var eventsToday: Int?
    var topAlarms: [IntegraPanoramaAlarm]
    var failedParts: [String]
}

struct IntegraPanoramaAlarm: Identifiable, Hashable {
    let id: String
    var title: String
    var subtitle: String?
    var when: String?
}

/// Panorama — resumen de estado. Solo lectura; navega con onOpenKey.
/// Nunca inventa ceros: un hueco se muestra como «—» / bloque fallido.
struct IntegraDashboardView: View {
    var onOpenKey: ((String) -> Void)? = nil

    @State private var snap: IntegraPanoramaSnapshot?
    @State private var isLoading = true
    @State private var errorText: String?

    var body: some View {
        Group {
            if isLoading {
                ProgressView("Leyendo el estado del sitio…")
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if snap == nil {
                VStack(spacing: 12) {
                    Text(errorText ?? "No se pudo leer el estado del sitio")
                        .foregroundStyle(.secondary)
                    Button("Reintentar") { Task { await reload() } }
                }
            } else if let snap {
                ScrollView {
                    VStack(alignment: .leading, spacing: 12) {
                        honestyBanner
                        if !snap.failedParts.isEmpty {
                            NxAlertBanner(
                                alert: NxAlert(
                                    id: "gaps",
                                    title: "Bloques sin respuesta",
                                    subtitle: snap.failedParts.joined(separator: ", "),
                                    tone: .warning
                                )
                            )
                        }
                        linkPanel(snap)
                        nowSection(snap)
                        alarmsSection(snap)
                        jumpRow
                    }
                    .padding(16)
                }
            }
        }
        .navigationTitle(IntegraMapRoutes.titleDashboard)
        .task { await reload() }
        .refreshable { await reload() }
    }

    private var honestyBanner: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text("Resumen de solo lectura")
                .font(.subheadline.weight(.bold))
            Text(
                "Ninguna métrica se inventa. Un hueco no es un cero: si un endpoint "
                    + "no responde, su bloque lo dice."
            )
            .font(.caption)
            .foregroundStyle(.secondary)
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(NxTone.info.bg)
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }

    private func linkPanel(_ snap: IntegraPanoramaSnapshot) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            NxSectionHeader(title: "Enlace del sitio", subtitle: snap.linkLabel)
            if let connected = snap.linkConnected {
                NxStatusChip(
                    text: connected ? "Conectado" : "Sin enlace",
                    tone: connected ? .success : .danger
                )
            } else {
                Text("Estado de enlace desconocido (sin respuesta).")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color(.secondarySystemBackground))
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }

    private func nowSection(_ snap: IntegraPanoramaSnapshot) -> some View {
        NxKpiGrid(items: [
            kpi("Puertas en línea", snap.doorsOnline, snap.doorsTotal),
            kpi("Cámaras en línea", snap.camerasOnline, snap.camerasTotal),
            NxKpi(
                label: "Alarmas abiertas",
                value: snap.openAlarms.map(String.init) ?? "—",
                hint: snap.openAlarms == nil ? "Sin cola" : "24 h",
                tone: (snap.openAlarms ?? 0) > 0 ? .warning : .success
            ),
            NxKpi(
                label: "Gente en sitio",
                value: snap.occupancy.map(String.init) ?? "—",
                hint: snap.occupancy == nil ? "Sin occupancy" : nil,
                tone: .brand
            ),
            NxKpi(
                label: "Eventos hoy",
                value: snap.eventsToday.map(String.init) ?? "—",
                hint: snap.eventsToday == nil ? "Sin stats" : nil,
                tone: .brand
            ),
        ])
    }

    private func kpi(_ label: String, _ online: Int?, _ total: Int?) -> NxKpi {
        if let online, let total {
            return NxKpi(label: label, value: "\(online)/\(total)", tone: .brand)
        }
        if let online {
            return NxKpi(label: label, value: "\(online)", tone: .brand)
        }
        return NxKpi(label: label, value: "—", hint: "Sin dato", tone: .neutral)
    }

    @ViewBuilder
    private func alarmsSection(_ snap: IntegraPanoramaSnapshot) -> some View {
        if snap.openAlarms == nil && snap.topAlarms.isEmpty {
            EmptyView()
        } else {
            NxSectionHeader(title: "Alarmas abiertas", subtitle: "Últimas 24 horas")
            if snap.topAlarms.isEmpty {
                Text(
                    snap.openAlarms == nil
                        ? "La cola de alarmas no respondió."
                        : "Sin alarmas abiertas en el resumen."
                )
                .font(.caption)
                .foregroundStyle(.secondary)
            } else {
                ForEach(snap.topAlarms.prefix(5)) { a in
                    VStack(alignment: .leading, spacing: 2) {
                        Text(a.title).font(.subheadline.weight(.semibold))
                        if let sub = a.subtitle {
                            Text(sub).font(.caption).foregroundStyle(.secondary)
                        }
                        if let when = a.when {
                            Text(when).font(.caption2).foregroundStyle(.secondary)
                        }
                    }
                    .padding(12)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(Color(.secondarySystemBackground))
                    .clipShape(RoundedRectangle(cornerRadius: 12))
                }
            }
        }
    }

    @ViewBuilder
    private var jumpRow: some View {
        if let onOpenKey {
            VStack(alignment: .leading, spacing: 8) {
                NxSectionHeader(title: "Ir a módulo", subtitle: "Este panorama no escribe")
                HStack {
                    Button("Alarmas") { onOpenKey("integra-alarms") }.buttonStyle(.bordered)
                    Button("Acceso") { onOpenKey("integra-access") }.buttonStyle(.bordered)
                    Button("Cámaras") { onOpenKey("integra-video") }.buttonStyle(.bordered)
                }
            }
        }
    }

    private func reload() async {
        isLoading = true
        errorText = nil
        defer { isLoading = false }

        var failed: [String] = []
        var linkConnected: Bool?
        var linkLabel = "Enlace"
        var doorsOnline: Int?
        var doorsTotal: Int?
        var camerasOnline: Int?
        var camerasTotal: Int?
        var openAlarms: Int?
        var occupancy: Int?
        var eventsToday: Int?
        var topAlarms: [IntegraPanoramaAlarm] = []

        if let dash = try? await IntegraRepository.shared.dashboard() {
            linkConnected = dash.integraBool("connected", "online")
            linkLabel = dash.integraStr("provider", "label") ?? "Enlace del sitio"
            doorsOnline = dash.integraInt("doorsOnline")
            doorsTotal = dash.integraInt("doorsTotal")
            camerasOnline = dash.integraInt("camerasOnline")
            camerasTotal = dash.integraInt("camerasTotal")
        } else {
            failed.append("dashboard")
        }

        // Prefer map snapshot counts when dashboard omitted inventory (never invent 0).
        if doorsOnline == nil || camerasOnline == nil,
           let map = try? await IntegraMapRepository.shared.snapshot() {
            if doorsTotal == nil {
                doorsTotal = map.doors.count
                let known = map.doors.compactMap(\.online)
                if known.count == map.doors.count {
                    doorsOnline = known.filter { $0 }.count
                }
            }
            if camerasTotal == nil {
                camerasTotal = map.cameras.count
                let known = map.cameras.compactMap(\.online)
                if known.count == map.cameras.count {
                    camerasOnline = known.filter { $0 }.count
                }
            }
        }

        if let q = try? await IntegraRepository.shared.alarmQueue(hours: 24) {
            openAlarms = q.openCount
            topAlarms = q.items.prefix(5).enumerated().map { i, m in
                IntegraPanoramaAlarm(
                    id: m.integraStr("id") ?? "\(i)",
                    title: m.integraStr("title", "name") ?? "Alarma",
                    subtitle: m.integraStr("personName", "deviceName"),
                    when: m.integraStr("timestamp", "occurredAt")
                )
            }
        } else {
            failed.append("alarms")
        }

        if let occ = try? await IntegraRepository.shared.occupancy() {
            occupancy = occ.total
        } else {
            failed.append("occupancy")
        }

        if let stats = try? await IntegraRepository.shared.pushEventStats() {
            eventsToday = stats.integraInt("today", "count", "eventsToday")
        } else if let stats = try? await IntegraGovernanceRepository.shared.pushEventStats() {
            eventsToday = stats.integraInt("today", "count", "eventsToday")
        } else {
            failed.append("stats")
        }

        snap = IntegraPanoramaSnapshot(
            linkConnected: linkConnected,
            linkLabel: linkLabel,
            doorsOnline: doorsOnline,
            doorsTotal: doorsTotal,
            camerasOnline: camerasOnline,
            camerasTotal: camerasTotal,
            openAlarms: openAlarms,
            occupancy: occupancy,
            eventsToday: eventsToday,
            topAlarms: topAlarms,
            failedParts: failed
        )
    }
}
