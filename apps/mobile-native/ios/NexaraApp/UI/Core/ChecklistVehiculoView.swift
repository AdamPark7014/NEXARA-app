import SwiftUI
import UIKit

/// Check list de salida y de regreso: las siete fotos del vehículo, el
/// kilometraje y la gasolina. La salida va en cuatro pasos; el regreso junta tablero,
/// datos y confirmar en una pantalla (`RegresoVehiculoContenido`, mockup `AppRegreso`).
///
/// La foto del tablero se lee en el servidor y llena lo que la persona no ha escrito; si
/// no se pudo leer, se captura a mano.
///
/// Todas las fotos se toman con `GeoPhotoCaptureView` (cámara en vivo). No hay
/// selector de galería en ninguna parte: el API exige `capturedAt` por foto y
/// rechaza lo que no venga de la cámara.
struct ChecklistVehiculoView: View {
    let accion: ChecklistVehiculoAccion
    /// «Ranger · ABC-123», para el encabezado.
    let vehiculo: String
    /// En el regreso, el kilometraje con el que salió: el final no puede ser menor.
    var odometroInicio: Int? = nil
    /// Con valor, el flujo es el regreso: «Regreso del vehículo» y estas líneas debajo.
    var encabezadoRegreso: [String]? = nil
    /// Se llama cuando el API aceptó el check list.
    var onDone: () -> Void

    @Environment(\.dismiss) private var dismiss

    private enum Paso: Int, CaseIterable {
        case fotos, tablero, datos, confirmar, regreso

        var titulo: String {
            switch self {
            case .fotos: return "Fotos"
            case .tablero: return "Tablero"
            case .datos: return "Km y gasolina"
            case .confirmar: return "Confirmar"
            case .regreso: return "Regreso"
            }
        }
    }

    /// Los pasos de este flujo, en orden.
    private var secuencia: [Paso] {
        encabezadoRegreso == nil ? [.fotos, .tablero, .datos, .confirmar] : [.fotos, .regreso]
    }

    @State private var paso: Paso = .fotos
    @State private var fotos: [SlotChecklist: CapturedGeoPhoto] = [:]
    @State private var camara: SlotChecklist?
    @State private var preguntandoIA = false
    @State private var aMano = false
    @State private var odometro = ""
    @State private var combustible: NivelCombustible?
    @State private var odometroEscrito = false
    @State private var nivelEscrito = false
    @State private var lectura: LecturaTablero = .sinFoto
    @State private var aviso: String?
    @State private var enviando = false
    @State private var error: String?
    @State private var infoFotos = false
    @State private var confirmaSalir = false

    private var tieneAvance: Bool {
        !fotos.isEmpty || !odometro.trimmingCharacters(in: .whitespaces).isEmpty || combustible != nil
    }

    private var odometroKm: Int? {
        Int(odometro.trimmingCharacters(in: .whitespaces))
    }

    /// Lo que teclea la persona: desde aquí la lectura de una foto ya no lo pisa.
    private var odometroEscribible: Binding<String> {
        Binding(
            get: { odometro },
            set: { nuevo in
                let limpio = GasolinaRules.soloDigitos(nuevo)
                guard limpio != odometro else { return }
                odometro = limpio
                odometroEscrito = true
                aviso = nil
            }
        )
    }

    /// El mismo campo con comas: solo se pintan, lo que se guarda son los dígitos.
    private var odometroConComas: Binding<String> {
        Binding(
            get: { GasolinaRules.agrupado(odometro) },
            set: { odometroEscribible.wrappedValue = $0 }
        )
    }

    private var nivelEscribible: Binding<NivelCombustible?> {
        Binding(
            get: { combustible },
            set: { nuevo in
                combustible = nuevo
                nivelEscrito = true
                aviso = nil
            }
        )
    }

    private var errores: [ErrorChecklist] {
        ChecklistVehiculoRules.validar(
            capturas: fotos.mapValues { $0.capturedAt },
            odometroKm: odometroKm,
            combustible: combustible,
            odometroInicio: odometroInicio
        )
    }

    private var puedeEnviar: Bool { errores.isEmpty && !enviando }

    private var puedeAvanzar: Bool {
        switch paso {
        case .fotos:
            return (ChecklistVehiculoRules.exterior + ChecklistVehiculoRules.interior)
                .allSatisfy { fotos[$0] != nil }
        case .tablero:
            return fotos[ChecklistVehiculoRules.tablero] != nil
        case .datos:
            return odometroKm != nil && combustible != nil
        case .confirmar, .regreso:
            return false
        }
    }

    var body: some View {
        Group {
            if paso == .regreso {
                regreso
            } else {
                VStack(spacing: 0) {
                    pasos
                    ScrollView {
                        VStack(alignment: .leading, spacing: 14) {
                            if let error {
                                NxAlertBanner(alert: NxAlert(id: "checklist", title: error, tone: .danger))
                            }
                            contenido
                        }
                        .padding(.horizontal)
                        .padding(.vertical, 14)
                    }
                    barra
                }
            }
        }
        .navigationTitle(paso == .regreso ? "" : "\(accion.titulo) · \(vehiculo)")
        .navigationBarTitleDisplayMode(.inline)
        .interactiveDismissDisabled(tieneAvance && !enviando)
        .toolbar {
            ToolbarItem(placement: .cancellationAction) {
                Button(paso == .regreso ? "Atrás" : "Cerrar") {
                    if paso == .regreso {
                        retroceder()
                    } else if tieneAvance {
                        confirmaSalir = true
                    } else {
                        dismiss()
                    }
                }
                .disabled(enviando)
            }
            ToolbarItemGroup(placement: .keyboard) {
                Spacer()
                Button("Listo") { cerrarTeclado() }
            }
        }
        .fullScreenCover(item: $camara) { slot in
            GeoPhotoCaptureView(
                title: slot.label,
                confirmLabel: "Usar esta foto",
                // El API acepta lat/lng nulos: en un sótano la foto sigue valiendo.
                requireLocation: false,
                onConfirm: { captured in
                    fotos[slot] = captured
                    camara = nil
                    aviso = nil
                    if slot == ChecklistVehiculoRules.tablero, PermisoLecturaIa.concedido, !aMano {
                        leerFotoDelTablero(captured)
                    }
                    return nil
                },
                onCancel: { camara = nil }
            )
        }
        .alert(PermisoLecturaIa.titulo, isPresented: $preguntandoIA) {
            Button(PermisoLecturaIa.permitir) {
                PermisoLecturaIa.conceder()
                abrirCamaraDelTablero()
            }
            Button(PermisoLecturaIa.aMano) {
                aMano = true
                abrirCamaraDelTablero()
            }
            Button("Cancelar", role: .cancel) {}
        } message: {
            Text(PermisoLecturaIa.mensaje)
        }
        .alert("Fotos del momento", isPresented: $infoFotos) {
            Button("Entendido", role: .cancel) {}
        } message: {
            Text("Se toman con la cámara. El sistema rechaza fotos de la galería.")
        }
        .alert("¿Salir sin enviar?", isPresented: $confirmaSalir) {
            Button("Seguir aquí", role: .cancel) {}
            Button("Salir y perder fotos", role: .destructive) { dismiss() }
        } message: {
            Text("Las fotos del checklist solo viven en esta pantalla hasta que las envías, y si sales ahora hay que volver a tomarlas.")
        }
    }

    // MARK: Pasos

    private var regreso: some View {
        let tablero = fotos[ChecklistVehiculoRules.tablero]
        return RegresoVehiculoContenido(
            encabezado: encabezadoRegreso ?? [],
            foto: tablero?.image,
            horaFoto: tablero.map { FechaMexico.hora($0.capturedAt) },
            lectura: lectura,
            odometro: odometroConComas,
            nivel: nivelEscribible,
            kmInicio: odometroInicio,
            aviso: aviso,
            error: error,
            enviando: enviando,
            onFoto: { tomar(ChecklistVehiculoRules.tablero) },
            onConfirmar: confirmarRegreso
        )
    }

    private var pasos: some View {
        HStack(spacing: 6) {
            ForEach(secuencia, id: \.rawValue) { item in
                Capsule()
                    .fill(item.rawValue <= paso.rawValue ? NxBrand.primary : Color(.systemGray4))
                    .frame(height: 4)
                    .accessibilityLabel(item.titulo)
            }
        }
        .padding(.horizontal)
        .padding(.top, 10)
    }

    @ViewBuilder
    private var contenido: some View {
        switch paso {
        case .fotos:
            HStack {
                NxSectionHeader(title: "Exterior", subtitle: "4 caras")
                Spacer()
                Button { infoFotos = true } label: { Image(systemName: "info.circle") }
                    .buttonStyle(.plain)
                    .foregroundStyle(.secondary)
                    .accessibilityLabel("Por qué solo cámara")
            }
            cuadricula(ChecklistVehiculoRules.exterior)
            NxSectionHeader(title: "Interior", subtitle: "2 fotos")
            cuadricula(ChecklistVehiculoRules.interior)

        case .tablero:
            NxSectionHeader(title: "Tablero", subtitle: "Odómetro y aguja de gasolina")
            casilla(ChecklistVehiculoRules.tablero, alto: 220)

        case .datos:
            if lectura == .leida || lectura == .leyendo {
                Text(lectura == .leyendo
                    ? "Leyendo la foto del tablero…"
                    : "Esto leímos en la foto. Si no cuadra, corrígelo: la foto queda de respaldo.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            NxSectionHeader(title: "Kilometraje")
            HStack(spacing: 8) {
                TextField("0", text: odometroEscribible)
                    .keyboardType(.numberPad)
                    .textFieldStyle(.roundedBorder)
                Text("km").foregroundStyle(.secondary)
            }
            if let odometroInicio {
                Text("Salió con \(odometroInicio) km")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            NxSectionHeader(title: "Gasolina")
            Picker("Gasolina", selection: nivelEscribible) {
                ForEach(NivelCombustible.allCases) { nivel in
                    Text(nivel.label).tag(Optional(nivel))
                }
            }
            .pickerStyle(.segmented)

        case .regreso:
            EmptyView()

        case .confirmar:
            NxSectionHeader(title: "Resumen")
            resumen
            if !errores.isEmpty {
                VStack(alignment: .leading, spacing: 6) {
                    ForEach(errores) { item in
                        Label(item.mensaje, systemImage: "exclamationmark.circle")
                            .font(.caption)
                            .foregroundStyle(NxTone.danger.fg)
                    }
                }
            }
        }
    }

    private var resumen: some View {
        VStack(spacing: 10) {
            HStack(spacing: 10) {
                NxKpiCard(kpi: NxKpi(
                    label: "Fotos",
                    value: "\(fotos.count)/\(ChecklistVehiculoRules.slots.count)",
                    tone: fotos.count == ChecklistVehiculoRules.slots.count ? .success : .warning
                ))
                NxKpiCard(kpi: NxKpi(
                    label: "Kilometraje",
                    value: odometroKm.map { "\($0) km" } ?? "—"
                ))
            }
            HStack(spacing: 10) {
                NxKpiCard(kpi: NxKpi(label: "Gasolina", value: combustible?.label ?? "—"))
                NxKpiCard(kpi: NxKpi(label: "Movimiento", value: accion.titulo))
            }
        }
    }

    // MARK: Casillas de foto

    private func cuadricula(_ slots: [SlotChecklist]) -> some View {
        LazyVGrid(columns: [GridItem(.flexible())], spacing: 10) {
            ForEach(slots) { slot in
                casilla(slot, alto: 128)
            }
        }
    }

    private func casilla(_ slot: SlotChecklist, alto: CGFloat) -> some View {
        Button {
            tomar(slot)
        } label: {
            ZStack(alignment: .bottomLeading) {
                if let foto = fotos[slot] {
                    Image(uiImage: foto.image)
                        .resizable()
                        .scaledToFill()
                        .frame(maxWidth: .infinity)
                        .frame(height: alto)
                        .clipped()
                } else {
                    VStack(spacing: 8) {
                        Image(systemName: slot.systemImage)
                            .font(.title2)
                            .foregroundStyle(NxBrand.primary)
                        Text(slot.label)
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(.primary)
                    }
                    .frame(maxWidth: .infinity)
                    .frame(height: alto)
                    .background(Color(.secondarySystemBackground))
                }

                if fotos[slot] != nil {
                    HStack(spacing: 4) {
                        Image(systemName: "checkmark.circle.fill")
                        Text(slot.label)
                    }
                    .font(.caption2.weight(.semibold))
                    .foregroundStyle(Color.white)
                    .padding(.horizontal, 8)
                    .padding(.vertical, 4)
                    .background(Color.black.opacity(0.55), in: Capsule())
                    .padding(8)
                }
            }
            .clipShape(RoundedRectangle(cornerRadius: 14))
            .overlay(
                RoundedRectangle(cornerRadius: 14)
                    .stroke(fotos[slot] == nil ? Color(.systemGray4) : NxTone.success.fg, lineWidth: 1)
            )
        }
        .buttonStyle(.plain)
        .accessibilityLabel(fotos[slot] == nil ? "Tomar foto: \(slot.label)" : "Repetir foto: \(slot.label)")
    }

    // MARK: Barra inferior

    private var barra: some View {
        HStack(spacing: 10) {
            if paso != .fotos {
                Button("Atrás") { retroceder() }
                    .buttonStyle(.bordered)
                    .disabled(enviando)
            }
            Spacer()
            if paso == .confirmar {
                Button {
                    enviar()
                } label: {
                    HStack(spacing: 6) {
                        if enviando { ProgressView().tint(.white) }
                        Text("Enviar")
                    }
                }
                .buttonStyle(.borderedProminent)
                .tint(NxBrand.primary)
                .disabled(!puedeEnviar)
            } else {
                Button("Continuar") { avanzar() }
                    .buttonStyle(.borderedProminent)
                    .tint(NxBrand.primary)
                    .disabled(!puedeAvanzar)
            }
        }
        .padding(.horizontal)
        .padding(.vertical, 12)
        .background(.bar)
    }

    private func avanzar() {
        guard let i = secuencia.firstIndex(of: paso), i + 1 < secuencia.count else { return }
        error = nil
        aviso = nil
        paso = secuencia[i + 1]
    }

    private func retroceder() {
        guard let i = secuencia.firstIndex(of: paso), i > 0 else { return }
        error = nil
        aviso = nil
        paso = secuencia[i - 1]
    }

    /// Lo leído llena lo que la persona no ha escrito; si no se pudo, se escribe a mano.
    private func leerFotoDelTablero(_ foto: CapturedGeoPhoto) {
        lectura = .leyendo
        Task { @MainActor in
            let r = try? await VehiculosRepository.shared.leerTablero(foto: foto, odometroPrevio: odometroInicio)
            odometro = GasolinaRules.tras(
                lectura: r?.odometroKm.map { String($0) },
                actual: odometro,
                escrito: odometroEscrito
            )
            let leido = r?.combustible.flatMap { NivelCombustible(rawValue: $0) }
            if let leido, !nivelEscrito || combustible == nil { combustible = leido }
            lectura = (r?.odometroKm != nil || leido != nil) ? .leida : .noSePudo
        }
    }

    /// Solo el tablero se lee, y sin permiso no se manda a nadie: se pregunta antes de tomarla.
    private func tomar(_ slot: SlotChecklist) {
        if slot == ChecklistVehiculoRules.tablero, !PermisoLecturaIa.concedido, !aMano {
            preguntandoIA = true
        } else {
            camara = slot
        }
    }

    /// Tras cerrar el aviso: una pantalla completa no se presenta mientras el aviso sigue saliendo.
    private func abrirCamaraDelTablero() {
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.4) { camara = ChecklistVehiculoRules.tablero }
    }

    private func confirmarRegreso() {
        cerrarTeclado()
        if errores.isEmpty {
            aviso = nil
            enviar()
        } else {
            aviso = errores.map(\.mensaje).joined(separator: ". ")
        }
    }

    private func enviar() {
        guard let odometroKm, let combustible, errores.isEmpty else { return }
        enviando = true
        error = nil
        Task { @MainActor in
            do {
                try await VehiculosRepository.shared.enviarChecklist(
                    accion: accion,
                    fotos: fotos,
                    odometroKm: odometroKm,
                    combustible: combustible
                )
                enviando = false
                onDone()
                dismiss()
            } catch {
                enviando = false
                // El 400 del API trae en español todo lo que falta: se muestra tal cual.
                self.error = error.toUserMessage()
            }
        }
    }
}
