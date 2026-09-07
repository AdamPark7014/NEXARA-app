import SwiftUI
import UIKit

struct IntegraMapPin: Identifiable, Hashable {
    let id: String
    var entityId: String
    var label: String
    var kind: Kind
    var x: CGFloat
    var y: CGFloat
    var orphan: Bool
    var statusLabel: String?

    enum Kind: String { case door, camera, other }
}

struct IntegraFloorPlan: Identifiable {
    let id: String
    var name: String
    var image: UIImage?
    var pins: [IntegraMapPin]
    var coveredEntityIds: Set<String>
    var orphanPins: Int
}

enum IntegraMapRoutes {
    static let map = "integra/map"
    static let dashboard = "integra/dashboard"
    static let titleMap = "Plano del sitio"
    static let titleDashboard = "Panorama INTEGRA"
    static let keyMap = "integra-map"
    static let keyDashboard = "integra-dashboard"

    static let routeByKey: [String: String] = [
        keyMap: map, "map": map, "plano": map, "mapa": map, "floorplan": map,
        keyDashboard: dashboard, "dashboard": dashboard, "panorama": dashboard,
        "tablero": dashboard, "resumen": dashboard,
    ]

    static func title(for route: String?) -> String? {
        switch route {
        case map: return titleMap
        case dashboard: return titleDashboard
        default: return nil
        }
    }

    static func route(forModuleKey key: String) -> String? {
        routeByKey[key.lowercased()]
    }
}

private enum FloorplanImageDecode {
    static func image(from imageData: String?) -> UIImage? {
        guard let raw = imageData?.trimmingCharacters(in: .whitespacesAndNewlines), !raw.isEmpty else {
            return nil
        }
        if raw.hasPrefix("http://") || raw.hasPrefix("https://") {
            return nil // remote URLs are not fetched here — honesty: embedded only
        }
        let b64: String
        if let range = raw.range(of: ";base64,") {
            b64 = String(raw[range.upperBound...])
        } else if raw.hasPrefix("data:") {
            return nil
        } else {
            b64 = raw
        }
        guard let data = Data(base64Encoded: b64, options: [.ignoreUnknownCharacters]) else {
            return nil
        }
        return UIImage(data: data)
    }
}

/// Plano del sitio — **solo lectura**. Tocing a pin opens its card; never moves/deletes.
struct IntegraMapView: View {
    var onOpenKey: ((String) -> Void)? = nil

    @State private var plans: [IntegraFloorPlan] = []
    @State private var selectedPlanId: String?
    @State private var selectedPin: IntegraMapPin?
    @State private var filter: PinFilter = .todos
    @State private var isLoading = true
    @State private var errorText: String?
    @State private var scale: CGFloat = 1
    @State private var offset: CGSize = .zero

    enum PinFilter: String, CaseIterable {
        case todos = "Todos"
        case puertas = "Puertas"
        case camaras = "Cámaras"
        case huerfanos = "Huérfanos"
    }

    private var plan: IntegraFloorPlan? {
        if let selectedPlanId {
            return plans.first { $0.id == selectedPlanId }
        }
        return plans.first
    }

    private var visiblePins: [IntegraMapPin] {
        guard let plan else { return [] }
        switch filter {
        case .todos: return plan.pins
        case .puertas: return plan.pins.filter { $0.kind == .door }
        case .camaras: return plan.pins.filter { $0.kind == .camera }
        case .huerfanos: return plan.pins.filter(\.orphan)
        }
    }

    var body: some View {
        Group {
            if isLoading {
                ProgressView("Cargando plano del sitio…")
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if let errorText, plans.isEmpty {
                VStack(spacing: 12) {
                    Text(errorText).foregroundStyle(.secondary)
                    Button("Reintentar") { Task { await reload() } }
                }
            } else if plans.isEmpty {
                NxEmptyState(
                    title: "Este sitio no tiene plano",
                    subtitle: "Los planos se suben desde la consola web (INTEGRA → Plano). "
                        + "Aquí solo se consultan."
                )
            } else {
                ScrollView {
                    VStack(alignment: .leading, spacing: 12) {
                        honestyBanner
                        coverageRow
                        if plans.count > 1 {
                            Picker("Plano", selection: $selectedPlanId) {
                                ForEach(plans) { Text($0.name).tag(Optional($0.id)) }
                            }
                        }
                        Picker("Filtro", selection: $filter) {
                            ForEach(PinFilter.allCases, id: \.self) { Text($0.rawValue).tag($0) }
                        }
                        .pickerStyle(.segmented)
                        floorplanCanvas
                        legend
                        if let selectedPin {
                            pinCard(selectedPin)
                        }
                        if let onOpenKey {
                            Button("Abrir dispositivos") { onOpenKey("integra-devices") }
                                .buttonStyle(.bordered)
                        }
                    }
                    .padding(16)
                }
            }
        }
        .navigationTitle(IntegraMapRoutes.titleMap)
        .task { await reload() }
        .refreshable { await reload() }
    }

    private var honestyBanner: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text("Vista de solo lectura")
                .font(.subheadline.weight(.bold))
            Text(
                "Zoom, arrastre y ficha al tocar un pin. NO coloca, NO mueve, NO borra pines "
                    + "y NO sube planos — eso queda en la consola web (el toque accidental en "
                    + "teléfono no debe borrar un equipo)."
            )
            .font(.caption)
            .foregroundStyle(.secondary)
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(NxTone.warning.bg)
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }

    @ViewBuilder
    private var coverageRow: some View {
        if let plan {
            HStack {
                NxStatusChip(text: "\(plan.pins.count) pines", tone: .info)
                NxStatusChip(
                    text: "\(plan.orphanPins) huérfanos",
                    tone: plan.orphanPins > 0 ? .warning : .success
                )
                NxStatusChip(
                    text: "\(plan.coveredEntityIds.count) cubiertos",
                    tone: .brand
                )
            }
        }
    }

    private var floorplanCanvas: some View {
        GeometryReader { geo in
            ZStack {
                Color(.secondarySystemBackground)
                if let image = plan?.image {
                    Image(uiImage: image)
                        .resizable()
                        .scaledToFit()
                } else {
                    Text("Plano sin imagen incrustada")
                        .foregroundStyle(.secondary)
                }
                ForEach(visiblePins) { pin in
                    Circle()
                        .fill(pin.orphan ? Color.orange : (pin.kind == .camera ? Color.teal : Color.blue))
                        .frame(width: 14, height: 14)
                        .overlay(Circle().stroke(.white, lineWidth: 1))
                        .position(
                            x: pin.x * geo.size.width,
                            y: pin.y * geo.size.height
                        )
                        .onTapGesture {
                            selectedPin = pin
                        }
                        .accessibilityLabel(pin.label)
                }
            }
            .scaleEffect(scale)
            .offset(offset)
            .gesture(
                SimultaneousGesture(
                    MagnificationGesture().onChanged { scale = max(1, min($0, 4)) },
                    DragGesture().onChanged { offset = $0.translation }
                )
            )
        }
        .aspectRatio(4 / 3, contentMode: .fit)
        .clipShape(RoundedRectangle(cornerRadius: 12))
        .overlay(
            RoundedRectangle(cornerRadius: 12)
                .stroke(Color.secondary.opacity(0.2))
        )
    }

    private var legend: some View {
        HStack(spacing: 12) {
            legendDot(.blue, "Puerta")
            legendDot(.teal, "Cámara")
            legendDot(.orange, "Huérfano")
        }
        .font(.caption)
    }

    private func legendDot(_ color: Color, _ label: String) -> some View {
        HStack(spacing: 4) {
            Circle().fill(color).frame(width: 8, height: 8)
            Text(label)
        }
    }

    private func pinCard(_ pin: IntegraMapPin) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                Text(pin.label).font(.headline)
                Spacer()
                Button("Cerrar") { selectedPin = nil }.font(.caption)
            }
            NxStatusChip(text: pin.kind.rawValue.uppercased(), tone: .info)
            if pin.orphan {
                Text("Huérfano: apunta a un equipo que ya no está en el espejo.")
                    .font(.caption)
                    .foregroundStyle(NxTone.warning.fg)
            }
            if let status = pin.statusLabel {
                Text(status).font(.caption).foregroundStyle(.secondary)
            }
            Text("Sin acciones de escritura en este módulo.")
                .font(.caption2)
                .foregroundStyle(.secondary)
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color(.secondarySystemBackground))
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }

    private func reload() async {
        isLoading = true
        errorText = nil
        defer { isLoading = false }
        do {
            let snap = try await IntegraMapRepository.shared.snapshot()
            let entityIds = Set(snap.doors.map(\.id) + snap.cameras.map(\.id))
            let byId = Dictionary(uniqueKeysWithValues: (snap.doors + snap.cameras).map { ($0.id, $0) })
            plans = snap.floorplans.map { fp in
                let pins: [IntegraMapPin] = fp.pins.map { p in
                    let orphan = !entityIds.contains(p.entityId)
                    let ent = byId[p.entityId]
                    let kind: IntegraMapPin.Kind = {
                        switch p.kind {
                        case .door: return .door
                        case .camera: return .camera
                        case .other: return .other
                        }
                    }()
                    return IntegraMapPin(
                        id: "\(p.id)",
                        entityId: p.entityId,
                        label: p.displayName,
                        kind: kind,
                        x: CGFloat(p.xPct) / 100,
                        y: CGFloat(p.yPct) / 100,
                        orphan: orphan,
                        statusLabel: ent.map { e in
                            if let online = e.online {
                                return online ? "En línea" : "Fuera de línea"
                            }
                            return e.doorState ?? "Sin estado"
                        }
                    )
                }
                let covered = Set(pins.filter { !$0.orphan }.map(\.entityId))
                return IntegraFloorPlan(
                    id: "\(fp.id)",
                    name: fp.name,
                    image: FloorplanImageDecode.image(from: fp.imageData),
                    pins: pins,
                    coveredEntityIds: covered,
                    orphanPins: pins.filter(\.orphan).count
                )
            }
            selectedPlanId = plans.first?.id
        } catch {
            errorText = error.localizedDescription
        }
    }
}
