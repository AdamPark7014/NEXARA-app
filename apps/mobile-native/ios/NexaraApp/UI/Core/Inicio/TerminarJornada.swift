import SwiftUI

/// Salir de la jornada no es salir de la actividad (Adam, 01-11-2026): «se confunden y marcan salida
/// en asistencia en lugar de salida de su actividad». Mockup aprobado, Programa Velocidad Core Ola 3.
/// Espejo de `TerminarJornada.kt`, con los mismos textos.
enum TerminarJornadaRules {
    /// La propia persona deshace su salida dentro de este tiempo; después, su jefe con motivo.
    static let ventanaDeshacer: TimeInterval = 10 * 60

    private static func folios(_ lista: [ActividadEnRiesgo]?) -> [String] {
        (lista ?? []).map { $0.folio }.filter { !$0.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }
    }

    /// «Si sigues: se detiene el reloj de AN-0368 y queda «No cumplida» porque vence hoy…».
    static func textoSiSigues(_ riesgo: RiesgoSalida?) -> String? {
        let corriendo = folios(riesgo?.corriendo)
        let porCerrar = folios(riesgo?.porCerrar)
        if corriendo.isEmpty && porCerrar.isEmpty { return nil }
        var partes: [String] = []
        if corriendo.count == 1 { partes.append("se detiene el reloj de \(corriendo[0])") }
        if corriendo.count > 1 { partes.append("se detienen los relojes de \(corriendo.joined(separator: ", "))") }
        let mismas = Set(corriendo) == Set(porCerrar)
        if !porCerrar.isEmpty {
            if mismas && porCerrar.count == 1 {
                partes.append("queda «No cumplida» porque vence hoy y no la has entregado")
            } else if mismas {
                partes.append("quedan «No cumplida» porque vencen hoy y no las has entregado")
            } else if porCerrar.count == 1 {
                partes.append("\(porCerrar[0]) queda «No cumplida» porque vence hoy y no la has entregado")
            } else {
                partes.append("\(porCerrar.joined(separator: ", ")) quedan «No cumplida» porque vencen hoy y no las has entregado")
            }
        }
        return "Si sigues: " + partes.joined(separator: " y ") + "."
    }

    /// A cuál lleva «Mejor terminar la actividad»: la que corre o, si ninguna, la que vence.
    static func actividadParaTerminar(_ riesgo: RiesgoSalida?) -> Int? {
        let todas = (riesgo?.corriendo ?? []) + (riesgo?.porCerrar ?? [])
        return todas.first { $0.id > 0 }?.id
    }

    /// Minutos que quedan para deshacerla (al menos 1), o nil si ya no se puede.
    static func minutosParaDeshacer(_ salidaIso: String?, ahora: Date) -> Int? {
        guard let salida = AttendanceClock.parse(salidaIso) else { return nil }
        let pasados = ahora.timeIntervalSince(salida)
        if pasados < 0 || pasados > ventanaDeshacer { return nil }
        return max(1, Int(((ventanaDeshacer - pasados) / 60).rounded(.up)))
    }

    /// Sin señal todavía no se registró: decir «registrada» hacía creer que ya estaba.
    static func mensajeChecada(_ type: String, queued: Bool, message: String) -> String {
        if queued {
            return type == "salida"
                ? "Sin señal: tu salida se enviará en cuanto vuelva la red"
                : "Sin señal: tu entrada se enviará en cuanto vuelva la red"
        }
        if !message.isEmpty { return message }
        return type == "entrada" ? "Entrada registrada" : "Salida registrada"
    }

    static func mensajeDeshecha(_ regresadas: [String?]) -> String {
        let folios = regresadas.compactMap { $0 }
        if folios.isEmpty { return "Tu jornada sigue abierta" }
        if folios.count == 1 { return "Tu jornada sigue abierta y \(folios[0]) ya no queda «No cumplida»" }
        return "Tu jornada sigue abierta y \(folios.joined(separator: ", ")) ya no quedan «No cumplida»"
    }
}

/// La hoja del mockup, sin estado propio.
struct TerminarJornadaContenido: View {
    let riesgo: RiesgoSalida?
    let cargando: Bool
    let onTerminarActividad: (() -> Void)?
    let onConfirmar: () -> Void
    let onCancelar: () -> Void

    var body: some View {
        let nota = TerminarJornadaRules.textoSiSigues(riesgo)
        VStack(alignment: .leading, spacing: 12) {
            Text("¿Terminar tu jornada?")
                .font(.system(size: 18, weight: .bold))
                .foregroundStyle(NxColors.fg)
                .accessibilityAddTraits(.isHeader)
            Text(nota != nil ? "Es tu salida del día. Tu actividad sigue abierta." : "Es tu salida del día.")
                .font(.system(size: 14))
                .foregroundStyle(NxColors.fg2)
                .fixedSize(horizontal: false, vertical: true)
            if cargando {
                ProgressView()
                    .controlSize(.small)
                    .tint(NxColors.brand)
                    .frame(maxWidth: .infinity)
                    .padding(4)
            }
            if let nota {
                Text(nota)
                    .font(.system(size: 13))
                    .foregroundStyle(NxColors.fg)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(12)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(NxColors.warningSoft, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
            }
            if nota != nil, let onTerminarActividad {
                NxPrimaryButton("Mejor terminar la actividad", action: onTerminarActividad)
                NxSecondaryButton("Sí, terminar mi jornada", fullWidth: true, tint: NxColors.fg, action: onConfirmar)
            } else {
                NxPrimaryButton("Sí, terminar mi jornada", enabled: !cargando, action: onConfirmar)
                NxSecondaryButton("Cancelar", fullWidth: true, tint: NxColors.fg, action: onCancelar)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

/// Lee qué se detiene y lo dice antes de abrir la cámara. Si no se puede leer (sin señal), se puede
/// salir igual: lo capturado sin conexión no se frena.
private struct TerminarJornadaHoja: View {
    @ObservedObject var vm: AttendanceVM
    let onTerminarActividad: ((Int) -> Void)?
    let onConfirmar: () -> Void
    let onCerrar: () -> Void

    @State private var riesgo: RiesgoSalida?
    @State private var cargando = true

    private var terminarActividad: (() -> Void)? {
        guard let id = TerminarJornadaRules.actividadParaTerminar(riesgo), let abrir = onTerminarActividad else {
            return nil
        }
        return { abrir(id) }
    }

    var body: some View {
        ScrollView {
            TerminarJornadaContenido(
                riesgo: riesgo,
                cargando: cargando,
                onTerminarActividad: terminarActividad,
                onConfirmar: onConfirmar,
                onCancelar: onCerrar
            )
            .padding(.horizontal, 20)
            .padding(.top, 28)
            .padding(.bottom, 24)
        }
        .scrollBounceBehavior(.basedOnSize)
        .background(NxColors.card.ignoresSafeArea())
        .presentationDetents([.medium, .large])
        .presentationDragIndicator(.visible)
        .presentationBackground(NxColors.card)
        .task {
            riesgo = await vm.riesgoSalida()
            cargando = false
        }
    }
}

/// Presenta la hoja y deja lo que se eligió para cuando ya se cerró: abrir la cámara (o el detalle de
/// la actividad) en el mismo instante en que se cierra una hoja no la presenta.
private struct TerminarJornadaHojaModifier: ViewModifier {
    @Binding var isPresented: Bool
    @ObservedObject var vm: AttendanceVM
    let onTerminarActividad: ((Int) -> Void)?
    let onConfirmar: () -> Void

    @State private var despues: (() -> Void)?

    func body(content: Content) -> some View {
        content.sheet(isPresented: $isPresented, onDismiss: {
            let accion = despues
            despues = nil
            accion?()
        }) {
            TerminarJornadaHoja(
                vm: vm,
                onTerminarActividad: { id in
                    despues = {
                        if let abrir = onTerminarActividad { abrir(id) }
                    }
                    isPresented = false
                },
                onConfirmar: {
                    despues = onConfirmar
                    isPresented = false
                },
                onCerrar: { isPresented = false }
            )
        }
    }
}

extension View {
    /// La hoja «¿Terminar tu jornada?». `onConfirmar` sigue el camino de siempre: permiso y cámara.
    @MainActor
    func terminarJornadaHoja(
        isPresented: Binding<Bool>,
        vm: AttendanceVM,
        onTerminarActividad: ((Int) -> Void)?,
        onConfirmar: @escaping () -> Void
    ) -> some View {
        modifier(TerminarJornadaHojaModifier(
            isPresented: isPresented,
            vm: vm,
            onTerminarActividad: onTerminarActividad,
            onConfirmar: onConfirmar
        ))
    }
}
