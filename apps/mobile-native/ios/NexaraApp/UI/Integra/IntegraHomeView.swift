import SwiftUI

/// Hub INTEGRA — tarjetas por módulo. Paridad Android `IntegraHomeScreen`.
struct IntegraHomeView: View {
    var onOpenKey: (String) -> Void
    var onExit: (() -> Void)? = nil
    var allowedKeys: Set<String>? = nil

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
