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

// MARK: - Diálogos con la forma de Android

/// Diálogo de Android (`AlertDialog`): título 22, contenido y botones a la derecha,
/// en una hoja que se ajusta al contenido (fondo `surfaceContainerHigh`, radio 28).
/// Lo usan «Pausar actividad», «Cancelar actividad» y «Pasar a otro compañero».
struct ActivityDialogSheet<Content: View, Actions: View>: View {
    let title: String
    var titleWeight: Font.Weight
    let content: Content
    let actions: Actions

    /// `surfaceContainerHigh` del tema de Android (#EEF2F7).
    static var fondo: Color { NxColors.rgb(0xEEF2F7) }

    init(
        title: String,
        titleWeight: Font.Weight = .semibold,
        @ViewBuilder content: () -> Content,
        @ViewBuilder actions: () -> Actions
    ) {
        self.title = title
        self.titleWeight = titleWeight
        self.content = content()
        self.actions = actions()
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                Text(title)
                    .font(.system(size: 22, weight: titleWeight))
                    .foregroundStyle(NxColors.fg)
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityAddTraits(.isHeader)
                VStack(alignment: .leading, spacing: 8) { content }
                HStack(spacing: 8) {
                    Spacer(minLength: 0)
                    actions
                }
            }
            .padding(24)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .scrollBounceBehavior(.basedOnSize)
        .background(Self.fondo.ignoresSafeArea())
        .presentationDetents([.medium, .large])
        .presentationDragIndicator(.visible)
        .presentationCornerRadius(28)
        .presentationBackground(Self.fondo)
    }
}

/// `TextButton` de Material: letra 14 Medium de marca, sin fondo.
struct ActivityDialogTextButtonStyle: ButtonStyle {
    var color: Color = NxColors.brand

    func makeBody(configuration: Configuration) -> some View {
        ActivityDialogTextButtonBody(configuration: configuration, color: color)
    }
}

private struct ActivityDialogTextButtonBody: View {
    let configuration: ButtonStyleConfiguration
    let color: Color
    @Environment(\.isEnabled) private var isEnabled

    var body: some View {
        configuration.label
            .font(.system(size: 14, weight: .medium))
            .lineLimit(1)
            .foregroundStyle(isEnabled ? color : NxColors.fg.opacity(0.38))
            .padding(.horizontal, 12)
            .frame(minHeight: 40)
            .background(configuration.isPressed ? color.opacity(0.1) : Color.clear, in: Capsule())
            .contentShape(Capsule())
    }
}

/// Campo de contorno de Material (`OutlinedTextField`): etiqueta, borde #CBD5E1
/// (rojo con error) y texto de apoyo debajo.
struct ActivityOutlinedField: View {
    let label: String
    @Binding var text: String
    var placeholder: String = ""
    var minLines: Int = 1
    var isError: Bool = false
    var supporting: String? = nil
    var enabled: Bool = true

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(label)
                .font(.system(size: 12, weight: .medium))
                .foregroundStyle(isError ? NxColors.danger : NxColors.muted)
            TextField(placeholder.isEmpty ? label : placeholder, text: $text, axis: .vertical)
                .font(.system(size: 16))
                .foregroundStyle(NxColors.fg)
                .lineLimit(max(1, minLines)...max(6, minLines))
                .padding(.horizontal, 14)
                .padding(.vertical, 12)
                .background(NxColors.card, in: RoundedRectangle(cornerRadius: NxRadius.s, style: .continuous))
                .overlay(
                    RoundedRectangle(cornerRadius: NxRadius.s, style: .continuous)
                        .strokeBorder(isError ? NxColors.danger : NxColors.borderStrong, lineWidth: 1)
                )
                .disabled(!enabled)
            if let supporting, !supporting.isEmpty {
                Text(supporting)
                    .font(.system(size: 12))
                    .foregroundStyle(isError ? NxColors.danger : NxColors.muted)
            }
        }
    }
}

// MARK: - Pausar mi actividad

/// «Pausar actividad» (motivo opcional) con `me/activities/:id/pausar`. Espejo de
/// `PausarPropiaDialog` de Android: lo usa el dock del detalle.
struct PausarPropiaSheet: View {
    let activityId: Int
    let onDone: (String) -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var motivo = ""
    @State private var guardando = false
    @State private var error: String?

    private var errorMotivo: String? { SesionActividad.errorMotivoPropio(motivo) }

    var body: some View {
        ActivityDialogSheet(title: SesionActividad.tituloPausaPropia) {
            Text(SesionActividad.textoPausaPropia)
                .font(.system(size: 13))
                .foregroundStyle(NxColors.fg)
                .fixedSize(horizontal: false, vertical: true)
            ActivityOutlinedField(
                label: "Motivo (opcional)",
                text: $motivo,
                minLines: 2,
                isError: errorMotivo != nil,
                supporting: errorMotivo,
                enabled: !guardando
            )
            if let error {
                Text(error)
                    .font(.system(size: 12.5))
                    .foregroundStyle(NxColors.rojo)
                    .fixedSize(horizontal: false, vertical: true)
            }
        } actions: {
            Button("Cancelar") { dismiss() }
                .buttonStyle(ActivityDialogTextButtonStyle())
                .disabled(guardando)
            Button(guardando ? "Pausando…" : "Pausar") {
                Task { await pausar() }
            }
            .buttonStyle(ActivityDialogTextButtonStyle())
            .disabled(guardando || errorMotivo != nil)
        }
        .interactiveDismissDisabled(guardando)
        .onChange(of: motivo) { _, value in
            let tope = SesionActividad.motivoMaximo + 20
            if value.count > tope { motivo = String(value.prefix(tope)) }
        }
    }

    @MainActor
    private func pausar() async {
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
