import SwiftUI
import PDFKit

// MARK: - Tiempo

/// Tarjeta «Tiempo» del detalle (web `TiempoActividad.tsx`, 28-10; Android `ActividadTiempoCard`):
/// lo trabajado contra lo planeado y el tope, con un anillo que da la vuelta en el plan. Banda
/// oscura con aurora verde como la de «Mi día». «En curso» si el reloj de cualquiera del equipo
/// está corriendo. Sin plan y sin nada trabajado no se pinta.
struct ActivityTiempoCard: View {
    let medidor: ActividadTiempoRules.Medidor
    let enCurso: Bool
    let tiempoMaximoMin: Double?
    let minutosEstandar: Double?

    fileprivate static let fondo = NxColors.rgb(0x0D0F12)
    private static let tenue = NxColors.rgb(0xC9CED8)
    private static let pie = NxColors.rgb(0xB9BFCC)
    fileprivate static let verde = NxColors.rgb(0x10A183)

    var body: some View {
        if ActividadTiempoRules.visible(medidor) {
            tarjeta
        }
    }

    /// Anillo y píldora de estado: verde en tiempo, ámbar cerca del tope, rojo excedida.
    private var tono: (anillo: Color, pildora: Color, texto: Color) {
        switch medidor.estado {
        case .enTiempo: return (Self.verde, NxColors.rgb(0x10A183, alpha: 0.22), NxColors.rgb(0x9BE3D2))
        case .cerca: return (NxColors.rgb(0xF5B25C), NxColors.rgb(0xF5B25C, alpha: 0.2), NxColors.rgb(0xF8CD8F))
        case .excedida: return (NxColors.rgb(0xF87171), NxColors.rgb(0xF87171, alpha: 0.2), NxColors.rgb(0xFCA5A5))
        case .sinPlan: return (Self.verde, Color.white.opacity(0.1), NxColors.rgb(0xD6DAE2))
        }
    }

    private var tarjeta: some View {
        let forma = RoundedRectangle(cornerRadius: NxRadius.xl, style: .continuous)
        let colores = tono
        return VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .center, spacing: 8) {
                Text("Tiempo")
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(Self.tenue)
                if enCurso {
                    Text("en curso")
                        .font(.system(size: 11, weight: .bold))
                        .foregroundStyle(NxColors.rgb(0x9BE3D2))
                        .padding(.horizontal, 8)
                        .padding(.vertical, 2)
                        .background(NxColors.rgb(0x10A183, alpha: 0.25), in: Capsule())
                }
            }
            HStack(alignment: .center, spacing: 16) {
                if medidor.plan != nil {
                    ActivityTiempoAnillo(avance: medidor.avance ?? 0, color: colores.anillo)
                }
                VStack(alignment: .leading, spacing: 2) {
                    Text(ActividadTiempoRules.realTexto(medidor))
                        .font(NxFont.display(size: 32))
                        .monospacedDigit()
                        .foregroundStyle(Color.white)
                        .lineLimit(1)
                        .minimumScaleFactor(0.7)
                    Text(ActividadTiempoRules.contraTexto(medidor))
                        .font(.system(size: 13))
                        .foregroundStyle(Self.tenue)
                        .lineLimit(2)
                    Text(medidor.texto)
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundStyle(colores.texto)
                        .padding(.horizontal, 9)
                        .padding(.vertical, 2)
                        .background(colores.pildora, in: Capsule())
                        .padding(.top, 4)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            if let estandar = ActividadTiempoRules.pieEstandar(minutosEstandar, medidor) {
                Text(estandar)
                    .font(.system(size: 12))
                    .foregroundStyle(Self.pie)
                    .fixedSize(horizontal: false, vertical: true)
            }
            if let tope = ActividadTiempoRules.pieTope(medidor, tiempoMaximoMin: tiempoMaximoMin) {
                Text(tope)
                    .font(.system(size: 12))
                    .foregroundStyle(Self.pie)
            }
        }
        .padding(.horizontal, 20)
        .padding(.vertical, 18)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background { ActivityTiempoResplandor() }
        .clipShape(forma)
        // La sombra va fuera del recorte (si no, la corta la forma), como la banda de «Mi día».
        .background {
            forma
                .fill(Self.fondo)
                .shadow(color: NxColors.rgb(0x0D0F12, alpha: 0.3), radius: 16, x: 0, y: 10)
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel("Tiempo\(enCurso ? ", en curso" : ""). \(ActividadTiempoRules.etiquetaAccesible(medidor))")
    }
}

/// Anillo de 84 pt: pista blanca tenue y el avance encima, empezando arriba.
private struct ActivityTiempoAnillo: View {
    let avance: Double
    let color: Color

    var body: some View {
        ZStack {
            Circle()
                .stroke(Color.white.opacity(0.16), lineWidth: 9)
            Circle()
                .trim(from: 0, to: CGFloat(min(1, max(0, avance))))
                .stroke(color, style: StrokeStyle(lineWidth: 9, lineCap: .round))
                .rotationEffect(.degrees(-90))
        }
        // El trazo va centrado en el círculo: 75 + 9 = 84 de lado.
        .frame(width: 75, height: 75)
        .padding(4.5)
        .accessibilityHidden(true)
    }
}

/// Fondo casi negro con la aurora de «Mi día»: verde arriba a la derecha, azul abajo a la izquierda.
private struct ActivityTiempoResplandor: View {
    var body: some View {
        GeometryReader { geo in
            let ancho = geo.size.width
            ZStack {
                ActivityTiempoCard.fondo
                RadialGradient(
                    colors: [NxColors.rgb(0x10A183, alpha: 0.5), NxColors.rgb(0x10A183, alpha: 0)],
                    center: .topTrailing,
                    startRadius: 0,
                    endRadius: ancho * 0.75
                )
                RadialGradient(
                    colors: [NxColors.rgb(0x0060F0, alpha: 0.42), NxColors.rgb(0x0060F0, alpha: 0)],
                    center: UnitPoint(x: 0, y: 1.3),
                    startRadius: 0,
                    endRadius: ancho * 0.7
                )
            }
        }
        .allowsHitTesting(false)
        .accessibilityHidden(true)
    }
}

// MARK: - Costo directo

/// «Costo directo» (web `CostoActividad.tsx`): viáticos imputados, material del almacén y total.
/// El detalle lo carga y decide si se ve (`ActividadCostoRules.puedeVer` y `visible`).
struct ActivityCostoCard: View {
    let costo: ActividadCostoRules.Costo

    var body: some View {
        NxPanelShell(spacing: 10) {
            Text(ActividadCostoRules.titulo)
                .font(.system(size: 14, weight: .bold))
                .foregroundStyle(NxColors.fg)
            VStack(alignment: .leading, spacing: 8) {
                renglon(ActividadCostoRules.etiquetaViaticos(costo), ActividadCostoRules.pesos(costo.viaticosCentavos))
                renglon(ActividadCostoRules.etiquetaMaterial(costo), ActividadCostoRules.pesos(costo.materialCentavos))
                Rectangle()
                    .fill(NxColors.borderSubtle)
                    .frame(height: 1)
                renglon("Total", ActividadCostoRules.pesos(costo.totalCentavos), total: true)
            }
            Text(ActividadCostoRules.nota)
                .font(.system(size: 11.5))
                .foregroundStyle(NxColors.muted)
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    private func renglon(_ etiqueta: String, _ monto: String, total: Bool = false) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: 12) {
            Text(etiqueta)
                .font(.system(size: 14, weight: total ? .semibold : .regular))
                .foregroundStyle(total ? NxColors.fg : NxColors.fg2)
                .frame(maxWidth: .infinity, alignment: .leading)
            Text(monto)
                .font(.system(size: 14, weight: total ? .semibold : .medium))
                .monospacedDigit()
                .foregroundStyle(NxColors.fg)
        }
        .accessibilityElement(children: .combine)
    }
}

// MARK: - Cotización ligada

/// La cotización ligada de una actividad comercial (web `CotizacionDeActividad.tsx` y
/// `PropuestaEmbebida.tsx`): folio · estado · total, y la propuesta en PDF abierta dentro de la
/// app (`GET cotizaciones/:id/pdf`) con Guardar y Compartir. Con 403: «No tienes acceso a cotizaciones».
struct ActivityCotizacionCard: View {
    let cotizacion: ActividadCotizacionLigada

    @State private var abriendo = false
    @State private var error: String?
    @State private var abierto: CotizacionPdfAbierto?

    var body: some View {
        NxPanelShell(spacing: 6) {
            Text(ActividadCotizacionRules.titulo)
                .font(.system(size: 14, weight: .bold))
                .foregroundStyle(NxColors.fg)
            Text(ActividadCotizacionRules.linea(cotizacion))
                .font(.system(size: 14, weight: .semibold))
                .foregroundStyle(NxColors.fg)
                .fixedSize(horizontal: false, vertical: true)
            Text(ActividadCotizacionRules.nota)
                .font(.system(size: 12.5))
                .foregroundStyle(NxColors.muted)
                .fixedSize(horizontal: false, vertical: true)
            Button {
                Task { await abrir() }
            } label: {
                HStack(spacing: 8) {
                    if abriendo {
                        ProgressView()
                    } else {
                        Image(systemName: "doc.richtext")
                    }
                    Text(abriendo ? ActividadCotizacionRules.abriendo : ActividadCotizacionRules.boton)
                }
            }
            .buttonStyle(NxSecondaryButtonStyle())
            .disabled(abriendo)
            .padding(.top, 4)
            if let error {
                Text(error)
                    .font(.system(size: 13))
                    .foregroundStyle(NxColors.danger)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .fullScreenCover(item: $abierto) { pdf in
            NavigationStack {
                PDFViewerScreen(title: pdf.titulo, data: pdf.data)
                    .nxBrandNavBar(title: pdf.titulo, showsBell: false)
                    .toolbar {
                        ToolbarItem(placement: .cancellationAction) {
                            Button("Cerrar") { abierto = nil }
                        }
                    }
            }
        }
    }

    @MainActor
    private func abrir() async {
        guard !abriendo else { return }
        abriendo = true
        error = nil
        defer { abriendo = false }
        do {
            let bytes = try await CotizacionesRepository.shared.pdf(id: cotizacion.id)
            // Lo que llegó tiene que ser un PDF de verdad: un visor en blanco no avisa de nada.
            guard !bytes.isEmpty, PDFDocument(data: bytes) != nil else {
                error = ActividadCotizacionRules.fallo
                return
            }
            let nombre = CotizacionesRules.nombreArchivoPdf(id: cotizacion.id, folio: cotizacion.quoteNumber)
            let titulo = nombre.hasSuffix(".pdf") ? String(nombre.dropLast(4)) : nombre
            abierto = CotizacionPdfAbierto(titulo: titulo, data: bytes)
        } catch {
            if Task.isCancelled || error is CancellationError { return }
            var prohibido = false
            if let api = error as? ApiError, case .http(let codigo, _) = api {
                prohibido = codigo == 403
            }
            self.error = ActividadCotizacionRules.error(
                prohibido: prohibido,
                mensaje: error.toUserMessage(fallback: ActividadCotizacionRules.fallo)
            )
        }
    }
}
