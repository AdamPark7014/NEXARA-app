import SwiftUI

/// Reloj propio en el detalle de mi actividad: «En pausa» + «Reanudar actividad», o
/// «Reloj corriendo» + «Pausar». Sin datos de sesión (API vieja) no pinta nada.
/// Subir cualquier evidencia también lo reanuda: eso lo hace el servidor.
struct SesionPropiaSection: View {
    let activityId: Int
    let sesion: SesionActividad
    let miId: Int?
    let despachador: Bool
    let estatus: String?
    let onDone: (String) -> Void

    @State private var guardando = false
    @State private var error: String?
    @State private var pidiendoMotivo = false
    @State private var motivo = ""

    private var reanudable: Bool { sesion.puedeReanudar(despachador: despachador, estatus: estatus) }
    private var pausable: Bool { !despachador && sesion.puedePausar(estatus: estatus) }

    var body: some View {
        if reanudable || pausable {
            Section {
                if reanudable {
                    VStack(alignment: .leading, spacing: 4) {
                        NxIconText(systemName: "pause.circle.fill", text: "En pausa", tint: CorePalette.orange)
                            .font(.subheadline.weight(.bold))
                        if let texto = sesion.textoPausa(miId: miId, propia: true) {
                            Text(texto).font(.footnote).foregroundStyle(.secondary)
                        }
                    }
                    .padding(.vertical, 2)
                    if let error {
                        Text(error).font(.footnote).foregroundStyle(CorePalette.red)
                    }
                    Button {
                        Task { await reanudar() }
                    } label: {
                        Text(guardando ? "Reanudando…" : "Reanudar actividad")
                    }
                    .buttonStyle(NxPrimaryButtonStyle(tint: CorePalette.green))
                    .disabled(guardando)
                    .listRowInsets(EdgeInsets(top: 8, leading: 16, bottom: 8, trailing: 16))
                } else {
                    NxIconText(systemName: "timer", text: sesion.textoCorriendo, tint: CorePalette.green)
                        .font(.subheadline.weight(.semibold))
                    if let error {
                        Text(error).font(.footnote).foregroundStyle(CorePalette.red)
                    }
                    Button {
                        error = nil
                        motivo = ""
                        pidiendoMotivo = true
                    } label: {
                        Label(guardando ? "Pausando…" : "Pausar", systemImage: "pause.circle")
                    }
                    .disabled(guardando)
                }
            } header: {
                Text("Tu reloj")
            } footer: {
                if reanudable {
                    Text(SesionActividad.ayudaReanudar)
                }
            }
            .alert(SesionActividad.tituloPausaPropia, isPresented: $pidiendoMotivo) {
                TextField("Motivo (opcional)", text: $motivo)
                Button("Cancelar", role: .cancel) {}
                Button("Pausar") {
                    Task { await pausar() }
                }
            } message: {
                Text(SesionActividad.textoPausaPropia)
            }
        }
    }

    private func reanudar() async {
        guardando = true
        error = nil
        defer { guardando = false }
        do {
            try await CoreRepository.shared.reanudarActividad(activityId: activityId)
            onDone("Tu reloj volvió a correr")
        } catch {
            self.error = error.toUserMessage(fallback: "No se pudo reanudar la actividad")
        }
    }

    private func pausar() async {
        if let invalido = SesionActividad.errorMotivoPropio(motivo) {
            error = invalido
            return
        }
        guardando = true
        error = nil
        defer { guardando = false }
        do {
            try await CoreRepository.shared.pausarActividad(activityId: activityId, motivo: motivo)
            onDone("Actividad en pausa")
        } catch {
            self.error = error.toUserMessage(fallback: "No se pudo pausar la actividad")
        }
    }
}

/// Lo que el jefe va a pausar: la actividad de una persona de su equipo.
struct PausaDeEquipoTarget: Identifiable {
    let userId: Int
    let nombre: String
    let actividad: TeamBoardOpenActivity
    var id: Int { actividad.id }
}

/// En el día de una persona: su jefe (o el CEO) le pausa una actividad con el reloj
/// corriendo, siempre con motivo. Las que ya están en pausa solo se muestran.
/// Quién lo ve lo decide `puedePausar` de `me/board/:userId`; el API vuelve a validar.
struct PausarDeEquipoSection: View {
    let userId: Int
    let nombre: String
    let actividades: [TeamBoardOpenActivity]
    let onDone: (String) -> Void

    @State private var objetivo: PausaDeEquipoTarget?

    private var conReloj: [TeamBoardOpenActivity] {
        actividades.filter { $0.enCurso == true || $0.enPausa == true }
    }

    var body: some View {
        if !conReloj.isEmpty {
            Section {
                ForEach(conReloj) { actividad in
                    fila(actividad)
                }
            } header: {
                Text("Reloj de sus actividades")
            } footer: {
                Text("Al pausar le llega un aviso con tu motivo; la reanuda desde su teléfono cuando vuelva a ella.")
            }
            .sheet(item: $objetivo) { target in
                PausarDeEquipoSheet(target: target) { mensaje in
                    onDone(mensaje)
                }
            }
        }
    }

    private func fila(_ actividad: TeamBoardOpenActivity) -> some View {
        let sesion = actividad.sesion
        let folio = (actividad.anNumber ?? "").trimmingCharacters(in: .whitespaces)
        let titulo = (actividad.titulo ?? "").trimmingCharacters(in: .whitespaces)
        let encabezado = [folio, titulo].filter { !$0.isEmpty }.joined(separator: " · ")
        return VStack(alignment: .leading, spacing: 6) {
            HStack(alignment: .firstTextBaseline) {
                Text(encabezado.isEmpty ? "Actividad #\(actividad.id)" : encabezado)
                    .font(.subheadline.weight(.semibold))
                    .lineLimit(2)
                Spacer(minLength: 8)
                if sesion.enPausa {
                    CoreChip(icon: "pause.circle.fill", text: "En pausa", color: CorePalette.orange)
                } else {
                    CoreChip(icon: "timer", text: "Reloj corriendo", color: CorePalette.green)
                }
            }
            if let texto = sesion.textoPausa(propia: false) {
                Text(texto).font(.footnote).foregroundStyle(.secondary)
            }
            if sesion.puedePausar(estatus: actividad.estatus) {
                Button {
                    objetivo = PausaDeEquipoTarget(userId: userId, nombre: nombre, actividad: actividad)
                } label: {
                    Label("Pausar", systemImage: "pause.circle")
                        .font(.subheadline.weight(.bold))
                }
                .buttonStyle(.bordered)
                .tint(CorePalette.orange)
            }
        }
        .padding(.vertical, 4)
    }
}

/// Motivo obligatorio (10 a 500 caracteres) para pausarle el reloj a alguien del equipo.
private struct PausarDeEquipoSheet: View {
    let target: PausaDeEquipoTarget
    let onDone: (String) -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var motivo = ""
    @State private var intento = false
    @State private var guardando = false
    @State private var error: String?

    private var errorMotivo: String? { SesionActividad.errorMotivoPausa(motivo) }

    private var descripcion: String {
        let quien = SesionActividad.primerNombre(target.nombre)
        let titulo = (target.actividad.titulo ?? "").trimmingCharacters(in: .whitespaces)
        return "Se detiene el reloj de \(quien.isEmpty ? "esta persona" : quien) "
            + "en «\(titulo.isEmpty ? "la actividad" : titulo)». Le llega un aviso con tu motivo."
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Text(descripcion).font(.subheadline)
                }
                Section {
                    TextField(SesionActividad.placeholderMotivoJefe, text: $motivo, axis: .vertical)
                        .lineLimit(3...6)
                } header: {
                    Text("¿Por qué la pausas? *")
                } footer: {
                    if intento, let errorMotivo {
                        Text(errorMotivo).foregroundStyle(CorePalette.red)
                    } else {
                        Text("Mínimo \(SesionActividad.motivoMinimo) caracteres.")
                    }
                }
                if let error {
                    Section {
                        Text(error).foregroundStyle(CorePalette.red)
                    }
                }
            }
            .navigationTitle("Pausar actividad")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancelar") { dismiss() }
                        .disabled(guardando)
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(guardando ? "Pausando…" : "Pausar") {
                        Task { await pausar() }
                    }
                    .disabled(guardando)
                }
            }
            .interactiveDismissDisabled(guardando)
        }
    }

    private func pausar() async {
        intento = true
        guard errorMotivo == nil else { return }
        guardando = true
        error = nil
        defer { guardando = false }
        do {
            try await CoreRepository.shared.pausarActividadDeEquipo(
                userId: target.userId,
                activityId: target.actividad.id,
                motivo: motivo
            )
            onDone(SesionActividad.avisoPausaDeEquipo(target.nombre))
            dismiss()
        } catch {
            self.error = error.toUserMessage(fallback: "No se pudo pausar la actividad")
        }
    }
}
