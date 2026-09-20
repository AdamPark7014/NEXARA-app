import SwiftUI

/// «Herramientas a ocupar» del detalle de la OT.
///
/// Regla del dueño: antes de atender la instalación o el servicio se palomea el
/// checklist. Mientras quede un renglón sin palomear, `POST me/activities/:id/iniciar`
/// contesta 400 diciendo exactamente qué falta.
///
/// No se pinta nada cuando la OT no pide herramientas, ni cuando quien mira no la
/// tiene asignada (el API contesta 403).
struct ActivityToolChecklistView: View {
    let activityId: Int
    var refreshToken: Int = 0

    @State private var checklist: HerramientasChecklist?
    @State private var loading = true
    @State private var error: String?
    @State private var hidden = false
    @State private var savingId: Int?

    private var items: [HerramientaRequisito] { checklist?.items ?? [] }

    var body: some View {
        Group {
            if hidden || (!loading && error == nil && items.isEmpty) {
                EmptyView()
            } else {
                VStack(alignment: .leading, spacing: 10) {
                    Text("Herramientas a ocupar").font(.headline)
                    if loading && checklist == nil {
                        ProgressView()
                    } else if let error, checklist == nil {
                        VStack(alignment: .leading, spacing: 6) {
                            Text(error).font(.caption).foregroundStyle(.secondary)
                            Button("Reintentar") { Task { await load() } }
                                .font(.subheadline.weight(.semibold))
                        }
                    } else {
                        progressLine
                        if let error {
                            Text(error).font(.caption).foregroundStyle(CorePalette.red)
                        }
                        ForEach(items, id: \.rowKey) { req in
                            row(req)
                        }
                    }
                }
                .task(id: refreshToken) { await load() }
            }
        }
    }

    // MARK: Piezas

    private var progressLine: some View {
        let listos = checklist?.listosCount ?? 0
        let total = checklist?.totalCount ?? items.count
        let completo = checklist?.estaCompleto ?? false
        return HStack(spacing: 8) {
            Text("\(listos) de \(total) \(total == 1 ? "lista" : "listas")")
                .font(.caption.weight(.bold))
                .foregroundStyle(completo ? CorePalette.green : CorePalette.orange)
            if completo {
                CoreChip(icon: "checkmark.seal", text: "Listo para iniciar", color: CorePalette.green)
            }
            Spacer(minLength: 0)
        }
    }

    @ViewBuilder
    private func row(_ req: HerramientaRequisito) -> some View {
        let ok = req.check?.ok
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 8) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(nombre(req)).font(.subheadline.weight(.semibold))
                    if let detalle = detalle(req) {
                        Text(detalle).font(.caption).foregroundStyle(.secondary).lineLimit(1)
                    }
                }
                Spacer(minLength: 4)
                if ok == true {
                    CoreChip(icon: "checkmark.circle.fill", text: "Lo traigo", color: CorePalette.green)
                } else if ok == false {
                    CoreChip(icon: "xmark.circle.fill", text: "Falta", color: CorePalette.red)
                } else {
                    CoreChip(text: "Sin revisar", color: CorePalette.slate)
                }
            }
            HStack(spacing: 8) {
                Button("Lo traigo") { Task { await palomear(req, ok: true) } }
                    .buttonStyle(.borderedProminent)
                    .tint(CorePalette.green)
                    .disabled(savingId == req.id || ok == true)
                Button("Falta") { Task { await palomear(req, ok: false) } }
                    .buttonStyle(.bordered)
                    .tint(CorePalette.red)
                    .disabled(savingId == req.id || ok == false)
            }
            .font(.caption.weight(.semibold))
            if let nota = req.check?.nota, !nota.isEmpty {
                Text(nota).font(.caption).foregroundStyle(.secondary)
            }
        }
        .padding(.vertical, 2)
    }

    private func nombre(_ req: HerramientaRequisito) -> String {
        let text = (req.descripcion ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        return text.isEmpty ? "Renglón sin nombre" : text
    }

    /// «x2 · Serie A-1140 · SKU-99»; nulo cuando no hay nada que añadir.
    private func detalle(_ req: HerramientaRequisito) -> String? {
        var parts: [String] = []
        if let cantidad = req.cantidad, cantidad > 0 {
            let entero = cantidad.rounded() == cantidad
            parts.append(entero ? "x\(Int(cantidad))" : "x\(cantidad)")
        }
        if let serie = req.herramienta?.serie, !serie.isEmpty { parts.append("Serie \(serie)") }
        if let sku = req.producto?.sku, !sku.isEmpty { parts.append(sku) }
        return parts.isEmpty ? nil : parts.joined(separator: " · ")
    }

    // MARK: Datos

    @MainActor
    private func load() async {
        loading = true
        defer { loading = false }
        do {
            checklist = try await CoreRepository.shared.herramientasChecklist(activityId: activityId)
            error = nil
        } catch let ApiError.http(code, _) where code == 403 || code == 404 {
            // No asignada a mí o sin checklist: no es un error, simplemente no va.
            hidden = true
        } catch {
            self.error = error.toUserMessage(fallback: "No se pudo cargar el checklist de herramientas")
        }
    }

    @MainActor
    private func palomear(_ req: HerramientaRequisito, ok: Bool) async {
        guard let id = req.id else { return }
        savingId = id
        defer { savingId = nil }
        do {
            checklist = try await CoreRepository.shared.palomearHerramienta(
                activityId: activityId,
                requirementId: id,
                ok: ok
            )
            error = nil
        } catch {
            self.error = error.toUserMessage(fallback: "No se pudo guardar el palomeo")
        }
    }
}
