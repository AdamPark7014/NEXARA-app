import SwiftUI
import UIKit

/// Check list de salida y de regreso: las siete fotos del vehículo, el
/// kilometraje y la gasolina, en cuatro pasos.
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
    /// Se llama cuando el API aceptó el check list.
    var onDone: () -> Void

    @Environment(\.dismiss) private var dismiss

    private enum Paso: Int, CaseIterable {
        case fotos, tablero, datos, confirmar

        var titulo: String {
            switch self {
            case .fotos: return "Fotos"
            case .tablero: return "Tablero"
            case .datos: return "Km y gasolina"
            case .confirmar: return "Confirmar"
            }
        }
    }

    @State private var paso: Paso = .fotos
    @State private var fotos: [SlotChecklist: CapturedGeoPhoto] = [:]
    @State private var camara: SlotChecklist?
    @State private var odometro = ""
    @State private var combustible: NivelCombustible?
    @State private var enviando = false
    @State private var error: String?
    @State private var infoFotos = false

    private var odometroKm: Int? {
        Int(odometro.trimmingCharacters(in: .whitespaces))
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
        case .confirmar:
            return false
        }
    }

    var body: some View {
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
        .navigationTitle("\(accion.titulo) · \(vehiculo)")
        .navigationBarTitleDisplayMode(.inline)
        .fullScreenCover(item: $camara) { slot in
            GeoPhotoCaptureView(
                title: slot.label,
                confirmLabel: "Usar esta foto",
                // El API acepta lat/lng nulos: en un sótano la foto sigue valiendo.
                requireLocation: false,
                onConfirm: { captured in
                    fotos[slot] = captured
                    camara = nil
                    return nil
                },
                onCancel: { camara = nil }
            )
        }
        .alert("Fotos del momento", isPresented: $infoFotos) {
            Button("Entendido", role: .cancel) {}
        } message: {
            Text("Se toman con la cámara. El sistema rechaza fotos de la galería.")
        }
    }

    // MARK: Pasos

    private var pasos: some View {
        HStack(spacing: 6) {
            ForEach(Paso.allCases, id: \.rawValue) { item in
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
            NxSectionHeader(title: "Kilometraje")
            HStack(spacing: 8) {
                TextField("0", text: $odometro)
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
            Picker("Gasolina", selection: $combustible) {
                ForEach(NivelCombustible.allCases) { nivel in
                    Text(nivel.label).tag(Optional(nivel))
                }
            }
            .pickerStyle(.segmented)

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
        LazyVGrid(columns: [GridItem(.flexible(), spacing: 10), GridItem(.flexible(), spacing: 10)], spacing: 10) {
            ForEach(slots) { slot in
                casilla(slot, alto: 128)
            }
        }
    }

    private func casilla(_ slot: SlotChecklist, alto: CGFloat) -> some View {
        Button {
            camara = slot
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
        guard let siguiente = Paso(rawValue: paso.rawValue + 1) else { return }
        error = nil
        paso = siguiente
    }

    private func retroceder() {
        guard let anterior = Paso(rawValue: paso.rawValue - 1) else { return }
        error = nil
        paso = anterior
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
