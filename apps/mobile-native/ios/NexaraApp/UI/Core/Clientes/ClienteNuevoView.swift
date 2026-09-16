import SwiftUI

/// Alta de cliente (`/erp/clientes/nuevo`): sectores permitidos, datos
/// fiscales obligatorios y consulta de RFC (`ventas/clientes/fiscal-lookup`)
/// que rellena razón social, CP y régimen.
struct ClienteNuevoView: View {
    var presetSector: ClientSector?
    var onCreated: (Int) -> Void

    @EnvironmentObject var session: SessionStore
    @Environment(\.dismiss) private var dismiss

    @State private var sectors: Set<ClientSector> = []
    @State private var name = ""
    @State private var legalName = ""
    @State private var taxId = ""
    @State private var fiscalRegime = ""
    @State private var fiscalAddress = ""
    @State private var fiscalZipCode = ""
    @State private var billingEmail = ""
    @State private var billingPhone = ""
    @State private var notes = ""
    @State private var regimes: [CoreFiscalLookup.Regime] = []
    @State private var lookingUp = false
    @State private var lookupMessage: String?
    @State private var lookupOk = false
    @State private var saving = false
    @State private var error: String?
    @State private var seeded = false

    private var allowed: [ClientSector] { ClientSector.sectors(for: session.currentUser?.email) }

    var body: some View {
        Form {
            Section("Sectores") {
                ForEach(allowed) { s in
                    Button {
                        if sectors.contains(s) { sectors.remove(s) } else { sectors.insert(s) }
                    } label: {
                        HStack {
                            Text("\(s.emoji) \(s.shortTitle)").foregroundColor(.primary)
                            Spacer()
                            Image(systemName: sectors.contains(s) ? "checkmark.circle.fill" : "circle")
                                .foregroundColor(sectors.contains(s) ? .accentColor : .secondary)
                        }
                    }
                }
            }

            Section("Datos fiscales") {
                TextField("Nombre comercial *", text: $name)
                TextField("RFC *", text: $taxId)
                    .textInputAutocapitalization(.characters)
                    .autocorrectionDisabled()
                    .onChange(of: taxId) { _, value in
                        let upper = value.uppercased()
                        if upper != value { taxId = upper }
                        lookupMessage = nil
                    }
                Button {
                    Task { await lookupRfc() }
                } label: {
                    if lookingUp {
                        ProgressView()
                    } else {
                        Label("Consultar RFC", systemImage: "magnifyingglass")
                    }
                }
                .disabled(lookingUp || taxId.trimmingCharacters(in: .whitespaces).count < 12)
                if let lookupMessage {
                    Text(lookupMessage)
                        .font(.caption)
                        .foregroundColor(lookupOk ? .green : .orange)
                }
                TextField("Razón social *", text: $legalName)
                if regimes.isEmpty {
                    TextField("Régimen fiscal (clave SAT)", text: $fiscalRegime)
                        .keyboardType(.numberPad)
                } else {
                    Picker("Régimen fiscal", selection: $fiscalRegime) {
                        Text("Selecciona…").tag("")
                        ForEach(regimes, id: \.code) { r in
                            Text("\(r.code) · \(r.name)").tag(r.code)
                        }
                    }
                }
                TextField("Dirección fiscal *", text: $fiscalAddress)
                TextField("CP fiscal *", text: $fiscalZipCode)
                    .keyboardType(.numberPad)
                TextField("Email facturación *", text: $billingEmail)
                    .keyboardType(.emailAddress)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                TextField("Teléfono", text: $billingPhone)
                    .keyboardType(.phonePad)
            }

            Section("Notas") {
                TextField("Notas", text: $notes, axis: .vertical)
                    .lineLimit(2...5)
            }

            if let error {
                Section { Text(error).foregroundColor(.red).font(.footnote) }
            }

            Section {
                Button(saving ? "Guardando…" : "Crear cliente") {
                    Task { await save() }
                }
                .disabled(saving)
            }
        }
        .navigationTitle("Nuevo cliente")
        .navigationBarTitleDisplayMode(.inline)
        .onAppear {
            guard !seeded else { return }
            seeded = true
            if let presetSector, allowed.contains(presetSector) {
                sectors = [presetSector]
            } else if let first = allowed.first {
                sectors = [first]
            }
        }
    }

    /// `FiscalRfcLookup.onApply`: solo pisa lo que el SAT sí devolvió.
    private func lookupRfc() async {
        lookingUp = true
        defer { lookingUp = false }
        do {
            let result = try await ClientesRepository.shared.fiscalLookup(rfc: taxId)
            regimes = result.regimes ?? []
            if let legal = result.legalName?.trimmingCharacters(in: .whitespaces), !legal.isEmpty {
                legalName = legal
            }
            if let zip = result.fiscalZipCode?.trimmingCharacters(in: .whitespaces), !zip.isEmpty {
                fiscalZipCode = zip
            }
            if let suggested = result.suggestedRegime, !suggested.isEmpty {
                fiscalRegime = suggested
            }
            let valid = result.validation?.valid ?? true
            lookupOk = valid
            let errors = (result.validation?.errors ?? []).joined(separator: " · ")
            let msg = (result.message ?? "").trimmingCharacters(in: .whitespaces)
            lookupMessage = !valid && !errors.isEmpty ? errors : (msg.isEmpty ? (valid ? "RFC válido" : "RFC inválido") : msg)
        } catch {
            lookupOk = false
            lookupMessage = error.toUserMessage(fallback: "No se pudo consultar el RFC")
        }
    }

    private func save() async {
        guard !sectors.isEmpty else {
            error = "Elige al menos un sector"
            return
        }
        let t = { (s: String) in s.trimmingCharacters(in: .whitespacesAndNewlines) }
        guard !t(name).isEmpty, !t(legalName).isEmpty, !t(taxId).isEmpty,
              !t(fiscalAddress).isEmpty, !t(fiscalZipCode).isEmpty, !t(billingEmail).isEmpty else {
            error = "Completa los campos obligatorios (*)"
            return
        }
        guard t(billingEmail).contains("@") else {
            error = "Email de facturación inválido"
            return
        }
        let phoneDigits = billingPhone.filter(\.isNumber).count
        if !t(billingPhone).isEmpty && !(10...15).contains(phoneDigits) {
            error = "Teléfono inválido para el país seleccionado"
            return
        }
        saving = true
        error = nil
        defer { saving = false }
        let body = CoreSalesClientCreateBody(
            name: t(name),
            legalName: t(legalName),
            taxId: t(taxId).uppercased(),
            fiscalAddress: t(fiscalAddress),
            fiscalZipCode: t(fiscalZipCode),
            fiscalRegime: t(fiscalRegime),
            billingEmail: t(billingEmail),
            billingPhone: t(billingPhone),
            notes: t(notes),
            sectors: ClientSector.allCases.filter { sectors.contains($0) }.map(\.rawValue)
        )
        do {
            if let created = try await ClientesRepository.shared.create(body) {
                onCreated(created.id)
            } else {
                dismiss()
            }
        } catch {
            self.error = error.toUserMessage(fallback: "No se pudo crear")
        }
    }
}
