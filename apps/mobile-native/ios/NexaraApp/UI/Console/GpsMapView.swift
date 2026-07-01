import SwiftUI

// MARK: – ViewModel

@MainActor
final class GpsMapVM: ObservableObject {
    @Published var locations: [[String: Any]] = []
    @Published var pins: [MapPin] = []
    @Published var isLoading = false

    func load() {
        isLoading = true
        Task {
            let locs = await ExtraRepository.shared.gpsLocations()
            locations = locs
            pins = locs.compactMap { loc -> MapPin? in
                guard let lat = gpsDouble(loc, "lat", "latitude"),
                      let lng = gpsDouble(loc, "lng", "longitude", "lon") else { return nil }
                let name = gpsStr(loc, "userName", "usuario", "nombre")
                return MapPin(
                    id: gpsStr(loc, "id").ifBlankGps(UUID().uuidString),
                    latitude: lat,
                    longitude: lng,
                    title: name.ifBlankGps(nil),
                    subtitle: gpsStr(loc, "capturedAt", "createdAt").prefix(10).map(String.init)
                )
            }
            isLoading = false
        }
    }
}

// MARK: – View

struct GpsMapView: View {
    @StateObject private var vm = GpsMapVM()

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                // KPI strip
                if !vm.locations.isEmpty {
                    let active = vm.locations.filter { gpsStr($0, "isActive", "active") == "true" }.count
                    HStack(spacing: 0) {
                        GpsKpiChip(label: "Unidades", value: "\(vm.locations.count)", color: .primary)
                        Divider().frame(height: 36)
                        GpsKpiChip(label: "Con GPS", value: "\(vm.pins.count)", color: .green)
                        Divider().frame(height: 36)
                        GpsKpiChip(label: "Activos", value: "\(active > 0 ? active : vm.pins.count)", color: .teal)
                    }
                    .padding(.horizontal)
                    .padding(.vertical, 6)
                    .background(Color(.secondarySystemGroupedBackground))
                    .clipShape(RoundedRectangle(cornerRadius: 12))
                    .padding(.horizontal)
                }

                // Map
                if vm.isLoading {
                    ProgressView().frame(maxWidth: .infinity).padding(.top, 60)
                } else if vm.pins.isEmpty {
                    Text("Sin coordenadas GPS disponibles")
                        .foregroundColor(.secondary)
                        .frame(maxWidth: .infinity)
                        .padding(.top, 40)
                } else {
                    NexaraMapView(pins: vm.pins)
                        .frame(height: 300)
                        .clipShape(RoundedRectangle(cornerRadius: 16))
                        .padding(.horizontal)
                }

                // List
                if !vm.locations.isEmpty {
                    VStack(alignment: .leading, spacing: 6) {
                        Text("Ubicaciones recientes")
                            .font(.headline)
                            .padding(.horizontal)
                        ForEach(vm.locations.prefix(20), id: \.gpsId) { loc in
                            GpsLocationRow(item: loc)
                                .padding(.horizontal)
                        }
                    }
                }

                Spacer(minLength: 24)
            }
            .padding(.vertical)
        }
        .navigationTitle("GPS · Ubicaciones")
        .toolbar {
            ToolbarItem(placement: .navigationBarTrailing) {
                Button { vm.load() } label: { Image(systemName: "arrow.clockwise") }
            }
        }
        .refreshable { vm.load() }
        .task { vm.load() }
    }
}

// MARK: – Subviews

private struct GpsKpiChip: View {
    let label: String; let value: String; let color: Color
    var body: some View {
        VStack(spacing: 2) {
            Text(value).font(.headline).bold().foregroundColor(color)
            Text(label).font(.caption2).foregroundColor(.secondary)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 4)
    }
}

private struct GpsLocationRow: View {
    let item: [String: Any]
    var body: some View {
        let name = gpsStr(item, "userName", "usuario", "nombre").ifBlankGps("Usuario desconocido")
        let lat  = gpsDouble(item, "lat", "latitude").map { String(format: "%.5f", $0) } ?? "–"
        let lng  = gpsDouble(item, "lng", "longitude", "lon").map { String(format: "%.5f", $0) } ?? "–"
        let time = String(gpsStr(item, "capturedAt", "createdAt").prefix(16))

        HStack(spacing: 12) {
            Image(systemName: "mappin.circle.fill")
                .font(.title2).foregroundColor(.teal)
            VStack(alignment: .leading, spacing: 2) {
                Text(name).font(.subheadline).bold()
                Text("\(lat), \(lng)").font(.caption).foregroundColor(.secondary)
            }
            Spacer()
            if !time.isEmpty {
                Text(time).font(.caption2).foregroundColor(.secondary)
            }
        }
        .padding(12)
        .background(Color(.secondarySystemGroupedBackground))
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }
}

// MARK: – Helpers

private func gpsStr(_ m: [String: Any], _ keys: String...) -> String {
    for k in keys {
        if let v = m[k] {
            let s: String
            if let ss = v as? String { s = ss }
            else if let n = v as? NSNumber { s = n.stringValue }
            else { s = String(describing: v) }
            if !s.isEmpty && s != "null" { return s }
        }
    }
    return ""
}

private func gpsDouble(_ m: [String: Any], _ keys: String...) -> Double? {
    for k in keys {
        if let v = m[k] {
            if let d = v as? Double { return d }
            if let n = v as? NSNumber { return n.doubleValue }
            if let s = v as? String, let d = Double(s) { return d }
        }
    }
    return nil
}

extension String {
    fileprivate func ifBlankGps(_ fallback: String) -> String { isEmpty ? fallback : self }
    fileprivate func ifBlankGps(_ fallback: String?) -> String? { isEmpty ? fallback : self }
}

extension [String: Any] {
    fileprivate var gpsId: String {
        if let n = self["id"] as? Int { return String(n) }
        if let s = self["id"] as? String { return s }
        return UUID().uuidString
    }
}
