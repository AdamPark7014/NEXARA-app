import SwiftUI

/// Perfil INTEGRA: vínculo ERP↔ACS y credenciales del espejo.
/// No edita datos personales (eso es console/my-profile).
struct IntegraMyProfileView: View {
    @State private var identity: IntegraIdentitySnapshot?
    @State private var credentials: [IntegraCredentialRow] = []
    @State private var isLoading = true
    @State private var errorText: String?
    @State private var personError: String?

    var body: some View {
        Group {
            if isLoading {
                ProgressView("Cargando perfil ACS…")
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if let errorText, identity == nil {
                VStack(spacing: 12) {
                    Text(errorText).foregroundStyle(.secondary)
                    Button("Reintentar") { Task { await reload() } }
                }
            } else {
                List {
                    Section("Identidad") {
                        Text(identity?.displayName ?? "Sin nombre")
                            .font(.headline)
                        if let email = identity?.email {
                            Text(email).foregroundStyle(.secondary)
                        }
                        if let pid = identity?.acsPersonId {
                            Text("ACS personId: \(pid)")
                                .font(.caption.monospaced())
                        } else {
                            Text("Sin vínculo ACS en identity/me.")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                    }
                    Section {
                        Text(
                            "Responde a «¿qué abre mi rostro/tarjeta y por qué?». "
                                + "Edición de datos personales: consola / mi perfil."
                        )
                        .font(.caption)
                        .foregroundStyle(.secondary)
                    }
                    if let personError {
                        Section {
                            Text(personError).foregroundStyle(NxTone.warning.fg)
                        }
                    }
                    Section("Credenciales del espejo") {
                        if credentials.isEmpty {
                            Text("Sin face / tarjeta / huella en el espejo.")
                                .foregroundStyle(.secondary)
                        } else {
                            ForEach(credentials) { c in
                                HStack {
                                    VStack(alignment: .leading, spacing: 2) {
                                        Text(c.label).font(.subheadline.weight(.semibold))
                                        Text(c.kind).font(.caption).foregroundStyle(.secondary)
                                    }
                                    Spacer()
                                    NxStatusChip(text: c.status, tone: .info)
                                }
                            }
                        }
                    }
                }
            }
        }
        .navigationTitle("Mi perfil")
        .task { await reload() }
        .refreshable { await reload() }
    }

    private func reload() async {
        isLoading = true
        errorText = nil
        personError = nil
        defer { isLoading = false }
        do {
            let me = try await IntegraGovernanceRepository.shared.identityMe()
            let acs = IntegraJSON.asMap(me["acsPerson"])
            let snap = IntegraIdentitySnapshot(
                displayName: me.integraStr("name", "displayName"),
                email: me.integraStr("email"),
                acsPersonId: acs?.integraStr("personId", "id"),
                acsSiteId: acs?.integraInt("siteId")
            )
            identity = snap
            guard let personId = snap.acsPersonId, !personId.isEmpty else {
                credentials = []
                return
            }
            do {
                let detail = try await IntegraGovernanceRepository.shared.personDetail(personId: personId)
                var out: [IntegraCredentialRow] = []
                if let face = detail.integraInt("faceCount"), face > 0 {
                    out.append(.init(id: "face", kind: "Rostro", label: "\(face) face(s)", status: "En espejo"))
                }
                if let fp = detail.integraInt("fingerprintCount"), fp > 0 {
                    out.append(.init(id: "fp", kind: "Huella", label: "\(fp) FP", status: "En espejo"))
                }
                if let card = detail.integraInt("cardCount"), card > 0 {
                    out.append(.init(id: "card", kind: "Tarjeta", label: "\(card) card(s)", status: "En espejo"))
                }
                credentials = out
            } catch {
                personError = error.localizedDescription
                credentials = []
            }
        } catch {
            errorText = error.localizedDescription
        }
    }
}
