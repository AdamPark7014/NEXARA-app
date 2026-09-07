import SwiftUI

/// Hub INTEGRA — tarjetas por módulo + cabecera viva. Paridad Android `IntegraHomeScreen` / `IntegraHomeSummary`.
struct IntegraHomeView: View {
    var onOpenKey: (String) -> Void
    var onExit: (() -> Void)? = nil
    var allowedKeys: Set<String>? = nil

    @StateObject private var summary = IntegraHomeSummaryVM()

    private struct HubCard: Identifiable {
        let key: String
        let icon: String
        let title: String
        let subtitle: String
        let tint: Color
        var id: String { key }
    }

    private var accessCards: [HubCard] {
        filter([
            .init(key: IntegraRoutes.ModuleKey.access, icon: "lock.open", title: "Acceso", subtitle: "Puertas y apertura", tint: Color(red: 0.15, green: 0.39, blue: 0.92)),
            .init(key: IntegraRoutes.ModuleKey.events, icon: "list.clipboard", title: "Eventos", subtitle: "Bitácora ACS", tint: Color(red: 0.05, green: 0.58, blue: 0.53)),
            .init(key: IntegraRoutes.ModuleKey.people, icon: "person.2", title: "Personas", subtitle: "Directorio ACS", tint: Color(red: 0.49, green: 0.23, blue: 0.93)),
            .init(key: IntegraRoutes.ModuleKey.attendance, icon: "clock", title: "Asistencia", subtitle: "Entradas / salidas", tint: Color(red: 0.98, green: 0.45, blue: 0.09)),
            .init(key: IntegraRoutes.ModuleKey.visitors, icon: "person.badge.clock", title: "Visitantes", subtitle: "Citas y registro", tint: Color(red: 0.02, green: 0.59, blue: 0.41)),
            .init(key: "integra-schedules", icon: "calendar", title: "Horarios", subtitle: "Vigencia por puerta", tint: Color(red: 0.11, green: 0.30, blue: 0.85)),
            .init(key: "integra-espacios", icon: "building.2", title: "Espacios", subtitle: "Política y reservas", tint: Color(red: 0.43, green: 0.16, blue: 0.85)),
        ])
    }

    private var opsCards: [HubCard] {
        filter([
            .init(key: "integra-dashboard", icon: "chart.bar", title: "Panorama", subtitle: "Cómo está todo ahora", tint: Color(red: 0.12, green: 0.25, blue: 0.69)),
            .init(key: IntegraRoutes.ModuleKey.alarms, icon: "bell.badge", title: "Alarmas", subtitle: "Cola SOC", tint: Color(red: 0.86, green: 0.15, blue: 0.15)),
            .init(key: IntegraRoutes.ModuleKey.occupancy, icon: "mappin.and.ellipse", title: "En sitio", subtitle: "Ocupación hoy", tint: Color(red: 0.03, green: 0.57, blue: 0.70)),
            .init(key: "integra-map", icon: "map", title: "Plano", subtitle: "Puertas y cámaras situadas", tint: Color(red: 0.28, green: 0.33, blue: 0.41)),
            .init(key: "integra-video", icon: "video", title: "Cámaras", subtitle: "Vista previa y PTZ", tint: Color(red: 0.06, green: 0.46, blue: 0.43)),
            .init(key: "integra-vehicles", icon: "car", title: "Vehículos", subtitle: "Placas registradas", tint: Color(red: 0.08, green: 0.50, blue: 0.24)),
            .init(key: "integra-anpr", icon: "magnifyingglass", title: "ANPR", subtitle: "Lecturas de placa", tint: Color(red: 0.09, green: 0.40, blue: 0.20)),
            .init(key: IntegraRoutes.ModuleKey.devices, icon: "desktopcomputer", title: "Equipos", subtitle: "Inventario ACS", tint: Color(red: 0.29, green: 0.33, blue: 0.39)),
        ])
    }

    private var governCards: [HubCard] {
        filter([
            .init(key: "integra-detection", icon: "scope", title: "Detección", subtitle: "Perfiles por cámara", tint: Color(red: 0.71, green: 0.32, blue: 0.04)),
            .init(key: "integra-audit", icon: "doc.text", title: "Bitácora", subtitle: "Quién hizo qué", tint: Color(red: 0.20, green: 0.25, blue: 0.33)),
            .init(key: "integra-notifications", icon: "bell", title: "Avisos", subtitle: "Centro de notificaciones", tint: Color(red: 0.76, green: 0.25, blue: 0.05)),
            .init(key: "integra-my-profile", icon: "person.crop.circle", title: "Mi perfil", subtitle: "Mis credenciales", tint: Color(red: 0.49, green: 0.13, blue: 0.81)),
            .init(key: IntegraRoutes.ModuleKey.sites, icon: "gearshape", title: "Ajustes", subtitle: "Sitios y sincronización", tint: Color(red: 0.58, green: 0.20, blue: 0.92)),
        ])
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                VStack(alignment: .leading, spacing: 4) {
                    Text("INTEGRA").font(.title2.bold())
                    Text("Control de acceso, eventos y operación del sitio.")
                        .font(.footnote)
                        .foregroundColor(.secondary)
                }

                IntegraHomeSummaryBlock(vm: summary)

                if !accessCards.isEmpty {
                    section("Control de accesos", "Puertas, eventos, personas, asistencia y visitantes", cards: accessCards)
                }
                if !opsCards.isEmpty {
                    section("Operación", "Alarmas, presencia, cámaras, vehículos y equipos", cards: opsCards)
                }
                if !governCards.isEmpty {
                    section("Configuración y gobierno", "Detección, bitácora, avisos, perfil y ajustes", cards: governCards)
                }
            }
            .padding(16)
        }
        .background(Color(.systemGroupedBackground))
        .navigationTitle("INTEGRA")
        .navigationBarTitleDisplayMode(.inline)
        .task { await summary.refresh() }
        .refreshable { await summary.refresh() }
        .toolbar {
            if let onExit {
                ToolbarItem(placement: .navigationBarLeading) {
                    Button("Paneles", action: onExit)
                }
            }
        }
    }

    private func filter(_ cards: [HubCard]) -> [HubCard] {
        guard let allowedKeys else { return cards }
        return cards.filter { allowedKeys.contains($0.key) }
    }

    @ViewBuilder
    private func section(_ title: String, _ subtitle: String, cards: [HubCard]) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            NxSectionHeader(title: title, subtitle: subtitle)
            LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 10) {
                ForEach(cards) { card in
                    Button { onOpenKey(card.key) } label: {
                        VStack(alignment: .leading, spacing: 8) {
                            Image(systemName: card.icon)
                                .font(.title3)
                                .foregroundColor(card.tint)
                            Text(card.title)
                                .font(.subheadline.weight(.semibold))
                                .foregroundColor(.primary)
                            Text(card.subtitle)
                                .font(.caption2)
                                .foregroundColor(.secondary)
                                .lineLimit(2)
                                .multilineTextAlignment(.leading)
                        }
                        .frame(maxWidth: .infinity, minHeight: 96, alignment: .topLeading)
                        .padding(14)
                        .background(Color(.secondarySystemBackground))
                        .clipShape(RoundedRectangle(cornerRadius: 16))
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }
}

// MARK: - Cabecera viva (paridad IntegraHomeSummary)

private struct IntegraHomeSummaryBlock: View {
    @ObservedObject var vm: IntegraHomeSummaryVM

    var body: some View {
        let caidas = max(0, vm.doors - vm.doorsOnline)
        VStack(alignment: .leading, spacing: 10) {
            if vm.loading && vm.connected == nil {
                ProgressView("Consultando panorama…")
                    .frame(maxWidth: .infinity)
            }

            if vm.connected == false {
                NxAlertBanner(alert: NxAlert(
                    id: "offline",
                    title: vm.host.isEmpty
                        ? "Sin enlace con el sitio."
                        : "Sin enlace con el sitio (\(vm.host)).",
                    subtitle: "Lo de abajo es el último espejo sincronizado, no el estado de ahora.",
                    tone: .danger
                ))
            } else if vm.connected == nil && !vm.loading {
                NxAlertBanner(alert: NxAlert(
                    id: "dash-fail",
                    title: "No se pudo consultar el estado del sitio.",
                    subtitle: "Los módulos siguen abriéndose, pero sus datos pueden estar desfasados.",
                    tone: .warning
                ))
            }

            NxKpiGrid(items: [
                NxKpi(
                    label: "Puertas en línea",
                    value: vm.doors > 0 ? "\(vm.doorsOnline)/\(vm.doors)" : "—",
                    hint: caidas > 0 ? "\(caidas) sin conexión" : nil,
                    tone: caidas > 0 ? .danger : .success
                ),
                NxKpi(
                    label: "Alarmas pendientes",
                    value: "\(vm.alarmasAbiertas)",
                    hint: vm.alarmasAbiertas > 0 ? "Requieren decisión" : "Cola limpia",
                    tone: vm.alarmasAbiertas > 0 ? .danger : .success
                ),
                NxKpi(label: "En sitio ahora", value: "\(vm.enSitio)", tone: .info),
                NxKpi(
                    label: "Denegados hoy",
                    value: "\(vm.denegados)",
                    tone: vm.denegados > 0 ? .warning : .neutral
                ),
            ])

            Text(
                "\(vm.cameras) cámaras · \(vm.people) personas · \(vm.devices) equipos"
                    + (vm.syncLabel.map { " · espejo \($0)" } ?? "")
            )
            .font(.caption2)
            .foregroundColor(.secondary)

            if !vm.loading, vm.syncLabel == nil {
                NxAlertBanner(alert: NxAlert(
                    id: "no-sync",
                    title: "El espejo no tiene fecha de última reconciliación.",
                    subtitle: "No se sabe de cuándo son estos números; sincroniza desde la consola web.",
                    tone: .warning
                ))
            } else if let sync = vm.syncLabel, vm.syncStale {
                NxAlertBanner(alert: NxAlert(
                    id: "stale",
                    title: "El espejo lleva \(sync.replacingOccurrences(of: "hace ", with: "")) sin reconciliarse.",
                    subtitle: "Puertas, personas y equipos pueden no coincidir con lo instalado.",
                    tone: .warning
                ))
            }
        }
    }
}

@MainActor
final class IntegraHomeSummaryVM: ObservableObject {
    @Published var loading = true
    @Published var connected: Bool?
    @Published var host = ""
    @Published var doors = 0
    @Published var doorsOnline = 0
    @Published var cameras = 0
    @Published var people = 0
    @Published var devices = 0
    @Published var enSitio = 0
    @Published var denegados = 0
    @Published var alarmasAbiertas = 0
    @Published var syncLabel: String?
    @Published var syncStale = false

    private let repo = IntegraRepository.shared

    func refresh() async {
        loading = true
        let dash = (try? await repo.dashboard()) ?? [:]
        let stats = (try? await repo.pushEventStats()) ?? [:]
        let alarms = try? await repo.alarmQueue()
        let syncMap = (try? await repo.lastSync()) ?? [:]

        connected = IntegraDict.bool(dash, "connected")
        host = IntegraDict.str(dash, "host")
        doors = IntegraDict.int(dash, "doors")
        doorsOnline = IntegraDict.int(dash, "doorsOnline")
        cameras = IntegraDict.int(dash, "cameras")
        people = IntegraDict.int(dash, "people")
        devices = IntegraDict.int(dash, "devices")
        if stats["enSitio"] != nil {
            enSitio = IntegraDict.int(stats, "enSitio")
        } else {
            enSitio = IntegraDict.int(stats, "onSite")
        }
        if stats["denegados"] != nil {
            denegados = IntegraDict.int(stats, "denegados")
        } else {
            denegados = IntegraDict.int(stats, "denied")
        }
        alarmasAbiertas = alarms?.openCount ?? 0

        let raw = IntegraDict.str(dash, "lastSync", "lastSyncAt").nilIfEmpty
            ?? IntegraDict.str(syncMap, "lastSync", "lastSyncAt", "at").nilIfEmpty
        if let ms = IntegraCoreFormat.parseMs(raw) {
            let age = IntegraCoreFormat.syncAge(lastSyncMs: ms)
            syncLabel = age.label
            syncStale = age.stale
        } else {
            syncLabel = nil
            syncStale = false
        }
        loading = false
    }
}

/// Formato / edad de espejo compartido por pantallas core (paridad Android IntegraFormat / syncAge).
enum IntegraCoreFormat {
    static let syncStaleMs: TimeInterval = 60 * 60

    struct SyncAge {
        let label: String
        let stale: Bool
    }

    static func parseMs(_ raw: String?) -> TimeInterval? {
        guard let raw, !raw.isEmpty else { return nil }
        let iso = ISO8601DateFormatter()
        iso.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let d = iso.date(from: raw) { return d.timeIntervalSince1970 }
        iso.formatOptions = [.withInternetDateTime]
        if let d = iso.date(from: raw) { return d.timeIntervalSince1970 }
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US_POSIX")
        f.dateFormat = "yyyy-MM-dd'T'HH:mm:ss"
        if let d = f.date(from: String(raw.prefix(19))) { return d.timeIntervalSince1970 }
        return nil
    }

    static func syncAge(lastSyncMs: TimeInterval, now: Date = Date()) -> SyncAge {
        let edad = now.timeIntervalSince1970 - lastSyncMs
        if edad < 0 { return SyncAge(label: "recién", stale: false) }
        let minutos = Int(edad / 60)
        let label: String
        switch minutos {
        case ..<1: label = "hace menos de 1 min"
        case ..<60: label = "hace \(minutos) min"
        case ..<(60 * 24): label = "hace \(minutos / 60) h"
        default: label = "hace \(minutos / (60 * 24)) d"
        }
        return SyncAge(label: label, stale: edad > syncStaleMs)
    }

    static func dateOnly(_ date: Date) -> String {
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US_POSIX")
        f.dateFormat = "yyyy-MM-dd"
        return f.string(from: date)
    }
}
