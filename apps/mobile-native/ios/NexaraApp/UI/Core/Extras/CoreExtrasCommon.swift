import SwiftUI

/// Piezas que comparten las pantallas de consulta de «Más» en iOS.
///
/// Desde la paridad con Android (octubre de 2026) la referencia de diseño es la
/// app Android: fondo #F8FAFC, tarjetas blancas y las piezas de
/// `UI/Enterprise/NxParityComponents.swift` (`MoreTarjeta`, `MoreCabecera`,
/// `MoreDatoCard`, `MoreNotaDeAlcance`, `NxMetricStrip`…). Lo de aquí se
/// conserva para las pantallas que todavía son listas de iOS, con los colores
/// de Android, hasta que cada una se rehaga.

// MARK: - Estado de carga

/// Estado de una pantalla de consulta.
///
/// La regla que lo ordena todo: **un fallo al refrescar no borra lo que ya se
/// veía**. Si falla la primera carga no hay nada que enseñar y va `error`; si
/// falla un refresco posterior, los datos viejos se quedan y el fallo se cuenta
/// en `avisoDesactualizado`, que es una cinta, no una pantalla en blanco. En
/// campo, con media raya de señal, perder la lista por un refresco fallido es
/// peor que leer un dato de hace dos minutos.
struct CoreExtrasEstado<T> {
    var datos: T?
    var cargando = true
    /// Primera carga fallida: no hay nada en pantalla.
    var error: String?
    /// Refresco fallido con datos viejos todavía en pantalla.
    var avisoDesactualizado: String?

    var hayDatos: Bool { datos != nil }
    /// Solo se enseña el hueco de carga cuando de verdad no hay nada debajo.
    var mostrandoEsqueleto: Bool { cargando && datos == nil }

    mutating func empezar() {
        cargando = true
        avisoDesactualizado = nil
        if datos == nil { error = nil }
    }

    mutating func exito(_ valor: T) {
        datos = valor
        cargando = false
        error = nil
        avisoDesactualizado = nil
    }

    mutating func fallo(_ mensaje: String) {
        cargando = false
        if datos == nil {
            error = mensaje
        } else {
            avisoDesactualizado = mensaje
        }
    }
}

// MARK: - Semáforo

/// El semáforo que manda el servidor (`verde` · `amarillo` · `rojo` · `sin_datos`).
enum CoreExtrasSemaforo: String {
    case verde, amarillo, rojo, sinDatos

    init(_ valor: String?) {
        switch (valor ?? "").trimmingCharacters(in: .whitespaces).lowercased() {
        case "verde": self = .verde
        case "amarillo": self = .amarillo
        case "rojo": self = .rojo
        default: self = .sinDatos
        }
    }

    /// El color nunca informa solo: esta palabra va siempre al lado.
    var etiqueta: String {
        switch self {
        case .verde: return "Bien"
        case .amarillo: return "Atención"
        case .rojo: return "Mal"
        case .sinDatos: return "Sin datos"
        }
    }

    /// Tono del design system (Android `Semaforo.tono()`).
    var tono: NxTone {
        switch self {
        case .verde: return .success
        case .amarillo: return .warning
        case .rojo: return .danger
        case .sinDatos: return .neutral
        }
    }

    /// Color del semáforo: el `fg` de su tono (#10B981 / #F59E0B / #EF4444 / #6B7889).
    var color: Color { tono.fg }

    var systemImage: String {
        switch self {
        case .verde: return "checkmark.circle.fill"
        case .amarillo: return "exclamationmark.triangle.fill"
        case .rojo: return "xmark.octagon.fill"
        case .sinDatos: return "questionmark.circle"
        }
    }

    /// Verde arriba de 85, ámbar arriba de 60, rojo debajo; gris sin dato.
    static func dePorcentaje(_ valor: Double?) -> CoreExtrasSemaforo {
        guard let valor, valor.isFinite else { return .sinDatos }
        if valor >= 85 { return .verde }
        if valor >= 60 { return .amarillo }
        return .rojo
    }
}

/// Insignia de semáforo: símbolo, color y palabra. Se lee sin distinguir colores.
struct CoreExtrasSemaforoBadge: View {
    let semaforo: CoreExtrasSemaforo
    var texto: String?

    var body: some View {
        Label(texto ?? semaforo.etiqueta, systemImage: semaforo.systemImage)
            .font(.caption.weight(.semibold))
            .foregroundStyle(semaforo.color)
            .labelStyle(.titleAndIcon)
    }
}

// MARK: - Cintas y pies

/// «Sigues viendo lo último que se pudo cargar»: el refresco falló y los datos
/// viejos siguen en pantalla.
struct CoreExtrasAvisoDesactualizado: View {
    let mensaje: String

    var body: some View {
        HStack(alignment: .top, spacing: 10) {
            Image(systemName: "icloud.slash")
                .foregroundStyle(NxColors.warning)
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 2) {
                Text("Sigues viendo lo último que se pudo cargar")
                    .font(.system(size: 12.5, weight: .semibold))
                    .foregroundStyle(NxColors.fg)
                Text(mensaje)
                    .font(NxType.labelSmall)
                    .foregroundStyle(NxColors.muted)
            }
        }
        .padding(.vertical, 4)
        .listRowBackground(NxColors.warningSoft)
    }
}

/// Lo que esta pantalla NO hace, al pie y **sin botón**.
///
/// Es el reemplazo del «Disponible pronto — ábrelo en la web»: se dice qué falta
/// y dónde se hace, pero no se echa a nadie al navegador a iniciar sesión otra
/// vez.
struct CoreExtrasNotaDeAlcance: View {
    let texto: String

    var body: some View {
        MoreNotaDeAlcance(texto: texto)
    }
}

/// Hueco de carga: en iOS, el indicador nativo centrado, no un esqueleto gris.
struct CoreExtrasCargando: View {
    var body: some View {
        HStack {
            Spacer()
            NxLoadingState()
            Spacer()
        }
        .listRowSeparator(.hidden)
    }
}

/// Primera carga fallida: no hay nada debajo, así que ocupa la pantalla entera.
struct CoreExtrasError: View {
    let mensaje: String
    let reintentar: () -> Void

    var body: some View {
        NxErrorState(message: mensaje, retry: reintentar)
    }
}

// MARK: - Filas

/// Una fila de número con su pie, para las listas agrupadas de iOS.
///
/// `LabeledContent` es la forma nativa: alinea sola, respeta la letra grande y
/// en accesibilidad se lee como un par etiqueta-valor.
struct CoreExtrasDatoFila: View {
    let etiqueta: String
    let valor: String
    var pie: String?
    var semaforo: CoreExtrasSemaforo = .sinDatos

    var body: some View {
        LabeledContent {
            Text(valor)
                .font(.body.weight(.semibold))
                .foregroundStyle(semaforo == .sinDatos ? NxColors.fg : semaforo.color)
        } label: {
            VStack(alignment: .leading, spacing: 1) {
                Text(etiqueta)
                if let pie, !pie.isEmpty {
                    Text(pie).font(NxType.bodySmall).foregroundStyle(NxColors.muted)
                }
            }
        }
        .accessibilityElement(children: .combine)
    }
}

/// Barra de avance con su texto debajo.
///
/// `valor` a `nil` = desconocido, que **no** es cero: la barra se queda vacía y
/// en gris, y el texto lo dice con palabras.
struct CoreExtrasBarra: View {
    let valor: Double?
    let etiqueta: String
    var color: Color = NxBrand.primary

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            ProgressView(value: min(max(valor ?? 0, 0), 1))
                .tint(valor == nil ? NxColors.muted : color)
                .accessibilityHidden(true)
            Text(etiqueta)
                .font(NxType.labelSmall)
                .foregroundStyle(NxColors.muted)
        }
    }
}

/// Círculo con iniciales cuando no hay foto; foto protegida cuando sí la hay.
/// Dibuja `NxAvatar` (estilo suave de Android `PersonAvatar`).
struct CoreExtrasAvatar: View {
    let nombre: String
    let url: String?
    var lado: CGFloat = 40

    var body: some View {
        NxAvatar(nombre: nombre, url: url, size: lado)
    }

    /// «CG» para el círculo. Dos letras como mucho.
    static func iniciales(_ nombre: String) -> String {
        NxAvatar.iniciales(nombre)
    }
}
