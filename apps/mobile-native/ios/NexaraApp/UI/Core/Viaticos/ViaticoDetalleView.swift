import SwiftUI

/// El viático por dentro: cuánto se pidió, cuánto se autorizó, cuánto se
/// comprobó y qué falta. Desde aquí se reparte entre actividades, se suben los
/// tickets y —si me toca— se autoriza, se rechaza o se marca pagado.
struct ViaticoDetalleView: View {
    let viaticoId: Int
    /// La lista de arriba quedó desfasada: que relea.
    var onCambio: () -> Void = {}

    @State private var viatico: Viatico?
    @State private var cargando = true
    @State private var error: String?
    @State private var aviso: String?
    @State private var comprobando = false
    @State private var decidiendo = false
    @State private var confirmandoPago = false
    @State private var enviando = false

    private var miId: Int? { SessionStore.shared.currentUser.flatMap { Int($0.id) } }

    private var administra: Bool {
        guard let user = SessionStore.shared.currentUser else { return false }
        if user.isSuperAdmin { return true }
        return user.permissions.contains { $0 == "viatics.manage" || $0 == "CONSOLE_ADMIN" }
    }

    private var esMio: Bool {
        guard let viatico else { return false }
        return viatico.usuarioId == nil || miId == nil || viatico.usuarioId == miId
    }

    /// Repartir es de quien lo pidió: es quien sabe qué visitas cubrió el viaje.
    /// Un viático pagado ya salió en una póliza y no se vuelve a repartir.
    private var puedeRepartir: Bool {
        guard let viatico else { return false }
        return esMio && !viatico.estaPagado && !viatico.estaRechazado
    }

    /// Solo se comprueba contra dinero ya entregado: `Aprobado` o `Pagado`.
    private var puedeComprobar: Bool {
        guard let viatico else { return false }
        return (viatico.estaAprobado || viatico.estaPagado) && (esMio || administra)
    }

    /// Nadie autoriza lo suyo: la cadena de aprobación del servidor tampoco lo permite.
    private var puedeDecidir: Bool {
        guard let viatico else { return false }
        return administra && !esMio && viatico.estaPendiente
    }

    private var puedePagar: Bool {
        guard let viatico else { return false }
        return administra && viatico.estaAprobado
    }

    var body: some View {
        List {
            if let error {
                Section {
                    NxAlertBanner(
                        alert: NxAlert(
                            id: "viatico",
                            title: error,
                            subtitle: viatico == nil ? nil : "Abajo sigue lo último que se pudo leer.",
                            tone: .danger
                        ),
                        actionLabel: "Reintentar",
                        onAction: { Task { await cargar() } }
                    )
                    .listRowInsets(EdgeInsets())
                    .listRowBackground(Color.clear)
                }
            }

            if let viatico {
                encabezado(viatico)
                importes(viatico)
                reparto(viatico)
                if let url = viatico.ticketEvidenciaUrl, !url.isEmpty {
                    Section("Comprobante") {
                        AuthenticatedImage(url: url, contentMode: .fit)
                            .frame(height: 240)
                            .clipShape(RoundedRectangle(cornerRadius: 12))
                            .accessibilityLabel("Foto del ticket del viático")
                    }
                }
                acciones(viatico)
            } else if cargando {
                Section { ProgressView().frame(maxWidth: .infinity) }
            }
        }
        .listStyle(.insetGrouped)
        .navigationTitle("Viático")
        .navigationBarTitleDisplayMode(.inline)
        .refreshable { await cargar() }
        .task { await cargar() }
        .sheet(isPresented: $comprobando) {
            if let viatico {
                HojaComprobarViatico(viatico: viatico) { mensaje in
                    aviso = mensaje
                    comprobando = false
                    Task { await cargar() }
                    onCambio()
                }
            }
        }
        .sheet(isPresented: $decidiendo) {
            if let viatico {
                HojaDecisionViatico(viatico: viatico) { mensaje in
                    aviso = mensaje
                    decidiendo = false
                    Task { await cargar() }
                    onCambio()
                }
            }
        }
        .confirmationDialog(
            "¿Marcar como pagado?",
            isPresented: $confirmandoPago,
            titleVisibility: .visible
        ) {
            Button("Sí, pagado") { marcarPagado() }
            Button("Cancelar", role: .cancel) {}
        } message: {
            Text(
                "Se levanta la póliza contable con lo autorizado. Después de esto el viático "
                    + "ya no se puede repartir entre actividades: el asiento ya salió."
            )
        }
        .alert(
            "Viáticos",
            isPresented: Binding(get: { aviso != nil }, set: { if !$0 { aviso = nil } })
        ) {
            Button("Entendido") { aviso = nil }
        } message: {
            Text(aviso ?? "")
        }
    }

    // MARK: Secciones

    private func encabezado(_ viatico: Viatico) -> some View {
        Section {
            VStack(alignment: .leading, spacing: 8) {
                Text(viatico.titulo).font(.title3.weight(.bold))
                Text(
                    [
                        Viatico.etiquetaCategoria(viatico.categoria),
                        viatico.usuario?.nombre ?? "",
                        viatico.fechaCorta,
                        viatico.actividad?.anNumber ?? "",
                        viatico.contabilidadRef ?? "",
                    ]
                    .filter { !$0.isEmpty }
                    .joined(separator: " · ")
                )
                .font(.caption)
                .foregroundStyle(.secondary)
                ChipsDeViatico(viatico: viatico)
            }
            .padding(.vertical, 4)
        }
    }

    private func importes(_ viatico: Viatico) -> some View {
        Section("Importes") {
            HStack(spacing: 14) {
                ImporteLabel(titulo: "Solicitado", centavos: viatico.solicitadoCentavos)
                ImporteLabel(
                    titulo: "Autorizado",
                    centavos: viatico.aprobadoCentavos,
                    tono: viatico.fueRecortado ? .warning : .success
                )
            }
            if viatico.fueRecortado, let aprobado = viatico.aprobadoCentavos {
                Text("Se autorizó \(Dinero.pesos(viatico.solicitadoCentavos - aprobado)) menos de lo que pediste.")
                    .font(.caption)
                    .foregroundStyle(NxTone.warning.fg)
            }
            HStack(spacing: 14) {
                ImporteLabel(titulo: "Comprobado", centavos: viatico.comprobadoCentavos ?? 0)
                ImporteLabel(
                    titulo: "Saldo",
                    centavos: viatico.liquidacion?.saldoCentavos,
                    tono: viatico.liquidacion?.tono ?? .neutral
                )
            }
            if let explicacion = viatico.liquidacion?.explicacion {
                Text(explicacion).font(.subheadline)
            }
            if viatico.comprobadoCentavos == nil {
                Text("Falta subir tickets por \(Dinero.pesos(viatico.vigenteCentavos)).")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
    }

    private func reparto(_ viatico: Viatico) -> some View {
        Section {
            ForEach(viatico.repartos) { parte in
                HStack {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(parte.titulo).lineLimit(2)
                        if let nota = parte.nota, !nota.isEmpty {
                            Text(nota).font(.caption2).foregroundStyle(.secondary)
                        }
                    }
                    Spacer()
                    Text(Dinero.pesos(parte.centavos)).font(.headline)
                }
                .accessibilityElement(children: .combine)
            }
            if puedeRepartir {
                NavigationLink {
                    RepartoViaticoView(viaticoId: viatico.id) { mensaje in
                        aviso = mensaje
                        Task { await cargar() }
                        onCambio()
                    }
                } label: {
                    Label(
                        viatico.repartos.isEmpty ? "Repartir entre actividades" : "Cambiar el reparto",
                        systemImage: "arrow.triangle.branch"
                    )
                    .frame(minHeight: 44)
                }
            } else if viatico.estaPagado {
                Text("Pagado: el asiento contable ya salió y el reparto queda fijo.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            } else if viatico.estaRechazado {
                Text("Rechazado: no hay costo que repartir.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        } header: {
            Text("Reparto entre actividades")
        } footer: {
            Text(
                viatico.repartos.isEmpty
                    ? "Todo el costo cae en una sola actividad."
                    : "El costo se divide en \(viatico.repartos.count) actividades."
            )
        }
    }

    @ViewBuilder
    private func acciones(_ viatico: Viatico) -> some View {
        if puedeDecidir || puedeComprobar || puedePagar {
            Section {
                if puedeDecidir {
                    Button {
                        decidiendo = true
                    } label: {
                        Text("Autorizar o rechazar")
                            .font(.body.weight(.bold))
                            .frame(maxWidth: .infinity, minHeight: 44)
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(NxBrand.primary)
                    .disabled(enviando)
                }
                if puedeComprobar {
                    Button {
                        comprobando = true
                    } label: {
                        Label("Comprobar con tickets", systemImage: "doc.text.magnifyingglass")
                            .font(.body.weight(.bold))
                            .frame(maxWidth: .infinity, minHeight: 44)
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(NxTone.success.fg)
                    .disabled(enviando)
                }
                if puedePagar {
                    Button {
                        confirmandoPago = true
                    } label: {
                        Text("Marcar como pagado").frame(maxWidth: .infinity, minHeight: 44)
                    }
                    .buttonStyle(.bordered)
                    .disabled(enviando)
                }
            }
            .listRowInsets(EdgeInsets(top: 8, leading: 16, bottom: 8, trailing: 16))
        }
    }

    // MARK: Datos

    private func cargar() async {
        if viatico == nil { cargando = true }
        do {
            viatico = try await ViaticosRepository.shared.detalle(id: viaticoId)
            error = nil
        } catch {
            self.error = error.localizedDescription
        }
        cargando = false
    }

    private func marcarPagado() {
        enviando = true
        Task {
            do {
                try await ViaticosRepository.shared.marcarPagado(id: viaticoId)
                enviando = false
                aviso = "Marcado como pagado"
                await cargar()
                onCambio()
            } catch {
                enviando = false
                aviso = error.localizedDescription
            }
        }
    }
}

// MARK: - Comprobar

/// Subir tickets contra el anticipo: cuánto se gastó de verdad y, si hay, su foto.
struct HojaComprobarViatico: View {
    let viatico: Viatico
    let onListo: (String) -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var importe = ""
    @State private var nota = ""
    @State private var foto: CapturedGeoPhoto?
    @State private var camara = false
    @State private var enviando = false
    @State private var error: String?

    private var centavos: Int? { Dinero.parsearCentavos(importe) }

    private var ayuda: String {
        guard let centavos else { return "Si no gastaste nada, captura 0." }
        let diferencia = viatico.vigenteCentavos - centavos
        if diferencia == 0 { return "Cuadra exacto con lo entregado." }
        if diferencia > 0 { return "Sobran \(Dinero.pesos(diferencia)): hay que devolverlos." }
        return "Gastaste \(Dinero.pesos(-diferencia)) de más: la empresa te los debe."
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    CampoImporte(
                        titulo: "Total de los tickets",
                        crudo: $importe,
                        ayuda: ayuda,
                        error: nil,
                        habilitado: !enviando
                    )
                    .listRowInsets(EdgeInsets(top: 10, leading: 16, bottom: 10, trailing: 16))
                } footer: {
                    Text("Se te entregaron \(Dinero.pesos(viatico.vigenteCentavos)).")
                }

                Section("Nota (opcional)") {
                    TextField("Qué conviene saber", text: $nota, axis: .vertical)
                        .lineLimit(2...4)
                        .disabled(enviando)
                }

                Section("Foto del comprobante (opcional)") {
                    if let foto {
                        Image(uiImage: foto.image)
                            .resizable()
                            .scaledToFill()
                            .frame(height: 160)
                            .clipped()
                            .clipShape(RoundedRectangle(cornerRadius: 12))
                    }
                    Button {
                        camara = true
                    } label: {
                        Label(foto == nil ? "Tomar foto" : "Tomar otra", systemImage: "camera")
                            .frame(maxWidth: .infinity, minHeight: 44)
                    }
                    .disabled(enviando)
                }

                if let error {
                    Section {
                        NxAlertBanner(alert: NxAlert(id: "comprobar", title: error, tone: .danger))
                            .listRowInsets(EdgeInsets())
                            .listRowBackground(Color.clear)
                    }
                }

                Section {
                    Button {
                        enviar()
                    } label: {
                        if enviando {
                            ProgressView().frame(maxWidth: .infinity, minHeight: 44)
                        } else {
                            Text("Enviar comprobación")
                                .font(.body.weight(.bold))
                                .frame(maxWidth: .infinity, minHeight: 44)
                        }
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(NxTone.success.fg)
                    .disabled(enviando || centavos == nil)
                }
            }
            .navigationTitle("Comprobar el anticipo")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancelar") { dismiss() }.disabled(enviando)
                }
            }
            .fullScreenCover(isPresented: $camara) {
                GeoPhotoCaptureView(
                    title: "Foto del comprobante",
                    confirmLabel: "Usar esta foto",
                    requireLocation: false,
                    onConfirm: { capturada in
                        foto = capturada
                        camara = false
                        return nil
                    },
                    onCancel: { camara = false }
                )
            }
        }
    }

    private func enviar() {
        guard let centavos else { return }
        enviando = true
        error = nil
        Task {
            do {
                let encolado = try await ViaticosRepository.shared.comprobar(
                    id: viatico.id,
                    centavosComprobados: centavos,
                    nota: nota,
                    ticket: foto
                )
                enviando = false
                onListo(
                    encolado
                        ? "Sin conexión: la comprobación quedó en la cola y sale al volver la señal."
                        : "Comprobación registrada"
                )
                dismiss()
            } catch {
                enviando = false
                self.error = error.localizedDescription
            }
        }
    }
}

// MARK: - Decisión del jefe

/// Autorizar (con recorte opcional) o rechazar.
///
/// El recorte no puede pasarse de lo solicitado —el servidor lo rechaza— y la
/// hoja lo dice antes de intentarlo.
struct HojaDecisionViatico: View {
    let viatico: Viatico
    let onResuelto: (String) -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var recorte = ""
    @State private var nota = ""
    @State private var enviando = false
    @State private var error: String?

    private var centavosRecorte: Int? { Dinero.parsearCentavos(recorte) }

    private var errorRecorte: String? {
        guard !recorte.isEmpty else { return nil }
        guard let centavosRecorte, centavosRecorte > 0 else {
            return "Captura un importe mayor que cero"
        }
        if centavosRecorte > viatico.solicitadoCentavos {
            return "No puedes autorizar más de \(Dinero.pesos(viatico.solicitadoCentavos)). "
                + "Si hace falta más, que levante otro viático por la diferencia."
        }
        return nil
    }

    private var tituloBoton: String {
        if !recorte.isEmpty, errorRecorte == nil, let centavosRecorte {
            return "Autorizar \(Dinero.pesos(centavosRecorte))"
        }
        return "Autorizar \(Dinero.pesos(viatico.solicitadoCentavos))"
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    VStack(alignment: .leading, spacing: 6) {
                        Text(
                            (viatico.usuario?.nombre).flatMap { $0.isEmpty ? nil : $0 }
                                .map { "\($0) pide \(Dinero.pesos(viatico.solicitadoCentavos))" }
                                ?? "Pide \(Dinero.pesos(viatico.solicitadoCentavos))"
                        )
                        .font(.headline)
                        if !viatico.motivo.isEmpty {
                            Text(viatico.motivo).font(.subheadline).foregroundStyle(.secondary)
                        }
                    }
                    .padding(.vertical, 4)
                }

                Section {
                    CampoImporte(
                        titulo: "Autorizar otra cantidad (opcional)",
                        crudo: $recorte,
                        ayuda: "Vacío autoriza los \(Dinero.pesos(viatico.solicitadoCentavos)) completos.",
                        error: errorRecorte,
                        habilitado: !enviando
                    )
                    .listRowInsets(EdgeInsets(top: 10, leading: 16, bottom: 10, trailing: 16))
                }

                Section("Nota para quien lo pidió") {
                    TextField("Opcional", text: $nota, axis: .vertical)
                        .lineLimit(2...4)
                        .disabled(enviando)
                }

                if let error {
                    Section {
                        NxAlertBanner(alert: NxAlert(id: "decision", title: error, tone: .danger))
                            .listRowInsets(EdgeInsets())
                            .listRowBackground(Color.clear)
                    }
                }

                Section {
                    Button {
                        resolver(aprobar: true)
                    } label: {
                        if enviando {
                            ProgressView().frame(maxWidth: .infinity, minHeight: 44)
                        } else {
                            Text(tituloBoton)
                                .font(.body.weight(.bold))
                                .frame(maxWidth: .infinity, minHeight: 44)
                        }
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(NxTone.success.fg)
                    .disabled(enviando || errorRecorte != nil)

                    Button(role: .destructive) {
                        resolver(aprobar: false)
                    } label: {
                        Text("Rechazar").frame(maxWidth: .infinity, minHeight: 44)
                    }
                    .buttonStyle(.bordered)
                    .disabled(enviando)
                } footer: {
                    Text("Autorizar y rechazar necesitan señal: no se guardan en la cola.")
                }
            }
            .navigationTitle("Resolver viático")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancelar") { dismiss() }.disabled(enviando)
                }
            }
        }
    }

    private func resolver(aprobar: Bool) {
        enviando = true
        error = nil
        Task {
            do {
                if aprobar {
                    try await ViaticosRepository.shared.aprobar(
                        id: viatico.id,
                        centavosAprobados: recorte.isEmpty ? nil : centavosRecorte,
                        nota: nota
                    )
                } else {
                    try await ViaticosRepository.shared.rechazar(id: viatico.id, nota: nota)
                }
                enviando = false
                onResuelto(aprobar ? "Viático autorizado" : "Viático rechazado")
                dismiss()
            } catch {
                enviando = false
                self.error = error.localizedDescription
            }
        }
    }
}
