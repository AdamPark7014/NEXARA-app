import SwiftUI

/// Evidencia de préstamos (21-11-2026): la herramienta sale con fotos de cómo va y vuelve con
/// fotos de cómo llegó y en qué condición. Aquí viven las piezas que comparten la ventanilla
/// (`HerramientasHojas`), el escáner (`HerramientasEscaneo`) y la salida de material de
/// Almacén. Espejo de `HerramientasEvidencia.kt` en Android.

private let ladoMiniatura: CGFloat = 84

// MARK: - Fotos tomadas en el momento

/// Fotos tomadas con la cámara en vivo, con su miniatura y «Quitar». La evidencia se toma en
/// el momento: no se elige de la galería, para que la foto sea de esta entrega y no de otra.
struct FotosDeEvidencia: View {
    let titulo: String
    var pista: String? = nil
    let fotos: [CapturedGeoPhoto]
    let maximo: Int
    var habilitado: Bool = true
    let onTomar: () -> Void
    let onQuitar: (CapturedGeoPhoto) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            VStack(alignment: .leading, spacing: 2) {
                Text(titulo)
                    .font(.system(size: 14, weight: .bold))
                    .foregroundStyle(NxColors.fg)
                    .accessibilityAddTraits(.isHeader)
                if let pista {
                    Text(pista)
                        .font(NxType.labelMedium)
                        .foregroundStyle(NxColors.muted)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            if !fotos.isEmpty {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(alignment: .top, spacing: 10) {
                        ForEach(Array(fotos.enumerated()), id: \.element.id) { indice, foto in
                            VStack(spacing: 2) {
                                Image(uiImage: foto.image)
                                    .resizable()
                                    .scaledToFill()
                                    .frame(width: ladoMiniatura, height: ladoMiniatura)
                                    .clipShape(RoundedRectangle(cornerRadius: NxRadius.m, style: .continuous))
                                    .accessibilityLabel("Foto \(indice + 1)")
                                Button("Quitar") { onQuitar(foto) }
                                    .buttonStyle(BotonMaterialStyle(tipo: .texto(NxColors.brand), alto: viaticoAlturaToque))
                                    .disabled(!habilitado)
                                    .accessibilityLabel("Quitar la foto \(indice + 1)")
                            }
                        }
                    }
                }
            }
            if fotos.count < maximo {
                Button(action: onTomar) {
                    HStack(spacing: 8) {
                        Image(systemName: "camera.fill")
                            .font(.system(size: 15, weight: .semibold))
                            .frame(width: 18, height: 18)
                            .accessibilityHidden(true)
                        Text(fotos.isEmpty ? "Tomar foto" : "Tomar otra (\(fotos.count) de \(maximo))")
                    }
                }
                .buttonStyle(BotonMaterialStyle(tipo: .contorno(NxColors.brand), alto: viaticoAlturaToque, llenaAncho: true))
                .disabled(!habilitado)
                .accessibilityLabel(fotos.isEmpty ? "Tomar foto: \(titulo)" : "Tomar otra foto: \(titulo)")
            } else {
                Text("Ya son \(maximo) fotos, el máximo.")
                    .font(NxType.labelMedium)
                    .foregroundStyle(NxColors.muted)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

// MARK: - Fotos guardadas en el servidor

/// Una foto del servidor abierta en grande.
private struct FotoAbierta: Identifiable {
    let url: String
    var id: String { url }
}

/// Miniaturas de fotos guardadas en el servidor. Un toque abre la foto completa.
struct MiniaturasDeEvidencia: View {
    let urls: [String]
    let descripcion: String

    @State private var abierta: FotoAbierta?

    var body: some View {
        if !urls.isEmpty {
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(alignment: .top, spacing: 8) {
                    ForEach(Array(urls.enumerated()), id: \.offset) { indice, url in
                        Button {
                            abierta = FotoAbierta(url: url)
                        } label: {
                            AuthenticatedImage(url: url)
                                .frame(width: ladoMiniatura, height: ladoMiniatura)
                                .clipShape(RoundedRectangle(cornerRadius: NxRadius.m, style: .continuous))
                        }
                        .buttonStyle(.plain)
                        .accessibilityLabel("\(descripcion), foto \(indice + 1). Abrir")
                    }
                }
            }
            .fullScreenCover(item: $abierta) { foto in
                ZStack(alignment: .topTrailing) {
                    Color.black.ignoresSafeArea()
                    AuthenticatedImage(url: foto.url, contentMode: .fit, background: .black)
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                    Button("Cerrar") { abierta = nil }
                        .buttonStyle(BotonMaterialStyle(tipo: .texto(.white), alto: viaticoAlturaToque))
                        .padding(NxSpacing.xl)
                }
            }
        }
    }
}

/// Antes y después de un préstamo, dentro de su tarjeta: cómo salió, cómo volvió, en qué
/// condición y quién firmó cada paso. Lo que falta se dice («Salió sin foto»). No pinta nada
/// en un préstamo que todavía no sale.
struct EvidenciaDelPrestamo: View {
    let prestamo: PrestamoHerramienta

    var body: some View {
        let salida = EvidenciaPrestamoReglas.urls(prestamo.deliveryPhotos)
        let entrada = EvidenciaPrestamoReglas.urls(prestamo.returnPhotos)
        let falta = EvidenciaPrestamoReglas.faltaEvidencia(prestamo)
        let condicion = EvidenciaPrestamoReglas.etiquetaCondicion(prestamo)
        let firmas = EvidenciaPrestamoReglas.quienesFirmaron(prestamo)
        let nota = prestamo.returnNotes?.nilSiVacio

        if !salida.isEmpty || !entrada.isEmpty || falta != nil || condicion != nil || !firmas.isEmpty {
            VStack(alignment: .leading, spacing: 6) {
                if !salida.isEmpty {
                    Text("Cómo salió")
                        .font(NxType.labelMedium)
                        .foregroundStyle(NxColors.muted)
                    MiniaturasDeEvidencia(urls: salida, descripcion: "Cómo salió")
                }
                if !entrada.isEmpty || condicion != nil {
                    Text(["Cómo volvió", condicion].compactMap { $0 }.joined(separator: ": "))
                        .font(NxType.labelMedium)
                        .foregroundStyle(NxColors.muted)
                    MiniaturasDeEvidencia(urls: entrada, descripcion: "Cómo volvió")
                }
                if let nota {
                    Text(nota)
                        .font(NxType.bodySmall)
                        .foregroundStyle(NxColors.fg)
                        .fixedSize(horizontal: false, vertical: true)
                }
                if !firmas.isEmpty {
                    Text(firmas)
                        .font(NxType.labelSmall)
                        .foregroundStyle(NxColors.muted)
                }
                if let falta {
                    NxStatusChip(text: falta, tone: .warning)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }
}

// MARK: - Entregar

/// «Entregar»: el código de quien la recoge (si el préstamo lo tiene) y las fotos de cómo sale.
/// Sin foto no hay entrega: es lo que después permite decir si volvió igual.
struct HojaDeEntrega: View {
    let titulo: String
    let persona: String
    /// Se enseña el campo del código.
    let pideCodigo: Bool
    /// Sin código no se puede mandar. El escáner enseña el campo siempre y solo lo exige cuando
    /// sabe que el préstamo tiene código; si no lo sabe, decide el servidor.
    var codigoObligatorio: Bool = true
    var codigoVencido: Bool = false
    let enviando: Bool
    let error: String?
    let onCerrar: () -> Void
    let onEntregar: (String, [CapturedGeoPhoto]) -> Void

    @State private var codigo = ""
    @State private var fotos: [CapturedGeoPhoto] = []
    @State private var camara = false

    private var falta: String? {
        EvidenciaPrestamoReglas.faltaParaEntregar(
            pideCodigo: pideCodigo && codigoObligatorio, codigo: codigo, fotos: fotos.count
        )
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                VStack(alignment: .leading, spacing: 2) {
                    Text("ENTREGAR")
                        .font(.system(size: 11, weight: .heavy))
                        .foregroundStyle(NxColors.muted)
                    Text(titulo)
                        .font(.system(size: 16, weight: .bold))
                        .foregroundStyle(NxColors.fg)
                        .fixedSize(horizontal: false, vertical: true)
                    Text("A \(persona)")
                        .font(NxType.bodySmall)
                        .foregroundStyle(NxColors.muted)
                }
                .accessibilityElement(children: .combine)
                .accessibilityAddTraits(.isHeader)

                if codigoVencido {
                    Text("El código de recolección ya venció: hay que generar otro en la web.")
                        .font(NxType.bodySmall)
                        .foregroundStyle(NxColors.danger)
                        .fixedSize(horizontal: false, vertical: true)
                }

                if pideCodigo {
                    CampoDelineado(
                        etiqueta: "Código de recolección",
                        texto: $codigo,
                        ayuda: "El que enseña quien la recoge.",
                        mayusculas: true,
                        habilitado: !enviando,
                        maxLargo: 12
                    )
                }

                FotosDeEvidencia(
                    titulo: "Cómo sale",
                    pista: "La herramienta completa y, si ya trae golpes o desgaste, un acercamiento.",
                    fotos: fotos,
                    maximo: EvidenciaPrestamoReglas.maxFotos,
                    habilitado: !enviando,
                    onTomar: { camara = true },
                    onQuitar: { quitada in fotos.removeAll { $0.id == quitada.id } }
                )

                if let error {
                    Text(error)
                        .font(NxType.bodySmall)
                        .foregroundStyle(NxColors.danger)
                        .fixedSize(horizontal: false, vertical: true)
                }

                HStack(spacing: 8) {
                    Spacer(minLength: 0)
                    Button("Cancelar", action: onCerrar)
                        .buttonStyle(BotonMaterialStyle(tipo: .texto(NxColors.brand)))
                        .disabled(enviando)
                    Button(enviando ? "Registrando…" : "Registrar salida") {
                        onEntregar(pideCodigo ? codigo : "", fotos)
                    }
                    .buttonStyle(BotonMaterialStyle(tipo: .lleno(NxColors.brand), alto: 48))
                    .disabled(enviando || falta != nil)
                }

                if let falta {
                    Text(falta)
                        .font(NxType.labelMedium)
                        .foregroundStyle(NxColors.muted)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
            }
            .padding(NxSpacing.xl)
        }
        .scrollDismissesKeyboard(.interactively)
        .interactiveDismissDisabled(enviando)
        .hojaMaterial(detents: [.large])
        .fullScreenCover(isPresented: $camara) {
            GeoPhotoCaptureView(
                title: "Cómo sale",
                confirmLabel: "Usar esta foto",
                // Se toma en el almacén, a veces sin GPS: la ubicación no bloquea la entrega.
                requireLocation: false,
                onConfirm: { foto in
                    if fotos.count < EvidenciaPrestamoReglas.maxFotos { fotos.append(foto) }
                    camara = false
                    return nil
                },
                onCancel: { camara = false }
            )
        }
    }
}

// MARK: - Recibir

/// «Recibir»: enseña cómo salió, pregunta cómo volvió y pide las fotos de después. Dañada o
/// incompleta piden explicación; extraviada no pide foto porque no hay qué fotografiar.
struct HojaDeEntrada: View {
    let titulo: String
    let persona: String
    let fotosDeSalida: [String]
    let enviando: Bool
    let error: String?
    let onCerrar: () -> Void
    let onRecibir: (CondicionDeDevolucion, String, [CapturedGeoPhoto]) -> Void

    @State private var condicion: CondicionDeDevolucion?
    @State private var descripcion = ""
    @State private var fotos: [CapturedGeoPhoto] = []
    @State private var camara = false

    private var falta: String? {
        EvidenciaPrestamoReglas.faltaParaRecibir(condicion: condicion, descripcion: descripcion, fotos: fotos.count)
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                VStack(alignment: .leading, spacing: 2) {
                    Text("RECIBIR")
                        .font(.system(size: 11, weight: .heavy))
                        .foregroundStyle(NxColors.muted)
                    Text(titulo)
                        .font(.system(size: 16, weight: .bold))
                        .foregroundStyle(NxColors.fg)
                        .fixedSize(horizontal: false, vertical: true)
                    Text("La trae \(persona)")
                        .font(NxType.bodySmall)
                        .foregroundStyle(NxColors.muted)
                }
                .accessibilityElement(children: .combine)
                .accessibilityAddTraits(.isHeader)

                VStack(alignment: .leading, spacing: 6) {
                    Text("Cómo salió")
                        .font(.system(size: 14, weight: .bold))
                        .foregroundStyle(NxColors.fg)
                        .accessibilityAddTraits(.isHeader)
                    Text(fotosDeSalida.isEmpty ? "Salió sin foto: no hay con qué comparar." : "Compárala con estas fotos.")
                        .font(NxType.labelMedium)
                        .foregroundStyle(NxColors.muted)
                    MiniaturasDeEvidencia(urls: fotosDeSalida, descripcion: "Cómo salió")
                }

                VStack(alignment: .leading, spacing: 0) {
                    Text("¿Cómo volvió?")
                        .font(.system(size: 14, weight: .bold))
                        .foregroundStyle(NxColors.fg)
                        .accessibilityAddTraits(.isHeader)
                    ForEach(CondicionDeDevolucion.allCases) { opcion in
                        Button {
                            condicion = opcion
                        } label: {
                            HStack(alignment: .center, spacing: 10) {
                                Image(systemName: condicion == opcion ? "largecircle.fill.circle" : "circle")
                                    .font(.system(size: 20))
                                    .foregroundStyle(condicion == opcion ? NxColors.brand : NxColors.muted)
                                    .accessibilityHidden(true)
                                VStack(alignment: .leading, spacing: 0) {
                                    Text(opcion.etiqueta)
                                        .font(.system(size: 14, weight: .semibold))
                                        .foregroundStyle(NxColors.fg)
                                    Text(opcion.ayuda)
                                        .font(NxType.labelMedium)
                                        .foregroundStyle(NxColors.muted)
                                        .multilineTextAlignment(.leading)
                                }
                                Spacer(minLength: 0)
                            }
                            .frame(minHeight: viaticoAlturaToque)
                            .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                        .disabled(enviando)
                        .accessibilityLabel("\(opcion.etiqueta). \(opcion.ayuda)")
                        .accessibilityAddTraits(condicion == opcion ? AccessibilityTraits.isSelected : [])
                    }
                }

                if condicion?.pideFoto != false {
                    FotosDeEvidencia(
                        titulo: "Cómo volvió",
                        pista: "Desde el mismo ángulo que al salir; si hay daño, un acercamiento.",
                        fotos: fotos,
                        maximo: EvidenciaPrestamoReglas.maxFotos,
                        habilitado: !enviando,
                        onTomar: { camara = true },
                        onQuitar: { quitada in fotos.removeAll { $0.id == quitada.id } }
                    )
                }

                CampoDelineado(
                    etiqueta: EvidenciaPrestamoReglas.preguntaDescripcion(condicion),
                    texto: $descripcion,
                    multilinea: true,
                    minLineas: 2,
                    habilitado: !enviando,
                    maxLargo: 500
                )

                if let error {
                    Text(error)
                        .font(NxType.bodySmall)
                        .foregroundStyle(NxColors.danger)
                        .fixedSize(horizontal: false, vertical: true)
                }

                HStack(spacing: 8) {
                    Spacer(minLength: 0)
                    Button("Cancelar", action: onCerrar)
                        .buttonStyle(BotonMaterialStyle(tipo: .texto(NxColors.brand)))
                        .disabled(enviando)
                    Button(enviando ? "Registrando…" : "Registrar entrada") {
                        guard let elegida = condicion else { return }
                        onRecibir(elegida, descripcion, elegida.pideFoto ? fotos : [])
                    }
                    .buttonStyle(BotonMaterialStyle(tipo: .lleno(NxColors.brand), alto: 48))
                    .disabled(enviando || falta != nil)
                }

                if let falta {
                    Text(falta)
                        .font(NxType.labelMedium)
                        .foregroundStyle(NxColors.muted)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
            }
            .padding(NxSpacing.xl)
        }
        .scrollDismissesKeyboard(.interactively)
        .interactiveDismissDisabled(enviando)
        .hojaMaterial(detents: [.large])
        .fullScreenCover(isPresented: $camara) {
            GeoPhotoCaptureView(
                title: "Cómo volvió",
                confirmLabel: "Usar esta foto",
                requireLocation: false,
                onConfirm: { foto in
                    if fotos.count < EvidenciaPrestamoReglas.maxFotos { fotos.append(foto) }
                    camara = false
                    return nil
                },
                onCancel: { camara = false }
            )
        }
    }
}
