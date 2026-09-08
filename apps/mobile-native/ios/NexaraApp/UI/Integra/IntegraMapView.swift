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
    var imageUnavailableReason: String?
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
    enum State {
        case ready(UIImage)
        case unavailable(String)
    }

    static func decode(_ imageData: String?) -> State {
        guard let raw = imageData?.trimmingCharacters(in: .whitespacesAndNewlines), !raw.isEmpty else {
            return .unavailable("Este plano no tiene imagen guardada.")
        }
        if isRemoteUrl(raw) {
            return .unavailable(
                "El plano está guardado como enlace y no como imagen incrustada. Ábrelo en la consola web."
            )
        }
        guard let payload = parsePayload(raw) else {
            return .unavailable("La imagen del plano no está en un formato que se pueda abrir aquí.")
        }
        guard let data = Data(base64Encoded: payload, options: [.ignoreUnknownCharacters]), !data.isEmpty else {
            return .unavailable("La imagen del plano llegó dañada.")
        }
        // Downsample large CAD exports to avoid OOM on device.
        guard let image = downsampledImage(data: data, maxDimension: 2048) else {
            return .unavailable("El archivo guardado como plano no es una imagen legible.")
        }
        return .ready(image)
    }

    static func image(from imageData: String?) -> UIImage? {
        if case .ready(let img) = decode(imageData) { return img }
        return nil
    }

    static func reason(from imageData: String?) -> String? {
        if case .unavailable(let r) = decode(imageData) { return r }
        return nil
    }

    private static func isRemoteUrl(_ s: String) -> Bool {
        s.hasPrefix("http://") || s.hasPrefix("https://")
            || (s.hasPrefix("/") && !s.hasPrefix("//"))
    }

    private static func parsePayload(_ s: String) -> String? {
        if s.lowercased().hasPrefix("data:") {
            guard let mark = s.range(of: ";base64,", options: .caseInsensitive) else {
                return nil
            }
            let body = stripWhitespace(String(s[mark.upperBound...]))
            return body.isEmpty ? nil : body
        }
        let body = stripWhitespace(s)
        guard body.count >= 32, looksLikeBase64(body) else { return nil }
        return body
    }

    private static func stripWhitespace(_ raw: String) -> String {
        if raw.first(where: \.isWhitespace) == nil { return raw.trimmingCharacters(in: .whitespacesAndNewlines) }
        return raw.filter { !$0.isWhitespace }
    }

    private static func looksLikeBase64(_ s: String) -> Bool {
        s.allSatisfy {
            ($0 >= "A" && $0 <= "Z") || ($0 >= "a" && $0 <= "z")
                || ($0 >= "0" && $0 <= "9") || $0 == "+" || $0 == "/" || $0 == "="
        }
    }

    private static func downsampledImage(data: Data, maxDimension: CGFloat) -> UIImage? {
        guard let src = CGImageSourceCreateWithData(data as CFData, nil) else {
            return UIImage(data: data)
        }
        let opts: [CFString: Any] = [
            kCGImageSourceCreateThumbnailFromImageAlways: true,
            kCGImageSourceCreateThumbnailWithTransform: true,
            kCGImageSourceThumbnailMaxPixelSize: maxDimension,
        ]
        if let cg = CGImageSourceCreateThumbnailAtIndex(src, 0, opts as CFDictionary) {
            return UIImage(cgImage: cg)
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
                    Text(plan?.imageUnavailableReason ?? "Plano sin imagen incrustada")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .multilineTextAlignment(.center)
                        .padding()
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
                let decoded = FloorplanImageDecode.decode(fp.imageData)
                let image: UIImage?
                let reason: String?
                switch decoded {
                case .ready(let img): image = img; reason = nil
                case .unavailable(let r): image = nil; reason = r
                }
                return IntegraFloorPlan(
                    id: "\(fp.id)",
                    name: fp.name,
                    image: image,
                    imageUnavailableReason: reason,
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
