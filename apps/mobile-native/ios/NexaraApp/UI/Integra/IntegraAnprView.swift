import SwiftUI

struct IntegraAnprRecord: Identifiable, Hashable {
    let id: String
    var plate: String
    var crossTime: String?
    var direction: String?
    var cameraName: String?
    var owner: String?
    var vehicleType: String?
    var vehicleColor: String?
    /// Internal HikCentral ref — NOT a downloadable image URL via NEXARA API.
    var vehiclePicUri: String?
}

enum IntegraAnprDataStub {
    static func query(
        plate: String,
        owner: String,
        cameraId: String
    ) async throws -> (records: [IntegraAnprRecord], total: Int?, unavailable: Bool, message: String?) {
        let now = Date()
        let start = now.addingTimeInterval(-24 * 3600)
        let fmt = ISO8601DateFormatter()
        let q = IntegraVehiclesRepository.AnprQuery(
            pageNo: 1,
            pageSize: 50,
            startTime: fmt.string(from: start),
            endTime: fmt.string(from: now),
            cameraIndexCode: cameraId.isEmpty ? nil : cameraId,
            plateNo: plate.isEmpty ? nil : plate,
            ownerName: owner.isEmpty ? nil : owner
        )
        do {
            let page = try await IntegraVehiclesRepository.shared.anpr(q)
            let records = page.registros.enumerated().map { i, m -> IntegraAnprRecord in
                IntegraAnprRecord(
                    id: m.integraStr("id", "crossRecordSyscode") ?? "\(i)",
                    plate: m.integraStr("plateNo", "plate") ?? "—",
                    crossTime: m.integraStr("crossTime", "passTime"),
                    direction: m.integraStr("direction", "vehicleDirection"),
                    cameraName: m.integraStr("cameraName"),
                    owner: m.integraStr("ownerName"),
                    vehicleType: m.integraStr("vehicleType"),
                    vehicleColor: m.integraStr("vehicleColor"),
                    vehiclePicUri: m.integraStr("vehiclePicUri")
                )
            }
            return (records, page.total, false, nil)
        } catch {
            let d = IntegraVehiclesRepository.diagnosticar(error, fallback: "No se pudo consultar ANPR")
            if d.noDisponible {
                return ([], nil, true, d.mensaje)
            }
            throw error
        }
    }

    static func cameras() async throws -> [(id: String, name: String)] {
        try await IntegraVehiclesRepository.shared.camaras().map { ($0.id, $0.name) }
    }
}

/// Cruces ANPR. No inventa lecturas; en sitios sin Artemis muestra no-disponible.
struct IntegraAnprView: View {
    @State private var records: [IntegraAnprRecord] = []
    @State private var total: Int?
    @State private var isLoading = true
    @State private var searching = false
    @State private var errorText: String?
    @State private var unavailable = false
    @State private var unavailableMessage: String?
    @State private var plate = ""
    @State private var owner = ""
    @State private var cameraId = ""
    @State private var cameras: [(id: String, name: String)] = []

    var body: some View {
        Group {
            if isLoading {
                ProgressView("Preparando ANPR…")
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if unavailable {
                NxEmptyState(
                    title: "Este sitio no tiene ANPR",
                    subtitle: unavailableMessage
                        ?? "La consulta de cruces solo funciona con proveedor ARTEMIS. "
                        + "En sitios ISAPI el servidor responde error; no se lista vacío "
                        + "para no fingir que no pasó ningún coche."
                )
            } else if let errorText {
                VStack(spacing: 12) {
                    Text(errorText).foregroundStyle(.secondary).multilineTextAlignment(.center)
                    Button("Reintentar") { Task { await search() } }
                }
                .padding()
            } else {
                List {
                    Section {
                        Text(
                            "Filtros de placa, dueño y cámara son de servidor: acotan toda "
                                + "la búsqueda, no la página descargada. «0 resultados» con "
                                + "filtro significa 0 en todo el rango."
                        )
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        TextField("Placa", text: $plate)
                            .textInputAutocapitalization(.characters)
                        TextField("Dueño", text: $owner)
                        if !cameras.isEmpty {
                            Picker("Cámara", selection: $cameraId) {
                                Text("Todas").tag("")
                                ForEach(cameras, id: \.id) { Text($0.name).tag($0.id) }
                            }
                        }
                        Button(searching ? "Buscando…" : "Buscar cruces") {
                            Task { await search() }
                        }
                        .disabled(searching)
                    }
                    Section {
                        if records.isEmpty {
                            Text("Sin cruces en el rango consultado.")
                                .foregroundStyle(.secondary)
                        } else {
                            ForEach(records) { r in
                                VStack(alignment: .leading, spacing: 4) {
                                    HStack {
                                        Text(r.plate).font(.headline.monospaced())
                                        Spacer()
                                        if let direction = r.direction {
                                            NxStatusChip(text: direction, tone: .info)
                                        }
                                    }
                                    if let t = r.crossTime {
                                        Text(t).font(.caption).foregroundStyle(.secondary)
                                    }
                                    Text(meta(r)).font(.caption).foregroundStyle(.secondary)
                                    if let uri = r.vehiclePicUri, !uri.isEmpty {
                                        Text("Ref. foto: \(uri) (sin proxy de imagen en la API)")
                                            .font(.caption2)
                                            .foregroundStyle(.secondary)
                                    }
                                }
                            }
                        }
                    } header: {
                        Text(total.map { "\($0) cruces" } ?? "\(records.count) en página")
                    }
                }
            }
        }
        .navigationTitle(IntegraVehiclesRoutes.titleAnpr)
        .task {
            cameras = (try? await IntegraAnprDataStub.cameras()) ?? []
            await search()
        }
        .refreshable { await search() }
    }

    private func meta(_ r: IntegraAnprRecord) -> String {
        [r.cameraName, r.owner, r.vehicleType, r.vehicleColor]
            .compactMap { $0 }
            .filter { !$0.isEmpty }
            .joined(separator: " · ")
    }

    private func search() async {
        if isLoading == false { searching = true }
        errorText = nil
        unavailable = false
        defer {
            isLoading = false
            searching = false
        }
        do {
            let result = try await IntegraAnprDataStub.query(
                plate: plate, owner: owner, cameraId: cameraId
            )
            if result.unavailable {
                unavailable = true
                unavailableMessage = result.message
                records = []
                total = nil
            } else {
                records = result.records
                total = result.total
            }
        } catch {
            errorText = error.localizedDescription
        }
    }
}
