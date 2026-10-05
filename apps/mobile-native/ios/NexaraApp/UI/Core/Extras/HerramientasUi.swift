import SwiftUI
import UIKit

/// Las piezas visuales de Herramientas: la tarjeta del kit, la del préstamo, el
/// código de recolección, el diálogo «MÁS PLAZO» y los controles de Material 3
/// que Android usa tal cual (`FilterChip`, `OutlinedTextField`, `Button`,
/// `OutlinedButton`, `TextButton`, `Snackbar`). Espejo de `HerramientasUi.kt`.
///
/// Aquí no se decide nada: solo se dibuja lo que `HerramientasReglas` ya resolvió.

// MARK: - Controles de Material 3

/// Divisor de Material 3 (`HorizontalDivider`): 1 de alto en `outlineVariant`.
struct HerrDivisor: View {
    var body: some View {
        Rectangle()
            .fill(NxColors.border)
            .frame(height: 1)
            .frame(maxWidth: .infinity)
            .accessibilityHidden(true)
    }
}

/// `FilterChip` de Android con los colores de `MoreFilaDePastillas`: 32 de alto,
/// radio 8, letra 14 SemiBold; activa en `brandSoft` con letra `BrandDark`, inactiva
/// con filo `#E2E8F0` y letra gris.
struct HerrChipFiltro: View {
    let texto: String
    let seleccionada: Bool
    var habilitado: Bool = true
    let accion: () -> Void

    var body: some View {
        Button(action: accion) {
            Text(texto)
                .font(NxType.labelLarge)
                .lineLimit(1)
                .foregroundStyle(seleccionada ? NxColors.brandText : NxColors.muted)
                .padding(.horizontal, 16)
                .frame(height: 32)
                .background(
                    seleccionada ? NxColors.brandSoft : Color.clear,
                    in: RoundedRectangle(cornerRadius: 8, style: .continuous)
                )
                .overlay {
                    if !seleccionada {
                        RoundedRectangle(cornerRadius: 8, style: .continuous)
                            .strokeBorder(NxColors.border, lineWidth: 1)
                    }
                }
                .contentShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
        }
        .buttonStyle(.plain)
        .disabled(!habilitado)
        .opacity(habilitado ? 1 : 0.38)
        .accessibilityAddTraits(seleccionada ? AccessibilityTraits.isSelected : [])
    }
}

/// Una pastilla de filtro con su cuenta: «Mi kit · 4» (Android `MorePastilla`).
struct HerrPastilla: Identifiable {
    let id: String
    let etiqueta: String
    var conteo: Int? = nil
    var seleccionada: Bool = false
    let onClick: () -> Void

    var texto: String {
        if let conteo { return "\(etiqueta) · \(conteo)" }
        return etiqueta
    }
}

/// Fila de pastillas que se desplaza en horizontal (Android `MoreFilaDePastillas`).
struct HerrFilaDePastillas: View {
    let pastillas: [HerrPastilla]

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(pastillas) { pastilla in
                    HerrChipFiltro(texto: pastilla.texto, seleccionada: pastilla.seleccionada, accion: pastilla.onClick)
                }
            }
            .padding(.horizontal, 2)
        }
    }
}

/// `OutlinedTextField` de Material 3: contorno de 1 (2 de marca con foco), radio 6,
/// etiqueta que sube al borde al escribir, `placeholder` solo con foco y texto de
/// apoyo debajo. `fondo` es el color de lo que hay detrás (tapa el filo bajo la
/// etiqueta, como el hueco que deja Android).
struct HerrCampoContorno: View {
    let etiqueta: String
    @Binding var texto: String
    var placeholder: String?
    var soporte: String?
    var mayusculas: Bool
    /// `false` = una sola línea (Android `singleLine = true`).
    var multilinea: Bool
    var lineasMinimas: Int
    var limite: Int
    var habilitado: Bool
    var fondo: Color
    var alEnviar: (() -> Void)?

    @FocusState private var enfocado: Bool

    init(
        etiqueta: String,
        texto: Binding<String>,
        placeholder: String? = nil,
        soporte: String? = nil,
        mayusculas: Bool = false,
        multilinea: Bool = false,
        lineasMinimas: Int = 1,
        limite: Int = 500,
        habilitado: Bool = true,
        fondo: Color = NxColors.card,
        alEnviar: (() -> Void)? = nil
    ) {
        self.etiqueta = etiqueta
        self._texto = texto
        self.placeholder = placeholder
        self.soporte = soporte
        self.mayusculas = mayusculas
        self.multilinea = multilinea
        self.lineasMinimas = lineasMinimas
        self.limite = limite
        self.habilitado = habilitado
        self.fondo = fondo
        self.alEnviar = alEnviar
    }

    private var flotando: Bool { enfocado || !texto.isEmpty }

    private var borde: Color {
        if !habilitado { return NxColors.fg.opacity(0.12) }
        return enfocado ? NxColors.brand : NxColors.borderStrong
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            ZStack(alignment: .topLeading) {
                campo
                    .font(NxType.bodyLarge)
                    .foregroundStyle(NxColors.fg)
                    .tint(NxColors.brand)
                    .padding(.horizontal, 16)
                    .padding(.vertical, 16)
                    .frame(maxWidth: .infinity, minHeight: 56, alignment: .topLeading)
                    .overlay(
                        RoundedRectangle(cornerRadius: 6, style: .continuous)
                            .strokeBorder(borde, lineWidth: enfocado ? 2 : 1)
                    )
                Text(etiqueta)
                    .font(flotando ? NxType.bodySmall : NxType.bodyLarge)
                    .foregroundStyle(enfocado ? NxColors.brand : NxColors.muted)
                    .lineLimit(1)
                    .padding(.horizontal, 4)
                    .background(flotando ? fondo : Color.clear)
                    .padding(.leading, 12)
                    .padding(.trailing, 12)
                    .offset(y: flotando ? -8 : 16)
                    .allowsHitTesting(false)
                    .accessibilityHidden(true)
            }
            .contentShape(Rectangle())
            .onTapGesture { if habilitado { enfocado = true } }
            .animation(.easeOut(duration: 0.15), value: flotando)

            if let soporte, !soporte.isEmpty {
                Text(soporte)
                    .font(NxType.bodySmall)
                    .foregroundStyle(NxColors.muted)
                    .padding(.horizontal, 16)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .disabled(!habilitado)
    }

    @ViewBuilder
    private var campo: some View {
        let prompt = Text(enfocado ? (placeholder ?? "") : "").foregroundColor(NxColors.muted)
        if multilinea {
            TextField("", text: limitado, prompt: prompt, axis: .vertical)
                .lineLimit(max(lineasMinimas, 1)...max(lineasMinimas, 6))
                .textInputAutocapitalization(capitalizacion)
                .focused($enfocado)
                .accessibilityLabel(etiqueta)
        } else {
            TextField("", text: limitado, prompt: prompt)
                .textInputAutocapitalization(capitalizacion)
                .autocorrectionDisabled(mayusculas)
                .submitLabel(alEnviar == nil ? .done : .search)
                .onSubmit { alEnviar?() }
                .focused($enfocado)
                .accessibilityLabel(etiqueta)
        }
    }

    private var capitalizacion: TextInputAutocapitalization {
        mayusculas ? TextInputAutocapitalization.characters : TextInputAutocapitalization.sentences
    }

    /// Recorta como el `take(n)` de Android en `onValueChange`.
    private var limitado: Binding<String> {
        Binding(
            get: { texto },
            set: { nuevo in texto = nuevo.count > limite ? String(nuevo.prefix(limite)) : nuevo }
        )
    }
}

/// `Button` de Material 3: píldora llena de marca, letra 14 Bold blanca.
/// Deshabilitado: gris al 12 % con letra al 38 %.
struct HerrBotonLlenoStyle: ButtonStyle {
    var alto: CGFloat = 48
    var anchoCompleto: Bool = false

    func makeBody(configuration: Configuration) -> some View {
        HerrBotonLlenoCuerpo(configuration: configuration, alto: alto, anchoCompleto: anchoCompleto)
    }
}

private struct HerrBotonLlenoCuerpo: View {
    let configuration: ButtonStyleConfiguration
    let alto: CGFloat
    let anchoCompleto: Bool
    @Environment(\.isEnabled) private var isEnabled

    var body: some View {
        configuration.label
            .font(.system(size: 14, weight: .bold))
            .lineLimit(1)
            .foregroundStyle(isEnabled ? Color.white : NxColors.fg.opacity(0.38))
            .padding(.horizontal, 24)
            .frame(maxWidth: anchoCompleto ? .infinity : nil, minHeight: alto)
            .background(isEnabled ? NxColors.brand : NxColors.fg.opacity(0.12), in: Capsule())
            .opacity(configuration.isPressed ? 0.85 : 1)
            .contentShape(Capsule())
    }
}

/// `OutlinedButton` de Material 3: píldora con filo `#CBD5E1` y letra de marca.
struct HerrBotonContornoStyle: ButtonStyle {
    var alto: CGFloat = 48
    var negritas: Bool = false

    func makeBody(configuration: Configuration) -> some View {
        HerrBotonContornoCuerpo(configuration: configuration, alto: alto, negritas: negritas)
    }
}

private struct HerrBotonContornoCuerpo: View {
    let configuration: ButtonStyleConfiguration
    let alto: CGFloat
    let negritas: Bool
    @Environment(\.isEnabled) private var isEnabled

    var body: some View {
        configuration.label
            .font(.system(size: 14, weight: negritas ? .bold : .semibold))
            .lineLimit(1)
            .foregroundStyle(isEnabled ? NxColors.brand : NxColors.fg.opacity(0.38))
            .padding(.horizontal, 24)
            .frame(minHeight: alto)
            .background(configuration.isPressed ? NxColors.brand.opacity(0.08) : Color.clear, in: Capsule())
            .overlay(Capsule().strokeBorder(isEnabled ? NxColors.borderStrong : NxColors.fg.opacity(0.12), lineWidth: 1))
            .contentShape(Capsule())
    }
}

/// `TextButton` de Material 3: solo la letra de marca, 40 de alto.
struct HerrBotonTextoStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        HerrBotonTextoCuerpo(configuration: configuration)
    }
}

private struct HerrBotonTextoCuerpo: View {
    let configuration: ButtonStyleConfiguration
    @Environment(\.isEnabled) private var isEnabled

    var body: some View {
        configuration.label
            .font(NxType.labelLarge)
            .lineLimit(1)
            .foregroundStyle(isEnabled ? NxColors.brand : NxColors.fg.opacity(0.38))
            .padding(.horizontal, 12)
            .frame(minHeight: 40)
            .background(configuration.isPressed ? NxColors.brand.opacity(0.08) : Color.clear, in: Capsule())
            .contentShape(Capsule())
    }
}

/// `Snackbar` de `NxSnackbarHost`: pizarra, letra blanca 14, radio 16.
struct HerrSnackbar: View {
    let texto: String
    var onCerrar: (() -> Void)? = nil

    var body: some View {
        Text(texto)
            .font(NxType.bodyMedium)
            .foregroundStyle(Color.white)
            .frame(maxWidth: .infinity, alignment: .leading)
            .fixedSize(horizontal: false, vertical: true)
            .padding(.horizontal, 16)
            .padding(.vertical, 14)
            .frame(minHeight: 48)
            .background {
                RoundedRectangle(cornerRadius: NxRadius.l, style: .continuous)
                    .fill(NxColors.fg)
                    .nxElevation(6)
            }
            .contentShape(Rectangle())
            .onTapGesture { onCerrar?() }
            .accessibilityAddTraits(.isStaticText)
    }
}

// MARK: - Tarjeta del kit

/// Una herramienta del kit. Lo que manda es la identificación de la pieza —el código
/// interno es el que lleva pegado en la etiqueta— y lo que reclama atención: un daño
/// que nadie ha dictaminado o una revisión pasada de fecha.
struct TarjetaKit: View {
    let asignacion: KitAsignacion
    let hoy: HerramientasReglas.Dia

    var body: some View {
        let titulo = HerramientasReglas.tituloPieza(asignacion)
        let identificacion = HerramientasReglas.identificacionPieza(asignacion)
        let abiertos = HerramientasReglas.eventosAbiertos(asignacion)
        let revisionVencida = HerramientasReglas.revisionVencida(asignacion, hoy: hoy)
        let estadoPieza = HerramientasReglas.etiquetaEstadoPieza(asignacion.inventoryItem?.status)
        let desdeCuando = HerramientasReglas.fechaCorta(asignacion.assignedAt)
        let plazoRevision = HerramientasReglas.textoPlazo(asignacion.proximaInspeccion, hoy: hoy)
        let parteAbierto = asignacion.events.first { $0.resolvedAt == nil }?.description?.nilSiVacio
        let nota = asignacion.notes?.nilSiVacio

        MoreTarjeta {
            Text(titulo)
                .font(.system(size: 16, weight: .semibold))
                .foregroundStyle(NxColors.fg)
                .lineLimit(2)
            Text(identificacion)
                .font(NxType.labelMedium)
                .foregroundStyle(NxColors.muted)
                .lineLimit(2)
            if !desdeCuando.isEmpty {
                Text("Asignada desde el \(desdeCuando)")
                    .font(NxType.labelSmall)
                    .foregroundStyle(NxColors.muted)
            }

            HStack(alignment: .center, spacing: 6) {
                NxStatusChip(
                    text: estadoPieza,
                    tone: HerramientasReglas.tonoEstadoPieza(asignacion.inventoryItem?.status).nx
                )
                if abiertos > 0 {
                    NxStatusChip(text: abiertos == 1 ? "1 daño sin cerrar" : "\(abiertos) daños sin cerrar", tone: .danger)
                }
                if revisionVencida {
                    NxStatusChip(text: "Revisión vencida", tone: .warning)
                }
            }

            // El plazo de revisión solo se enseña cuando hay revisión programada:
            // recordar una fecha que nadie fijó sería inventarse una obligación.
            if !revisionVencida, let plazoRevision {
                Text("Próxima revisión: \(HerramientasReglas.fechaCorta(asignacion.proximaInspeccion)) · \(plazoRevision)")
                    .font(NxType.labelSmall)
                    .foregroundStyle(NxColors.muted)
            }

            // El último parte abierto, con sus palabras: un «1 daño sin cerrar» sin decir
            // cuál obliga a llamar a alguien para saber de qué se trata.
            if let parteAbierto {
                Text(parteAbierto)
                    .font(NxType.bodySmall)
                    .foregroundStyle(NxColors.fg)
                    .lineLimit(3)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.horizontal, 10)
                    .padding(.vertical, 8)
                    .background(NxTone.danger.bg, in: RoundedRectangle(cornerRadius: 8, style: .continuous))
            }

            if let nota {
                Text(nota)
                    .font(NxType.bodySmall)
                    .foregroundStyle(NxColors.muted)
                    .lineLimit(3)
            }
        }
        // La tarjeta se lee de una sola vez con VoiceOver: los chips sueltos sonarían
        // a lista de palabras sin sujeto.
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(descripcion(
            titulo: titulo, identificacion: identificacion, estado: estadoPieza,
            desde: desdeCuando, abiertos: abiertos, plazo: plazoRevision
        ))
    }

    private func descripcion(
        titulo: String, identificacion: String, estado: String,
        desde: String, abiertos: Int, plazo: String?
    ) -> String {
        var texto = "\(titulo). \(identificacion). \(estado). "
        if !desde.isEmpty { texto += "Asignada desde el \(desde). " }
        if abiertos > 0 { texto += "\(abiertos) daños sin resolver. " }
        if let plazo { texto += "Revisión: \(plazo). " }
        return texto
    }
}

// MARK: - Tarjeta del préstamo

/// Un préstamo. Lo primero que busca quien abre esto parado en la ventanilla del
/// almacén es el código de recolección, así que cuando sirve se enseña grande y aparte.
struct TarjetaPrestamo: View {
    let prestamo: PrestamoHerramienta
    let hoy: HerramientasReglas.Dia
    let ahora: Date
    let onRenovar: () -> Void

    var body: some View {
        let titulo = HerramientasReglas.tituloPrestamo(prestamo)
        let identificacion = HerramientasReglas.identificacionPrestamo(prestamo)
        let estado = HerramientasReglas.etiquetaEstado(prestamo.status)
        let abierto = HerramientasReglas.estaAbierto(prestamo)
        let plazo = abierto ? HerramientasReglas.textoPlazo(prestamo.expectedReturnDate, hoy: hoy) : nil
        let codigo = prestamo.pickupCode?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        let codigoVigente = HerramientasReglas.codigoVigente(prestamo, ahora: ahora)
        let devolver = HerramientasReglas.fechaCorta(prestamo.expectedReturnDate)
        let renovaciones = prestamo.renewalCount ?? 0
        let notas = [prestamo.damageDescription?.nilSiVacio, prestamo.adminNotes?.nilSiVacio].compactMap { $0 }

        MoreTarjeta {
            VStack(alignment: .leading, spacing: 8) {
                Text(titulo)
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundStyle(NxColors.fg)
                    .lineLimit(2)
                Text(identificacion)
                    .font(NxType.labelMedium)
                    .foregroundStyle(NxColors.muted)
                    .lineLimit(2)

                HStack(alignment: .center, spacing: 6) {
                    NxStatusChip(text: estado, tone: HerramientasReglas.tonoEstado(prestamo.status).nx)
                    if let plazo {
                        NxStatusChip(
                            text: plazo,
                            tone: HerramientasReglas.tonoPlazo(prestamo.expectedReturnDate, hoy: hoy).nx
                        )
                    }
                    if renovaciones > 0 {
                        NxStatusChip(text: renovaciones == 1 ? "1 prórroga" : "\(renovaciones) prórrogas", tone: .info)
                    }
                }

                if !devolver.isEmpty && abierto {
                    Text("Devolver el \(devolver)")
                        .font(NxType.labelSmall)
                        .foregroundStyle(NxColors.muted)
                }

                if codigoVigente {
                    CodigoDeRecoleccion(codigo: codigo, caduca: HerramientasReglas.fechaCorta(prestamo.pickupExpiresAt))
                }

                if let motivo = prestamo.reason?.nilSiVacio {
                    Text(motivo)
                        .font(NxType.bodySmall)
                        .foregroundStyle(NxColors.muted)
                        .lineLimit(3)
                }

                // Lo que dijo quien decidió: si te la rechazaron o la recibieron con
                // daño, el porqué importa más que el estado.
                ForEach(Array(notas.enumerated()), id: \.offset) { _, nota in
                    Text(nota)
                        .font(NxType.bodySmall)
                        .foregroundStyle(NxColors.fg)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .fixedSize(horizontal: false, vertical: true)
                        .padding(.horizontal, 10)
                        .padding(.vertical, 8)
                        .background(NxTone.neutral.bg, in: RoundedRectangle(cornerRadius: 8, style: .continuous))
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(descripcion(
                titulo: titulo, identificacion: identificacion, estado: estado,
                devolver: devolver, plazo: plazo, codigo: codigoVigente ? codigo : nil
            ))

            if HerramientasReglas.sePuedeRenovar(prestamo) {
                Button("Pedir más plazo", action: onRenovar)
                    .buttonStyle(HerrBotonContornoStyle(alto: 48))
            }
        }
    }

    private func descripcion(
        titulo: String, identificacion: String, estado: String,
        devolver: String, plazo: String?, codigo: String?
    ) -> String {
        var texto = "\(titulo). \(identificacion). \(estado). "
        if !devolver.isEmpty { texto += "Devolver el \(devolver). " }
        if let plazo { texto += "\(plazo). " }
        if let codigo { texto += "Código de recolección \(codigo). " }
        return texto
    }
}

/// El código que el almacén teclea al entregar: con espacios cada tres caracteres y
/// en cuerpo grande, porque se lee en voz alta a través de una ventanilla.
struct CodigoDeRecoleccion: View {
    let codigo: String
    let caduca: String

    private var agrupado: String {
        var grupos: [String] = []
        var actual = ""
        for caracter in codigo {
            actual.append(caracter)
            if actual.count == 3 {
                grupos.append(actual)
                actual = ""
            }
        }
        if !actual.isEmpty { grupos.append(actual) }
        return grupos.joined(separator: " ")
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text("Código para recoger en almacén")
                .font(NxType.labelSmall)
                .foregroundStyle(NxColors.muted)
            Text(agrupado)
                .font(.system(size: 22, weight: .bold))
                .foregroundStyle(NxTone.info.fg)
            if !caduca.isEmpty {
                Text("Sirve hasta el \(caduca)")
                    .font(NxType.labelSmall)
                    .foregroundStyle(NxColors.muted)
            }
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(NxTone.info.bg, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
    }
}

// MARK: - Diálogo «MÁS PLAZO»

/// Pedir más plazo (Android `DialogoRenovar`, un `AlertDialog`).
///
/// Sin selector de calendario a propósito: en campo se piensa en «una semana más».
/// Las tres opciones salen de `HerramientasReglas.fechasSugeridas` y debajo se enseña
/// la fecha exacta que se va a mandar.
struct DialogoRenovar: View {
    let prestamo: PrestamoHerramienta
    let hoy: HerramientasReglas.Dia
    let enviando: Bool
    let error: String?
    let onCerrar: () -> Void
    let onConfirmar: (HerramientasReglas.Dia, String?) -> Void

    @State private var elegida = 0
    @State private var motivo = ""

    /// `surfaceContainerHigh` del tema de Android: el fondo de sus diálogos.
    private static let fondo = NxColors.rgb(0xEEF2F7)

    private var opciones: [HerramientasReglas.OpcionPlazo] {
        HerramientasReglas.fechasSugeridas(prestamo, hoy: hoy)
    }

    private var fecha: HerramientasReglas.Dia? {
        opciones.indices.contains(elegida) ? opciones[elegida].fecha : nil
    }

    var body: some View {
        ZStack {
            // `scrim` del tema de Android (#020617) al 32 %, como el fondo de `AlertDialog`.
            NxColors.rgb(0x020617).opacity(0.32)
                .ignoresSafeArea()
                .accessibilityHidden(true)

            // Centrado cuando cabe; con el teclado arriba (o letra grande) se desplaza.
            GeometryReader { geo in
                ScrollView {
                    tarjeta
                        .padding(24)
                        .frame(maxWidth: 560)
                        .frame(maxWidth: .infinity, minHeight: geo.size.height)
                        // Tocar fuera de la tarjeta la cierra (Android `onDismissRequest`).
                        .background(
                            Color.black.opacity(0.001)
                                .onTapGesture { if !enviando { onCerrar() } }
                                .accessibilityHidden(true)
                        )
                }
                .scrollBounceBehavior(.basedOnSize)
            }
        }
    }

    private var tarjeta: some View {
        VStack(alignment: .leading, spacing: 0) {
            VStack(alignment: .leading, spacing: 0) {
                Text("MÁS PLAZO")
                    .font(.system(size: 11, weight: .heavy))
                    .foregroundStyle(NxColors.muted)
                Text(HerramientasReglas.tituloPrestamo(prestamo))
                    .font(.system(size: 16, weight: .bold))
                    .foregroundStyle(NxColors.fg)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .accessibilityElement(children: .combine)
            .accessibilityAddTraits(.isHeader)
            .padding(.bottom, 16)

            VStack(alignment: .leading, spacing: 10) {
                if let plazo = HerramientasReglas.textoPlazo(prestamo.expectedReturnDate, hoy: hoy) {
                    Text("Ahora la devuelves el \(HerramientasReglas.fechaCorta(prestamo.expectedReturnDate)) · \(plazo)")
                        .font(NxType.bodySmall)
                        .foregroundStyle(NxColors.muted)
                        .fixedSize(horizontal: false, vertical: true)
                }
                HStack(spacing: 8) {
                    ForEach(Array(opciones.enumerated()), id: \.offset) { indice, opcion in
                        HerrChipFiltro(
                            texto: opcion.etiqueta,
                            seleccionada: indice == elegida,
                            habilitado: !enviando,
                            accion: { elegida = indice }
                        )
                    }
                }
                if let fecha {
                    Text("La pedirías hasta el \(HerramientasReglas.fechaCorta(fecha))")
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundStyle(NxColors.fg)
                }
                HerrCampoContorno(
                    etiqueta: "¿Por qué? (opcional)",
                    texto: $motivo,
                    placeholder: "Ej. La obra se alargó una semana.",
                    multilinea: true,
                    lineasMinimas: 2,
                    limite: 500,
                    habilitado: !enviando,
                    fondo: Self.fondo
                )
                Text("Queda pendiente: alguien de almacén tiene que autorizarla.")
                    .font(NxType.labelSmall)
                    .foregroundStyle(NxColors.muted)
                    .fixedSize(horizontal: false, vertical: true)
                if let error {
                    Text(error)
                        .font(NxType.bodySmall)
                        .foregroundStyle(NxColors.danger)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            .padding(.bottom, 24)

            HStack(spacing: 8) {
                Spacer(minLength: 0)
                Button("Mejor no", action: onCerrar)
                    .buttonStyle(HerrBotonTextoStyle())
                    .disabled(enviando)
                Button(enviando ? "Enviando…" : "Pedir prórroga") {
                    guard let fecha else { return }
                    onConfirmar(fecha, motivo.nilSiVacio)
                }
                .buttonStyle(HerrBotonLlenoStyle(alto: 48))
                .disabled(enviando || fecha == nil)
            }
        }
        .padding(24)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background {
            RoundedRectangle(cornerRadius: NxRadius.xl, style: .continuous)
                .fill(Self.fondo)
                .nxElevation(6)
        }
        .accessibilityAddTraits(.isModal)
    }
}
