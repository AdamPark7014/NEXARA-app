import SwiftUI

/// «Vehículos» del hub «Más»: lo que traigo asignado, mis solicitudes y la
/// flota libre. La salida y el regreso se registran con `ChecklistVehiculoView`
/// (siete fotos con cámara en vivo, kilometraje y gasolina).
///
/// Va dentro del `NavigationStack` del shell: aquí no se crea otro.
struct VehiculosView: View {
    @State private var datos = MisVehiculosResponse()
    @State private var cargando = true
    @State private var error: String?
    @State private var checklist: ChecklistRequest?
    @State private var solicitar: VehiculoFlota?

    @State private var cargado = false

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: NxSpacing.l) {
                if cargando && !cargado {
                    NxSkeletonRows(count: 4)
                } else if let error, !cargado {
                    NxErrorState(message: error) { Task { await cargar() } }
                        .padding(.top, NxSpacing.xxl)
                } else {
                    if let error {
                        NxStaleBanner(message: error) { Task { await cargar() } }
                    }
                    activa
                    solicitudes
                    disponibles
                }
            }
            .padding(.horizontal, NxSpacing.l)
            .padding(.vertical, NxSpacing.m + 2)
        }
        .background(Color(.systemGroupedBackground))
        .navigationTitle("Vehículos")
        .navigationBarTitleDisplayMode(.inline)
        .refreshable { await cargar() }
        .task { await cargar() }
        .sheet(item: $checklist) { req in
            NavigationStack {
                ChecklistVehiculoView(
                    accion: req.accion,
                    vehiculo: req.vehiculo,
                    odometroInicio: req.odometroInicio,
                    onDone: { Task { await cargar() } }
                )
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) {
                        Button("Cerrar") { checklist = nil }
                    }
                }
            }
        }
        .sheet(item: $solicitar) { vehiculo in
            SolicitarVehiculoSheet(vehiculo: vehiculo) {
                Task { await cargar() }
            }
        }
    }

    // MARK: Asignación activa

    @ViewBuilder
    private var activa: some View {
        if let asignacion = datos.activa {
            VStack(alignment: .leading, spacing: 12) {
                HStack {
                    NxSectionHeader(title: asignacion.vehiculo?.titulo ?? "Mi vehículo")
                    Spacer()
                    NxStatusChip(text: asignacion.esInventario ? "Inventario" : "Solicitud", tone: .info)
                }

                HStack(spacing: 10) {
                    NxKpiCard(kpi: NxKpi(
                        label: "Km inicial",
                        value: asignacion.odometroInicio.map { "\(NxFormat.integer($0)) km" } ?? "—"
                    ))
                    NxKpiCard(kpi: NxKpi(
                        label: "Gasolina inicial",
                        value: asignacion.nivelInicio?.label ?? "—"
                    ))
                }

                if let inicio = CoreFormat.when(asignacion.inicio) {
                    Label(inicio, systemImage: "arrow.up.right.circle")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                if let fin = CoreFormat.when(asignacion.fin) {
                    Label(fin, systemImage: "arrow.down.left.circle")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }

                if asignacion.requiereSalida {
                    Button {
                        abrirChecklist(salida: true, activa: asignacion)
                    } label: {
                        Label("Registrar salida", systemImage: "camera")
                    }
                    .buttonStyle(NxPrimaryButtonStyle())
                }
                if asignacion.requiereDevolucion {
                    Button {
                        abrirChecklist(salida: false, activa: asignacion)
                    } label: {
                        Label("Registrar regreso", systemImage: "camera")
                    }
                    .buttonStyle(NxPrimaryButtonStyle())
                }
            }
            .nxCard()
        } else if !cargando {
            NxEmptyState(
                title: "Sin vehículo asignado",
                subtitle: "Solicita uno de la flota disponible.",
                systemImage: "car"
            )
            .nxCard(padding: 0)
        }
    }

    // MARK: Mis solicitudes

    @ViewBuilder
    private var solicitudes: some View {
        if !datos.solicitudes.isEmpty {
            NxSectionHeader(title: "Mis solicitudes")
            VStack(spacing: 8) {
                ForEach(datos.solicitudes) { item in
                    HStack(spacing: 10) {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(item.titulo).font(.subheadline.weight(.semibold))
                            if let cuando = CoreFormat.when(item.fechaInicioSolicitada) {
                                Text(cuando).font(.caption).foregroundStyle(.secondary)
                            }
                        }
                        Spacer()
                        NxStatusChip(text: NxStatusText.label(item.estatusAprobacion), tone: tono(item))
                    }
                    .nxCard(padding: NxSpacing.m)
                    .accessibilityElement(children: .combine)
                }
            }
        }
    }

    private func tono(_ item: SolicitudResumen) -> NxTone {
        if item.aprobada { return .success }
        if item.rechazada { return .danger }
        return .warning
    }

    // MARK: Flota disponible

    /// Solo los que el API marca libres y activos.
    private var libres: [VehiculoFlota] {
        datos.disponibles.filter { $0.disponible && $0.activo }
    }

    @ViewBuilder
    private var disponibles: some View {
        if !libres.isEmpty {
            NxSectionHeader(title: "Disponibles")
            VStack(spacing: 8) {
                ForEach(libres) { vehiculo in
                    HStack(spacing: 10) {
                        NxIconBadge(systemName: "car", size: 34)
                        VStack(alignment: .leading, spacing: 2) {
                            Text(vehiculo.titulo).font(.subheadline.weight(.semibold))
                            if let km = vehiculo.odometroUltimo {
                                Text("\(NxFormat.integer(km)) km").font(.caption).foregroundStyle(.secondary)
                            }
                        }
                        Spacer()
                        Button("Solicitar") { solicitar = vehiculo }
                            .buttonStyle(.bordered)
                            .controlSize(.large)
                            .tint(NxBrand.primary)
                            .accessibilityLabel("Solicitar \(vehiculo.titulo)")
                    }
                    .nxCard(padding: NxSpacing.m)
                }
            }
        }
    }

    // MARK: Datos

    private func abrirChecklist(salida: Bool, activa: AsignacionActiva) {
        checklist = ChecklistRequest(
            accion: ChecklistVehiculoAccion(salida: salida, asignacion: activa),
            vehiculo: activa.vehiculo?.titulo ?? "Vehículo",
            // El km inicial solo acota la devolución.
            odometroInicio: salida ? nil : activa.odometroInicio
        )
    }

    @MainActor
    private func cargar() async {
        cargando = true
        do {
            datos = try await VehiculosRepository.shared.misVehiculos()
            cargado = true
            error = nil
        } catch {
            self.error = error.toUserMessage()
        }
        cargando = false
    }
}

/// Qué check list se abrió, para la hoja.
private struct ChecklistRequest: Identifiable {
    let id = UUID()
    let accion: ChecklistVehiculoAccion
    let vehiculo: String
    let odometroInicio: Int?
}

// MARK: - Solicitar

/// `POST vehicles`: actividad, motivo y fechas. La aprobación la hace un superior.
private struct SolicitarVehiculoSheet: View {
    let vehiculo: VehiculoFlota
    var onDone: () -> Void

    @Environment(\.dismiss) private var dismiss

    @State private var actividades: [MyActivityItem] = []
    @State private var actividadId: Int?
    @State private var motivo = ""
    @State private var inicio = Date()
    @State private var fin = Date().addingTimeInterval(4 * 3600)
    @State private var cargando = true
    @State private var enviando = false
    @State private var error: String?

    private var puedeEnviar: Bool {
        actividadId != nil
            && !motivo.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            && fin >= inicio
            && !enviando
    }

    var body: some View {
        NavigationStack {
            Form {
                if let error {
                    Section {
                        NxAlertBanner(alert: NxAlert(id: "solicitar", title: error, tone: .danger))
                            .listRowInsets(EdgeInsets())
                            .listRowBackground(Color.clear)
                    }
                }

                Section("Vehículo") {
                    Text(vehiculo.titulo)
                }

                Section("Actividad") {
                    if cargando {
                        ProgressView()
                    } else if actividades.isEmpty {
                        Text("Sin actividades abiertas").foregroundStyle(.secondary)
                    } else {
                        Picker("Actividad", selection: $actividadId) {
                            Text("Elige una").tag(Int?.none)
                            ForEach(actividades) { item in
                                Text(item.titulo ?? "Actividad #\(item.id)").tag(Int?.some(item.id))
                            }
                        }
                    }
                }

                Section("Motivo") {
                    TextField("Para qué lo necesitas", text: $motivo, axis: .vertical)
                        .lineLimit(1...3)
                }

                Section("Fechas") {
                    DatePicker("Inicio", selection: $inicio)
                    DatePicker("Fin", selection: $fin, in: inicio...)
                }
            }
            .navigationTitle("Solicitar")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancelar") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Enviar") { enviar() }
                        .disabled(!puedeEnviar)
                }
            }
            .task { await cargarActividades() }
        }
    }

    @MainActor
    private func cargarActividades() async {
        do {
            let respuesta = try await CoreRepository.shared.myActivities()
            actividades = respuesta.open + respuesta.seguimiento
        } catch {
            self.error = error.toUserMessage()
        }
        cargando = false
    }

    private func enviar() {
        guard let actividadId else { return }
        enviando = true
        error = nil
        Task { @MainActor in
            do {
                try await VehiculosRepository.shared.solicitar(
                    actividadId: actividadId,
                    vehicleId: vehiculo.id,
                    motivoUso: motivo.trimmingCharacters(in: .whitespacesAndNewlines),
                    fechaInicioSolicitada: inicio,
                    fechaFinSolicitada: fin
                )
                enviando = false
                onDone()
                dismiss()
            } catch {
                enviando = false
                self.error = error.toUserMessage()
            }
        }
    }
}
