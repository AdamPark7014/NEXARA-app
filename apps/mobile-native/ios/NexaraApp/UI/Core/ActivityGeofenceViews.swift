import SwiftUI
import UIKit

// Geocerca de la actividad: espejo de Android `ui/console/activities/ActivityGeofence.kt`
// (`GeocercaActividadCard`, `AlertaZonaFila` y `JustificarZonaDialog`). Mismos textos,
// tamaños y colores; las horas siempre en America/Mexico_City (`ActivityGeofence.horaDe`).

/// Textos y colores de la geocerca, iguales en la captura del ejecutor y en las
/// evidencias del equipo.
enum ActivityGeofenceUI {
    /// #B91C1C: texto de una salida de zona y de los errores (Android `Color(0xFFB91C1C)`).
    static let rojoTexto = NxColors.rgb(0xB91C1C)
    /// #FEF2F2: fondo de la tarjeta mientras hay una salida abierta sin justificar.
    static let fondoFuera = NxColors.rgb(0xFEF2F2)

    /// Chip de la salida: «Justificada» (azul) o «Sin justificar» (ámbar).
    static func alertStatus(_ alert: ActivityGeofenceAlert) -> (label: String, icon: String, color: Color) {
        if alert.isJustified { return ("Justificada", "checkmark.seal", NxTone.info.fg) }
        return ("Sin justificar", "exclamationmark.bubble", NxTone.warning.fg)
    }

    /// Tono del chip de la salida (Android `NxStatusChip(…, NxTone.Info / Warning)`).
    static func alertTone(_ alert: ActivityGeofenceAlert) -> NxTone {
        alert.isJustified ? .info : .warning
    }

    /// Chip de la zona según la última lectura (Android: «Dentro de 500 m»,
    /// «Fuera de zona» o «Esperando ubicación»).
    static func zoneStatus(_ state: ActivityGeofenceState) -> (label: String, icon: String, color: Color) {
        let chip = zoneChip(state)
        return (chip.text, chip.systemImage ?? "location", chip.tone.fg)
    }

    static func zoneChip(_ state: ActivityGeofenceState) -> (text: String, tone: NxTone, systemImage: String?) {
        switch state.dentro {
        case .some(true): return ("Dentro de \(state.radioM) m", .success, nil)
        case .some(false): return ("Fuera de zona", .danger, "location.slash")
        case .none: return ("Esperando ubicación", .neutral, nil)
        }
    }

    /// «120 m»; «— m» sin distancia (Android `"${d ?: "—"} m"`).
    static func distance(_ meters: Int?) -> String {
        "\(meters.map { String($0) } ?? "—") m"
    }
}

// MARK: - Piezas privadas

/// Alto de línea de Android: un `Text(fontSize = …)` sin estilo propio hereda el de
/// `bodyLarge` (24); en el diálogo, el de `bodyMedium` (20).
private extension View {
    func geoLinea(_ size: CGFloat, alto: CGFloat = 24) -> some View {
        lineSpacing(max(0, alto - size * 1.2))
    }
}

/// Icono + texto en una fila (Android `NxIconText`): icono de 1,25 × el tamaño de
/// letra, 6 de separación, centrados. Sin color hereda el de su contenedor.
private struct GeoIconText: View {
    let systemName: String
    let text: String
    var size: CGFloat
    var weight: Font.Weight = .regular
    var color: Color? = nil

    var body: some View {
        HStack(alignment: .center, spacing: 6) {
            Image(systemName: systemName)
                .font(.system(size: size, weight: .regular))
                .frame(width: size * 1.25, height: size * 1.25)
                .accessibilityHidden(true)
            Text(text)
                .font(.system(size: size, weight: weight))
                .geoLinea(size)
                .fixedSize(horizontal: false, vertical: true)
        }
        .foregroundStyle(color.map { AnyShapeStyle($0) } ?? AnyShapeStyle(HierarchicalShapeStyle.primary))
    }
}

/// `Button` / `OutlinedButton` de Material 3: píldora de 40 de alto con relleno
/// 24 × 8. `fill == nil` = contorno #CBD5E1. La fuente la pone cada etiqueta.
private struct GeoPillButtonStyle: ButtonStyle {
    var fill: Color?
    var foreground: Color

    func makeBody(configuration: Configuration) -> some View {
        GeoPillButtonBody(configuration: configuration, fill: fill, foreground: foreground)
    }
}

private struct GeoPillButtonBody: View {
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

/// `TextButton` de Material 3: letra 14 SemiBold de marca, sin fondo.
private struct GeoTextButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        GeoTextButtonBody(configuration: configuration)
    }
}

private struct GeoTextButtonBody: View {
    let configuration: ButtonStyleConfiguration
    @Environment(\.isEnabled) private var isEnabled

    var body: some View {
        configuration.label
            .font(NxType.labelLarge)
            .lineLimit(1)
            .foregroundStyle(isEnabled ? NxColors.brand : NxColors.fg.opacity(0.38))
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
            .frame(minHeight: 40)
            .background(
                configuration.isPressed ? NxColors.brand.opacity(0.08) : Color.clear,
                in: Capsule()
            )
            .contentShape(Capsule())
    }
}

// MARK: - Fila de una salida de zona

/// Una salida de zona (Android `AlertaZonaFila`): «Salió de zona 14:05 · hasta 620 m»
/// con su chip, si regresó, el motivo, la foto y «Justificar con motivo y foto».
struct ActivityGeofenceAlertRow: View {
    let alert: ActivityGeofenceAlert
    /// Se conserva por compatibilidad: Android dice «Salió de zona» en la captura y
    /// en las evidencias del equipo.
    var firstPerson: Bool = true
    var photoTitle: String = "Foto de la justificación"
    /// Con él, tocar la foto la abre en grande.
    var onPhoto: ((CorePhotoItem) -> Void)? = nil
    /// Solo quien salió puede justificar.
    var onJustify: (() -> Void)? = nil

    private var hasta: Int { alert.maxDistanciaM }

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack(alignment: .center, spacing: 6) {
                GeoIconText(
                    systemName: "location.slash",
                    text: "Salió de zona \(ActivityGeofence.horaDe(alert.detectedAt)) · hasta \(hasta) m",
                    size: 12.5,
                    weight: .semibold,
                    color: ActivityGeofenceUI.rojoTexto
                )
                .frame(maxWidth: .infinity, alignment: .leading)
                NxStatusChip(
                    text: alert.isJustified ? "Justificada" : "Sin justificar",
                    tone: ActivityGeofenceUI.alertTone(alert)
                )
            }
            Text(
                alert.returnedAt != nil
                    ? "Regresó a las \(ActivityGeofence.horaDe(alert.returnedAt))"
                    : "Sigue fuera de la zona"
            )
            .font(.system(size: 11.5))
            .foregroundStyle(NxColors.muted)
            if alert.hasJustificationText {
                Text("Motivo: \(alert.justificacion ?? "")")
                    .font(.system(size: 12))
                    .foregroundStyle(NxColors.fg)
                    .geoLinea(12)
                    .fixedSize(horizontal: false, vertical: true)
            }
            if let url = alert.fotoUrl, !url.isEmpty {
                foto(url)
            }
            if let onJustify, !alert.isJustified {
                Button(action: onJustify) {
                    Text("Justificar con motivo y foto")
                        .font(.system(size: 13, weight: .semibold))
                }
                .buttonStyle(GeoPillButtonStyle(fill: NxColors.brand, foreground: .white))
            }
        }
        .padding(10)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(NxColors.card, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
    }

    @ViewBuilder
    private func foto(_ url: String) -> some View {
        let imagen = AuthenticatedImage(url: url, contentMode: .fill, background: NxColors.sunken)
            .frame(width: 96, height: 96)
            .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
            .accessibilityLabel("Foto de la justificación")
        if let onPhoto {
            Button {
                onPhoto(CorePhotoItem(title: photoTitle, url: url, time: alert.justificadaAt))
            } label: {
                imagen
            }
            .buttonStyle(.plain)
        } else {
            imagen
        }
    }
}

// MARK: - Tarjeta del ejecutor

/// «Ubicación de la actividad» (Android `GeocercaActividadCard`): punto de inicio, si
/// está dentro del radio, la última lectura, el recorrido (solo dirección lo recibe)
/// y las salidas de zona con su justificación. Va dentro del panel «Captura de
/// evidencias»: dibuja su propio fondo (tinte de marca, o rojo suave con una salida
/// abierta sin justificar). No pinta nada sin punto de inicio.
///
/// Se vuelve a pedir cada 2 minutos mientras el seguimiento sigue activo y la
/// pantalla está abierta.
struct ActivityGeofenceCard: View {
    let activityId: Int
    var refreshToken: Int = 0
    /// Cada lectura buena (Android `onEstado`): la captura la guarda para medir la salida.
    var onEstado: ((ActivityGeofenceState?) -> Void)? = nil

    @State private var state: ActivityGeofenceState?
    @State private var error: String?
    @State private var recargar = 0
    @State private var justifying: ActivityGeofenceAlert?
    @State private var photo: CorePhotoItem?

    /// Android: `delay(120_000)` entre lecturas.
    private static let refreshSeconds: UInt64 = 120
    /// Android: `puntos.take(6)`.
    private static let puntosVisibles = 6

    private var taskKey: String { "\(activityId)-\(refreshToken)-\(recargar)" }

    var body: some View {
        contenido
            .task(id: taskKey) {
                // Seguimiento paulatino: se refresca solo mientras la pantalla está abierta.
                while !Task.isCancelled {
                    await load()
                    if Task.isCancelled || state?.seguimientoActivo != true { break }
                    try? await Task.sleep(nanoseconds: ActivityGeofenceCard.refreshSeconds * 1_000_000_000)
                }
            }
            .fullScreenCover(item: $justifying) { alert in
                ActivityGeofenceJustifySheet(
                    activityId: activityId,
                    alert: alert,
                    onDone: { _, _ in recargar += 1 },
                    onClose: { cerrarJustificacion() }
                )
                .presentationBackground(.clear)
            }
            .fullScreenCover(item: $photo) { item in
                CorePhotoViewer(item: item)
            }
    }

    @ViewBuilder
    private var contenido: some View {
        if let state {
            // Sin punto de inicio no hay contra qué medir: Android no pinta nada.
            if state.origen != nil {
                tarjeta(state)
            }
        } else if let error {
            Text(error)
                .font(.system(size: 12))
                .foregroundStyle(NxColors.muted)
                .geoLinea(12)
                .frame(maxWidth: .infinity, alignment: .leading)
                .fixedSize(horizontal: false, vertical: true)
        } else {
            // Primera carga: Android no dibuja nada; esta vista sin alto solo sostiene la tarea.
            Color.clear.frame(height: 0)
        }
    }

    private func tarjeta(_ e: ActivityGeofenceState) -> some View {
        let radio = e.radioM
        let chip = ActivityGeofenceUI.zoneChip(e)
        let iniciaste = "Iniciaste a las \(ActivityGeofence.horaDe(e.origen?.at))."
        let parrafo = e.exigeMismaUbicacion
            ? "\(iniciaste) Mantente a menos de \(radio) m de ese punto: la foto de salida solo se acepta ahí."
            : "\(iniciaste) La foto de salida lleva tu ubicación; en este tipo de actividad no hace falta que coincida con el inicio."
        return VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .center, spacing: 8) {
                GeoIconText(
                    systemName: "scope",
                    text: "Ubicación de la actividad",
                    size: 14,
                    weight: .bold,
                    color: NxColors.fg
                )
                .frame(maxWidth: .infinity, alignment: .leading)
                NxStatusChip(text: chip.text, tone: chip.tone, systemImage: chip.systemImage)
            }
            Text(parrafo)
                .font(.system(size: 12))
                .foregroundStyle(NxColors.muted)
                .geoLinea(12)
                .fixedSize(horizontal: false, vertical: true)
            if let ultimo = e.ultimo {
                GeoIconText(
                    systemName: "location",
                    text: "Última ubicación \(ActivityGeofence.horaDe(ultimo.at)) · a \(ultimo.distanciaM.map { String($0) } ?? "—") m del inicio",
                    size: 12.5,
                    weight: .semibold,
                    color: NxColors.fg
                )
            }
            if !e.puntos.isEmpty {
                Text(e.seguimientoActivo ? "Seguimiento cada ~10 min" : "Recorrido registrado")
                    .font(.system(size: 11, weight: .bold))
                    .foregroundStyle(NxColors.muted)
                ForEach(Array(e.puntos.prefix(ActivityGeofenceCard.puntosVisibles).enumerated()), id: \.offset) { _, punto in
                    filaPunto(punto, radio: radio)
                }
            } else if e.seguimientoActivo {
                Text("Aún no llega tu primer punto de seguimiento.")
                    .font(.system(size: 12))
                    .foregroundStyle(NxColors.muted)
                    .geoLinea(12)
                    .fixedSize(horizontal: false, vertical: true)
            }
            ForEach(Array(e.alertas.enumerated()), id: \.offset) { _, alerta in
                let justificar: (() -> Void)? = alerta.isJustified ? nil : { abrirJustificacion(alerta) }
                ActivityGeofenceAlertRow(
                    alert: alerta,
                    onPhoto: { photo = $0 },
                    onJustify: justificar
                )
            }
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            e.alertaAbiertaSinJustificar != nil ? ActivityGeofenceUI.fondoFuera : NxColors.brandTint,
            in: RoundedRectangle(cornerRadius: 14, style: .continuous)
        )
    }

    private func filaPunto(_ punto: ActivityGeofencePoint, radio: Int) -> some View {
        let fuera = (punto.distanciaM ?? 0) > radio
        return HStack(alignment: .center, spacing: 8) {
            Text(ActivityGeofence.horaDe(punto.at))
                .font(.system(size: 12))
                .foregroundStyle(NxColors.fg)
            Spacer(minLength: 8)
            Text(ActivityGeofenceUI.distance(punto.distanciaM))
                .font(.system(size: 12, weight: .semibold))
                .foregroundStyle(fuera ? ActivityGeofenceUI.rojoTexto : NxColors.verde)
        }
    }

    /// El diálogo se abre como el de Android: encima, sin la animación de hoja.
    private func abrirJustificacion(_ alerta: ActivityGeofenceAlert) {
        var transaction = Transaction()
        transaction.disablesAnimations = true
        withTransaction(transaction) { justifying = alerta }
    }

    private func cerrarJustificacion() {
        var transaction = Transaction()
        transaction.disablesAnimations = true
        withTransaction(transaction) { justifying = nil }
    }

    @MainActor
    private func load() async {
        do {
            let nuevo = try await ActivityGeofenceRepository.shared.estado(activityId: activityId)
            state = nuevo
            error = nil
            onEstado?(nuevo)
        } catch {
            if Task.isCancelled { return }
            if let core = error as? CoreError, case .queuedOffline = core { return }
            self.error = error.toUserMessage(fallback: "No se pudo cargar la ubicación de la actividad")
        }
    }
}

// MARK: - Diálogo de justificación

/// «¿Por qué saliste de la zona?» (Android `JustificarZonaDialog`): motivo (mínimo 5
/// caracteres) y una foto opcional tomada con la cámara. Se pinta como el
/// `AlertDialog` de Material 3: velo oscuro, tarjeta #EEF2F7 de radio 20 y los botones
/// «Cancelar» / «Enviar» abajo a la derecha. Tocar fuera lo cierra (si no está enviando).
///
/// Quien lo presenta lo pone en un `fullScreenCover` con `.presentationBackground(.clear)`.
struct ActivityGeofenceJustifySheet: View {
    let activityId: Int
    let alert: ActivityGeofenceAlert
    /// Alerta actualizada (`nil` si quedó en la cola sin conexión) y el aviso que corresponde.
    let onDone: (ActivityGeofenceAlert?, String) -> Void
    /// Cierra sin animación (lo da quien presenta). Sin él se usa `dismiss`.
    var onClose: (() -> Void)? = nil

    @Environment(\.dismiss) private var dismiss
    @State private var motivo = ""
    @State private var photo: CapturedGeoPhoto?
    @State private var showsCamera = false
    @State private var saving = false
    @State private var error: String?
    @State private var visible = false
    @FocusState private var motivoFocused: Bool

    private static let minMotivo = 5
    /// `surfaceContainerHigh` del tema claro de Android.
    private static let fondo = NxColors.rgb(0xEEF2F7)

    private var trimmed: String { motivo.trimmingCharacters(in: .whitespacesAndNewlines) }

    var body: some View {
        GeometryReader { geo in
            ScrollView {
                dialogo
                    .opacity(visible ? 1 : 0)
                    .scaleEffect(visible ? 1 : 0.96)
                    .padding(24)
                    .frame(maxWidth: .infinity, minHeight: geo.size.height)
                    .background(
                        Color.clear
                            .contentShape(Rectangle())
                            .onTapGesture { if !saving { cerrar() } }
                    )
            }
            .scrollBounceBehavior(.basedOnSize)
            .scrollDismissesKeyboard(.interactively)
        }
        .background(Color.black.opacity(visible ? 0.32 : 0).ignoresSafeArea())
        .onAppear {
            withAnimation(.easeOut(duration: 0.18)) { visible = true }
        }
        .fullScreenCover(isPresented: $showsCamera) {
            GeoPhotoCaptureView(
                title: "Foto para comprobar",
                confirmLabel: "Usar esta foto",
                requireLocation: false,
                onConfirm: { captured in
                    photo = captured
                    showsCamera = false
                    return nil
                },
                onCancel: { showsCamera = false }
            )
        }
    }

    private var dialogo: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text("¿Por qué saliste de la zona?")
                .font(NxType.headlineSmall)
                .foregroundStyle(NxColors.fg)
                .lineSpacing(1.6)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.bottom, 16)
            VStack(alignment: .leading, spacing: 10) {
                Text(
                    "Te alejaste \(alert.maxDistanciaM) m del punto de inicio a las "
                        + "\(ActivityGeofence.horaDe(alert.detectedAt)). Tu encargado y dirección verán tu explicación."
                )
                .font(.system(size: 13))
                .foregroundStyle(NxColors.muted)
                .geoLinea(13, alto: 20)
                .fixedSize(horizontal: false, vertical: true)
                campoMotivo
                if let photo {
                    Image(uiImage: photo.image)
                        .resizable()
                        .scaledToFill()
                        .frame(width: 120, height: 120)
                        .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
                        .accessibilityLabel("Foto para comprobar")
                }
                Button {
                    error = nil
                    motivoFocused = false
                    showsCamera = true
                } label: {
                    GeoIconText(
                        systemName: "camera",
                        text: photo == nil ? "Tomar foto para comprobarlo" : "Tomar otra foto",
                        size: 13,
                        weight: .semibold
                    )
                }
                .buttonStyle(GeoPillButtonStyle(fill: nil, foreground: NxColors.brand))
                .disabled(saving)
                if let error {
                    Text(error)
                        .font(.system(size: 12))
                        .foregroundStyle(ActivityGeofenceUI.rojoTexto)
                        .geoLinea(12, alto: 20)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            HStack(alignment: .center, spacing: 8) {
                Spacer(minLength: 0)
                Button("Cancelar") { cerrar() }
                    .buttonStyle(GeoTextButtonStyle())
                    .disabled(saving)
                Button {
                    Task { await submit() }
                } label: {
                    Text(saving ? "Enviando…" : "Enviar")
                        .font(NxType.labelLarge)
                }
                .buttonStyle(GeoPillButtonStyle(fill: NxColors.brand, foreground: .white))
                .disabled(saving || trimmed.count < ActivityGeofenceJustifySheet.minMotivo)
            }
            .padding(.top, 24)
        }
        .padding(24)
        .frame(maxWidth: 560, alignment: .leading)
        .background(ActivityGeofenceJustifySheet.fondo, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
    }

    /// `OutlinedTextField` de Material 3: contorno #CBD5E1 (2 de marca con foco),
    /// radio 6, etiqueta «Motivo» que sube al borde y el ejemplo cuando está vacío.
    private var campoMotivo: some View {
        let activa = motivoFocused || !motivo.isEmpty
        return ZStack(alignment: .topLeading) {
            TextEditor(text: $motivo)
                .font(NxType.bodyLarge)
                .foregroundStyle(NxColors.fg)
                .tint(NxColors.brand)
                .scrollContentBackground(.hidden)
                .focused($motivoFocused)
                .disabled(saving)
                .padding(.horizontal, 11)
                .padding(.vertical, 8)
                .frame(minHeight: 96)
                .accessibilityLabel("Motivo")
            if motivo.isEmpty {
                Text(motivoFocused ? "Ej. Fui por material a la ferretería de enfrente" : "Motivo")
                    .font(NxType.bodyLarge)
                    .foregroundStyle(NxColors.muted)
                    .padding(.horizontal, 16)
                    .padding(.top, 16)
                    .allowsHitTesting(false)
                    .accessibilityHidden(true)
            }
        }
        .overlay(
            RoundedRectangle(cornerRadius: 6, style: .continuous)
                .strokeBorder(motivoFocused ? NxColors.brand : NxColors.borderStrong, lineWidth: motivoFocused ? 2 : 1)
        )
        .overlay(alignment: .topLeading) {
            if activa {
                Text("Motivo")
                    .font(.system(size: 12))
                    .foregroundStyle(motivoFocused ? NxColors.brand : NxColors.muted)
                    .padding(.horizontal, 4)
                    .background(ActivityGeofenceJustifySheet.fondo)
                    .offset(x: 12, y: -8)
                    .accessibilityHidden(true)
            }
        }
    }

    private func cerrar() {
        motivoFocused = false
        if let onClose {
            onClose()
        } else {
            dismiss()
        }
    }

    @MainActor
    private func submit() async {
        guard trimmed.count >= ActivityGeofenceJustifySheet.minMotivo else { return }
        saving = true
        error = nil
        defer { saving = false }
        do {
            let updated = try await ActivityGeofenceRepository.shared.justificar(
                activityId: activityId,
                alertId: alert.id,
                motivo: trimmed,
                fotoBase64: photo?.dataUrl
            )
            let message = updated == nil
                ? (CoreError.queuedOffline.errorDescription ?? "Sin conexión: se enviará al regresar la señal.")
                : "Justificación enviada."
            onDone(updated, message)
            cerrar()
        } catch {
            self.error = error.toUserMessage(fallback: "No se pudo enviar la justificación")
        }
    }
}
