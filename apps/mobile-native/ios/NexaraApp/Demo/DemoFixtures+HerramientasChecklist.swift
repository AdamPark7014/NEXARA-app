import Foundation

// Checklist de herramientas de la OT en la demostración:
//   GET  me/activities/:id/herramientas
//   POST me/activities/:id/herramientas/:requirementId/check   { ok, nota?, fotoUrl? }
// Forma: `HerramientasChecklist` de Data/CoreModels.swift (espejo de `RequisitoConCheck`
// y `estadoChecklist` en apps/api/src/activities/tools/herramientas-checklist.helpers.ts).
//
// Solo «Visita de supervisión · Corporativo Atlixco» (5150, mía y por empezar) pide
// herramientas; las demás contestan la lista vacía y la tarjeta no se pinta. En la demo
// «Iniciar» no se bloquea aunque falte palomear (el API real contesta 400).
//
// No confundir con `DemoFixtures+Herramientas.swift` (Mi kit y préstamos, `tool-requests/*`).

/// Un palomeo hecho en la demo.
private struct DemoChecklistPalomeo {
    let ok: Bool
    let nota: String?
    let at: Date
    let porId: Int
}

/// Un renglón fijo del checklist de la demo.
private struct DemoChecklistRequisito {
    let id: Int
    let descripcion: String
    let cantidad: Double
    let producto: (id: Int, sku: String, nombre: String)?
    let herramienta: (id: Int, nombre: String, serie: String)?
}

/// Palomeos de la sesión de demo. Vive fuera de `DemoStore` porque una extensión no
/// guarda propiedades; se vacía solo cuando cambia `DemoStore.epoch` (entrada nueva
/// al demo). Se lee y escribe con el candado de `DemoStore` tomado.
private final class DemoChecklistMemoria: @unchecked Sendable {
    static let shared = DemoChecklistMemoria()
    var epoch: Date?
    /// activityId → requirementId → último palomeo.
    var palomeos: [Int: [Int: DemoChecklistPalomeo]] = [:]
}

extension DemoStore {
    /// Actividades de la demo que piden herramientas.
    private static let requisitosChecklist: [Int: [DemoChecklistRequisito]] = [
        5150: [
            DemoChecklistRequisito(
                id: 9701,
                descripcion: "Laptop de configuración",
                cantidad: 1,
                producto: nil,
                herramienta: (id: 61, nombre: "Laptop Dell Latitude 5440", serie: "LAP-0412")
            ),
            DemoChecklistRequisito(
                id: 9702,
                descripcion: "Probador de red",
                cantidad: 1,
                producto: nil,
                herramienta: (id: 64, nombre: "Probador Fluke MicroScanner2", serie: "MS2-20931")
            ),
            DemoChecklistRequisito(
                id: 9703,
                descripcion: "Cable UTP Cat 6",
                cantidad: 30.5,
                producto: (id: 812, sku: "UTP-C6-305", nombre: "Cable UTP Cat 6 (metro)"),
                herramienta: nil
            ),
        ],
    ]

    /// Palomeos con los que arranca la demo: la laptop ya está lista desde hace 12 min.
    private func palomeosInicialesChecklist() -> [Int: [Int: DemoChecklistPalomeo]] {
        [5150: [9701: DemoChecklistPalomeo(ok: true, nota: nil, at: at(-12), porId: DemoMode.meId)]]
    }

    /// Respuesta de `me/activities/:id/herramientas` (GET) y de su `…/:requirementId/check`
    /// (POST). Al palomear guarda el estado en memoria y devuelve el checklist completo.
    func checklistHerramientas(method: String, parts: [String], activityId: Int, json: DemoJSON, now: Date) -> DemoJSON {
        let memoria = DemoChecklistMemoria.shared
        if memoria.epoch != epoch {
            memoria.epoch = epoch
            memoria.palomeos = palomeosInicialesChecklist()
        }

        let requisitos = DemoStore.requisitosChecklist[activityId] ?? []
        // me/activities/:id/herramientas/:requirementId/check
        if method == "POST", parts.count >= 6, parts[5] == "check",
           let requirementId = Int(parts[4]), requisitos.contains(where: { $0.id == requirementId }) {
            let nota = ((json["nota"] as? String) ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
            var palomeos = memoria.palomeos[activityId] ?? [:]
            palomeos[requirementId] = DemoChecklistPalomeo(
                ok: (json["ok"] as? Bool) ?? true,
                nota: nota.isEmpty ? nil : nota,
                at: now,
                porId: DemoMode.meId
            )
            memoria.palomeos[activityId] = palomeos
        }

        let palomeos = memoria.palomeos[activityId] ?? [:]
        var filas: [DemoJSON] = []
        var pendientes: [String] = []
        for req in requisitos {
            let palomeo = palomeos[req.id]
            if palomeo?.ok != true { pendientes.append(req.descripcion) }

            var checkJSON: Any = NSNull()
            if let palomeo {
                let quien = DemoData.person(palomeo.porId)
                var notaJSON: Any = NSNull()
                if let nota = palomeo.nota { notaJSON = nota }
                checkJSON = dj([
                    "ok": palomeo.ok,
                    "nota": notaJSON,
                    "fotoUrl": NSNull(),
                    "at": DemoClock.iso(palomeo.at),
                    "por": dj(["id": quien.id, "nombre": quien.nombre]),
                ])
            }
            var productId: Any = NSNull()
            var productoJSON: Any = NSNull()
            if let p = req.producto {
                productId = p.id
                productoJSON = dj(["id": p.id, "sku": p.sku, "nombre": p.nombre])
            }
            var toolId: Any = NSNull()
            var herramientaJSON: Any = NSNull()
            if let h = req.herramienta {
                toolId = h.id
                herramientaJSON = dj(["id": h.id, "nombre": h.nombre, "serie": h.serie])
            }
            filas.append(dj([
                "id": req.id,
                "descripcion": req.descripcion,
                "cantidad": req.cantidad,
                "productId": productId,
                "producto": productoJSON,
                "toolId": toolId,
                "herramienta": herramientaJSON,
                "check": checkJSON,
            ]))
        }

        return dj([
            "activityId": activityId,
            "requisitos": filas,
            "total": requisitos.count,
            "listos": requisitos.count - pendientes.count,
            "pendientes": pendientes,
            "completo": pendientes.isEmpty,
        ])
    }
}
