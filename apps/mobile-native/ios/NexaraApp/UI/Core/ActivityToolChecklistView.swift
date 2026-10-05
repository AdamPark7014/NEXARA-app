import SwiftUI

/// Reglas del checklist de herramientas del lado de la app (Android
/// `HerramientasChecklistRules`, espejo de `estadoChecklist` y
/// `mensajeChecklistPendiente` en apps/api/src/activities/tools/herramientas-checklist.helpers.ts).
/// El API manda ya `pendientes`/`listos`/`completo`, pero la app los recalcula para
/// pintar sin esperar la respuesta y para decir lo mismo que el servidor sin red.
enum HerramientasChecklistReglas {
    /// Cuántos nombres se enumeran antes de cortar con «y N más».
    static let maxNombresEnMensaje = 4

    /// Descripciones que faltan por revisar o que se marcaron mal. Un renglón cuenta
    /// como listo SOLO con un palomeo en `ok`.
    static func pendientes(_ requisitos: [HerramientaRequisito]) -> [String] {
        requisitos
            .filter { $0.check?.ok != true }
            .map { ($0.descripcion ?? "").trimmingCharacters(in: .whitespacesAndNewlines) }
    }

    /// Renglones con palomeo «lo traigo y sirve».
    static func listos(_ requisitos: [HerramientaRequisito]) -> Int {
        requisitos.filter { $0.check?.ok == true }.count
    }

    /// true cuando no queda nada pendiente (o cuando la OT no pide nada).
    static func completo(_ requisitos: [HerramientaRequisito]) -> Bool {
        pendientes(requisitos).isEmpty
    }

    /// «3 de 5 listas» para la línea de avance.
    static func progresoTexto(_ requisitos: [HerramientaRequisito]) -> String {
        let total = requisitos.count
        return "\(listos(requisitos)) de \(total) \(total == 1 ? "lista" : "listas")"
    }

    /// El mismo texto que devuelve el API en el 400 de `iniciar`.
    static func mensajePendiente(_ pendientes: [String]) -> String {
        guard !pendientes.isEmpty else { return "" }
        let muestra = pendientes.prefix(maxNombresEnMensaje).joined(separator: ", ")
        let resto = pendientes.count > maxNombresEnMensaje ? " y \(pendientes.count - maxNombresEnMensaje) más" : ""
        let falta = pendientes.count == 1 ? "Falta" : "Faltan"
        return "\(falta) palomear el checklist de herramientas antes de iniciar: "
            + "\(muestra)\(resto). Si algo no lo traes o está dañado, márcalo y avisa a tu supervisor."
    }

    /// «2» en vez de «2.0»; los decimales solo aparecen si los hay (metros de cable).
    static func cantidadTexto(_ cantidad: Double) -> String {
        if cantidad.rounded() == cantidad, abs(cantidad) < 1e15 { return String(Int64(cantidad)) }
        return String(cantidad)
    }

    /// «x2 · Serie A-1140 · SKU-99»; vacío cuando no hay nada que añadir.
    static func detalle(_ req: HerramientaRequisito) -> String {
        var partes: [String] = []
        if let cantidad = req.cantidad, cantidad > 0 { partes.append("x\(cantidadTexto(cantidad))") }
        if let serie = req.herramienta?.serie, !serie.trimmingCharacters(in: .whitespaces).isEmpty {
            partes.append("Serie \(serie)")
        }
        if let sku = req.producto?.sku, !sku.trimmingCharacters(in: .whitespaces).isEmpty { partes.append(sku) }
        return partes.joined(separator: " · ")
    }
}

/// «Herramientas a ocupar» del detalle de la OT (Android `HerramientasChecklistSection`).
///
/// Regla del dueño: antes de atender la instalación o el servicio se palomea el
/// checklist. Mientras quede un renglón sin palomear, `POST me/activities/:id/iniciar`
/// contesta 400 con el texto de `HerramientasChecklistReglas.mensajePendiente`.
///
/// Dibuja su propia tarjeta (`NxPanelShell`). No pinta nada cuando la OT no pide
/// herramientas, ni cuando quien mira no la tiene asignada (el API contesta 403/404).
struct ActivityToolChecklistView: View {
    let activityId: Int
    var refreshToken: Int = 0

    @State private var requisitos: [HerramientaRequisito]?
    @State private var cargando = true
    @State private var error: String?
    @State private var oculta = false
    @State private var guardandoId: Int?
    @State private var recarga = 0

    private var taskKey: String { "\(activityId)-\(refreshToken)-\(recarga)" }

    var body: some View {
        contenido
            .task(id: taskKey) { await load() }
    }

    @ViewBuilder
    private var contenido: some View {
        if oculta || (!cargando && error == nil && (requisitos ?? []).isEmpty) {
            // Android no pinta nada (OT sin herramientas o no asignada a mí).
            EmptyView()
        } else {
            NxPanelShell {
                NxSectionHeader(title: "Herramientas a ocupar")
                if cargando && requisitos == nil {
                    NxLoadingState(text: "Cargando checklist…")
                } else if let error {
                    NxErrorBlock(message: error, onRetry: { recarga += 1 })
                } else {
                    lista(requisitos ?? [])
                }
            }
        }
    }

    @ViewBuilder
    private func lista(_ items: [HerramientaRequisito]) -> some View {
        let faltan = HerramientasChecklistReglas.pendientes(items)
        Color.clear.frame(height: 6)
        HStack(alignment: .center, spacing: 8) {
            Text(HerramientasChecklistReglas.progresoTexto(items))
                .font(.system(size: 12.5, weight: .bold))
                .foregroundStyle(faltan.isEmpty ? NxColors.verde : NxColors.naranja)
            if faltan.isEmpty {
                CoreChip(text: "Listo para iniciar", color: NxColors.verde)
            }
            Spacer(minLength: 0)
        }
        Color.clear.frame(height: 8)
        ForEach(Array(items.enumerated()), id: \.offset) { _, req in
            HerramientaRequisitoFila(
                req: req,
                guardando: guardandoId != nil && guardandoId == req.id,
                onPalomear: { ok in Task { await palomear(req, ok: ok) } }
            )
        }
    }

    // MARK: Datos

    @MainActor
    private func load() async {
        cargando = true
        error = nil
        do {
            let checklist = try await CoreRepository.shared.herramientasChecklist(activityId: activityId)
            requisitos = checklist.items
            cargando = false
        } catch let ApiError.http(code, _) where code == 403 || code == 404 {
            // No asignada a mí o sin checklist: no es un error, simplemente no va.
            oculta = true
            cargando = false
        } catch {
            // Cancelada (la vista salió de pantalla): sigue «cargando» para que la
            // tarea vuelva a correr al reaparecer, en vez de quedar oculta sin datos.
            if Task.isCancelled { return }
            self.error = error.toUserMessage(fallback: "No se pudo cargar el checklist de herramientas")
            cargando = false
        }
    }

    @MainActor
    private func palomear(_ req: HerramientaRequisito, ok: Bool) async {
        guard let id = req.id else { return }
        guardandoId = id
        error = nil
        defer { guardandoId = nil }
        do {
            let checklist = try await CoreRepository.shared.palomearHerramienta(
                activityId: activityId,
                requirementId: id,
                ok: ok
            )
            requisitos = checklist.items
        } catch {
            self.error = error.toUserMessage(fallback: "No se pudo guardar el palomeo")
        }
    }
}

// MARK: - Renglón

/// Un renglón (Android `HerramientaRequisitoRow`): qué es, cómo está y las dos únicas
/// respuestas posibles, «Lo traigo» y «Falta».
private struct HerramientaRequisitoFila: View {
    let req: HerramientaRequisito
    let guardando: Bool
    let onPalomear: (Bool) -> Void

    private var ok: Bool? { req.check?.ok }

    private var estado: (texto: String, color: Color) {
        switch ok {
        case .some(true): return ("Lo traigo", NxColors.verde)
        case .some(false): return ("Falta", NxColors.rojo)
        case .none: return ("Sin revisar", NxColors.gris)
        }
    }

    private var nombre: String {
        let texto = (req.descripcion ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        return texto.isEmpty ? "Renglón sin nombre" : (req.descripcion ?? texto)
    }

    var body: some View {
        let detalle = HerramientasChecklistReglas.detalle(req)
        VStack(alignment: .leading, spacing: 4) {
            Color.clear.frame(height: 4)
            HStack(alignment: .center, spacing: 8) {
                VStack(alignment: .leading, spacing: 0) {
                    Text(nombre)
                        .font(.system(size: 13.5, weight: .semibold))
                        .foregroundStyle(NxColors.fg)
                        .lineSpacing(max(0, 24 - 13.5 * 1.2))
                        .fixedSize(horizontal: false, vertical: true)
                    if !detalle.isEmpty {
                        Text(detalle)
                            .font(.system(size: 11.5))
                            .foregroundStyle(NxColors.muted)
                            .lineLimit(1)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                CoreChip(text: estado.texto, color: estado.color)
            }
            HStack(alignment: .center, spacing: 8) {
                Button { onPalomear(true) } label: {
                    Text("Lo traigo").font(.system(size: 12.5, weight: .bold))
                }
                .buttonStyle(HerramientaPildoraStyle(fill: NxColors.verde, foreground: .white))
                .disabled(guardando || ok == true)
                Button { onPalomear(false) } label: {
                    // Android fija el rojo en el texto: se queda rojo aunque el botón esté apagado.
                    Text("Falta")
                        .font(.system(size: 12.5, weight: .semibold))
                        .foregroundStyle(NxColors.rojo)
                }
                .buttonStyle(HerramientaPildoraStyle(fill: nil, foreground: NxColors.brand))
                .disabled(guardando || ok == false)
            }
            if let nota = req.check?.nota, !nota.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                Text(nota)
                    .font(.system(size: 11.5))
                    .foregroundStyle(NxColors.muted)
                    .lineSpacing(max(0, 24 - 11.5 * 1.2))
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

/// `Button` / `OutlinedButton` de Material 3 con `heightIn(min = 40)`: píldora, relleno
/// 24 × 8. `fill == nil` = contorno #CBD5E1. La fuente la pone cada etiqueta.
private struct HerramientaPildoraStyle: ButtonStyle {
    var fill: Color?
    var foreground: Color

    func makeBody(configuration: Configuration) -> some View {
        HerramientaPildoraBody(configuration: configuration, fill: fill, foreground: foreground)
    }
}

private struct HerramientaPildoraBody: View {
    let configuration: ButtonStyleConfiguration
    let fill: Color?
    let foreground: Color
    @Environment(\.isEnabled) private var isEnabled

    var body: some View {
        configuration.label
            .lineLimit(1)
            .foregroundStyle(isEnabled ? foreground : NxColors.fg.opacity(0.38))
            .padding(.horizontal, 24)
            .padding(.vertical, 8)
            .frame(minHeight: 40)
            .background {
                if let fill {
                    Capsule().fill(isEnabled ? fill : NxColors.fg.opacity(0.12))
                }
            }
            .overlay {
                if fill == nil {
                    Capsule().strokeBorder(isEnabled ? NxColors.borderStrong : NxColors.fg.opacity(0.12), lineWidth: 1)
                }
            }
            .opacity(configuration.isPressed ? 0.85 : 1)
            .contentShape(Capsule())
    }
}
