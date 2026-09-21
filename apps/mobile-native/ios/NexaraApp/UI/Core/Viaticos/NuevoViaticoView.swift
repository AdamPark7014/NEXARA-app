import SwiftUI

/// Pedir un viático desde donde se gastó: cuánto, en qué, y la foto del ticket.
///
/// La foto se toma con la **misma cámara en vivo de las evidencias**
/// (`GeoPhotoCaptureView`); no hay galería y no se escribió otro flujo. El
/// servidor exige evidencia, así que «Pedir» no se habilita sin ella.
///
/// El reparto entre actividades no está aquí a propósito: viaja en el detalle,
/// porque un multipart no lleva listas anidadas y porque a menudo se sabe qué
/// visitas cubrió el viaje solo al volver.
struct NuevoViaticoView: View {
    /// Recibe el mensaje que hay que enseñar (enviado, o en cola sin conexión).
    let onCreado: (String) -> Void

    @Environment(\.dismiss) private var dismiss

    @State private var importe = ""
    @State private var categoria = Viatico.categorias.first?.clave ?? "OTROS"
    @State private var motivo = ""
    @State private var actividad: MyActivityItem?
    @State private var actividades: [MyActivityItem] = []
    @State private var ticket: CapturedGeoPhoto?
    @State private var camara = false
    @State private var enviando = false
    @State private var error: String?
    @State private var intentado = false

    private var centavos: Int { Dinero.parsearCentavos(importe) ?? 0 }

    private var errorImporte: String? {
        guard intentado else { return nil }
        if importe.isEmpty { return "Captura cuánto gastaste" }
        if centavos <= 0 { return "El importe tiene que ser mayor que cero" }
        return nil
    }

    private var completo: Bool {
        centavos > 0 && !motivo.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && ticket != nil
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    CampoImporte(
                        titulo: "¿Cuánto?",
                        crudo: $importe,
                        ayuda: "Lo que pusiste de tu bolsa, con centavos.",
                        error: errorImporte,
                        habilitado: !enviando
                    )
                    .listRowInsets(EdgeInsets(top: 10, leading: 16, bottom: 10, trailing: 16))
                }

                Section("¿En qué?") {
                    Picker("Categoría", selection: $categoria) {
                        ForEach(Viatico.categorias, id: \.clave) { item in
                            Text(item.etiqueta).tag(item.clave)
                        }
                    }
                    .pickerStyle(.menu)
                    .disabled(enviando)
                }

                Section("Concepto") {
                    TextField("En qué se gastó", text: $motivo, axis: .vertical)
                        .lineLimit(2...4)
                        .disabled(enviando)
                    if intentado, motivo.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                        Text("Di en qué se gastó")
                            .font(.caption)
                            .foregroundStyle(NxTone.danger.fg)
                    }
                }

                Section {
                    Picker("Actividad", selection: Binding(
                        get: { actividad?.id ?? 0 },
                        set: { nuevo in actividad = actividades.first { $0.id == nuevo } }
                    )) {
                        Text("Sin actividad").tag(0)
                        ForEach(actividades) { item in
                            Text(etiqueta(item)).tag(item.id)
                        }
                    }
                    .disabled(enviando || actividades.isEmpty)
                } header: {
                    Text("¿A qué actividad se carga?")
                } footer: {
                    Text("Si el viaje cubrió varias, elige una ahora y repártelo después desde el detalle.")
                }

                Section {
                    if let ticket {
                        Image(uiImage: ticket.image)
                            .resizable()
                            .scaledToFill()
                            .frame(height: 180)
                            .clipped()
                            .clipShape(RoundedRectangle(cornerRadius: 12))
                            .accessibilityLabel("Ticket fotografiado")
                    }
                    Button {
                        camara = true
                    } label: {
                        Label(
                            ticket == nil ? "Tomar foto del ticket" : "Tomar otra",
                            systemImage: "camera"
                        )
                        .frame(maxWidth: .infinity, minHeight: 44)
                    }
                    .disabled(enviando)
                } header: {
                    Text("Foto del ticket")
                } footer: {
                    Text("Obligatoria: es el comprobante del gasto.")
                }

                if let error {
                    Section {
                        NxAlertBanner(alert: NxAlert(id: "nuevo-viatico", title: error, tone: .danger))
                            .listRowInsets(EdgeInsets())
                            .listRowBackground(Color.clear)
                    }
                }

                Section {
                    Button {
                        pedir()
                    } label: {
                        if enviando {
                            ProgressView().frame(maxWidth: .infinity, minHeight: 44)
                        } else {
                            Text("Pedir viático")
                                .font(.body.weight(.bold))
                                .frame(maxWidth: .infinity, minHeight: 44)
                        }
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(NxBrand.primary)
                    .disabled(enviando)
                    .listRowInsets(EdgeInsets(top: 8, leading: 16, bottom: 8, trailing: 16))
                } footer: {
                    Text("Sin señal se guarda en la cola con su foto y sale solo al volver la red.")
                }
            }
            .navigationTitle("Pedir viático")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancelar") { dismiss() }.disabled(enviando)
                }
            }
            .task { await cargarActividades() }
            .fullScreenCover(isPresented: $camara) {
                GeoPhotoCaptureView(
                    title: "Foto del ticket",
                    confirmLabel: "Usar esta foto",
                    // Un ticket se fotografía donde caiga —gasolinera, caseta,
                    // sótano—: la ubicación viaja si la hay, pero no bloquea el gasto.
                    requireLocation: false,
                    onConfirm: { foto in
                        ticket = foto
                        camara = false
                        return nil
                    },
                    onCancel: { camara = false }
                )
            }
        }
    }

    private func etiqueta(_ item: MyActivityItem) -> String {
        [item.anNumber, item.titulo]
            .compactMap { $0 }
            .first { !$0.isEmpty } ?? "Actividad #\(item.id)"
    }

    /// Aparte: sin actividades se puede pedir igual un viático suelto.
    private func cargarActividades() async {
        actividades = (try? await CoreRepository.shared.myActivities().open) ?? []
    }

    private func pedir() {
        intentado = true
        guard completo, let ticket else { return }
        enviando = true
        error = nil
        Task {
            do {
                let encolado = try await ViaticosRepository.shared.crear(
                    centavos: centavos,
                    motivo: motivo,
                    categoria: categoria,
                    actividadId: actividad?.id,
                    ticket: ticket
                )
                enviando = false
                onCreado(
                    encolado
                        ? "Sin conexión: tu viático quedó en la cola con su foto y sale solo al volver la señal."
                        : "Viático solicitado"
                )
                dismiss()
            } catch {
                // La hoja se queda abierta con lo tecleado: nada que reescribir.
                enviando = false
                self.error = error.localizedDescription
            }
        }
    }
}
