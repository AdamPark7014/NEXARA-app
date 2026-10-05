import SwiftUI

/// Piezas compartidas de Viáticos (Android `ViaticosUi.kt`): el campo de
/// importe, los importes con su etiqueta y el vocabulario de estados. Viven
/// aparte porque las usan las cuatro pantallas del módulo.

/// Alto mínimo de cualquier cosa que se toque (Android `AlturaToque`): guantes
/// y sol de mediodía.
let viaticoAlturaToque: CGFloat = 48

/// Campo de importe (Android `CampoImporte`): `OutlinedTextField` con «$» a la
/// izquierda, cifra grande alineada a la derecha, 64 de alto y la ayuda o el
/// error debajo.
///
/// `crudo` guarda el texto **sin formato** —dígitos y a lo sumo un punto—, que
/// es lo que `Dinero.parsearCentavos` entiende. Las comas de millares solo se
/// pintan, a través de un `Binding` que formatea al leer y limpia al escribir:
/// así nunca acaba una coma dentro de la petición.
struct CampoImporte: View {
    let titulo: String
    @Binding var crudo: String
    var ayuda: String?
    var error: String?
    var habilitado: Bool = true
    /// Lo que rodea al campo (la etiqueta flotante «corta» el borde con este color).
    var fondo: Color = NxColors.surface

    @FocusState private var enfocado: Bool

    private var texto: Binding<String> {
        Binding(
            get: { Dinero.formatearEntrada(crudo) },
            set: { crudo = Dinero.sanitizarEntrada($0) }
        )
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            MarcoDelineado(
                etiqueta: titulo,
                enfocado: enfocado,
                vacio: crudo.isEmpty,
                error: error != nil,
                fondo: fondo,
                inicioPista: 48,
                minAlto: 64
            ) {
                HStack(spacing: 12) {
                    Text("$")
                        .font(.system(size: 20, weight: .bold))
                        .foregroundStyle(NxColors.muted)
                        .frame(width: 20)
                        .accessibilityHidden(true)
                    TextField("", text: texto)
                        .keyboardType(.decimalPad)
                        .font(.system(size: 22, weight: .bold))
                        .foregroundStyle(NxColors.fg)
                        .tint(NxColors.brand)
                        .multilineTextAlignment(.trailing)
                        .focused($enfocado)
                        .disabled(!habilitado)
                        .accessibilityLabel(titulo)
                        .accessibilityValue(
                            Dinero.parsearCentavos(crudo).map { Dinero.pesos($0) } ?? "sin capturar"
                        )
                }
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
}

/// Un importe con su etiqueta (Android `Importe`): etiqueta 12 gris y cifra 22
/// Bold. `nil` se lee «—»: no es cero, es que no lo hay.
struct ImporteLabel: View {
    let titulo: String
    let centavos: Int?
    var tono: NxTone = .neutral

    private var texto: String { centavos.map { Dinero.pesos($0) } ?? "—" }

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(titulo)
                .font(NxType.labelMedium)
                .foregroundStyle(NxColors.muted)
            Text(texto)
                .font(.system(size: 22, weight: .bold))
                .foregroundStyle(tono == .neutral ? NxColors.fg : tono.fg)
                .lineLimit(1)
                .minimumScaleFactor(0.6)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(titulo): \(centavos == nil ? "sin dato" : texto)")
    }
}

/// Dos importes lado a lado (Android `ParDeImportes`), separados 14.
struct ParDeImportes: View {
    let izquierda: String
    let izquierdaCentavos: Int
    let derecha: String
    let derechaCentavos: Int?
    var derechaTono: NxTone = .neutral

    var body: some View {
        HStack(alignment: .top, spacing: 14) {
            ImporteLabel(titulo: izquierda, centavos: izquierdaCentavos)
            ImporteLabel(titulo: derecha, centavos: derechaCentavos, tono: derechaTono)
        }
    }
}

/// Estado + liquidación + reparto en una fila de chips (Android `ChipsDeViatico`).
struct ChipsDeViatico: View {
    let viatico: Viatico

    var body: some View {
        CoreFlowLayout(spacing: 6) {
            NxStatusChip(text: NxStatusText.label(viatico.estatus), tone: viatico.tonoEstatus)
            if let resumen = viatico.liquidacion?.resumenCorto {
                NxStatusChip(text: resumen, tone: viatico.liquidacion?.tono ?? .neutral)
            }
            if !viatico.repartos.isEmpty {
                NxStatusChip(text: "Repartido en \(viatico.repartos.count)", tone: .info)
            }
        }
    }
}

/// «A0145 · Mantenimiento» de una actividad abierta, como la nombra Android.
enum ViaticoTextos {
    /// El número AN o el título; si no hay ninguno, «Actividad #id».
    static func etiqueta(_ item: MyActivityItem) -> String {
        [item.anNumber, item.titulo]
            .compactMap { $0?.trimmingCharacters(in: .whitespacesAndNewlines) }
            .first { !$0.isEmpty } ?? "Actividad #\(item.id)"
    }

    /// «AN-0145 · Hotel Casa Azul» para la segunda línea de la hoja.
    static func detalle(_ item: MyActivityItem) -> String {
        [item.anNumber, item.cliente]
            .compactMap { $0?.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }
            .joined(separator: " · ")
    }

    /// Título de la opción en la hoja: el título o «Actividad #id».
    static func tituloOpcion(_ item: MyActivityItem) -> String {
        let titulo = (item.titulo ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        return titulo.isEmpty ? "Actividad #\(item.id)" : titulo
    }
}

/// Hoja inferior para elegir una actividad abierta (Android `ModalBottomSheet`
/// de «¿A qué actividad se carga?» y «¿Qué actividad cubrió el viaje?»):
/// título 16 Bold, una pista opcional, un divisor y la lista.
struct HojaElegirActividadViatico: View {
    let titulo: String
    var pista: String? = nil
    let actividades: [MyActivityItem]
    /// Lo que se dice cuando no hay ninguna que elegir.
    let textoVacio: String
    let onElegir: (MyActivityItem) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text(titulo)
                .font(.system(size: 16, weight: .bold))
                .foregroundStyle(NxColors.fg)
                .padding(.horizontal, 24)
                .padding(.vertical, 10)
                .accessibilityAddTraits(.isHeader)
            if let pista, !pista.isEmpty {
                Text(pista)
                    .font(NxType.bodySmall)
                    .foregroundStyle(NxColors.muted)
                    .padding(.horizontal, 24)
                    .fixedSize(horizontal: false, vertical: true)
            }
            Color.clear.frame(height: 8)
            Rectangle().fill(NxColors.border).frame(height: 1)
            if actividades.isEmpty {
                Text(textoVacio)
                    .font(NxType.bodyMedium)
                    .foregroundStyle(NxColors.muted)
                    .padding(24)
            } else {
                ScrollView {
                    LazyVStack(spacing: 0) {
                        ForEach(actividades) { item in
                            OpcionDeHoja(
                                titulo: ViaticoTextos.tituloOpcion(item),
                                detalle: ViaticoTextos.detalle(item)
                            ) {
                                onElegir(item)
                            }
                        }
                    }
                }
            }
            Spacer(minLength: 0)
        }
        .padding(.top, 20)
        .padding(.bottom, 24)
        .frame(maxWidth: .infinity, alignment: .leading)
        .hojaMaterial(detents: [.medium, .large])
    }
}

/// Chip de estado que sí parte en renglones (Android `NxStatusChip` no corta
/// el texto): para los avisos largos del detalle.
struct ChipLargoViatico: View {
    let texto: String
    var tono: NxTone = .neutral

    var body: some View {
        Text(texto)
            .font(.system(size: 11, weight: .semibold))
            .foregroundStyle(tono.fg)
            .fixedSize(horizontal: false, vertical: true)
            .padding(.horizontal, 10)
            .padding(.vertical, 4)
            .background(tono.bg, in: RoundedRectangle(cornerRadius: 8, style: .continuous))
    }
}

/// Quién soy y si administro viáticos (Android `ViaticosRepository.miUsuarioId`
/// / `administraViaticos`).
enum ViaticoSesion {
    static var miId: Int? { SessionStore.shared.currentUser.flatMap { Int($0.id) } }

    /// `viatics.manage` / super admin: quien puede autorizar, pagar y ver a su gente.
    static var administra: Bool {
        guard let user = SessionStore.shared.currentUser else { return false }
        if user.isSuperAdmin { return true }
        return user.permissions.contains { $0 == "viatics.manage" || $0 == "CONSOLE_ADMIN" }
    }
}
