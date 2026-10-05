import SwiftUI
import PhotosUI
import UIKit

// MARK: - Piezas del portal de clientes y sucursales
//
// Lo que el portal necesita de Android (`ui/tickets/*`) y no está en la base
// visual de la fase A: el campo de contorno de Material (`OutlinedTextField`),
// el desplegable (`ExposedDropdownMenuBox`), la barra con «Cerrar sesión», el
// aviso inferior (`NxSnackbarHost`), las etiquetas de estatus de Android
// (`NxStatusLabels`) y las fechas en hora de México.

// MARK: - Barra superior

private struct PortalLogoutKey: EnvironmentKey {
    static let defaultValue: (() -> Void)? = nil
}

extension EnvironmentValues {
    /// Cierra la sesión del portal. Lo pone `PortalNavView`.
    var portalLogout: (() -> Void)? {
        get { self[PortalLogoutKey.self] }
        set { self[PortalLogoutKey.self] = newValue }
    }
}

/// Barra teal de Android `TicketsNavHost`: título 16 SemiBold blanco, flecha de
/// volver (la pone la pila) y, a la derecha, el icono de cerrar sesión en TODAS
/// las pantallas del portal. Sin campana: el portal no tiene notificaciones.
private struct PortalChromeModifier: ViewModifier {
    let title: String
    @Environment(\.portalLogout) private var logout

    func body(content: Content) -> some View {
        content
            .nxBrandNavBar(title: title, showsBell: false)
            .toolbar {
                if let logout {
                    ToolbarItem(placement: .topBarTrailing) {
                        Button(action: logout) {
                            Image(systemName: "rectangle.portrait.and.arrow.right")
                                .foregroundStyle(Color.white)
                        }
                        .tint(Color.white)
                        .accessibilityLabel("Cerrar sesión")
                    }
                }
            }
    }
}

extension View {
    /// Barra del portal con el título de Android y el botón de cerrar sesión.
    func portalChrome(_ title: String) -> some View {
        modifier(PortalChromeModifier(title: title))
    }

    /// Aviso oscuro abajo (Android `NxSnackbarHost`): se va solo a los 4 s.
    func portalSnackbar(_ message: Binding<String?>) -> some View {
        modifier(PortalSnackbarModifier(message: message))
    }
}

// MARK: - Aviso inferior

private struct PortalSnackbarModifier: ViewModifier {
    @Binding var message: String?

    func body(content: Content) -> some View {
        content
            .overlay(alignment: .bottom) {
                if let text = message {
                    Text(text)
                        .font(NxType.bodyMedium)
                        .foregroundStyle(Color.white)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(.horizontal, 16)
                        .padding(.vertical, 14)
                        .background(NxColors.fg, in: RoundedRectangle(cornerRadius: NxRadius.l, style: .continuous))
                        .padding(12)
                        .transition(.move(edge: .bottom).combined(with: .opacity))
                        .onTapGesture { message = nil }
                        .task(id: text) {
                            try? await Task.sleep(nanoseconds: 4_000_000_000)
                            guard !Task.isCancelled else { return }
                            if message == text { message = nil }
                        }
                        .accessibilityAddTraits(.isStaticText)
                }
            }
            .animation(.easeOut(duration: 0.2), value: message)
    }
}

// MARK: - Botones de Material 3

/// `Button` / `OutlinedButton` de Material 3 tal cual los usa el portal Android:
/// píldora de 40, letra 14 SemiBold.
enum PortalButtons {
    /// `Button`: relleno de marca, letra blanca.
    static let filled = NxPillButtonStyle(fill: NxColors.brand, foreground: .white)
    /// `OutlinedButton`: contorno #CBD5E1, letra de marca.
    static let outlined = NxPillButtonStyle(fill: .clear, foreground: NxColors.brand, border: NxColors.borderStrong)
}

// MARK: - Campo de contorno (Material `OutlinedTextField`)

/// `OutlinedTextField` de Android: 56 de alto, contorno #CBD5E1 de 1 (2 de marca
/// con foco, rojo con error), radio 6 (`shapes.extraSmall`), etiqueta que sube
/// al borde al escribir y texto de apoyo rojo debajo cuando hay error.
struct PortalOutlinedField: View {
    let label: String
    @Binding var text: String
    var enabled: Bool = true
    var error: String? = nil
    /// Líneas visibles mínimas; con 1 el campo es de una línea.
    var minLines: Int = 1
    /// Crece con el texto aunque empiece en una línea (Android sin `singleLine`).
    var multiline: Bool = false
    var keyboard: UIKeyboardType = .default
    var capitalization: TextInputAutocapitalization = .sentences
    var secure: Bool = false
    var radius: CGFloat = 6
    /// Color detrás de la etiqueta cuando sube al borde (el de la superficie).
    var labelBackground: Color = NxColors.card

    @FocusState private var focused: Bool

    /// Explícito: con un `@FocusState` privado el inicializador sintetizado no
    /// sería visible desde las pantallas, que viven en otros archivos.
    init(
        label: String,
        text: Binding<String>,
        enabled: Bool = true,
        error: String? = nil,
        minLines: Int = 1,
        multiline: Bool = false,
        keyboard: UIKeyboardType = .default,
        capitalization: TextInputAutocapitalization = .sentences,
        secure: Bool = false,
        radius: CGFloat = 6,
        labelBackground: Color = NxColors.card
    ) {
        self.label = label
        self._text = text
        self.enabled = enabled
        self.error = error
        self.minLines = minLines
        self.multiline = multiline
        self.keyboard = keyboard
        self.capitalization = capitalization
        self.secure = secure
        self.radius = radius
        self.labelBackground = labelBackground
    }

    /// Una sola línea fija: el texto y la etiqueta van centrados en los 56.
    private var singleLine: Bool { secure || (minLines <= 1 && !multiline) }

    private var floating: Bool { focused || !text.isEmpty }
    private var hasError: Bool { !(error ?? "").isEmpty }

    private var borderColor: Color {
        if !enabled { return NxColors.fg.opacity(0.12) }
        if hasError { return NxColors.danger }
        return focused ? NxColors.brand : NxColors.borderStrong
    }

    private var labelColor: Color {
        if !enabled { return NxColors.fg.opacity(0.38) }
        if hasError { return NxColors.danger }
        return focused ? NxColors.brand : NxColors.muted
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            ZStack(alignment: .topLeading) {
                input
                    .padding(.horizontal, 16)
                    .padding(.vertical, 16)
                    .frame(maxWidth: .infinity, minHeight: 56, alignment: singleLine ? .leading : .topLeading)
                RoundedRectangle(cornerRadius: radius, style: .continuous)
                    .strokeBorder(borderColor, lineWidth: focused && enabled ? 2 : 1)
                    .allowsHitTesting(false)
                etiqueta
                    .allowsHitTesting(false)
            }
            .contentShape(Rectangle())
            .onTapGesture { if enabled { focused = true } }
            if let error, !error.isEmpty {
                Text(error)
                    .font(NxType.bodySmall)
                    .foregroundStyle(NxColors.danger)
                    .padding(.horizontal, 16)
            }
        }
        // Material deja 8 arriba del contorno para la etiqueta que sube al borde
        // (`OutlinedTextFieldTopPadding`): sin ellos la etiqueta pisa lo de arriba.
        .padding(.top, 8)
        .animation(.easeOut(duration: 0.15), value: floating)
    }

    @ViewBuilder
    private var input: some View {
        Group {
            if secure {
                SecureField("", text: $text)
            } else if singleLine {
                TextField("", text: $text)
            } else {
                TextField("", text: $text, axis: .vertical)
                    .lineLimit(max(minLines, 1)...)
            }
        }
        .font(NxType.bodyLarge)
        .foregroundStyle(enabled ? NxColors.fg : NxColors.fg.opacity(0.38))
        .tint(NxColors.brand)
        .keyboardType(keyboard)
        .textInputAutocapitalization(capitalization)
        .autocorrectionDisabled(keyboard != .default || secure)
        .focused($focused)
        .disabled(!enabled)
        .accessibilityLabel(label)
    }

    @ViewBuilder
    private var etiqueta: some View {
        if floating {
            Text(label)
                .font(.system(size: 12))
                .foregroundStyle(labelColor)
                .lineLimit(1)
                .padding(.horizontal, 4)
                .background(labelBackground)
                .offset(x: 12, y: -8)
        } else {
            Text(label)
                .font(NxType.bodyLarge)
                .foregroundStyle(labelColor)
                .lineLimit(1)
                .padding(.horizontal, 16)
                .padding(.top, singleLine ? 0 : 16)
                .frame(height: singleLine ? 56 : nil, alignment: .leading)
        }
    }
}

// MARK: - Desplegable (Material `ExposedDropdownMenuBox`)

struct PortalMenuOption: Identifiable, Hashable {
    let id: String
    let title: String
}

/// Desplegable de solo lectura de Android: el mismo contorno que el campo, la
/// etiqueta arriba, el valor elegido y el triangulito a la derecha.
struct PortalDropdownField: View {
    let label: String
    let value: String
    let options: [PortalMenuOption]
    let onSelect: (String) -> Void
    var radius: CGFloat = 6
    var labelBackground: Color = NxColors.card

    var body: some View {
        Menu {
            ForEach(options) { option in
                Button(option.title) { onSelect(option.id) }
            }
        } label: {
            ZStack(alignment: .topLeading) {
                HStack(alignment: .center, spacing: 8) {
                    Text(value)
                        .font(NxType.bodyLarge)
                        .foregroundStyle(NxColors.fg)
                        .lineLimit(1)
                        .frame(maxWidth: .infinity, alignment: .leading)
                    Image(systemName: "arrowtriangle.down.fill")
                        .font(.system(size: 9, weight: .regular))
                        .foregroundStyle(NxColors.muted)
                        .accessibilityHidden(true)
                }
                .padding(.leading, 16)
                .padding(.trailing, 14)
                .frame(maxWidth: .infinity, minHeight: 56)
                RoundedRectangle(cornerRadius: radius, style: .continuous)
                    .strokeBorder(NxColors.borderStrong, lineWidth: 1)
                Text(label)
                    .font(.system(size: 12))
                    .foregroundStyle(NxColors.muted)
                    .lineLimit(1)
                    .padding(.horizontal, 4)
                    .background(labelBackground)
                    .offset(x: 12, y: -8)
            }
            .contentShape(Rectangle())
        }
        .tint(NxColors.fg)
        // Los 8 de Material arriba del contorno, como en `PortalOutlinedField`.
        .padding(.top, 8)
        .accessibilityLabel("\(label): \(value)")
    }
}

// MARK: - Piezas de pantalla del portal

/// Cómo se pide una recarga (Android distingue `isLoading` de `isRefreshing`).
enum PortalLoad {
    /// Primera carga: esqueleto en lugar del contenido.
    case initial
    /// La pidió el dedo: el indicador lo pone `.refreshable`.
    case pull
    /// Recarga programática (filtro, tiempo real, tras una acción): el
    /// indicador redondo de Android arriba de la lista.
    case visible
    /// Al volver a la pantalla: sin indicador.
    case silent
}

/// Opción de un filtro o de un control segmentado: clave del API y texto.
struct PortalOption: Identifiable, Hashable {
    let key: String
    let label: String
    var id: String { key }
}

/// Aire vertical fijo (`Spacer(Modifier.height(x.dp))` de Android).
struct PortalGap: View {
    let height: CGFloat

    init(_ height: CGFloat) {
        self.height = height
    }

    var body: some View {
        Color.clear
            .frame(height: height)
            .accessibilityHidden(true)
    }
}

/// Tipo de cuenta del portal. Las mismas reglas que Android
/// (`AuthRepository.loadSession()?.isBranchUser`) y que el API: lo que solo
/// existe en `client-portal` (cerrar o autorizar solicitudes, aprobar
/// inventarios, calificar servicios) a una sucursal le respondería 403.
enum PortalSession {
    static var isBranchUser: Bool { SessionStore.shared.currentUser?.isBranchUser == true }
}

/// Título de los formularios del portal (Android: `titleLarge` Bold y debajo
/// `bodySmall` gris).
struct PortalScreenTitle: View {
    let title: String
    let subtitle: String

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text(title)
                .font(.system(size: 20, weight: .bold))
                .foregroundStyle(NxColors.fg)
                .accessibilityAddTraits(.isHeader)
            Text(subtitle)
                .font(NxType.bodySmall)
                .foregroundStyle(NxColors.muted)
                .fixedSize(horizontal: false, vertical: true)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

/// Título de tarjeta en color de marca (Android `titleMedium` SemiBold
/// `primary`) con 8 de aire debajo.
struct PortalPanelTitle: View {
    let text: String

    var body: some View {
        Text(text)
            .font(NxType.titleMedium)
            .foregroundStyle(NxColors.brand)
            .padding(.bottom, NxSpacing.s)
            .accessibilityAddTraits(.isHeader)
    }
}

/// Aviso en tarjeta de Android: `NxPanelShell(12)` con el texto en `primary` y
/// un `OutlinedButton` para cerrarlo.
struct PortalNoticePanel: View {
    let message: String
    var closeLabel: String = "Cerrar"
    let onClose: () -> Void

    var body: some View {
        NxPanelShell(padding: 12) {
            Text(message)
                .font(NxType.bodyLarge)
                .foregroundStyle(NxColors.brand)
                .fixedSize(horizontal: false, vertical: true)
            Button(closeLabel, action: onClose)
                .buttonStyle(PortalButtons.outlined)
        }
    }
}

/// Aviso verde con «Cerrar» (Android `NxAlertBanner(NxAlert(tone = Success,
/// actionLabel = "Cerrar"))`).
struct PortalSuccessBanner: View {
    let message: String
    let onClose: () -> Void

    var body: some View {
        NxAlertBanner(
            alert: NxAlert(id: "message", title: message, tone: .success),
            actionLabel: "Cerrar",
            onAction: onClose
        )
    }
}

/// `Button` / `OutlinedButton` de Material 3 (píldora de 40), a lo ancho por
/// omisión, como los `Modifier.fillMaxWidth()` / `weight(1f)` del portal Android.
struct PortalPillButton: View {
    let title: String
    var filled: Bool = true
    var enabled: Bool = true
    var fullWidth: Bool = true
    /// Alto mínimo total (Android 40; 48 en «Enviar solicitud»).
    var minHeight: CGFloat = 40
    var tint: Color = NxColors.brand
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Text(title)
                .lineLimit(1)
                .minimumScaleFactor(0.8)
                .frame(maxWidth: fullWidth ? .infinity : nil, minHeight: max(minHeight - 16, 0))
        }
        .buttonStyle(
            filled
                ? NxPillButtonStyle(fill: tint, foreground: .white)
                : NxPillButtonStyle(fill: .clear, foreground: tint, border: NxColors.borderStrong)
        )
        .disabled(!enabled)
    }
}

/// Etiqueta con la forma del `OutlinedButton` para lo que no es un `Button`
/// (el selector de fotos de iOS).
struct PortalOutlinedPillLabel: View {
    let text: String
    var enabled: Bool = true

    var body: some View {
        Text(text)
            .font(NxType.labelLarge)
            .lineLimit(1)
            .foregroundStyle(enabled ? NxColors.brand : NxColors.fg.opacity(0.38))
            .padding(.horizontal, 14)
            .padding(.vertical, 8)
            .frame(maxWidth: .infinity, minHeight: 40)
            .overlay(
                Capsule().strokeBorder(enabled ? NxColors.borderStrong : NxColors.fg.opacity(0.12), lineWidth: 1)
            )
            .contentShape(Capsule())
    }
}

/// Indicador de recarga de Android (`PullToRefreshBox` con `isRefreshing`)
/// cuando la recarga no la pidió el dedo: cambiar el rango de fechas, el
/// proyecto o volver de un detalle. Círculo blanco de 40 con sombra arriba.
struct PortalRefreshIndicator: View {
    let visible: Bool

    var body: some View {
        if visible {
            ProgressView()
                .tint(NxColors.brand)
                .frame(width: 40, height: 40)
                .background(Circle().fill(NxColors.card).nxElevation(3))
                .padding(.top, NxSpacing.s)
                .transition(.opacity)
                .accessibilityLabel("Actualizando")
        }
    }
}

/// Bloques de carga arriba de la pantalla (Android `NxSkeletonList` fuera de la
/// lista): no se desplazan y dejan el resto del fondo libre.
struct PortalSkeletonScreen: View {
    var itemCount: Int = 5
    var itemHeight: CGFloat = 72
    var horizontal: CGFloat = NxSpacing.screenH
    var vertical: CGFloat = NxSpacing.m

    var body: some View {
        VStack(spacing: 0) {
            NxSkeletonList(itemCount: itemCount, itemHeight: itemHeight)
                .padding(.horizontal, horizontal)
                .padding(.vertical, vertical)
            Spacer(minLength: 0)
        }
    }
}

// MARK: - Tarjetas

/// Tarjeta de módulo del inicio (Android `PortalNavCard`): título 16 SemiBold,
/// subtítulo 12,5 gris y, si hay pendientes, un chip a la derecha.
struct PortalNavCard: View {
    let title: String
    let subtitle: String
    var badge: String? = nil
    var tone: NxTone = .brand
    let onClick: () -> Void

    var body: some View {
        NxPanelShell(padding: 14, onClick: onClick) {
            HStack(alignment: .center, spacing: NxSpacing.s) {
                VStack(alignment: .leading, spacing: 0) {
                    Text(title)
                        .font(NxType.titleMedium)
                        .foregroundStyle(NxColors.fg)
                    Text(subtitle)
                        .font(NxType.bodySmall)
                        .foregroundStyle(NxColors.muted)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                if let badge {
                    NxStatusChip(text: badge, tone: tone)
                }
            }
            .frame(minHeight: 20)
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel(badge.map { "\(title), \(subtitle), \($0) pendientes" } ?? "\(title), \(subtitle)")
    }
}

/// Renglón tocable con flecha a la derecha (Android `Card(onClick)` de las
/// listas de tickets e inventarios): relleno 14/12/12/6.
struct PortalChevronCard<Content: View>: View {
    let onClick: () -> Void
    let content: Content

    init(onClick: @escaping () -> Void, @ViewBuilder content: () -> Content) {
        self.onClick = onClick
        self.content = content()
    }

    var body: some View {
        Button(action: onClick) {
            HStack(alignment: .center, spacing: 0) {
                content
                    .frame(maxWidth: .infinity, alignment: .leading)
                Image(systemName: "chevron.right")
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(NxColors.muted)
                    .frame(width: 24, height: 24)
                    .accessibilityLabel("Ver detalle")
            }
            .padding(.leading, 14)
            .padding(.top, 12)
            .padding(.bottom, 12)
            .padding(.trailing, 6)
            .frame(maxWidth: .infinity, alignment: .leading)
            .nxCardSurface()
            .contentShape(RoundedRectangle(cornerRadius: NxRadius.l, style: .continuous))
        }
        .buttonStyle(NxPressableStyle())
    }
}

/// Renglón «etiqueta … valor» de los detalles (Android `TicketDetailRow`). Sin
/// valor no se dibuja.
struct PortalDetailRow: View {
    let label: String
    let value: String?

    var body: some View {
        if let value, !value.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            HStack(alignment: .firstTextBaseline, spacing: NxSpacing.s) {
                Text(label)
                    .font(NxType.bodySmall)
                    .foregroundStyle(NxColors.muted)
                Spacer(minLength: NxSpacing.s)
                Text(value)
                    .font(.system(size: 12.5, weight: .medium))
                    .foregroundStyle(NxColors.fg)
                    .multilineTextAlignment(.trailing)
            }
        }
    }
}

// MARK: - PDF dentro de la app

/// PDF ya descargado, listo para el visor.
struct PortalPDFItem: Identifiable {
    let id = UUID()
    let title: String
    let data: Data
}

/// Visor de PDF en hoja con «Cerrar»; compartir va en la barra del visor.
struct PortalPDFSheet: View {
    let item: PortalPDFItem
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            PDFViewerScreen(title: item.title, data: item.data)
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) {
                        Button("Cerrar") { dismiss() }
                    }
                }
        }
    }
}

/// PDF de evidencia protegido por la sesión: se descarga y se abre dentro de la
/// app (Android lo mandaba al navegador con `openExternalUrl`).
struct PortalAssetPDFItem: Identifiable {
    let id = UUID()
    let title: String
    let url: String
}

struct PortalAssetPDFSheet: View {
    let item: PortalAssetPDFItem
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            AuthenticatedPDFScreen(title: item.title, url: item.url)
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) {
                        Button("Cerrar") { dismiss() }
                    }
                }
        }
    }
}

// MARK: - Imágenes elegidas

/// Imagen elegida en la fototeca, lista para subir. Todo lo que no es PNG se
/// manda como JPEG (las fotos del iPhone llegan en HEIC).
struct PortalPickedImage {
    let data: Data
    let fileExtension: String
    let mimeType: String

    static func load(_ item: PhotosPickerItem) async -> PortalPickedImage? {
        guard let raw = try? await item.loadTransferable(type: Data.self), !raw.isEmpty else { return nil }
        let pngFirma: [UInt8] = [0x89, 0x50, 0x4E, 0x47]
        if raw.count > 4, Array(raw.prefix(4)) == pngFirma {
            return PortalPickedImage(data: raw, fileExtension: "png", mimeType: "image/png")
        }
        if let image = UIImage(data: raw), let jpeg = image.jpegData(compressionQuality: 0.85) {
            return PortalPickedImage(data: jpeg, fileExtension: "jpg", mimeType: "image/jpeg")
        }
        return PortalPickedImage(data: raw, fileExtension: "jpg", mimeType: "image/jpeg")
    }
}

// MARK: - Estatus (Android `NxStatusLabels`, texto por texto)

/// Las MISMAS etiquetas y tonos que `NxStatusLabels` de Android: el portal enseña
/// «Finalizada», «En curso» o «Sin estatus» igual que el teléfono Android.
enum PortalStatusLabels {
    private static let labels: [String: String] = [
        "DRAFT": "Borrador", "BORRADOR": "Borrador",
        "PENDING": "Pendiente", "PENDIENTE": "Pendiente",
        "OPEN": "Abierto", "ABIERTO": "Abierto",
        "NEW": "Nuevo", "NUEVO": "Nuevo",
        "ASSIGNED": "Asignado",
        "IN_PROGRESS": "En curso", "EN_PROCESO": "En curso", "EN_CURSO": "En curso",
        "ACTIVE": "Activo", "ACTIVO": "Activo",
        "ON_HOLD": "En pausa", "PAUSED": "En pausa",
        "INACTIVE": "Inactivo", "INACTIVO": "Inactivo",
        "PLANNING": "En planeación",
        "SENT": "Enviada", "ENVIADA": "Enviada",
        "ISSUED": "Emitida", "STAMPED": "Timbrada", "ACCEPTED": "Aceptada",
        "APPROVED": "Aprobado", "APROBADO": "Aprobado", "AUTORIZADO": "Autorizado",
        "REJECTED": "Rechazado", "RECHAZADO": "Rechazado",
        "PAID": "Pagada", "PAGADO": "Pagado",
        "PARTIALLY_PAID": "Pago parcial", "PARTIAL": "Parcial",
        "OVERDUE": "Vencida", "VENCIDO": "Vencido", "EXPIRED": "Vencida",
        "RESOLVED": "Resuelto", "RESUELTO": "Resuelto",
        "DONE": "Terminado", "COMPLETED": "Terminado", "FINISHED": "Terminado",
        "TERMINADO": "Terminado", "FINALIZADO": "Terminado",
        "CLOSED": "Cerrado", "CERRADO": "Cerrado",
        "CANCELLED": "Cancelado", "CANCELED": "Cancelado", "CANCELADO": "Cancelado",
        "VOID": "Anulada",
        "SCHEDULED": "Programada", "PROGRAMADO": "Programado",
        "CONFIRMED": "Confirmada",
        "WAITING_CLIENT": "Esperando al cliente", "WAITING": "En espera",
    ]

    private static let mx = Locale(identifier: "es_MX")

    private static func clave(_ raw: String) -> String {
        raw.uppercased()
            .replacingOccurrences(of: " ", with: "_")
            .replacingOccurrences(of: "-", with: "_")
    }

    static func label(_ raw: String?) -> String {
        let s = (raw ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        if s.isEmpty || s == "null" { return "Sin estatus" }
        if let conocido = labels[clave(s)] { return conocido }
        let legible = s.replacingOccurrences(of: "_", with: " ").lowercased(with: mx)
        return legible.prefix(1).uppercased(with: mx) + legible.dropFirst()
    }

    /// `HIGH` / `ALTA` → «Alta»; `nil` sin prioridad.
    static func priority(_ raw: String?) -> String? {
        let key = (raw ?? "").trimmingCharacters(in: .whitespacesAndNewlines).uppercased()
        switch key {
        case "", "—", "NULL": return nil
        case "LOW", "BAJA": return "Baja"
        case "MEDIUM", "NORMAL", "MEDIA": return "Media"
        case "HIGH", "ALTA": return "Alta"
        case "URGENT", "URGENTE", "CRITICAL", "CRITICA", "CRÍTICA": return "Urgente"
        default: return label(raw)
        }
    }

    static func tone(_ raw: String?) -> NxTone {
        let key = clave((raw ?? "").trimmingCharacters(in: .whitespacesAndNewlines))
        switch key {
        case "PAID", "PAGADO", "APPROVED", "APROBADO", "AUTORIZADO", "ACCEPTED", "DONE", "COMPLETED",
             "FINISHED", "TERMINADO", "FINALIZADO", "RESOLVED", "RESUELTO", "ACTIVE", "ACTIVO",
             "STAMPED", "CONFIRMED":
            return .success
        case "REJECTED", "RECHAZADO", "OVERDUE", "VENCIDO", "EXPIRED", "CANCELLED", "CANCELED",
             "CANCELADO", "VOID":
            return .danger
        case "PENDING", "PENDIENTE", "ON_HOLD", "PAUSED", "WAITING", "WAITING_CLIENT",
             "PARTIALLY_PAID", "PARTIAL":
            return .warning
        case "IN_PROGRESS", "EN_PROCESO", "EN_CURSO", "OPEN", "ABIERTO", "ASSIGNED", "SENT",
             "ENVIADA", "ISSUED", "SCHEDULED", "PROGRAMADO", "NEW", "NUEVO", "PLANNING":
            return .info
        default:
            return .neutral
        }
    }
}

// MARK: - Fechas y dinero (hora de México)

/// Fechas del portal como Android `NxFormat.date` / `dateTime` («5 oct 2026»,
/// «5 oct 2026, 14:30»), pero siempre en hora de la Ciudad de México: un cliente
/// con el teléfono en otra zona veía la hora corrida.
enum PortalFormat {
    static let zona = TimeZone(identifier: "America/Mexico_City") ?? .current

    /// Abreviaturas fijas de Android (`MESES_CORTOS`): «sept», sin punto.
    private static let meses = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sept", "oct", "nov", "dic"]

    private static var calendario: Calendar {
        var c = Calendar(identifier: .gregorian)
        c.timeZone = zona
        return c
    }

    private static let isoFraccion: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f
    }()

    private static let isoSimple: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime]
        return f
    }()

    private static let local: DateFormatter = {
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US_POSIX")
        f.calendar = Calendar(identifier: .gregorian)
        f.timeZone = TimeZone(identifier: "America/Mexico_City") ?? .current
        f.dateFormat = "yyyy-MM-dd'T'HH:mm:ss"
        return f
    }()

    private static let soloDia: DateFormatter = {
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US_POSIX")
        f.calendar = Calendar(identifier: .gregorian)
        f.timeZone = TimeZone(identifier: "America/Mexico_City") ?? .current
        f.dateFormat = "yyyy-MM-dd"
        return f
    }()

    /// ISO con zona, fecha y hora sin zona (se lee en México) o solo el día.
    static func parse(_ raw: String?) -> Date? {
        let s = (raw ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        guard s.count >= 10 else { return nil }
        if s.count > 10 {
            if let d = isoFraccion.date(from: s) ?? isoSimple.date(from: s) { return d }
            let sinZona = String(s.prefix(19)).replacingOccurrences(of: " ", with: "T")
            if let d = local.date(from: sinZona) { return d }
        }
        return soloDia.date(from: String(s.prefix(10)))
    }

    /// «5 oct 2026»; «—» sin fecha; el texto tal cual si no se entiende.
    static func date(_ raw: String?) -> String {
        let s = (raw ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        if s.isEmpty || s == "null" { return "—" }
        guard let d = parse(s) else { return s }
        return dia(d)
    }

    /// «5 oct 2026, 14:30»; con solo el día, como `date`.
    static func dateTime(_ raw: String?) -> String {
        let s = (raw ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        if s.isEmpty || s == "null" { return "—" }
        if s.count <= 10 { return date(s) }
        guard let d = parse(s) else { return s }
        let c = calendario.dateComponents([.hour, .minute], from: d)
        return "\(dia(d)), \(String(format: "%02d:%02d", c.hour ?? 0, c.minute ?? 0))"
    }

    static func dia(_ d: Date) -> String {
        let c = calendario.dateComponents([.year, .month, .day], from: d)
        let mes = meses[max(0, min(11, (c.month ?? 1) - 1))]
        return "\(c.day ?? 1) \(mes) \(c.year ?? 0)"
    }

    /// Inicio del día de hoy en la Ciudad de México.
    static func inicioDeHoy(_ ahora: Date = Date()) -> Date {
        calendario.startOfDay(for: ahora)
    }

    /// ISO-8601 con milisegundos para el API («2026-10-05T06:00:00.000Z»).
    static func iso(_ d: Date) -> String { isoFraccion.string(from: d) }

    /// Android `NxFormat.money`: «$1,234.50»; otra moneda se agrega al final.
    static func money(_ amount: Any?, currency: String?) -> String {
        let valor: Double
        if let n = amount as? NSNumber {
            valor = n.doubleValue
        } else if let s = amount as? String,
                  let d = Double(s.trimmingCharacters(in: .whitespaces).replacingOccurrences(of: ",", with: "")) {
            valor = d
        } else {
            return "—"
        }
        guard valor.isFinite else { return "—" }
        let texto = NxFormat.mxn(valor)
        let moneda = (currency ?? "").trimmingCharacters(in: .whitespaces).uppercased()
        return moneda.isEmpty || moneda == "MXN" ? texto : "\(texto) \(moneda)"
    }
}
