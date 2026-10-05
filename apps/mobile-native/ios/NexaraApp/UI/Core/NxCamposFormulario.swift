import SwiftUI
import UIKit

// MARK: - Campos y chips de Material que usan Mi perfil, Clientes y Notificaciones
//
// Android pinta estos formularios con `OutlinedTextField` (contorno #CBD5E1 de
// 1, de marca y 2 con foco, radio 6, etiqueta que sube al borde), el
// `DatePickerField` de actividades (campo de solo lectura con calendario) y
// `FilterChip` de Material 3 (32 de alto, radio 8). Aquí están sus gemelos.

// MARK: Hora de México

/// Fechas «yyyy-MM-dd» y horas «HH:mm» siempre en America/Mexico_City, como
/// `CoreActivityKinds.todayInMexico()` / `hhmmMexico` de Android.
enum NxHoraMexico {
    static let zona = TimeZone(identifier: "America/Mexico_City") ?? .current

    private static let formatoDia: DateFormatter = {
        let f = DateFormatter()
        f.calendar = Calendar(identifier: .gregorian)
        f.locale = Locale(identifier: "en_US_POSIX")
        f.timeZone = zona
        f.dateFormat = "yyyy-MM-dd"
        return f
    }()

    private static let formatoHora: DateFormatter = {
        let f = DateFormatter()
        f.calendar = Calendar(identifier: .gregorian)
        f.locale = Locale(identifier: "en_US_POSIX")
        f.timeZone = zona
        f.dateFormat = "HH:mm"
        return f
    }()

    /// «2026-10-05» de hoy en México.
    static func hoy(_ ahora: Date = Date()) -> String { formatoDia.string(from: ahora) }

    /// «yyyy-MM-dd» de una fecha, contada en México.
    static func dia(_ fecha: Date) -> String { formatoDia.string(from: fecha) }

    /// «yyyy-MM-dd» (o un ISO que empiece así) → fecha a medianoche de México.
    static func fecha(_ texto: String) -> Date? {
        let limpio = String(texto.trimmingCharacters(in: .whitespacesAndNewlines).prefix(10))
        guard limpio.count == 10 else { return nil }
        return formatoDia.date(from: limpio)
    }

    /// «HH:mm» en México de un instante ISO del servidor; `nil` si no se entiende.
    static func hhmm(_ iso: String?) -> String? {
        guard let date = NxFormat.parseISO(iso) else { return nil }
        return formatoHora.string(from: date)
    }
}

// MARK: Campo con contorno

/// `OutlinedTextField` de Android con etiqueta: contorno #CBD5E1 de 1 (de marca
/// y 2 con foco), radio 6, alto mínimo 56, texto 16 y la etiqueta que sube al
/// borde al escribir. `fondoEtiqueta` es el color de lo que hay detrás del campo
/// (la etiqueta «corta» el contorno pintándose encima con ese color).
struct NxOutlinedCampo: View {
    let label: String
    @Binding var text: String
    var keyboard: UIKeyboardType = .default
    var capitalization: TextInputAutocapitalization = .sentences
    var autocorrect: Bool = true
    var contentType: UITextContentType? = nil
    /// `true` = varias líneas (como `singleLine = false` de Android).
    var multiline: Bool = false
    var minLines: Int = 1
    var fondoEtiqueta: Color = NxColors.card

    @FocusState private var focused: Bool

    init(
        label: String,
        text: Binding<String>,
        keyboard: UIKeyboardType = .default,
        capitalization: TextInputAutocapitalization = .sentences,
        autocorrect: Bool = true,
        contentType: UITextContentType? = nil,
        multiline: Bool = false,
        minLines: Int = 1,
        fondoEtiqueta: Color = NxColors.card
    ) {
        self.label = label
        self._text = text
        self.keyboard = keyboard
        self.capitalization = capitalization
        self.autocorrect = autocorrect
        self.contentType = contentType
        self.multiline = multiline
        self.minLines = minLines
        self.fondoEtiqueta = fondoEtiqueta
    }

    var body: some View {
        let arriba = focused || !text.isEmpty
        ZStack(alignment: .topLeading) {
            campo
                .font(NxType.bodyLarge)
                .foregroundStyle(NxColors.fg)
                .tint(NxColors.brand)
                .focused($focused)
                .keyboardType(keyboard)
                .textInputAutocapitalization(capitalization)
                .autocorrectionDisabled(!autocorrect)
                .textContentType(contentType)
                .padding(.horizontal, 16)
                .padding(.vertical, 16)
                .frame(maxWidth: .infinity, minHeight: 56, alignment: .leading)
                .accessibilityLabel(label)

            Text(label)
                .font(.system(size: arriba ? 12 : 16, weight: .regular))
                .foregroundStyle(focused ? NxColors.brand : NxColors.muted)
                .lineLimit(1)
                .padding(.horizontal, arriba ? 4 : 0)
                .background(arriba ? fondoEtiqueta : Color.clear)
                .padding(.leading, arriba ? 12 : 16)
                .offset(y: arriba ? -8 : 18)
                .allowsHitTesting(false)
                .accessibilityHidden(true)
        }
        .background(
            RoundedRectangle(cornerRadius: 6, style: .continuous)
                .strokeBorder(focused ? NxColors.brand : NxColors.borderStrong, lineWidth: focused ? 2 : 1)
        )
        .contentShape(Rectangle())
        .onTapGesture { focused = true }
        .animation(.easeOut(duration: 0.15), value: arriba)
    }

    @ViewBuilder
    private var campo: some View {
        if multiline {
            TextField("", text: $text, axis: .vertical)
                .lineLimit(max(minLines, 1)...max(minLines, 6))
        } else {
            TextField("", text: $text)
        }
    }
}

// MARK: Campo de fecha

/// `DatePickerField` de Android: campo de solo lectura con la fecha
/// «yyyy-MM-dd», botón para limpiar y calendario. Al tocarlo abre el selector
/// con «Aceptar» y «Cancelar». Las fechas se cuentan en hora de México.
struct NxFechaCampo: View {
    let label: String
    /// «yyyy-MM-dd» o vacío.
    @Binding var value: String
    var permitirLimpiar: Bool = true
    /// Última fecha elegible (p. ej. hoy para la fecha de nacimiento).
    var hasta: Date? = nil
    var fondoEtiqueta: Color = NxColors.card

    @State private var eligiendo = false
    @State private var seleccion = Date()

    init(
        label: String,
        value: Binding<String>,
        permitirLimpiar: Bool = true,
        hasta: Date? = nil,
        fondoEtiqueta: Color = NxColors.card
    ) {
        self.label = label
        self._value = value
        self.permitirLimpiar = permitirLimpiar
        self.hasta = hasta
        self.fondoEtiqueta = fondoEtiqueta
    }

    private var mostrado: String { String(value.prefix(10)) }

    var body: some View {
        let arriba = !mostrado.isEmpty
        ZStack(alignment: .topLeading) {
            HStack(spacing: 0) {
                Text(mostrado.isEmpty ? " " : mostrado)
                    .font(NxType.bodyLarge)
                    .foregroundStyle(NxColors.fg)
                    .frame(maxWidth: .infinity, alignment: .leading)
                if permitirLimpiar && !value.isEmpty {
                    Button { value = "" } label: {
                        Image(systemName: "xmark")
                            .font(.system(size: 15, weight: .medium))
                            .foregroundStyle(NxColors.muted)
                            .frame(width: 40, height: 48)
                            .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("Limpiar")
                }
                Image(systemName: "calendar")
                    .font(.system(size: 18, weight: .regular))
                    .foregroundStyle(NxColors.muted)
                    .frame(width: 40, height: 48)
                    .accessibilityHidden(true)
            }
            .padding(.leading, 16)
            .padding(.trailing, 4)
            .frame(maxWidth: .infinity, minHeight: 56, alignment: .leading)

            Text(label)
                .font(.system(size: arriba ? 12 : 16, weight: .regular))
                .foregroundStyle(NxColors.muted)
                .lineLimit(1)
                .padding(.horizontal, arriba ? 4 : 0)
                .background(arriba ? fondoEtiqueta : Color.clear)
                .padding(.leading, arriba ? 12 : 16)
                .offset(y: arriba ? -8 : 18)
                .allowsHitTesting(false)
                .accessibilityHidden(true)
        }
        .background(
            RoundedRectangle(cornerRadius: 6, style: .continuous)
                .strokeBorder(NxColors.borderStrong, lineWidth: 1)
        )
        .contentShape(Rectangle())
        .onTapGesture { abrir() }
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(label): \(mostrado.isEmpty ? "sin fecha" : mostrado)")
        .accessibilityAddTraits(.isButton)
        .accessibilityAction { abrir() }
        .sheet(isPresented: $eligiendo) { selector }
    }

    private func abrir() {
        seleccion = NxHoraMexico.fecha(value) ?? NxHoraMexico.fecha(NxHoraMexico.hoy()) ?? Date()
        if let hasta, seleccion > hasta { seleccion = hasta }
        eligiendo = true
    }

    private var selector: some View {
        NavigationStack {
            VStack(spacing: 0) {
                Group {
                    if let hasta {
                        DatePicker(label, selection: $seleccion, in: ...hasta, displayedComponents: .date)
                    } else {
                        DatePicker(label, selection: $seleccion, displayedComponents: .date)
                    }
                }
                .datePickerStyle(.graphical)
                .labelsHidden()
                .tint(NxColors.brand)
                .environment(\.timeZone, NxHoraMexico.zona)
                .environment(\.locale, Locale(identifier: "es_MX"))
                .padding(.horizontal, NxSpacing.l)
                Spacer(minLength: 0)
            }
            .navigationTitle(label)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancelar") { eligiendo = false }
                        .foregroundStyle(NxColors.brand)
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Aceptar") {
                        value = NxHoraMexico.dia(seleccion)
                        eligiendo = false
                    }
                    .foregroundStyle(NxColors.brand)
                }
            }
        }
        .presentationDetents([.medium, .large])
    }
}

// MARK: Chip de filtro de Material 3

/// `FilterChip` de Material 3 con el tema de Android: 32 de alto, radio 8,
/// contorno #CBD5E1 sin elegir; elegido, relleno #CFECE4 sin contorno y letra
/// #0F5F4F. Texto 14 SemiBold; icono opcional de 18 a la izquierda (de marca).
struct NxFiltroChipM3: View {
    let label: String
    var systemImage: String? = nil
    let selected: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(alignment: .center, spacing: 8) {
                if let systemImage {
                    Image(systemName: systemImage)
                        .font(.system(size: 14, weight: .medium))
                        .foregroundStyle(selected ? NxColors.brandDeep : NxColors.brand)
                        .frame(width: 18, height: 18)
                        .accessibilityHidden(true)
                }
                Text(label)
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(selected ? NxColors.brandDeep : NxColors.muted)
                    .lineLimit(1)
            }
            .padding(.leading, systemImage == nil ? 16 : 8)
            .padding(.trailing, 16)
            .frame(height: 32)
            .background(
                selected ? NxColors.brandSoft2 : Color.clear,
                in: RoundedRectangle(cornerRadius: NxRadius.s, style: .continuous)
            )
            .overlay(
                RoundedRectangle(cornerRadius: NxRadius.s, style: .continuous)
                    .strokeBorder(selected ? Color.clear : NxColors.borderStrong, lineWidth: 1)
            )
            .frame(minHeight: NxMetrics.minTap)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(selected ? AccessibilityTraits.isSelected : [])
    }
}

/// Separador vertical de 24 entre grupos de chips (Android `VerticalDivider`).
struct NxDivisorVertical: View {
    var body: some View {
        Rectangle()
            .fill(NxColors.border)
            .frame(width: 1, height: 24)
            .accessibilityHidden(true)
    }
}

// MARK: Botones de Material 3

/// `Button` de Material 3 a todo lo ancho (píldora de 40, de marca), con el
/// spinner de 18 mientras guarda. Lo usan «Guardar perfil», «Crear cliente»…
struct NxBotonPildora: View {
    let title: String
    var loading: Bool = false
    var enabled: Bool = true
    var fill: Color = NxColors.brand
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Group {
                if loading {
                    ProgressView()
                        .controlSize(.small)
                        .tint(.white)
                        .frame(width: 18, height: 18)
                } else {
                    Text(title)
                }
            }
            .frame(maxWidth: .infinity)
        }
        .buttonStyle(NxPillButtonStyle(fill: fill, foreground: .white))
        .disabled(!enabled || loading)
    }
}

/// `OutlinedButton` de Material 3 (píldora de 40, contorno #CBD5E1, letra de marca).
struct NxBotonContorno: View {
    let title: String
    var enabled: Bool = true
    var tint: Color = NxColors.brand
    let action: () -> Void

    var body: some View {
        Button(title, action: action)
            .buttonStyle(NxPillButtonStyle(fill: .clear, foreground: tint, border: NxColors.borderStrong))
            .disabled(!enabled)
    }
}

// MARK: Aviso corto

/// Aviso corto abajo de la pantalla (Android `NxSnackbarHost`): barra pizarra
/// con letra blanca que se va sola a los 3 segundos.
struct NxAvisoCorto: ViewModifier {
    @Binding var mensaje: String?

    func body(content: Content) -> some View {
        content.overlay(alignment: .bottom) {
            if let mensaje {
                Text(mensaje)
                    .font(NxType.bodyMedium)
                    .foregroundStyle(Color.white)
                    .padding(.horizontal, 16)
                    .padding(.vertical, 14)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(NxColors.fg, in: RoundedRectangle(cornerRadius: 4, style: .continuous))
                    .padding(16)
                    .transition(.move(edge: .bottom).combined(with: .opacity))
                    .task(id: mensaje) {
                        try? await Task.sleep(nanoseconds: 3_000_000_000)
                        withAnimation { self.mensaje = nil }
                    }
                    .accessibilityAddTraits(.isStaticText)
            }
        }
        .animation(.easeOut(duration: 0.2), value: mensaje)
    }
}

extension View {
    /// Aviso corto que se cierra solo (snackbar de Android).
    func nxAvisoCorto(_ mensaje: Binding<String?>) -> some View {
        modifier(NxAvisoCorto(mensaje: mensaje))
    }
}
