import SwiftUI

/// «Vehículos» del hub «Más» (Android `VehiculosScreen`): lo que traigo
/// asignado, mis solicitudes y la flota libre. La salida y el regreso se
/// registran con `ChecklistVehiculoView` (siete fotos con cámara en vivo,
/// kilometraje y gasolina); un vehículo libre del inventario también se puede
/// sacar directo con «Salida».
///
/// Va dentro del `NavigationStack` del shell: aquí no se crea otro.
struct VehiculosView: View {
    @State private var datos = MisVehiculosResponse()
    @State private var cargando = true
    @State private var cargado = false
    @State private var error: String?
    /// Para «Solicitar»: la actividad a la que se carga el uso del vehículo.
    @State private var actividades: [MyActivityItem] = []
    @State private var checklist: ChecklistRequest?
    @State private var solicitar: VehiculoFlota?
    @State private var mensaje: String?

    /// El API ya manda solo los libres; el demo trae también uno en uso.
    private var disponibles: [VehiculoFlota] { datos.disponibles.filter(\.disponible) }

    private var vacio: Bool {
        datos.activa == nil && datos.solicitudes.isEmpty && disponibles.isEmpty
    }

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: NxSpacing.m) {
                if cargando && !cargado {
                    NxSkeletonList(itemCount: 3, itemHeight: 96)
                }
                if let error {
                    if vacio {
                        NxErrorBlock(message: error, onRetry: { Task { await cargar() } })
                    } else {
                        NxRefreshErrorBanner(message: error, onRetry: { Task { await cargar() } })
                    }
                }
                if let activa = datos.activa {
                    AsignacionActivaCard(activa: activa) { abrirChecklist($0) }
                }
                if !datos.solicitudes.isEmpty {
                    NxSectionHeader(title: "Mis solicitudes")
                    ForEach(datos.solicitudes) { SolicitudVehiculoRow(solicitud: $0) }
                }
                if !disponibles.isEmpty {
                    NxSectionHeader(title: "Disponibles")
                    ForEach(disponibles) { vehiculo in
                        DisponibleVehiculoRow(
                            vehiculo: vehiculo,
                            onSolicitar: { solicitar = vehiculo },
                            onSalida: {
                                abrirChecklist(ChecklistRequest(
                                    accion: .salida(asignacion: vehiculo.id, inventario: true),
                                    vehiculo: vehiculo.titulo,
                                    odometroInicio: nil
                                ))
                            }
                        )
                    }
                }
                if !cargando && error == nil && vacio {
                    NxEmptyState(
                        title: "Sin vehículos",
                        subtitle: "No traes asignación ni hay unidades libres."
                    )
                }
                Spacer(minLength: NxSpacing.l)
            }
            .padding(NxSpacing.l)
        }
        .nxScreenBackground()
        .refreshable { await cargar() }
        .task {
            await cargar()
            await cargarActividades()
        }
        .avisoSnackbar($mensaje)
        // El «Cerrar» lo pone `ChecklistVehiculoView`: pregunta antes de tirar fotos.
        .sheet(item: $checklist) { req in
            NavigationStack {
                ChecklistVehiculoView(
                    accion: req.accion,
                    vehiculo: req.vehiculo,
                    odometroInicio: req.odometroInicio,
                    onDone: {
                        mensaje = req.accion.esSalida ? "Salida registrada" : "Regreso registrado"
                        Task { await cargar() }
                    }
                )
            }
        }
        .sheet(item: $solicitar) { vehiculo in
            SolicitarVehiculoSheet(vehiculo: vehiculo, actividades: actividades) {
                mensaje = "Solicitud enviada"
                Task { await cargar() }
            }
        }
    }

    private func abrirChecklist(_ req: ChecklistRequest) {
        checklist = req
    }

    @MainActor
    private func cargar() async {
        cargando = true
        do {
            datos = try await VehiculosRepository.shared.misVehiculos()
            cargado = true
            error = nil
        } catch {
            self.error = error.toUserMessage(fallback: "No se pudo cargar Vehículos")
        }
        cargando = false
    }

    /// Se pide aparte: sin actividades se puede seguir viendo lo asignado.
    @MainActor
    private func cargarActividades() async {
        actividades = (try? await CoreRepository.shared.myActivities().open) ?? []
    }
}

/// Qué check list se abrió, para la hoja (Android `FlujoChecklist`).
private struct ChecklistRequest: Identifiable {
    let id = UUID()
    let accion: ChecklistVehiculoAccion
    let vehiculo: String
    /// Devolución: el km con el que salió; el final no puede ser menor.
    let odometroInicio: Int?
}

// MARK: - Asignación activa

private struct AsignacionActivaCard: View {
    let activa: AsignacionActiva
    let onAccion: (ChecklistRequest) -> Void

    private var nombre: String {
        let partes = [activa.vehiculo?.nombre ?? "", activa.vehiculo?.placas ?? ""]
            .map { $0.trimmingCharacters(in: .whitespaces) }
            .filter { !$0.isEmpty }
        return partes.isEmpty ? "Vehículo asignado" : partes.joined(separator: " · ")
    }

    private var fechas: String {
        [FechaMexico.diaHora(iso: activa.inicio), FechaMexico.diaHora(iso: activa.fin)]
            .compactMap { $0 }
            .joined(separator: " → ")
    }

    private var salida: String {
        [
            activa.odometroInicio.map { "Km salida \($0)" },
            activa.combustibleInicioPct.map { "Combustible \($0)%" },
        ]
        .compactMap { $0 }
        .joined(separator: " · ")
    }

    var body: some View {
        NxPanelShell {
            HStack(alignment: .center) {
                Text(nombre)
                    .font(.system(size: 16, weight: .bold))
                    .foregroundStyle(NxColors.fg)
                Spacer(minLength: NxSpacing.s)
                NxStatusChip(text: activa.esInventario ? "Inventario" : "Solicitud", tone: .brand)
            }
            if !fechas.isEmpty {
                Text(fechas)
                    .font(NxType.bodySmall)
                    .foregroundStyle(NxColors.muted)
            }
            if !salida.isEmpty {
                Text(salida)
                    .font(NxType.bodySmall)
                    .foregroundStyle(NxColors.muted)
            }
            if activa.requiereSalida || activa.requiereDevolucion {
                HStack(spacing: NxSpacing.s) {
                    if activa.requiereSalida {
                        Button("Salida") {
                            onAccion(ChecklistRequest(
                                accion: .salida(asignacion: activa.id, inventario: activa.esInventario),
                                vehiculo: nombre,
                                odometroInicio: nil
                            ))
                        }
                        .buttonStyle(BotonMaterialStyle(tipo: .lleno(NxColors.brand), alto: 46, llenaAncho: true))
                    }
                    if activa.requiereDevolucion {
                        Button("Regreso") {
                            onAccion(ChecklistRequest(
                                accion: .devolucion(asignacion: activa.id, inventario: activa.esInventario),
                                vehiculo: nombre,
                                odometroInicio: activa.odometroInicio
                            ))
                        }
                        .buttonStyle(BotonMaterialStyle(tipo: .lleno(NxColors.success), alto: 46, llenaAncho: true))
                    }
                }
                .padding(.top, 10)
            }
        }
    }
}

// MARK: - Filas

private struct SolicitudVehiculoRow: View {
    let solicitud: SolicitudResumen

    private var tono: NxTone {
        switch solicitud.estatusAprobacion.uppercased() {
        case "APROBADA", "APROBADO": return .success
        case "RECHAZADA", "RECHAZADO": return .danger
        default: return .warning
        }
    }

    private var titulo: String {
        let partes = [solicitud.nombreVehiculo ?? "", solicitud.placasVehiculo ?? ""]
            .map { $0.trimmingCharacters(in: .whitespaces) }
            .filter { !$0.isEmpty }
        return partes.isEmpty ? "Solicitud" : partes.joined(separator: " · ")
    }

    private var fechas: String? {
        let texto = [
            FechaMexico.diaHora(iso: solicitud.fechaInicioSolicitada),
            FechaMexico.diaHora(iso: solicitud.fechaFinSolicitada),
        ]
        .compactMap { $0 }
        .joined(separator: " → ")
        return texto.isEmpty ? nil : texto
    }

    private var entrega: String? {
        let estatus = solicitud.entregaEstatus.trimmingCharacters(in: .whitespaces)
        guard !estatus.isEmpty else { return nil }
        return "Entrega: \(NxStatusText.label(estatus).lowercased())"
    }

    var body: some View {
        let estatus = solicitud.estatusAprobacion.trimmingCharacters(in: .whitespaces)
        NxListRow(
            title: titulo,
            subtitle: fechas,
            meta: entrega,
            chipText: estatus.isEmpty ? "Pendiente" : NxStatusText.label(estatus),
            chipTone: tono
        )
    }
}

private struct DisponibleVehiculoRow: View {
    let vehiculo: VehiculoFlota
    let onSolicitar: () -> Void
    let onSalida: () -> Void

    private var detalle: String? {
        let texto = [
            vehiculo.odometroUltimo.map { "Km \($0)" },
            vehiculo.combustibleUltimoPct.map { "\($0)%" },
        ]
        .compactMap { $0 }
        .joined(separator: " · ")
        return texto.isEmpty ? nil : texto
    }

    var body: some View {
        let estatus = vehiculo.estatus.trimmingCharacters(in: .whitespaces)
        NxListRow(
            title: vehiculo.titulo,
            subtitle: detalle,
            meta: estatus.isEmpty ? nil : estatus
        ) {
            HStack(spacing: 6) {
                Button("Solicitar", action: onSolicitar)
                    .buttonStyle(BotonMaterialStyle(
                        tipo: .contorno(NxColors.brand), alto: 36, fuente: .system(size: 13, weight: .semibold)
                    ))
                    .accessibilityLabel("Solicitar \(vehiculo.titulo)")
                Button("Salida", action: onSalida)
                    .buttonStyle(BotonMaterialStyle(
                        tipo: .lleno(NxColors.brand), alto: 36, fuente: .system(size: 13, weight: .semibold)
                    ))
                    .accessibilityLabel("Salida de \(vehiculo.titulo)")
            }
        }
    }
}

// MARK: - Solicitar

/// `POST vehicles` (Android `SolicitarDialog`): actividad abierta, motivo y
/// fechas. La aprobación la hace un superior; el 400 del servidor trae en
/// español lo que falta y se enseña tal cual.
private struct SolicitarVehiculoSheet: View {
    let vehiculo: VehiculoFlota
    let actividades: [MyActivityItem]
    var onDone: () -> Void

    @Environment(\.dismiss) private var dismiss

    @State private var actividadId: Int?
    @State private var motivo = ""
    @State private var inicio = Date()
    @State private var fin = Date().addingTimeInterval(4 * 3600)
    @State private var enviando = false
    @State private var error: String?

    private var listo: Bool {
        actividadId != nil
            && !motivo.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            && fin >= inicio
    }

    private func etiqueta(_ a: MyActivityItem) -> String {
        let texto = [a.anNumber ?? "", a.titulo ?? ""]
            .filter { !$0.trimmingCharacters(in: .whitespaces).isEmpty }
            .joined(separator: " · ")
        return texto.isEmpty ? "Actividad \(a.id)" : texto
    }

    private var textoActividad: String {
        if let a = actividades.first(where: { $0.id == actividadId }) { return etiqueta(a) }
        return actividades.isEmpty ? "Sin actividades abiertas" : "Elegir actividad"
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 10) {
                Text("Solicitar \(vehiculo.titulo)")
                    .font(NxType.headlineSmall)
                    .foregroundStyle(NxColors.fg)
                    .padding(.bottom, NxSpacing.s)

                Menu {
                    ForEach(actividades) { a in
                        Button(etiqueta(a)) { actividadId = a.id }
                    }
                } label: {
                    Text(textoActividad)
                        .font(.system(size: 13, weight: .semibold))
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(BotonMaterialStyle(tipo: .contorno(NxColors.brand), llenaAncho: true))
                .disabled(enviando || actividades.isEmpty)

                CampoDelineado(etiqueta: "Motivo", texto: $motivo, habilitado: !enviando, fondo: NxColors.card, maxLargo: 300)

                DatePicker("Desde", selection: $inicio)
                    .font(NxType.bodyMedium)
                    .tint(NxColors.brand)
                    .disabled(enviando)
                DatePicker("Hasta", selection: $fin, in: inicio...)
                    .font(NxType.bodyMedium)
                    .tint(NxColors.brand)
                    .disabled(enviando)

                if let error {
                    Text(error)
                        .font(NxType.bodySmall)
                        .foregroundStyle(NxColors.danger)
                        .fixedSize(horizontal: false, vertical: true)
                }

                HStack(spacing: NxSpacing.s) {
                    Spacer()
                    Button("Cancelar") { dismiss() }
                        .buttonStyle(BotonMaterialStyle(tipo: .texto(NxColors.brand)))
                        .disabled(enviando)
                    Button(enviando ? "Enviando…" : "Solicitar") { enviar() }
                        .buttonStyle(BotonMaterialStyle(tipo: .lleno(NxColors.brand)))
                        .disabled(!listo || enviando)
                }
                .padding(.top, NxSpacing.s)
            }
            .padding(NxSpacing.xl)
        }
        .background(NxColors.card.ignoresSafeArea())
        .interactiveDismissDisabled(enviando)
        .hojaMaterial(detents: [.medium, .large])
    }

    private func enviar() {
        guard let actividadId, !enviando else { return }
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
                self.error = error.toUserMessage(fallback: "No se pudo solicitar")
            }
        }
    }
}
