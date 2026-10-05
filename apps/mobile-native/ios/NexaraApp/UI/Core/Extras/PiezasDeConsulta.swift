import SwiftUI
import UIKit

// MARK: - Piezas de Material 3 que usan Viáticos, Vehículos, Almacén, Proyectos y KPIs
//
// Lo que la base visual (`NxParityComponents.swift`) no trae y estas pantallas de
// Android sí usan: la fila de pastillas de «Más» (`MoreFilaDePastillas`), el
// `FilterChip`, los botones de píldora de Material 3 (`Button`, `OutlinedButton`,
// `TextButton`), el `OutlinedTextField` con etiqueta flotante, el `Snackbar` y la
// hoja inferior. Cada pieza dice de qué componente de Android sale.

// MARK: - Fechas en la hora de México

/// Fechas como las escribe Android (`NxFormat.date` / `dateTime`), siempre en
/// America/Mexico_City y con las abreviaturas fijas de Android («sept», no
/// «sep.» ni «sep» según la versión del sistema).
enum FechaMexico {
    static let zona = TimeZone(identifier: "America/Mexico_City") ?? .current

    /// Calendario gregoriano en la zona de México; la semana empieza el lunes.
    static let calendario: Calendar = {
        var c = Calendar(identifier: .gregorian)
        c.timeZone = zona
        c.locale = Locale(identifier: "es_MX")
        c.firstWeekday = 2
        return c
    }()

    private static let meses = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sept", "oct", "nov", "dic"]

    private static let mesLargo: DateFormatter = {
        let f = DateFormatter()
        f.locale = Locale(identifier: "es_MX")
        f.timeZone = zona
        f.calendar = calendario
        f.dateFormat = "d 'de' MMMM"
        return f
    }()

    /// Lee lo que manda el API: un instante ISO (con hora y zona) o una fecha
    /// de calendario «AAAA-MM-DD», que se respeta tal cual sin moverla de día.
    static func leer(_ raw: String?) -> (fecha: Date, soloDia: Bool)? {
        let texto = (raw ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        guard !texto.isEmpty, texto != "null" else { return nil }
        if texto.count == 10, let dia = diaDeCalendario(texto) { return (dia, true) }
        if let instante = NxFormat.parseISO(texto), texto.count > 10 { return (instante, false) }
        // «2026-10-05T09:00» sin zona: es hora de México.
        if texto.count >= 16, texto.contains("T") {
            let partes = texto.prefix(16).split(separator: "T")
            if partes.count == 2, let dia = diaDeCalendario(String(partes[0])) {
                let hm = partes[1].split(separator: ":").compactMap { Int($0) }
                if hm.count == 2, let fecha = calendario.date(bySettingHour: hm[0], minute: hm[1], second: 0, of: dia) {
                    return (fecha, false)
                }
            }
        }
        if let dia = diaDeCalendario(String(texto.prefix(10))) { return (dia, true) }
        return nil
    }

    /// «2026-09-26» → mediodía de ese día en México (el mediodía no cambia de
    /// fecha con ningún horario de verano).
    private static func diaDeCalendario(_ texto: String) -> Date? {
        let partes = texto.split(separator: "-").compactMap { Int($0) }
        guard partes.count == 3 else { return nil }
        var c = DateComponents()
        c.year = partes[0]
        c.month = partes[1]
        c.day = partes[2]
        c.hour = 12
        return calendario.date(from: c)
    }

    /// «26 sept 2026» (Android `NxFormat.date`).
    static func dia(_ fecha: Date) -> String {
        let c = calendario.dateComponents([.day, .month, .year], from: fecha)
        return "\(c.day ?? 1) \(meses[max(0, min(11, (c.month ?? 1) - 1))]) \(c.year ?? 2026)"
    }

    /// «26 sept» (Android `ProyectosRules.fechaCorta`).
    static func diaCorto(_ fecha: Date) -> String {
        let c = calendario.dateComponents([.day, .month], from: fecha)
        return "\(c.day ?? 1) \(meses[max(0, min(11, (c.month ?? 1) - 1))])"
    }

    /// «14:30».
    static func hora(_ fecha: Date) -> String {
        let c = calendario.dateComponents([.hour, .minute], from: fecha)
        return String(format: "%02d:%02d", c.hour ?? 0, c.minute ?? 0)
    }

    /// «5 de octubre».
    static func diaMesLargo(_ fecha: Date) -> String { mesLargo.string(from: fecha) }

    /// Texto del API → «26 sept 2026»; `nil` si viene vacío. Si no se entiende,
    /// el texto tal cual (Android hace lo mismo).
    static func dia(iso: String?) -> String? {
        let texto = (iso ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        guard !texto.isEmpty, texto != "null" else { return nil }
        guard let leida = leer(texto) else { return texto }
        return dia(leida.fecha)
    }

    /// Texto del API → «26 sept 2026, 14:30» (solo la fecha si no trae hora).
    static func diaHora(iso: String?) -> String? {
        let texto = (iso ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        guard !texto.isEmpty, texto != "null" else { return nil }
        guard let leida = leer(texto) else { return texto }
        if leida.soloDia { return dia(leida.fecha) }
        return "\(dia(leida.fecha)), \(hora(leida.fecha))"
    }

    /// Fecha de calendario «AAAA-MM-DD» de un día en México (para el API).
    static func diaApi(_ fecha: Date) -> String {
        let c = calendario.dateComponents([.year, .month, .day], from: fecha)
        return String(format: "%04d-%02d-%02d", c.year ?? 2026, c.month ?? 1, c.day ?? 1)
    }
}

// MARK: - Pastillas de filtro (Android `MoreFilaDePastillas` + `MorePastilla`)

/// Una pastilla con su cuenta: «Necesitan atención · 3».
struct PastillaDeConsulta: Identifiable {
    let etiqueta: String
    var conteo: Int? = nil
    let seleccionada: Bool
    let onClick: () -> Void

    var id: String { etiqueta }
}

/// Fila de pastillas que se desliza en horizontal (Android `MoreFilaDePastillas`):
/// `FilterChip` de Material 3 con «etiqueta · cuenta»; la elegida en `brandSoft`
/// con letra `brandText`.
struct FilaDePastillasDeConsulta: View {
    let pastillas: [PastillaDeConsulta]

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: NxSpacing.s) {
                ForEach(pastillas) { pastilla in
                    ChipDeFiltroMaterial(
                        texto: pastilla.conteo.map { "\(pastilla.etiqueta) · \($0)" } ?? pastilla.etiqueta,
                        seleccionado: pastilla.seleccionada,
                        onClick: pastilla.onClick
                    )
                }
            }
            .padding(.horizontal, 2)
        }
    }
}

/// `FilterChip` de Material 3: 32 de alto (48 de toque), radio 8, letra 14
/// SemiBold. Sin elegir: contorno #E2E8F0 y letra gris; elegido: relleno y
/// letra del color que se pida, sin contorno.
struct ChipDeFiltroMaterial: View {
    let texto: String
    let seleccionado: Bool
    /// Por omisión, los de `MoreFilaDePastillas` (#E7F5F1 / #12715E).
    var fondoActivo: Color = NxColors.brandSoft
    var textoActivo: Color = NxColors.brandText
    /// Alto del chip dibujado; el área de toque nunca baja de 48.
    var alto: CGFloat = 32
    /// Ocupa todo el ancho que le den (los cinco niveles de gasolina).
    var llenaAncho: Bool = false
    var habilitado: Bool = true
    let onClick: () -> Void

    var body: some View {
        Button(action: onClick) {
            Text(texto)
                .font(NxType.labelLarge)
                .lineLimit(1)
                .foregroundStyle(seleccionado ? textoActivo : NxColors.muted)
                .padding(.horizontal, 12)
                .frame(maxWidth: llenaAncho ? .infinity : nil)
                .frame(height: alto)
                .background(
                    seleccionado ? fondoActivo : Color.clear,
                    in: RoundedRectangle(cornerRadius: NxRadius.s, style: .continuous)
                )
                .overlay {
                    if !seleccionado {
                        RoundedRectangle(cornerRadius: NxRadius.s, style: .continuous)
                            .strokeBorder(NxColors.border, lineWidth: 1)
                    }
                }
                .padding(.vertical, max(0, (48 - alto) / 2))
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .disabled(!habilitado)
        .opacity(habilitado ? 1 : 0.38)
        .accessibilityAddTraits(seleccionado ? AccessibilityTraits.isSelected : [])
    }
}

// MARK: - Botones de píldora (Material 3 `Button` / `OutlinedButton` / `TextButton`)

/// Los botones por omisión de Material 3 que usan estas pantallas de Android:
/// forma de píldora, letra 14 SemiBold y 40 de alto mínimo (o el que se pida).
/// Deshabilitados: relleno al 12 % y letra al 38 % del texto principal.
struct BotonMaterialStyle: ButtonStyle {
    enum Tipo {
        /// `Button` con `containerColor`.
        case lleno(Color)
        /// `OutlinedButton`: contorno #CBD5E1 y letra del color dado.
        case contorno(Color)
        /// `TextButton`: solo la letra.
        case texto(Color)
    }

    var tipo: Tipo
    var alto: CGFloat = 40
    var llenaAncho: Bool = false
    var fuente: Font = NxType.labelLarge

    func makeBody(configuration: Configuration) -> some View {
        BotonMaterialCuerpo(configuration: configuration, tipo: tipo, alto: alto, llenaAncho: llenaAncho, fuente: fuente)
    }
}

private struct BotonMaterialCuerpo: View {
    let configuration: ButtonStyleConfiguration
    let tipo: BotonMaterialStyle.Tipo
    let alto: CGFloat
    let llenaAncho: Bool
    let fuente: Font
    @Environment(\.isEnabled) private var isEnabled

    private var tinta: Color {
        guard isEnabled else { return NxColors.fg.opacity(0.38) }
        switch tipo {
        case .lleno: return .white
        case .contorno(let c), .texto(let c): return c
        }
    }

    private var relleno: Color {
        switch tipo {
        case .lleno(let c): return isEnabled ? c : NxColors.fg.opacity(0.12)
        case .contorno(let c), .texto(let c): return configuration.isPressed ? c.opacity(0.08) : .clear
        }
    }

    private var horizontal: CGFloat {
        if case .texto = tipo { return 12 }
        return 24
    }

    private var conContorno: Bool {
        if case .contorno = tipo { return true }
        return false
    }

    var body: some View {
        configuration.label
            .font(fuente)
            .lineLimit(1)
            .foregroundStyle(tinta)
            .padding(.horizontal, horizontal)
            .padding(.vertical, 8)
            .frame(maxWidth: llenaAncho ? .infinity : nil, minHeight: alto)
            .background(relleno, in: Capsule())
            .overlay {
                if conContorno {
                    Capsule().strokeBorder(isEnabled ? NxColors.borderStrong : NxColors.fg.opacity(0.12), lineWidth: 1)
                }
            }
            .opacity(configuration.isPressed ? 0.85 : 1)
            .contentShape(Capsule())
    }
}

/// Spinner blanco de 20 para el botón que está enviando (Android
/// `CircularProgressIndicator(color = White, strokeWidth = 2.dp)`).
struct SpinnerDeBoton: View {
    var color: Color = .white

    var body: some View {
        ProgressView()
            .controlSize(.small)
            .tint(color)
            .frame(width: 20, height: 20)
    }
}

// MARK: - Campo delineado (Material 3 `OutlinedTextField`)

/// Marco del `OutlinedTextField`: radio 6, contorno #CBD5E1 (2 de marca con
/// foco, rojo con error) y la etiqueta que sube al borde cuando hay foco o
/// texto. Sin foco ni texto, la etiqueta va dentro como pista.
struct MarcoDelineado<Contenido: View>: View {
    let etiqueta: String
    let enfocado: Bool
    let vacio: Bool
    var error: Bool = false
    /// Color detrás de la etiqueta flotante: el de lo que rodea al campo.
    var fondo: Color = NxColors.surface
    /// Dónde empieza la pista de dentro (después del «$» de un importe).
    var inicioPista: CGFloat = 16
    var minAlto: CGFloat = 56
    let contenido: Contenido

    init(
        etiqueta: String,
        enfocado: Bool,
        vacio: Bool,
        error: Bool = false,
        fondo: Color = NxColors.surface,
        inicioPista: CGFloat = 16,
        minAlto: CGFloat = 56,
        @ViewBuilder contenido: () -> Contenido
    ) {
        self.etiqueta = etiqueta
        self.enfocado = enfocado
        self.vacio = vacio
        self.error = error
        self.fondo = fondo
        self.inicioPista = inicioPista
        self.minAlto = minAlto
        self.contenido = contenido()
    }

    private var flota: Bool { enfocado || !vacio }

    private var tinta: Color {
        if error { return NxColors.danger }
        return enfocado ? NxColors.brand : NxColors.muted
    }

    var body: some View {
        contenido
            .padding(.horizontal, 16)
            .padding(.vertical, 16)
            .frame(maxWidth: .infinity, minHeight: minAlto, alignment: .leading)
            .overlay {
                RoundedRectangle(cornerRadius: 6, style: .continuous)
                    .strokeBorder(
                        error ? NxColors.danger : (enfocado ? NxColors.brand : NxColors.borderStrong),
                        lineWidth: enfocado || error ? 2 : 1
                    )
            }
            .overlay(alignment: .topLeading) {
                if flota {
                    Text(etiqueta)
                        .font(.system(size: 12, weight: .regular))
                        .foregroundStyle(tinta)
                        .lineLimit(1)
                        .padding(.horizontal, 4)
                        .background(fondo)
                        .offset(x: 12, y: -8)
                        .accessibilityHidden(true)
                } else {
                    Text(etiqueta)
                        .font(NxType.bodyLarge)
                        .foregroundStyle(error ? NxColors.danger : NxColors.muted)
                        .lineLimit(1)
                        .padding(.leading, inicioPista)
                        .padding(.top, 17)
                        .allowsHitTesting(false)
                        .accessibilityHidden(true)
                }
            }
    }
}

/// `OutlinedTextField` con su etiqueta (Android `NxFormTextField`): letra 16,
/// texto de error rojo debajo o, si no hay error, la ayuda en gris.
struct CampoDelineado: View {
    let etiqueta: String
    @Binding var texto: String
    var error: String? = nil
    var ayuda: String? = nil
    var multilinea: Bool = false
    var minLineas: Int = 1
    var teclado: UIKeyboardType = .default
    var mayusculas: Bool = false
    var habilitado: Bool = true
    var fondo: Color = NxColors.surface
    /// Tope de caracteres, como el `take(n)` de Android.
    var maxLargo: Int? = nil

    @FocusState private var enfocado: Bool

    private var limitado: Binding<String> {
        Binding(
            get: { texto },
            set: { nuevo in
                if let maxLargo, nuevo.count > maxLargo {
                    texto = String(nuevo.prefix(maxLargo))
                } else {
                    texto = nuevo
                }
            }
        )
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            MarcoDelineado(
                etiqueta: etiqueta,
                enfocado: enfocado,
                vacio: texto.isEmpty,
                error: error != nil,
                fondo: fondo
            ) {
                campo
                    .font(NxType.bodyLarge)
                    .foregroundStyle(NxColors.fg)
                    .tint(NxColors.brand)
                    .keyboardType(teclado)
                    .textInputAutocapitalization(mayusculas ? .characters : .sentences)
                    .focused($enfocado)
                    .disabled(!habilitado)
                    .accessibilityLabel(etiqueta)
            }
            .contentShape(Rectangle())
            .onTapGesture { if habilitado { enfocado = true } }
            .opacity(habilitado ? 1 : 0.6)

            if let error {
                Text(error)
                    .font(NxType.bodySmall)
                    .foregroundStyle(NxColors.danger)
                    .padding(.horizontal, 16)
                    .fixedSize(horizontal: false, vertical: true)
            } else if let ayuda, !ayuda.isEmpty {
                Text(ayuda)
                    .font(NxType.bodySmall)
                    .foregroundStyle(NxColors.muted)
                    .padding(.horizontal, 16)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
    }

    @ViewBuilder
    private var campo: some View {
        if multilinea {
            TextField("", text: limitado, axis: .vertical)
                .lineLimit(max(1, minLineas)...max(max(1, minLineas), 6))
        } else {
            TextField("", text: limitado)
        }
    }
}

// MARK: - Snackbar (Android `NxSnackbarHost`)

private struct AvisoSnackbarModifier: ViewModifier {
    @Binding var mensaje: String?
    let abajo: CGFloat

    func body(content: Content) -> some View {
        content
            .overlay(alignment: .bottom) {
                if let texto = mensaje {
                    Text(texto)
                        .font(NxType.bodyMedium)
                        .foregroundStyle(Color.white)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .fixedSize(horizontal: false, vertical: true)
                        .padding(.horizontal, 16)
                        .padding(.vertical, 14)
                        .frame(minHeight: 48)
                        .background(NxColors.fg, in: RoundedRectangle(cornerRadius: NxRadius.l, style: .continuous))
                        .padding(.horizontal, 12)
                        .padding(.bottom, abajo)
                        .transition(.move(edge: .bottom).combined(with: .opacity))
                        .onTapGesture { mensaje = nil }
                }
            }
            .animation(.easeOut(duration: 0.2), value: mensaje)
            .task(id: mensaje) {
                guard let texto = mensaje else { return }
                UIAccessibility.post(notification: .announcement, argument: texto)
                try? await Task.sleep(nanoseconds: 4_000_000_000)
                if !Task.isCancelled, mensaje == texto { mensaje = nil }
            }
    }
}

extension View {
    /// Snackbar de Android: cinta #0F172A con letra blanca, radio 16, abajo;
    /// se va sola a los 4 s o al tocarla.
    func avisoSnackbar(_ mensaje: Binding<String?>, abajo: CGFloat = 12) -> some View {
        modifier(AvisoSnackbarModifier(mensaje: mensaje, abajo: abajo))
    }

    /// Hoja inferior de Material 3 (`ModalBottomSheet`): asa visible, radio 28 y
    /// fondo #F8FAFC.
    func hojaMaterial(detents: Set<PresentationDetent> = [.large]) -> some View {
        presentationDetents(detents)
            .presentationDragIndicator(.visible)
            .presentationCornerRadius(28)
            .presentationBackground(NxColors.surface)
    }
}

// MARK: - Fila para elegir en una hoja (Android `TextButton` a todo lo ancho)

/// Renglón de una lista de opciones dentro de una hoja: título 16 en dos
/// líneas y una línea gris debajo, 48 de alto mínimo.
struct OpcionDeHoja: View {
    let titulo: String
    var detalle: String? = nil
    let onClick: () -> Void

    var body: some View {
        Button(action: onClick) {
            VStack(alignment: .leading, spacing: 0) {
                Text(titulo)
                    .font(NxType.bodyLarge)
                    .foregroundStyle(NxColors.fg)
                    .lineLimit(2)
                    .multilineTextAlignment(.leading)
                if let detalle, !detalle.isEmpty {
                    Text(detalle)
                        .font(NxType.labelMedium)
                        .foregroundStyle(NxColors.muted)
                        .lineLimit(1)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, 20)
            .padding(.vertical, 8)
            .frame(minHeight: 48)
            .contentShape(Rectangle())
        }
        .buttonStyle(NxPressableStyle())
    }
}
