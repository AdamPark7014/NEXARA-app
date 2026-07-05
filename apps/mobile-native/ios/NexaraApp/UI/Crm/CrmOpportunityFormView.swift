import SwiftUI

let opportunityStages: [(id: String, label: String)] = [
    ("DISCOVERY", "Discovery"),
    ("QUALIFICATION", "Calificado"),
    ("PROPOSAL", "Cotización"),
    ("NEGOTIATION", "Negociación"),
    ("CLOSING", "Cierre"),
    ("WON", "Ganada"),
    ("LOST", "Perdida"),
]

struct OpportunityFormState: Equatable {
    var title = ""
    var description = ""
    var value = ""
    var probability = "20"
    var stage = "DISCOVERY"
    var expectedCloseDate = ""
}

extension OpportunityFormState {
    func toPayload() -> [String: String] {
        var p: [String: String] = ["title": title.trimmingCharacters(in: .whitespaces)]
        let desc = description.trimmingCharacters(in: .whitespaces)
        if !desc.isEmpty { p["description"] = desc }
        if let v = Double(value.replacingOccurrences(of: ",", with: "")) {
            p["value"] = String(v)
        }
        if let prob = Int(probability) { p["probability"] = String(prob) }
        p["stage"] = stage
        let close = expectedCloseDate.trimmingCharacters(in: .whitespaces)
        if !close.isEmpty { p["expectedCloseDate"] = close }
        return p
    }

    static func from(_ m: [String: Any]) -> OpportunityFormState {
        var s = OpportunityFormState()
        s.title = ConsoleHelpers.mapStr(m, "title", "name", "titulo")
        s.description = ConsoleHelpers.mapStr(m, "description", "descripcion")
        if let v = m["value"] as? NSNumber { s.value = v.stringValue }
        else if let v = m["value"] as? String { s.value = v }
        if let p = m["probability"] as? NSNumber { s.probability = p.stringValue }
        else if let p = m["probability"] as? String { s.probability = p }
        s.stage = ConsoleHelpers.mapStr(m, "stage", "etapa").isEmpty ? "DISCOVERY" : ConsoleHelpers.mapStr(m, "stage", "etapa")
        s.expectedCloseDate = ConsoleHelpers.mapStr(m, "expectedCloseDate", "closeDate")
        return s
    }
}

struct OpportunityFormSheet: View {
    let title: String
    @Binding var state: OpportunityFormState
    let saving: Bool
    let error: String?
    let onDismiss: () -> Void
    let onSave: () -> Void

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("Título *", text: $state.title)
                    TextField("Descripción", text: $state.description, axis: .vertical)
                        .lineLimit(2...4)
                    TextField("Valor (MXN)", text: $state.value)
                        .keyboardType(.decimalPad)
                    TextField("Probabilidad %", text: $state.probability)
                        .keyboardType(.numberPad)
                    Picker("Etapa", selection: $state.stage) {
                        ForEach(opportunityStages, id: \.id) { s in
                            Text(s.label).tag(s.id)
                        }
                    }
                    TextField("Cierre estimado (YYYY-MM-DD)", text: $state.expectedCloseDate)
                }
                if let error, !error.isEmpty {
                    Section { Text(error).foregroundColor(.red).font(.footnote) }
                }
            }
            .navigationTitle(title)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancelar", action: onDismiss)
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(saving ? "Guardando…" : "Guardar", action: onSave)
                        .disabled(saving || state.title.trimmingCharacters(in: .whitespaces).isEmpty)
                }
            }
        }
    }
}
