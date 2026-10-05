import SwiftUI

/// Alta de cliente — igual que `NewClientScreen` de Android (y `/erp/clientes/nuevo`):
/// chips de sector con icono, nombre comercial y razón social obligatorios, RFC
/// con «Consultar RFC» (`ventas/clientes/fiscal-lookup`, que rellena razón
/// social, CP y régimen), régimen, dirección y CP fiscales, correo de
/// facturación, teléfono y notas; abajo, «Crear cliente».
struct ClienteNuevoView: View {
    var presetSector: ClientSector?
    var onCreated: (Int) -> Void

    @EnvironmentObject var session: SessionStore
    @Environment(\.dismiss) private var dismiss

    @State private var sectors: [ClientSector] = []
    @State private var name = ""
    @State private var legalName = ""
    @State private var taxId = ""
    @State private var fiscalRegime = ""
    @State private var fiscalAddress = ""
    @State private var fiscalZipCode = ""
    @State private var billingEmail = ""
    @State private var billingPhone = ""
    @State private var notes = ""
    @State private var lookingUp = false
    @State private var lookupMessage: String?
    @State private var saving = false
    @State private var error: String?
    @State private var seeded = false

    private var allowed: [ClientSector] { ClientSector.sectors(for: session.currentUser?.email) }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 10) {
                VStack(alignment: .leading, spacing: 6) {
                    Text("Sectores")
                        .font(.system(size: 16, weight: .semibold))
                        .foregroundStyle(NxColors.fg)
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: NxSpacing.s) {
                            ForEach(allowed) { s in
                                NxFiltroChipM3(
                                    label: s.padronEtiqueta,
                                    systemImage: s.padronSimbolo,
                                    selected: sectors.contains(s)
                                ) {
                                    if let i = sectors.firstIndex(of: s) {
                                        sectors.remove(at: i)
                                    } else {
                                        sectors.append(s)
                                    }
                                }
                            }
                        }
                    }
                }

                campo("Nombre comercial *", $name, contentType: .organizationName)
                campo("Razón social *", $legalName)
                VStack(alignment: .leading, spacing: 6) {
                    campo("RFC", $taxId, capitalization: .characters, autocorrect: false)
                        .onChange(of: taxId) { _, value in
                            let upper = value.uppercased()
                            if upper != value { taxId = upper }
                        }
                    HStack(alignment: .center, spacing: NxSpacing.s) {
                        NxBotonContorno(title: lookingUp ? "Consultando…" : "Consultar RFC", enabled: !lookingUp) {
                            Task { await lookupRfc() }
                        }
                        if let lookupMessage {
                            Text(lookupMessage)
                                .font(NxType.bodySmall)
                                .foregroundStyle(NxColors.fg)
                                .fixedSize(horizontal: false, vertical: true)
                        }
                    }
                }
                campo("Régimen fiscal", $fiscalRegime)
                campo("Dirección fiscal", $fiscalAddress, contentType: .fullStreetAddress)
                campo("CP fiscal", $fiscalZipCode, keyboard: .numberPad, contentType: .postalCode)
                campo("Email de facturación", $billingEmail, keyboard: .emailAddress,
                      capitalization: .never, autocorrect: false, contentType: .emailAddress)
                campo("Teléfono", $billingPhone, keyboard: .phonePad, contentType: .telephoneNumber)
                NxOutlinedCampo(
                    label: "Notas",
                    text: $notes,
                    multiline: true,
                    minLines: 2,
                    fondoEtiqueta: NxColors.surface
                )

                if let error {
                    NxErrorBlock(message: error)
                }

                NxBotonPildora(title: saving ? "Guardando…" : "Crear cliente", enabled: !saving) {
                    Task { await save() }
                }

                Spacer().frame(height: NxSpacing.l)
            }
            .padding(NxSpacing.l)
        }
        .nxScreenBackground()
        .scrollDismissesKeyboard(.interactively)
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

    /// Campo con contorno sobre el fondo de pantalla (#F8FAFC), como en Android.
    private func campo(
        _ label: String,
        _ text: Binding<String>,
        keyboard: UIKeyboardType = .default,
        capitalization: TextInputAutocapitalization = .sentences,
        autocorrect: Bool = true,
        contentType: UITextContentType? = nil
    ) -> NxOutlinedCampo {
        NxOutlinedCampo(
            label: label,
            text: text,
            keyboard: keyboard,
            capitalization: capitalization,
            autocorrect: autocorrect,
            contentType: contentType,
            fondoEtiqueta: NxColors.surface
        )
    }

    /// `lookupRfc` de Android: solo pisa lo que el SAT sí devolvió.
    private func lookupRfc() async {
        let rfc = taxId.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !rfc.isEmpty else {
            lookupMessage = "Escribe el RFC primero"
            return
        }
        lookingUp = true
        lookupMessage = nil
        defer { lookingUp = false }
        do {
            let result = try await ClientesRepository.shared.fiscalLookup(rfc: rfc)
            if let legal = result.legalName?.trimmingCharacters(in: .whitespaces), !legal.isEmpty {
                legalName = legal
            }
            if let zip = result.fiscalZipCode?.trimmingCharacters(in: .whitespaces), !zip.isEmpty {
                fiscalZipCode = zip
            }
            if let suggested = result.suggestedRegime?.trimmingCharacters(in: .whitespaces), !suggested.isEmpty {
                fiscalRegime = suggested
            }
            if let msg = result.message?.trimmingCharacters(in: .whitespaces), !msg.isEmpty {
                lookupMessage = msg
            } else {
                lookupMessage = result.validation?.valid == true ? "RFC válido" : "RFC no reconocido"
            }
        } catch {
            lookupMessage = error.toUserMessage(fallback: "No se pudo consultar el RFC")
        }
    }

    private func save() async {
        guard !sectors.isEmpty else {
            error = "Elige al menos un sector"
            return
        }
        let t = { (s: String) in s.trimmingCharacters(in: .whitespacesAndNewlines) }
        guard !t(name).isEmpty, !t(legalName).isEmpty else {
            error = "Nombre comercial y razón social son obligatorios"
            return
        }
        // La web valida el teléfono; Android no. Se conserva la regla de la web.
        let phoneDigits = billingPhone.filter(\.isNumber).count
        if !t(billingPhone).isEmpty && !(10...15).contains(phoneDigits) {
            error = "El teléfono debe tener entre 10 y 15 dígitos."
            return
        }
        saving = true
        error = nil
        defer { saving = false }
        let vacioANil = { (s: String) -> String? in
            let v = t(s)
            return v.isEmpty ? nil : v
        }
        let body = CoreSalesClientCreateBody(
            name: t(name),
            legalName: vacioANil(legalName),
            taxId: vacioANil(taxId.uppercased()),
            fiscalAddress: vacioANil(fiscalAddress),
            fiscalZipCode: vacioANil(fiscalZipCode),
            fiscalRegime: vacioANil(fiscalRegime),
            billingEmail: vacioANil(billingEmail),
            billingPhone: vacioANil(billingPhone),
            notes: vacioANil(notes),
            sectors: sectors.map(\.rawValue)
        )
        do {
            if let created = try await ClientesRepository.shared.create(body) {
                onCreated(created.id)
            } else {
                // Sin red: quedó en la cola y se manda al volver la señal.
                dismiss()
            }
        } catch {
            self.error = error.toUserMessage(fallback: "No se pudo crear el cliente")
        }
    }
}
