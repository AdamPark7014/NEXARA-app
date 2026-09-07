import PhotosUI
import SwiftUI
import UniformTypeIdentifiers

/// JPEG/PNG/HEIC desde PhotosPicker — `Data` no es `Transferable` en iOS 16.
private struct IntegraFaceImage: Transferable {
    let data: Data

    static var transferRepresentation: some TransferRepresentation {
        DataRepresentation(importedContentType: .image) { data in
            IntegraFaceImage(data: data)
        }
    }
}

/// Ficha ACS — editar, rostro y baja. Paridad `IntegraPersonDetailScreen`.
/// La baja forzada es un checkbox explícito; nunca se manda `force=true` en silencio.
struct IntegraPersonDetailView: View {
    let personId: String
    var onDeleted: (() -> Void)? = nil

    @StateObject private var vm: IntegraPersonDetailVM
    @State private var facePicker: PhotosPickerItem?
    @State private var showDeleteConfirm = false
    @State private var showRemoveFaceConfirm = false

    init(personId: String, onDeleted: (() -> Void)? = nil) {
        self.personId = personId
        self.onDeleted = onDeleted
        _vm = StateObject(wrappedValue: IntegraPersonDetailVM(personId: personId))
    }

    var body: some View {
        Group {
            if vm.loading && vm.person == nil {
                ProgressView("Cargando ficha…")
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if let error = vm.error, vm.person == nil {
                NxEmptyState(title: "No se pudo cargar", subtitle: error, actionLabel: "Reintentar") {
                    Task { await vm.refresh() }
                }
            } else if let person = vm.person {
                formBody(person)
            }
        }
        .navigationTitle(vm.displayName)
        .navigationBarTitleDisplayMode(.inline)
        .task { await vm.refresh() }
        .onChange(of: facePicker) { _, item in
            guard let item else { return }
            Task { await vm.uploadFace(from: item); facePicker = nil }
        }
        .alert("Quitar el rostro", isPresented: $showRemoveFaceConfirm) {
            Button("Cancelar", role: .cancel) {}
            Button("Quitar rostro", role: .destructive) {
                Task { await vm.removeFace() }
            }
        } message: {
            Text("Se borra el modelo facial de \(vm.displayName) en los terminales y el JPEG en NEXARA. Dejará de abrir mirando al lector.")
        }
        .confirmationDialog(
            "Eliminar a \(vm.displayName)",
            isPresented: $showDeleteConfirm,
            titleVisibility: .visible
        ) {
            Button(vm.forceDelete ? "Eliminar (forzado)" : "Eliminar", role: .destructive) {
                Task {
                    if await vm.deletePerson() {
                        onDeleted?()
                    }
                }
            }
            Button("Cancelar", role: .cancel) {}
        } message: {
            Text(vm.forceDelete
                ? "FORZADO: sale del espejo aunque algún terminal no conteste. No se puede deshacer."
                : "Se borra de todos los terminales. Si algún equipo falla, se conserva en NEXARA; entonces marca «Forzar baja» e insiste. No se puede deshacer.")
        }
    }

    @ViewBuilder
    private func formBody(_ person: [String: Any]) -> some View {
        Form {
            if let message = vm.message {
                Section {
                    NxAlertBanner(alert: NxAlert(
                        id: "msg",
                        title: message,
                        tone: vm.messageIsError ? .danger : .success
                    ))
                }
            }

            Section {
                NxSectionHeader(title: "Identidad", subtitle: "Ficha en el control de acceso")
                LabeledContent("ID ACS", value: personId)
                LabeledContent("Código", value: IntegraDict.str(person, "code", "personCode").nilIfEmpty ?? "—")
                LabeledContent("Tipo", value: IntegraDict.str(person, "userType").nilIfEmpty ?? "—")
                LabeledContent("Género", value: IntegraDict.str(person, "gender").nilIfEmpty ?? "—")
            }

            Section {
                NxSectionHeader(title: "Credenciales", subtitle: "Con qué se identifica en el lector")
                let faces = IntegraDict.int(person, "numOfFace")
                let cards = IntegraDict.int(person, "numOfCard")
                let fps = IntegraDict.int(person, "numOfFP")
                LabeledContent("Rostros", value: "\(faces)")
                LabeledContent("Tarjetas", value: "\(cards)")
                LabeledContent("Huellas", value: "\(fps)")
                PhotosPicker(selection: $facePicker, matching: .images) {
                    Label(vm.acting ? "Subiendo…" : "Subir / reemplazar rostro", systemImage: "faceid")
                }
                .disabled(vm.acting)
                if faces > 0 || IntegraDict.bool(person, "hasFace", "hasLocalFace") == true {
                    Button("Quitar rostro", role: .destructive) {
                        showRemoveFaceConfirm = true
                    }
                    .disabled(vm.acting)
                }
            }

            Section {
                NxSectionHeader(title: "Editar ficha", subtitle: "Se escribe en los terminales del sitio")
                TextField("Nombre", text: $vm.editName)
                    .disabled(vm.acting)
                Picker("Tipo", selection: $vm.editUserType) {
                    Text("Sin cambiar").tag("")
                    Text("Normal").tag("normal")
                    Text("Visitante").tag("visitor")
                    Text("Lista negra").tag("blackList")
                }
                .disabled(vm.acting)
                Picker("Género", selection: $vm.editGender) {
                    Text("Sin cambiar").tag("")
                    Text("Masculino").tag("male")
                    Text("Femenino").tag("female")
                    Text("Desconocido").tag("unknown")
                }
                .disabled(vm.acting)
                Toggle("Vigencia activa", isOn: $vm.editValidEnable)
                    .disabled(vm.acting)
                Button {
                    Task { await vm.save() }
                } label: {
                    if vm.acting { ProgressView() } else { Text("Guardar cambios") }
                }
                .disabled(vm.acting || vm.editName.trimmingCharacters(in: .whitespacesAndNewlines).count < 2)
            }

            Section {
                NxSectionHeader(title: "Baja", subtitle: "Acción irreversible en terminales")
                Toggle(isOn: $vm.forceDelete) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text("Forzar baja")
                        Text("Solo si algún terminal no contestó en un intento previo.")
                            .font(.caption2)
                            .foregroundColor(.secondary)
                    }
                }
                .disabled(vm.acting)
                Button(role: .destructive) {
                    showDeleteConfirm = true
                } label: {
                    Text(vm.forceDelete ? "Eliminar persona (forzado)" : "Eliminar persona")
                }
                .disabled(vm.acting)
            }
        }
    }
}

@MainActor
final class IntegraPersonDetailVM: ObservableObject {
    let personId: String
    @Published var person: [String: Any]?
    @Published var loading = true
    @Published var acting = false
    @Published var error: String?
    @Published var message: String?
    @Published var messageIsError = false
    @Published var editName = ""
    @Published var editUserType = ""
    @Published var editGender = ""
    @Published var editValidEnable = true
    /// Checkbox explícito — nunca se envía force=true sin marcar esto.
    @Published var forceDelete = false

    private let repo = IntegraRepository.shared

    init(personId: String) {
        self.personId = personId
    }

    var displayName: String {
        guard let person else { return personId }
        return IntegraDict.str(person, "name", "personName").nilIfEmpty ?? personId
    }

    func refresh() async {
        loading = person == nil
        error = nil
        do {
            let data = try await repo.personDetail(personId: personId)
            person = data
            editName = IntegraDict.str(data, "name", "personName")
            editUserType = IntegraDict.str(data, "userType")
            editGender = IntegraDict.str(data, "gender")
            editValidEnable = IntegraDict.bool(data, "validEnable") != false
            loading = false
        } catch {
            loading = false
            self.error = error.localizedDescription
        }
    }

    func save() async {
        acting = true
        message = nil
        defer { acting = false }
        do {
            _ = try await repo.updatePerson(
                personId: personId,
                personName: editName,
                gender: editGender.nilIfEmpty,
                userType: editUserType.nilIfEmpty,
                validEnable: editValidEnable
            )
            message = "Ficha actualizada"
            messageIsError = false
            await refresh()
        } catch {
            message = error.localizedDescription
            messageIsError = true
        }
    }

    func uploadFace(from item: PhotosPickerItem) async {
        acting = true
        message = nil
        defer { acting = false }
        do {
            guard let payload = try await item.loadTransferable(type: IntegraFaceImage.self),
                  !payload.data.isEmpty else {
                message = "No se pudo leer la imagen."
                messageIsError = true
                return
            }
            let b64 = payload.data.base64EncodedString()
            _ = try await repo.uploadPersonFace(personId: personId, imageBase64: b64)
            message = "Rostro actualizado"
            messageIsError = false
            await refresh()
        } catch {
            message = error.localizedDescription
            messageIsError = true
        }
    }

    func removeFace() async {
        acting = true
        message = nil
        defer { acting = false }
        do {
            _ = try await repo.deletePersonFace(personId: personId)
            message = "Rostro eliminado"
            messageIsError = false
            await refresh()
        } catch {
            message = error.localizedDescription
            messageIsError = true
        }
    }

    func deletePerson() async -> Bool {
        acting = true
        message = nil
        defer { acting = false }
        do {
            _ = try await repo.deletePerson(personId: personId, force: forceDelete)
            return true
        } catch {
            message = error.localizedDescription
            messageIsError = true
            return false
        }
    }
}
