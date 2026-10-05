import SwiftUI

/// Una fila de la pantalla: la actividad y lo que se le carga, tal como se teclea.
private struct FilaReparto: Identifiable, Hashable {
    let actividadId: Int
    let etiqueta: String
    /// Texto crudo del campo de importe (dígitos y a lo sumo un punto).
    var texto: String

    var id: Int { actividadId }
}

/// «Repartir viático» (Android `RepartoViaticoScreen`): un viático entre varias
/// actividades.
///
/// Un mismo viaje cubre dos servicios de clientes distintos y la gasolina es
/// una sola: sin esto, el costo entero cae sobre una actividad, un proyecto
/// paga de más y el otro de menos, y el P&L miente sin que nada avise.
///
/// **El cuadre manda**: la suma tiene que ser exactamente el total, al centavo.
/// La pantalla enseña en vivo cuánto falta o sobra y ofrece acomodar el resto
/// de un toque. Todo se cuenta en centavos enteros (`RepartoViatico`), igual
/// que el servidor.
///
/// El total es el **monto solicitado**, no el autorizado: es contra ése que
/// `setReparto` valida del otro lado.
///
/// Se apila sobre el detalle; la barra teal la pone quien la abre.
struct RepartoViaticoView: View {
    let viaticoId: Int
    let onListo: (String) -> Void

    @Environment(\.dismiss) private var dismiss

    @State private var viatico: Viatico?
    @State private var filas: [FilaReparto] = []
    @State private var actividades: [MyActivityItem] = []
    @State private var cargando = true
    @State private var cargandoActividades = true
    @State private var precargado = false
    @State private var agregando = false
    @State private var enviando = false
    @State private var error: String?
    @State private var accionError: String?

    private var totalCentavos: Int { viatico?.solicitadoCentavos ?? 0 }

    private var partes: [ParteReparto] {
        filas.map {
            ParteReparto(actividadId: $0.actividadId, centavos: Dinero.parsearCentavos($0.texto) ?? 0)
        }
    }

    private var sumaCentavos: Int { partes.reduce(0) { $0 + $1.centavos } }

    private var cuadre: CuadreReparto { RepartoViatico.revisar(partes, totalCentavos: totalCentavos) }

    private var candidatas: [MyActivityItem] {
        let puestas = Set(filas.map(\.actividadId))
        return actividades.filter { !puestas.contains($0.id) }
    }

    var body: some View {
        VStack(spacing: 0) {
            ScrollView {
                VStack(alignment: .leading, spacing: 12) {
                    if let error {
                        NxAlertBanner(
                            alert: NxAlert(id: "reparto-error", title: error, tone: .danger),
                            actionLabel: "Reintentar",
                            onAction: { Task { await cargar() } }
                        )
                    }

                    if viatico == nil {
                        if cargando { NxLoadingState(text: "Abriendo el viático…") }
                    } else {
                        MarcadorReparto(totalCentavos: totalCentavos, sumaCentavos: sumaCentavos, cuadre: cuadre)

                        ForEach(filas) { fila in
                            FilaDeReparto(
                                etiqueta: fila.etiqueta,
                                texto: texto(de: fila.actividadId),
                                habilitado: !enviando,
                                onQuitar: { quitar(fila.actividadId) }
                            )
                        }

                        Button {
                            agregando = true
                        } label: {
                            HStack(spacing: 8) {
                                Image(systemName: "plus")
                                    .font(.system(size: 15, weight: .semibold))
                                    .frame(width: 18, height: 18)
                                    .accessibilityHidden(true)
                                Text("Agregar actividad")
                            }
                        }
                        .buttonStyle(BotonMaterialStyle(tipo: .contorno(NxColors.brand), alto: viaticoAlturaToque, llenaAncho: true))
                        .disabled(enviando || filas.count >= RepartoViatico.maxPartes)

                        if filas.count >= 2 {
                            HStack(spacing: 10) {
                                Button("Partes iguales") { partesIguales() }
                                    .buttonStyle(BotonMaterialStyle(tipo: .contorno(NxColors.brand), alto: viaticoAlturaToque, llenaAncho: true))
                                    .disabled(enviando || totalCentavos <= 0)
                                Button(sobra ? "Quitar lo que sobra" : "Repartir el resto") {
                                    aplicar(RepartoViatico.cuadrarResto(partes, totalCentavos: totalCentavos))
                                }
                                .buttonStyle(BotonMaterialStyle(tipo: .lleno(NxColors.brand), alto: viaticoAlturaToque, llenaAncho: true))
                                .disabled(enviando || totalCentavos <= 0 || sumaCentavos == totalCentavos)
                            }
                        }

                        if let viatico, !viatico.repartos.isEmpty {
                            Button("Quitar el reparto") { guardar(partes: []) }
                                .buttonStyle(BotonMaterialStyle(tipo: .texto(NxColors.danger), alto: viaticoAlturaToque, llenaAncho: true))
                                .disabled(enviando)
                        }

                        if let accionError {
                            NxErrorBlock(message: accionError)
                        }

                        Color.clear.frame(height: 8)
                    }
                }
                .padding(NxSpacing.l)
            }
            .scrollDismissesKeyboard(.interactively)

            // El botón vive abajo, fijo: con una mano y el teclado abierto no se
            // puede exigir que alguien baje a buscarlo.
            if viatico != nil {
                barraInferior
            }
        }
        .nxScreenBackground()
        .task { await cargar() }
        .sheet(isPresented: $agregando) {
            HojaElegirActividadViatico(
                titulo: "¿Qué actividad cubrió el viaje?",
                actividades: candidatas,
                textoVacio: cargandoActividades
                    ? "Buscando tus actividades…"
                    : "No te quedan actividades abiertas por agregar."
            ) { item in
                filas.append(
                    FilaReparto(
                        actividadId: item.id,
                        etiqueta: ViaticoTextos.etiqueta(item),
                        // Entra vacía a propósito: «repartir el resto» sabe
                        // darle lo que falta.
                        texto: ""
                    )
                )
                agregando = false
            }
        }
    }

    private var sobra: Bool {
        if case .sobra = cuadre { return true }
        return false
    }

    private var barraInferior: some View {
        VStack(spacing: 0) {
            Rectangle().fill(NxColors.border).frame(height: 1)
            VStack(alignment: .leading, spacing: 10) {
                if let aviso = RepartoViatico.mensaje(cuadre) {
                    Text(aviso)
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundStyle(faltaNada ? NxColors.danger : NxColors.warning)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .fixedSize(horizontal: false, vertical: true)
                        .accessibilityAddTraits(.updatesFrequently)
                }
                Button {
                    guardar(partes: partes)
                } label: {
                    if enviando {
                        SpinnerDeBoton()
                    } else {
                        Text("Guardar reparto").fontWeight(.bold)
                    }
                }
                .buttonStyle(BotonMaterialStyle(tipo: .lleno(NxColors.brand), alto: 56, llenaAncho: true))
                .disabled(enviando || !cuadre.puedeGuardarse || filas.isEmpty)
            }
            .padding(NxSpacing.l)
            .background(NxColors.card)
        }
    }

    /// El aviso va en ámbar solo cuando faltan centavos; todo lo demás es rojo.
    private var faltaNada: Bool {
        if case .falta = cuadre { return false }
        return true
    }

    // MARK: Datos

    private func quitar(_ actividadId: Int) {
        filas.removeAll { $0.actividadId == actividadId }
    }

    /// El texto de una fila por su actividad, no por su posición: quitar una
    /// fila no puede dejar a otro campo apuntando a un índice que ya no existe.
    private func texto(de actividadId: Int) -> Binding<String> {
        Binding(
            get: { filas.first(where: { $0.actividadId == actividadId })?.texto ?? "" },
            set: { nuevo in
                if let i = filas.firstIndex(where: { $0.actividadId == actividadId }) {
                    filas[i].texto = nuevo
                }
            }
        )
    }

    private func partesIguales() {
        let trozos = RepartoViatico.repartirEnPartesIguales(totalCentavos: totalCentavos, cuantas: filas.count)
        aplicar(filas.enumerated().map { i, f in
            ParteReparto(actividadId: f.actividadId, centavos: trozos.indices.contains(i) ? trozos[i] : 0)
        })
    }

    private func aplicar(_ nuevos: [ParteReparto]) {
        for (i, parte) in nuevos.enumerated() where filas.indices.contains(i) {
            filas[i].texto = Dinero.textoApi(parte.centavos)
        }
    }

    private func cargar() async {
        if viatico == nil { cargando = true }
        do {
            let v = try await ViaticosRepository.shared.detalle(id: viaticoId)
            viatico = v
            error = nil
            precargar(v)
        } catch {
            self.error = error.toUserMessage(fallback: "No se pudo abrir el viático")
        }
        cargando = false
        // Las actividades se piden aparte: sin ellas todavía se puede ver y
        // ajustar el reparto que ya existe.
        if actividades.isEmpty {
            cargandoActividades = true
            if let abiertas = try? await CoreRepository.shared.myActivities().open {
                actividades = abiertas
            }
            cargandoActividades = false
        }
    }

    /// Se precarga una sola vez: un refresco no puede borrar lo que la persona
    /// lleva tecleado.
    private func precargar(_ v: Viatico) {
        guard !precargado else { return }
        precargado = true

        let existentes = v.repartos.filter { $0.actividadId > 0 }.map { parte in
            FilaReparto(
                actividadId: parte.actividadId,
                etiqueta: parte.titulo,
                texto: Dinero.textoApi(parte.centavos)
            )
        }
        if !existentes.isEmpty {
            filas = existentes
            return
        }
        // Sin reparto previo: se arranca con la actividad del viático y el total
        // encima, que es el punto de partida real de cualquier reparto.
        if let propia = v.actividadId ?? v.actividad?.id, propia > 0 {
            let an = (v.actividad?.anNumber ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
            filas = [
                FilaReparto(
                    actividadId: propia,
                    etiqueta: an.isEmpty ? "Actividad #\(propia)" : an,
                    texto: Dinero.textoApi(v.solicitadoCentavos)
                ),
            ]
        }
    }

    private func guardar(partes: [ParteReparto]) {
        guard !enviando else { return }
        enviando = true
        accionError = nil
        Task {
            do {
                let encolado = try await ViaticosRepository.shared.guardarReparto(
                    id: viaticoId,
                    partes: partes
                )
                enviando = false
                onListo(
                    encolado
                        ? "Sin conexión: el reparto quedó en la cola y se manda al volver la señal."
                        : (partes.isEmpty ? "Reparto deshecho" : "Reparto guardado")
                )
                dismiss()
            } catch {
                // El 400 del servidor dice al centavo cuánto falta o sobra: se
                // enseña tal cual y no se pierde nada de lo tecleado.
                enviando = false
                accionError = error.toUserMessage(fallback: "No se pudo guardar el reparto")
            }
        }
    }
}

/// El marcador (Android `Marcador`): total, repartido y lo que falta o sobra,
/// en vivo. Es lo primero que se ve y lo único que hay que mirar mientras se
/// teclea: se pone verde en cuanto cuadra.
private struct MarcadorReparto: View {
    let totalCentavos: Int
    let sumaCentavos: Int
    let cuadre: CuadreReparto

    private var diferencia: Int { totalCentavos - sumaCentavos }

    private var cuadra: Bool {
        if case .cuadra = cuadre { return true }
        return false
    }

    private var color: Color {
        if cuadra { return NxColors.success }
        return diferencia > 0 ? NxColors.warning : NxColors.danger
    }

    private var estado: String {
        if cuadra { return "Cuadra exacto" }
        if diferencia > 0 { return "Faltan \(Dinero.pesos(diferencia))" }
        return "Sobran \(Dinero.pesos(-diferencia))"
    }

    var body: some View {
        NxPanelShell {
            VStack(alignment: .leading, spacing: 12) {
                NxSectionHeader(
                    title: "Total a repartir",
                    subtitle: "Es el monto solicitado; la suma tiene que dar esto, al centavo."
                )
                HStack(alignment: .top, spacing: 14) {
                    ImporteLabel(titulo: "Total", centavos: totalCentavos)
                    ImporteLabel(titulo: "Repartido", centavos: sumaCentavos)
                }
                Text(estado)
                    .font(.system(size: 20, weight: .bold))
                    .foregroundStyle(color)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.horizontal, 14)
                    .padding(.vertical, 12)
                    .background(color.opacity(0.10), in: RoundedRectangle(cornerRadius: 10, style: .continuous))
                    .animation(.easeOut(duration: 0.2), value: estado)
                    .accessibilityElement(children: .ignore)
                    .accessibilityLabel(
                        "\(estado). Repartido \(Dinero.pesos(sumaCentavos)) de \(Dinero.pesos(totalCentavos))."
                    )
                    .accessibilityAddTraits(.updatesFrequently)
            }
        }
    }
}

/// Una actividad y lo que carga (Android `FilaDeReparto`). El importe usa el
/// mismo campo que todo el módulo.
private struct FilaDeReparto: View {
    let etiqueta: String
    @Binding var texto: String
    let habilitado: Bool
    let onQuitar: () -> Void

    var body: some View {
        NxPanelShell {
            VStack(alignment: .leading, spacing: 8) {
                HStack(alignment: .center, spacing: 8) {
                    Text(etiqueta)
                        .font(.system(size: 16, weight: .semibold))
                        .foregroundStyle(NxColors.fg)
                        .lineLimit(2)
                        .frame(maxWidth: .infinity, alignment: .leading)
                    Button(action: onQuitar) {
                        Image(systemName: "xmark")
                            .font(.system(size: 16, weight: .medium))
                            .foregroundStyle(NxColors.muted)
                            .frame(width: viaticoAlturaToque, height: viaticoAlturaToque)
                            .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .disabled(!habilitado)
                    .accessibilityLabel("Quitar \(etiqueta) del reparto")
                }
                CampoImporte(
                    titulo: "Carga esta actividad",
                    crudo: $texto,
                    ayuda: nil,
                    error: nil,
                    habilitado: habilitado,
                    fondo: NxColors.card
                )
            }
        }
    }
}
