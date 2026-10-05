import SwiftUI
import PhotosUI
import UIKit

// Pantallas del portal de clientes y sucursales — Perfil y Sucursales.
// Solicitudes, Tickets, Calificación e Inventarios viven en sus propios
// archivos (`PortalRequestsView`, `PortalTicketsView`, `PortalFeedbackView`,
// `PortalInventoriesView`). Todas copian a Android `ui/tickets/screens/*`:
// misma estructura de arriba abajo, mismos textos y mismos endpoints.

// MARK: - Mi perfil (Android `TicketsProfileScreen`)

@MainActor
final class PortalProfileVM: ObservableObject {
    @Published var isLoading = true
    @Published var saving = false
    @Published var error: String?
    @Published var message: String?
    @Published var profile: PortalClientProfile?
    @Published var contactName = ""
    @Published var contactEmail = ""
    @Published var contactPhone = ""
    @Published var address = ""
    @Published var city = ""
    @Published var state = ""
    @Published var country = ""

    private var started = false

    /// Solo la cuenta cliente edita (Android `profile?.kind == CLIENT`); la
    /// sucursal ve su perfil en solo lectura y sin botón de guardar.
    var editable: Bool { profile?.isBranch == false }

    func start() {
        guard !started else { return }
        started = true
        Task { await refresh(initial: true) }
    }

    func refresh(initial: Bool) async {
        if initial { isLoading = true }
        error = nil
        message = nil
        do {
            let loaded = try await TicketsRepository.shared.portalProfile()
            profile = loaded
            contactName = loaded?.contactName ?? ""
            contactEmail = loaded?.contactEmail ?? ""
            contactPhone = loaded?.contactPhone ?? ""
            address = loaded?.address ?? ""
            city = loaded?.city ?? ""
            state = loaded?.state ?? ""
            country = loaded?.country ?? ""
        } catch {
            self.error = error.toUserMessage(fallback: "No se pudo cargar el perfil")
        }
        isLoading = false
    }

    func save() {
        if profile?.isBranch == true {
            message = "Perfil de sucursal: solo lectura"
            return
        }
        guard !saving else { return }
        saving = true
        error = nil
        message = nil
        Task {
            do {
                let raw = try await TicketsRepository.shared.updateProfile(
                    contactName: contactName,
                    contactEmail: contactEmail,
                    contactPhone: contactPhone,
                    address: address,
                    city: city,
                    state: state,
                    country: country
                )
                profile = PortalClientProfile(raw: raw, isBranch: false)
                message = "Perfil actualizado"
            } catch {
                self.error = error.toUserMessage(fallback: "No se pudo guardar")
            }
            saving = false
        }
    }
}

/// Perfil del portal (Android `TicketsProfileScreen`): título, tarjeta
/// «Contacto», tarjeta «Dirección» y «Guardar cambios». La sucursal lo ve
/// deshabilitado y sin botón.
struct PortalProfileView: View {
    @StateObject private var vm = PortalProfileVM()

    init() {}

    var body: some View {
        Group {
            if vm.isLoading {
                PortalSkeletonScreen(itemCount: 3, itemHeight: 160, vertical: NxSpacing.l)
            } else {
                ScrollView {
                    form
                        .padding(.horizontal, NxSpacing.screenH)
                }
                .refreshable { await vm.refresh(initial: false) }
            }
        }
        .nxScreenBackground()
        .onAppear { vm.start() }
    }

    private var form: some View {
        VStack(alignment: .leading, spacing: 0) {
            PortalScreenTitle(
                title: "Perfil del portal",
                subtitle: vm.editable ? "Actualiza datos de contacto y dirección" : "Perfil de sucursal (solo lectura)"
            )
            PortalGap(12)

            if let error = vm.error {
                if vm.profile == nil {
                    NxErrorBlock(message: error, onRetry: { Task { await vm.refresh(initial: true) } })
                } else {
                    NxRefreshErrorBanner(message: error, onRetry: { Task { await vm.refresh(initial: false) } })
                }
                PortalGap(10)
            }

            if let message = vm.message {
                PortalSuccessBanner(message: message) { vm.message = nil }
                PortalGap(10)
            }

            NxPanelShell(padding: 14) {
                PortalPanelTitle(text: "Contacto")
                PortalOutlinedField(
                    label: "Nombre de contacto",
                    text: $vm.contactName,
                    enabled: vm.editable,
                    capitalization: .words
                )
                PortalGap(8)
                PortalOutlinedField(
                    label: "Correo electrónico",
                    text: $vm.contactEmail,
                    enabled: vm.editable,
                    keyboard: .emailAddress,
                    capitalization: .never
                )
                PortalGap(8)
                PortalOutlinedField(
                    label: "Teléfono",
                    text: $vm.contactPhone,
                    enabled: vm.editable,
                    keyboard: .phonePad,
                    capitalization: .never
                )
            }

            PortalGap(12)

            NxPanelShell(padding: 14) {
                PortalPanelTitle(text: "Dirección")
                PortalOutlinedField(label: "Dirección", text: $vm.address, enabled: vm.editable, multiline: true)
                PortalGap(8)
                PortalOutlinedField(label: "Ciudad", text: $vm.city, enabled: vm.editable, capitalization: .words)
                PortalGap(8)
                PortalOutlinedField(label: "Estado", text: $vm.state, enabled: vm.editable, capitalization: .words)
                PortalGap(8)
                PortalOutlinedField(label: "País", text: $vm.country, enabled: vm.editable, capitalization: .words)
            }

            PortalGap(14)
            if vm.editable {
                NxPrimaryButton(
                    vm.saving ? "Guardando…" : "Guardar cambios",
                    loading: vm.saving,
                    enabled: !vm.saving
                ) { vm.save() }
            }
            PortalGap(16)
        }
    }
}

// MARK: - Mis sucursales (Android `TicketsBranchesScreen`)

@MainActor
final class PortalBranchesVM: ObservableObject {
    @Published var isLoading = true
    @Published var refreshingVisible = false
    @Published var error: String?
    @Published var branches: [PortalBranch] = []

    private var started = false

    func onAppear() {
        if !started {
            started = true
            Task { await refresh(.initial) }
        } else {
            // Al volver de «Nueva sucursal» o «Editar»: la lista trae lo guardado.
            Task { await refresh(.silent) }
        }
    }

    func refresh(_ mode: PortalLoad) async {
        switch mode {
        case .initial: isLoading = true
        case .visible: refreshingVisible = true
        case .pull, .silent: break
        }
        error = nil
        do {
            branches = try await TicketsRepository.shared.portalBranches()
        } catch {
            self.error = error.toUserMessage(fallback: "No se pudieron cargar sucursales")
        }
        isLoading = false
        refreshingVisible = false
    }
}

/// Sucursales del cliente (Android `TicketsBranchesScreen`): «Nueva sucursal»
/// arriba, título, y una tarjeta por sucursal con su estatus, sus datos y
/// «Editar». Solo la ve la cuenta cliente (el inicio no la ofrece a sucursales).
struct PortalBranchesView: View {
    let onCreate: () -> Void
    let onEdit: (Int64) -> Void
    @StateObject private var vm = PortalBranchesVM()

    init(onCreate: @escaping () -> Void, onEdit: @escaping (Int64) -> Void) {
        self.onCreate = onCreate
        self.onEdit = onEdit
    }

    var body: some View {
        VStack(spacing: 0) {
            NxPrimaryButton("Nueva sucursal", systemImage: "plus", action: onCreate)
                .padding(NxSpacing.l)
            if vm.isLoading {
                PortalSkeletonScreen(vertical: 0)
            } else {
                ScrollView {
                    LazyVStack(alignment: .leading, spacing: NxSpacing.listGap) {
                        list
                    }
                    .padding(.horizontal, NxSpacing.screenH)
                }
                .refreshable { await vm.refresh(.pull) }
                .overlay(alignment: .top) { PortalRefreshIndicator(visible: vm.refreshingVisible) }
            }
        }
        .nxScreenBackground()
        .onAppear { vm.onAppear() }
        .refreshOnModels(["ServiceClientBranch", "ServiceClient"]) { await vm.refresh(.visible) }
    }

    @ViewBuilder
    private var list: some View {
        PortalScreenTitle(title: "Mis sucursales", subtitle: "Administra ubicaciones y accesos del portal")
        if let error = vm.error {
            NxErrorBlock(message: error, onRetry: { Task { await vm.refresh(.initial) } })
        }
        if vm.branches.isEmpty && vm.error == nil {
            NxEmptyState(
                title: "Sin sucursales",
                subtitle: "Registra tu primera sucursal para habilitar el portal por ubicación.",
                actionLabel: "+ Nueva sucursal",
                onAction: onCreate
            )
        } else {
            ForEach(vm.branches) { branch in
                branchCard(branch)
            }
        }
        PortalGap(8)
    }

    private func branchCard(_ b: PortalBranch) -> some View {
        NxPanelShell(padding: 12) {
            HStack(alignment: .top, spacing: NxSpacing.s) {
                Text(b.name)
                    .font(NxType.titleMedium)
                    .foregroundStyle(NxColors.fg)
                    .frame(maxWidth: .infinity, alignment: .leading)
                // Sin dato de `isActive` no se pinta el chip (Android `Boolean?`).
                if let active = b.isActiveValue {
                    NxStatusChip(text: active ? "Activa" : "Inactiva", tone: active ? .success : .neutral)
                }
            }
            let meta = Self.meta(b)
            if !meta.isEmpty {
                Text(meta)
                    .font(NxType.bodySmall)
                    .foregroundStyle(NxColors.muted)
                    .fixedSize(horizontal: false, vertical: true)
            }
            PortalGap(4)
            Button("Editar") { onEdit(b.id) }
                .buttonStyle(PortalButtons.outlined)
        }
    }

    /// «Sucursal: 014 · Puebla, Puebla · Av. Juárez 120» (Android `meta`).
    private static func meta(_ b: PortalBranch) -> String {
        var parts: [String] = []
        let number = b.branchNumber.trimmingCharacters(in: .whitespacesAndNewlines)
        if !number.isEmpty { parts.append("Sucursal: \(number)") }
        let city = b.city.trimmingCharacters(in: .whitespacesAndNewlines)
        if !city.isEmpty {
            let state = b.state.trimmingCharacters(in: .whitespacesAndNewlines)
            parts.append(state.isEmpty ? city : "\(city), \(state)")
        }
        let address = b.address.trimmingCharacters(in: .whitespacesAndNewlines)
        if !address.isEmpty { parts.append(address) }
        return parts.joined(separator: " · ")
    }
}

// MARK: - Nueva / editar sucursal (Android `TicketsBranchEditScreen`)

@MainActor
final class PortalBranchEditVM: ObservableObject {
    @Published var isLoading = true
    @Published var saving = false
    @Published var error: String?
    @Published var message: String?
    @Published var branch: PortalBranch?
    @Published var name = ""
    @Published var branchNumber = ""
    @Published var portalEmail = ""
    @Published var portalPassword = ""
    @Published var address = ""
    @Published var city = ""
    @Published var state = ""
    @Published var country = ""
    @Published var latitud = ""
    @Published var longitud = ""
    @Published var isActive = true
    @Published var logo: PortalPickedImage?
    @Published var logoPreview: UIImage?
    /// Id de la sucursal que se edita: la de la ruta o la que se acaba de crear.
    @Published private(set) var branchId: Int64? = nil

    /// Se abrió como «Nueva sucursal» (título de la pantalla, como Android).
    let isNew: Bool
    /// Place ID de Google: Android no lo enseña, pero lo devuelve tal cual al guardar.
    private var placeId = ""
    private var started = false

    init(branchId: Int64?) {
        self.isNew = branchId == nil
        self.branchId = branchId
    }

    func start() {
        guard !started else { return }
        started = true
        Task { await load(initial: true) }
    }

    func load(initial: Bool) async {
        if initial { isLoading = true }
        error = nil
        message = nil
        guard let id = branchId else {
            isLoading = false
            return
        }
        do {
            let list = try await TicketsRepository.shared.portalBranches()
            if let found = list.first(where: { $0.id == id }) {
                apply(found)
            } else {
                branch = nil
                error = "Sucursal no encontrada"
            }
        } catch {
            self.error = error.toUserMessage(fallback: "No se pudo cargar la sucursal")
        }
        isLoading = false
    }

    private func apply(_ b: PortalBranch) {
        branch = b
        name = b.name
        branchNumber = b.branchNumber
        portalEmail = b.portalEmail
        portalPassword = ""
        address = b.address
        city = b.city
        state = b.state
        country = b.country
        placeId = b.placeId
        latitud = b.latitud.map { String($0) } ?? ""
        longitud = b.longitud.map { String($0) } ?? ""
        isActive = b.isActiveValue ?? true
    }

    func setLogo(_ picked: PortalPickedImage?) {
        logo = picked
        logoPreview = picked.flatMap { UIImage(data: $0.data) }
    }

    func save() {
        guard !saving else { return }
        saving = true
        error = nil
        message = nil
        let lat = Double(latitud.trimmingCharacters(in: .whitespacesAndNewlines))
        let lng = Double(longitud.trimmingCharacters(in: .whitespacesAndNewlines))
        let picked = logo
        let logoName = picked.map { "logo.\($0.fileExtension)" }
        let logoMime = picked?.mimeType ?? "image/jpeg"
        let editingId = branchId
        Task {
            do {
                let raw: [String: Any]
                if let id = editingId {
                    raw = try await TicketsRepository.shared.updateBranch(
                        id: id,
                        name: name,
                        branchNumber: branchNumber,
                        portalEmail: portalEmail,
                        portalPassword: portalPassword.isEmpty ? nil : portalPassword,
                        address: address,
                        city: city,
                        state: state,
                        country: country,
                        placeId: placeId,
                        latitud: lat,
                        longitud: lng,
                        isActive: isActive,
                        logoData: picked?.data,
                        logoFileName: logoName,
                        logoMimeType: logoMime
                    )
                } else {
                    raw = try await TicketsRepository.shared.createBranch(
                        name: name,
                        branchNumber: branchNumber,
                        portalEmail: portalEmail,
                        portalPassword: portalPassword,
                        address: address,
                        city: city,
                        state: state,
                        country: country,
                        placeId: placeId,
                        latitud: lat,
                        longitud: lng,
                        isActive: isActive,
                        logoData: picked?.data,
                        logoFileName: logoName,
                        logoMimeType: logoMime
                    )
                }
                let saved = PortalBranch(raw: raw)
                branch = saved
                // Android se queda en la pantalla con el id de la ruta (`null`):
                // un segundo «Guardar» creaba OTRA sucursal. Aquí, ya creada, los
                // siguientes guardados la actualizan.
                if saved.id > 0 { branchId = saved.id }
                setLogo(nil)
                message = editingId == nil ? "Sucursal creada" : "Sucursal actualizada"
            } catch {
                self.error = error.toUserMessage(fallback: "No se pudo guardar")
            }
            saving = false
        }
    }
}

/// Alta y edición de sucursal (Android `TicketsBranchEditScreen`): «Guardar
/// sucursal» arriba, y tarjetas «Datos generales», «Dirección (opcional)»,
/// «Coordenadas (opcional)» y «Logo».
struct PortalBranchEditView: View {
    @StateObject private var vm: PortalBranchEditVM
    @State private var logoItem: PhotosPickerItem?

    init(branchId: Int64?) {
        _vm = StateObject(wrappedValue: PortalBranchEditVM(branchId: branchId))
    }

    var body: some View {
        VStack(spacing: 0) {
            NxPrimaryButton(
                vm.saving ? "Guardando…" : "Guardar sucursal",
                loading: vm.saving,
                enabled: !vm.saving
            ) { vm.save() }
            .padding(NxSpacing.l)

            if vm.isLoading {
                PortalSkeletonScreen(itemCount: 4, itemHeight: 96, vertical: 0)
            } else {
                ScrollView {
                    form
                        .padding(.horizontal, NxSpacing.screenH)
                }
                .refreshable { await vm.load(initial: false) }
            }
        }
        .nxScreenBackground()
        .onAppear { vm.start() }
        .onChange(of: logoItem) { _, item in
            guard let item else { return }
            Task {
                if let picked = await PortalPickedImage.load(item) {
                    vm.setLogo(picked)
                }
                logoItem = nil
            }
        }
    }

    private var form: some View {
        VStack(alignment: .leading, spacing: 0) {
            PortalScreenTitle(
                title: vm.isNew ? "Nueva sucursal" : "Editar sucursal",
                subtitle: "Datos de acceso, ubicación y logo del portal"
            )
            PortalGap(12)

            if let message = vm.message {
                PortalNoticePanel(message: message, closeLabel: "Cerrar") { vm.message = nil }
                PortalGap(10)
            }

            if let error = vm.error {
                NxErrorBlock(message: error, onRetry: { Task { await vm.load(initial: true) } })
                PortalGap(10)
            }

            NxPanelShell(padding: 14) {
                PortalPanelTitle(text: "Datos generales")
                PortalOutlinedField(label: "Nombre *", text: $vm.name)
                PortalGap(8)
                PortalOutlinedField(label: "Número de sucursal *", text: $vm.branchNumber, capitalization: .never)
                PortalGap(8)
                PortalOutlinedField(
                    label: "Usuario (email) *",
                    text: $vm.portalEmail,
                    keyboard: .emailAddress,
                    capitalization: .never
                )
                PortalGap(8)
                // Android lo deja a la vista: es la contraseña que el cliente le
                // asigna a su sucursal y tiene que poder leerla.
                PortalOutlinedField(
                    label: vm.branchId == nil ? "Password *" : "Password (opcional)",
                    text: $vm.portalPassword,
                    keyboard: .asciiCapable,
                    capitalization: .never
                )
                PortalGap(10)
                HStack(alignment: .center, spacing: NxSpacing.s) {
                    Text("Estatus")
                        .font(NxType.labelMedium)
                        .foregroundStyle(NxColors.fg)
                        .frame(maxWidth: .infinity, alignment: .leading)
                    NxStatusChip(
                        text: vm.isActive ? "Activa" : "Inactiva",
                        tone: vm.isActive ? .success : .neutral
                    )
                }
                PortalPillButton(
                    title: vm.isActive ? "Cambiar a inactiva" : "Cambiar a activa",
                    filled: false
                ) { vm.isActive.toggle() }
            }

            PortalGap(12)

            NxPanelShell(padding: 14) {
                PortalPanelTitle(text: "Dirección (opcional)")
                PortalOutlinedField(label: "Dirección", text: $vm.address, multiline: true)
                PortalGap(8)
                PortalOutlinedField(label: "Ciudad", text: $vm.city, capitalization: .words)
                PortalGap(8)
                PortalOutlinedField(label: "Estado", text: $vm.state, capitalization: .words)
                PortalGap(8)
                PortalOutlinedField(label: "País", text: $vm.country, capitalization: .words)
            }

            PortalGap(12)

            NxPanelShell(padding: 14) {
                PortalPanelTitle(text: "Coordenadas (opcional)")
                // Teclado con signo: en México la longitud es negativa y el
                // teclado decimal de antes no dejaba escribir el «-».
                HStack(alignment: .top, spacing: NxSpacing.s) {
                    PortalOutlinedField(
                        label: "Latitud",
                        text: $vm.latitud,
                        keyboard: .numbersAndPunctuation,
                        capitalization: .never
                    )
                    PortalOutlinedField(
                        label: "Longitud",
                        text: $vm.longitud,
                        keyboard: .numbersAndPunctuation,
                        capitalization: .never
                    )
                }
            }

            PortalGap(12)

            NxPanelShell(padding: 14) {
                PortalPanelTitle(text: "Logo")
                if let preview = vm.logoPreview {
                    Image(uiImage: preview)
                        .resizable()
                        .scaledToFit()
                        .frame(maxWidth: .infinity)
                        .frame(height: 120)
                        .accessibilityLabel("Logo sucursal")
                    PortalGap(8)
                } else if let url = vm.branch?.logoUrl, !url.isEmpty {
                    AuthenticatedImage(url: url, contentMode: .fit, background: .clear)
                        .frame(maxWidth: .infinity)
                        .frame(height: 120)
                        .accessibilityLabel("Logo sucursal")
                    PortalGap(8)
                }
                HStack(spacing: NxSpacing.s) {
                    PhotosPicker(selection: $logoItem, matching: .images) {
                        PortalOutlinedPillLabel(text: "Elegir imagen")
                    }
                    .buttonStyle(.plain)
                    PortalPillButton(title: "Quitar", filled: false, enabled: vm.logo != nil) {
                        vm.setLogo(nil)
                    }
                }
            }

            PortalGap(16)
        }
    }
}
