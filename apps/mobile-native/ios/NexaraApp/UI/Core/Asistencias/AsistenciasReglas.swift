import SwiftUI

// Reglas y piezas visuales de Asistencias que no dependen de la pantalla: espejo de
// `AttendanceUx.kt`, `AttendanceBadges.kt`, `AttendanceCheckIn.kt` y
// `FaltasJustificadas.kt` de Android, con los mismos textos.

// MARK: - Iconos (Material de Android → SF Symbols)

enum AsisIcono {
    /// `Icons.AutoMirrored.Outlined.Login`.
    static let entrada = "arrow.right.to.line"
    /// `Icons.AutoMirrored.Outlined.Logout`.
    static let salida = "rectangle.portrait.and.arrow.right"
    /// `TaskAlt`.
    static let aprobado = "checkmark.circle"
    /// `Check`.
    static let hecho = "checkmark"
    /// `HourglassTop`.
    static let espera = "hourglass"
    /// `HighlightOff`.
    static let rechazado = "xmark.circle"
    /// `PhotoCamera`.
    static let foto = "camera"
    /// `Restaurant`.
    static let comida = "fork.knife"
    /// `Chat`.
    static let chat = "bubble.left"
    /// `CalendarMonth`.
    static let calendario = "calendar"
    /// `ErrorOutline`.
    static let error = "exclamationmark.circle"
    /// `GpsFixed`.
    static let gps = "scope"
    /// `AccessTime`.
    static let reloj = "clock"
    /// `CloudOff`.
    static let sinRed = "icloud.slash"
}

// MARK: - Piezas visuales

/// Texto con icono al frente (Android `NxIconText`): el icono mide 1,25 × la letra
/// salvo que se diga otra cosa, separado 6, y toma el color del texto.
struct AsisIconText: View {
    let text: String
    var systemImage: String?
    var fontSize: CGFloat = 14
    var weight: Font.Weight = .regular
    var color: Color = NxColors.fg
    var iconSize: CGFloat?
    var spacing: CGFloat = 6
    var lineLimit: Int?

    var body: some View {
        let lado = iconSize ?? fontSize * 1.25
        HStack(alignment: .center, spacing: spacing) {
            if let systemImage {
                Image(systemName: systemImage)
                    .font(.system(size: lado * 0.8, weight: .regular))
                    .frame(width: lado, height: lado)
                    .foregroundStyle(color)
                    .accessibilityHidden(true)
            }
            Text(text)
                .font(.system(size: fontSize, weight: weight))
                .foregroundStyle(color)
                .lineLimit(lineLimit)
                .fixedSize(horizontal: false, vertical: true)
        }
    }
}

/// Renglones que se acomodan con separación horizontal y vertical distintas
/// (`FlowRow` de Compose).
struct AsisFlowLayout: Layout {
    var horizontal: CGFloat = 6
    var vertical: CGFloat = 6

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let maxWidth = proposal.width ?? .infinity
        var x: CGFloat = 0
        var y: CGFloat = 0
        var rowHeight: CGFloat = 0
        var widest: CGFloat = 0
        for subview in subviews {
            let size = subview.sizeThatFits(ProposedViewSize(width: maxWidth, height: nil))
            if x > 0 && x + size.width > maxWidth {
                y += rowHeight + vertical
                x = 0
                rowHeight = 0
            }
            x += size.width + horizontal
            rowHeight = max(rowHeight, size.height)
            widest = max(widest, x - horizontal)
        }
        return CGSize(width: proposal.width ?? widest, height: y + rowHeight)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        var x = bounds.minX
        var y = bounds.minY
        var rowHeight: CGFloat = 0
        for subview in subviews {
            let size = subview.sizeThatFits(ProposedViewSize(width: bounds.width, height: nil))
            if x > bounds.minX && x + size.width > bounds.maxX {
                y += rowHeight + vertical
                x = bounds.minX
                rowHeight = 0
            }
            subview.place(at: CGPoint(x: x, y: y), proposal: ProposedViewSize(width: size.width, height: size.height))
            x += size.width + horizontal
            rowHeight = max(rowHeight, size.height)
        }
    }
}

/// Nota suave con icono (Android `SoftNote`): fondo del color al 9 % (gris
/// #F1F5F9 sin color), radio 12, icono de 18 y texto 13,5.
struct AsisSoftNote: View {
    let text: String
    var color: Color?
    var systemImage: String?

    var body: some View {
        HStack(alignment: .top, spacing: 10) {
            if let systemImage {
                Image(systemName: systemImage)
                    .font(.system(size: 15, weight: .regular))
                    .frame(width: 18, height: 18)
                    .foregroundStyle(color ?? NxColors.muted)
                    .padding(.top, 1)
                    .accessibilityHidden(true)
            }
            Text(text)
                .font(.system(size: 13.5))
                .foregroundStyle(NxColors.fg)
                .fixedSize(horizontal: false, vertical: true)
                .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 10)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(color.map { $0.opacity(0.09) } ?? NxColors.sunken, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
    }
}

/// Avisos de una checada como punto y palabra (Android `AvisosChecada`).
struct AvisosChecada: View {
    let avisos: [AttendanceBadge]

    var body: some View {
        AsisFlowLayout(horizontal: 14, vertical: 4) {
            ForEach(avisos) { aviso in
                NxStatusDot(text: aviso.texto, color: aviso.color, fontSize: 11.5, fontWeight: .semibold)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

/// «Falta justificada · motivo», con quién la justificó. Sin caja: una línea de
/// color de 2 a la izquierda basta (Android `FaltaJustificadaNota`).
struct FaltaJustificadaNota: View {
    let justificacion: AttendanceJustification

    var body: some View {
        VStack(alignment: .leading, spacing: 1) {
            Text(FaltasJustificadas.texto(justificacion))
                .font(.system(size: 13, weight: .semibold))
                .foregroundStyle(AttendanceEstado.justificada.color)
                .fixedSize(horizontal: false, vertical: true)
            if let quien = FaltasJustificadas.quien(justificacion) {
                Text(quien)
                    .font(.system(size: 11.5))
                    .foregroundStyle(NxColors.muted)
            }
        }
        .padding(.leading, 12)
        .frame(maxWidth: .infinity, alignment: .leading)
        // La raya mide lo que mide el texto, como `fillMaxHeight` dentro de `IntrinsicSize.Min`.
        .overlay(alignment: .leading) {
            Rectangle()
                .fill(AttendanceEstado.justificada.color)
                .frame(width: 2)
        }
    }
}

// MARK: - Insignias de una checada (contrato A)

/// Qué le pasó al registro y por qué (Android `AttendanceBadge`).
struct AttendanceBadge: Identifiable {
    let texto: String
    let color: Color
    var id: String { texto }
}

enum AttendanceBadges {
    static let ambar = NxColors.naranja        // #D97706
    static let rojo = NxColors.rojo            // #DC2626
    static let morado = NxColors.morado        // #7C3AED
    static let gris = NxColors.rgb(0x64748B)

    static let sinConexion = "Sin conexión"
    static let cierreAutomatico = "Cierre automático"
    static let corregida = "Corregida"

    /// «Revisar: La hora del teléfono no coincidía» (sin motivo, solo «Revisar»).
    static func revisarTexto(_ motivo: String?) -> String {
        let m = (motivo ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        return m.isEmpty ? "Revisar" : "Revisar: \(m)"
    }

    /// «Fuera de sitio · 450 m» · «Fuera de sitio · 450 m de Oficina».
    static func fueraDeSitioTexto(_ distanciaM: Int?, sitioNombre: String?) -> String {
        let distancia = distanciaM.flatMap { $0 >= 0 ? " · \($0) m" : nil } ?? ""
        let nombre = (sitioNombre ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        let sitio = (!nombre.isEmpty && !distancia.isEmpty) ? " de \(nombre)" : ""
        return "Fuera de sitio\(distancia)\(sitio)"
    }

    /// Insignias en el orden en que importan: primero por qué no cuenta como normal,
    /// luego dónde y al final que alguien la corrigió.
    static func de(
        validacion: String?,
        motivoValidacion: String?,
        offline: Bool = false,
        fueraDeSitio: Bool = false,
        distanciaSitioM: Int? = nil,
        sitioNombre: String? = nil,
        cierreAutomatico: Bool = false,
        correcciones: Int = 0
    ) -> [AttendanceBadge] {
        var out: [AttendanceBadge] = []
        let estado = (validacion ?? "").trimmingCharacters(in: .whitespacesAndNewlines).uppercased()
        let motivo = (motivoValidacion ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        if offline { out.append(AttendanceBadge(texto: sinConexion, color: gris)) }
        if cierreAutomatico { out.append(AttendanceBadge(texto: Self.cierreAutomatico, color: ambar)) }
        if estado == "REVISAR" {
            out.append(AttendanceBadge(texto: revisarTexto(motivo), color: rojo))
        } else if estado == "PENDIENTE" && !offline {
            out.append(AttendanceBadge(texto: motivo.isEmpty ? sinConexion : revisarTexto(motivo), color: ambar))
        }
        if fueraDeSitio {
            out.append(AttendanceBadge(texto: fueraDeSitioTexto(distanciaSitioM, sitioNombre: sitioNombre), color: ambar))
        }
        if correcciones > 0 { out.append(AttendanceBadge(texto: corregida, color: morado)) }
        // Dos insignias con el mismo texto romperían el `ForEach`; además no informan dos veces.
        var vistos = Set<String>()
        return out.filter { vistos.insert($0.texto).inserted }
    }

    /// Insignias de una checada del equipo o del historial propio.
    static func de(_ punch: AttendancePunch?) -> [AttendanceBadge] {
        guard let punch else { return [] }
        return de(
            validacion: punch.validacion,
            motivoValidacion: punch.motivoValidacion,
            offline: punch.offline,
            fueraDeSitio: punch.fueraDeSitio,
            distanciaSitioM: punch.distanciaSitioM,
            sitioNombre: punch.sitioNombre,
            cierreAutomatico: punch.cierreAutomatico,
            correcciones: punch.correcciones.count
        )
    }

    /// Lo que el servidor contestó al registrar (APIs viejas no traen nada: lista vacía).
    static func deRegistro(_ raw: [String: Any]) -> [AttendanceBadge] {
        let fuera: Bool = {
            if let b = raw["fueraDeSitio"] as? Bool { return b }
            return (raw["fueraDeSitio"] as? NSNumber)?.boolValue ?? false
        }()
        return de(
            validacion: StockParse.str(raw["validacion"]),
            motivoValidacion: StockParse.str(raw["motivoValidacion"]),
            fueraDeSitio: fuera,
            distanciaSitioM: StockParse.int(raw["distanciaSitioM"]),
            sitioNombre: StockParse.str(raw["sitioNombre"])
        )
    }

    /// «Corregida por Christian: el reloj marcó la salida tarde».
    static func correccionTexto(_ c: AttendanceCorreccion) -> String {
        let quien = c.porNombre.trimmingCharacters(in: .whitespacesAndNewlines)
        let motivo = c.motivo.trimmingCharacters(in: .whitespacesAndNewlines)
        return "Corregida" + (quien.isEmpty ? "" : " por \(quien)") + (motivo.isEmpty ? "" : ": \(motivo)")
    }
}

// MARK: - Checada (textos de la confirmación)

enum AttendanceCheckInNota {
    /// Arriba de 200 m el servidor la acepta pero la deja «Revisar: Ubicación imprecisa».
    static let precisionARevisar: Double = 200
    /// Baja precisión: se avisa en pantalla antes de que el servidor lo marque.
    static let precisionBaja: Double = 100

    /// Sufijo de la confirmación: « · GPS ±12m», « (sin GPS — activa ubicación)».
    static func notaGps(hayCoords: Bool, accuracyM: Double?, mock: Bool) -> String {
        if !hayCoords { return " (sin GPS — activa ubicación)" }
        if mock { return " · ubicación simulada detectada" }
        guard let acc = accuracyM, acc.isFinite else { return " · GPS ok" }
        let metros = Int(acc)
        if acc > precisionARevisar { return " · GPS ±\(metros)m (quedará para revisar)" }
        if acc > precisionBaja { return " · GPS ±\(metros)m (baja precisión)" }
        return " · GPS ±\(metros)m"
    }
}

// MARK: - Faltas justificadas

/// Espejo de `FaltasJustificadas.kt`: solo Christian justifica, con motivo, un día
/// sin checada de entrada que no sea futuro.
enum FaltasJustificadas {
    static let motivoMinimo = 10
    static let motivoMaximo = 1000
    static let etiqueta = "Falta justificada"

    /// La justificación de ese día (`AAAA-MM-DD`), si la hay.
    static func delDia(_ lista: [AttendanceJustification], fecha: String) -> AttendanceJustification? {
        lista.first { String($0.fecha.prefix(10)) == fecha }
    }

    /// «Falta justificada · Incapacidad del IMSS».
    static func texto(_ j: AttendanceJustification) -> String {
        let motivo = j.motivo.trimmingCharacters(in: .whitespacesAndNewlines)
        return motivo.isEmpty ? etiqueta : "\(etiqueta) · \(motivo)"
    }

    /// «Justificó Christian Ruiz» para la línea de abajo.
    static func quien(_ j: AttendanceJustification) -> String? {
        let nombre = j.justificadaPor.trimmingCharacters(in: .whitespacesAndNewlines)
        return nombre.isEmpty ? nil : "Justificó \(nombre)"
    }

    static func motivoLimpio(_ motivo: String) -> String {
        motivo.split(whereSeparator: { $0.isWhitespace }).joined(separator: " ")
    }

    static func motivoOk(_ motivo: String) -> Bool {
        motivoLimpio(motivo).count >= motivoMinimo
    }

    /// «Justificar falta» solo si quien ve puede, la persona no checó entrada ese
    /// día, aún no está justificado y el día no es futuro.
    static func ofrecerJustificar(puede: Bool, hayEntrada: Bool, yaJustificada: Bool, fecha: String, hoy: String) -> Bool {
        puede && !hayEntrada && !yaJustificada && !fecha.isEmpty && fecha <= hoy
    }
}

// MARK: - Equipo del día (cifras, filtros y título)

enum AttendanceUx {
    static let metricaEnJornada = "en_jornada"
    static let metricaCompletaron = "completaron"
    static let metricaSinChecada = "sin_checada"

    /// La tira de cifras del día: tres celdas y nada si no hay nadie que contar.
    static func metricas(_ rows: [AttendanceDayRow]) -> [NxMetric] {
        guard !rows.isEmpty else { return [] }
        let enJornada = rows.filter { $0.estado == .presente }.count
        let completaron = rows.filter { $0.estado == .completo }.count
        let sinChecada = rows.filter { $0.estado == .ausente }.count
        return [
            NxMetric(
                clave: metricaEnJornada,
                etiqueta: "En jornada",
                valor: "\(enJornada)",
                pista: enJornada == 0 ? "nadie dentro" : "checaron entrada"
            ),
            NxMetric(
                clave: metricaCompletaron,
                etiqueta: "Completaron",
                valor: "\(completaron)",
                pista: "entrada y salida"
            ),
            NxMetric(
                clave: metricaSinChecada,
                etiqueta: "Sin checada",
                valor: "\(sinChecada)",
                // Solo se tiñe si alguien falta.
                pista: sinChecada == 0 ? "todos registrados" : "hay que preguntar",
                color: sinChecada > 0 ? NxColors.rojo : nil
            ),
        ]
    }

    static func estadoDeMetrica(_ clave: String) -> AttendanceEstado? {
        switch clave {
        case metricaEnJornada: return .presente
        case metricaCompletaron: return .completo
        case metricaSinChecada: return .ausente
        default: return nil
        }
    }

    static func metricaDeEstado(_ estado: AttendanceEstado?) -> String? {
        switch estado {
        case .presente: return metricaEnJornada
        case .completo: return metricaCompletaron
        case .ausente: return metricaSinChecada
        default: return nil
        }
    }

    struct Filtro: Identifiable {
        let estado: AttendanceEstado?
        let etiqueta: String
        let conteo: Int
        let color: Color?
        var id: String { estado?.rawValue ?? "todos" }
    }

    /// La única barra de filtros. «Falta justificada» solo si ese día hay alguna.
    static func filtros(_ rows: [AttendanceDayRow]) -> [Filtro] {
        guard !rows.isEmpty else { return [] }
        var out = [Filtro(estado: nil, etiqueta: "Todos", conteo: rows.count, color: nil)]
        for estado in AttendanceEstado.allCases {
            let n = rows.filter { $0.estado == estado }.count
            if estado != .justificada || n > 0 {
                out.append(Filtro(estado: estado, etiqueta: estado.label, conteo: n, color: estado.color))
            }
        }
        return out
    }

    /// Mientras alguien tenga la jornada abierta, el reloj tiene que latir.
    static func hayJornadaAbierta(_ rows: [AttendanceDayRow], miJornadaAbierta: Bool) -> Bool {
        miJornadaAbierta || rows.contains { $0.estado == .presente }
    }

    /// «Equipo del día (8)» o «Sin checada (2)» cuando hay filtro.
    static func tituloLista(_ filtro: AttendanceEstado?, visibles: Int) -> String {
        "\(filtro?.label ?? "Equipo del día") (\(visibles))"
    }
}

// MARK: - Pestaña pedida desde fuera

/// Un aviso de comida o el botón «Comida» de Inicio abren Asistencias en su pestaña
/// «Comidas» (Android: `attendanceTab = "comidas"` + `selectTab(Attendance)`). El
/// shell deja aquí la pestaña y la pantalla la consume una vez.
@MainActor
final class AsistenciasPestanaPedida: ObservableObject {
    static let shared = AsistenciasPestanaPedida()
    @Published private(set) var pendiente: AsistenciasTab?

    private init() {}

    func pedir(_ tab: AsistenciasTab) {
        pendiente = tab
    }

    /// La pestaña pedida (si la hay), y se olvida.
    func consumir() -> AsistenciasTab? {
        let tab = pendiente
        if tab != nil { pendiente = nil }
        return tab
    }
}
