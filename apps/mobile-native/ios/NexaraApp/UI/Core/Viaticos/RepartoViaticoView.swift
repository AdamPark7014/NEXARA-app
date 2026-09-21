import SwiftUI

/// Una fila de la pantalla: la actividad y lo que se le carga, tal como se teclea.
private struct FilaReparto: Identifiable, Hashable {
    let actividadId: Int
    let etiqueta: String
    /// Texto crudo del campo de importe (dígitos y a lo sumo un punto).
    var texto: String

    var id: Int { actividadId }
}

/// Repartir un viático entre varias actividades.
///
/// Un mismo viaje cubre dos servicios de clientes distintos y la gasolina es
/// una sola: sin esto, el costo entero cae sobre una actividad, un proyecto
/// paga de más y el otro de menos, y el P&L miente sin que nada avise.
///
/// **El cuadre manda**: la suma tiene que ser exactamente el total, al centavo.
/// La pantalla no pelea con eso, ayuda a lograrlo — enseña en vivo cuánto falta
/// o sobra y ofrece acomodar el resto de un toque. Todo se cuenta en centavos
/// enteros (`RepartoViatico`), igual que el servidor.
///
/// El total es el **monto solicitado**, no el autorizado: es contra ése que
/// `setReparto` valida del otro lado. Si el jefe recortó la cifra, el reparto
/// sigue siendo del costo que se pidió.
struct RepartoViaticoView: View {
    let viaticoId: Int
    let onListo: (String) -> Void

    @Environment(\.dismiss) private var dismiss

    @State private var viatico: Viatico?
    @State private var filas: [FilaReparto] = []
    @State private var actividades: [MyActivityItem] = []
    @State private var cargando = true
    @State private var precargado = false
    @State private var agregando = false
    @State private var enviando = false
    @State private var error: String?

    private var totalCentavos: Int { viatico?.solicitadoCentavos ?? 0 }

    private var partes: [ParteReparto] {
        filas.map {
            ParteReparto(actividadId: $0.actividadId, centavos: Dinero.parsearCentavos($0.texto) ?? 0)
        }
    }

    private var sumaCentavos: Int { partes.reduce(0) { $0 + $1.centavos } }

    private var cuadre: CuadreReparto { RepartoViatico.revisar(partes, totalCentavos: totalCentavos) }

    private var diferencia: Int { totalCentavos - sumaCentavos }

    private var estado: String {
        if case .cuadra = cuadre { return "Cuadra exacto" }
        if diferencia > 0 { return "Faltan \(Dinero.pesos(diferencia))" }
        return "Sobran \(Dinero.pesos(-diferencia))"
    }

    private var tonoEstado: NxTone {
        if case .cuadra = cuadre { return .success }
        return diferencia > 0 ? .warning : .danger
    }

    private var candidatas: [MyActivityItem] {
        let puestas = Set(filas.map(\.actividadId))
        return actividades.filter { !puestas.contains($0.id) }
    }

    var body: some View {
        List {
            if let error {
                Section {
                    NxAlertBanner(alert: NxAlert(id: "reparto", title: error, tone: .danger))
                        .listRowInsets(EdgeInsets())
                        .listRowBackground(Color.clear)
                }
            }

            if cargando && viatico == nil {
                Section { ProgressView().frame(maxWidth: .infinity) }
            }

            if viatico != nil {
                marcador
                filasDeReparto
                herramientas
            }
        }
        .listStyle(.insetGrouped)
        .navigationTitle("Repartir viático")
        .navigationBarTitleDisplayMode(.inline)
        // El botón vive abajo, fijo: con una mano y el teclado abierto no se
        // puede exigir que alguien baje a buscarlo.
        .safeAreaInset(edge: .bottom) {
            if viatico != nil {
                barraInferior
            }
        }
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Button {
                    agregando = true
                } label: {
                    Label("Agregar actividad", systemImage: "plus")
                }
                .disabled(enviando || filas.count >= RepartoViatico.maxPartes)
            }
        }
        .sheet(isPresented: $agregando) {
            HojaElegirActividad(actividades: candidatas, cargando: cargando) { item in
                filas.append(
                    FilaReparto(
                        actividadId: item.id,
                        etiqueta: etiqueta(item),
                        // Entra vacía a propósito: «repartir el resto» sabe
                        // darle lo que falta.
                        texto: ""
                    )
                )
                agregando = false
            }
        }
        .task { await cargar() }
    }

    // MARK: Secciones

    /// El marcador: total, repartido y lo que falta o sobra, en vivo. Es lo
    /// primero que se ve y lo único que hay que mirar mientras se teclea.
    private var marcador: some View {
        Section {
            HStack(spacing: 14) {
                ImporteLabel(titulo: "Total", centavos: totalCentavos)
                ImporteLabel(titulo: "Repartido", centavos: sumaCentavos)
            }
            Text(estado)
                .font(.title3.weight(.bold))
                .foregroundStyle(tonoEstado.fg)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.horizontal, 14)
                .padding(.vertical, 12)
                .background(tonoEstado.bg, in: RoundedRectangle(cornerRadius: 10))
                .accessibilityElement(children: .ignore)
                .accessibilityLabel(
                    "\(estado). Repartido \(Dinero.pesos(sumaCentavos)) de \(Dinero.pesos(totalCentavos))."
                )
                .accessibilityAddTraits(.updatesFrequently)
        } header: {
            Text("Total a repartir")
        } footer: {
            Text("Es el monto solicitado; la suma tiene que dar esto, al centavo.")
        }
    }

    private var filasDeReparto: some View {
        Section {
            ForEach($filas) { $fila in
                VStack(alignment: .leading, spacing: 8) {
                    Text(fila.etiqueta).font(.body.weight(.semibold)).lineLimit(2)
                    CampoImporte(
                        titulo: "Carga esta actividad",
                        crudo: $fila.texto,
                        ayuda: nil,
                        error: nil,
                        habilitado: !enviando
                    )
                }
                .padding(.vertical, 4)
            }
            // Gesto nativo: deslizar para quitar una actividad del reparto.
            .onDelete { indices in
                filas.remove(atOffsets: indices)
            }
        } header: {
            Text("Actividades")
        } footer: {
            if filas.isEmpty {
                Text("Agrega las actividades que cubrió el viaje con el botón de arriba.")
            }
        }
    }

    @ViewBuilder
    private var herramientas: some View {
        if filas.count >= 2 {
            Section {
                Button("Partes iguales") {
                    let trozos = RepartoViatico.repartirEnPartesIguales(
                        totalCentavos: totalCentavos,
                        cuantas: filas.count
                    )
                    aplicar(filas.enumerated().map { i, f in
                        ParteReparto(actividadId: f.actividadId, centavos: trozos.indices.contains(i) ? trozos[i] : 0)
                    })
                }
                .frame(minHeight: 44)
                .disabled(enviando || totalCentavos <= 0)

                Button(diferencia < 0 ? "Quitar lo que sobra" : "Repartir el resto") {
                    aplicar(RepartoViatico.cuadrarResto(partes, totalCentavos: totalCentavos))
                }
                .frame(minHeight: 44)
                .disabled(enviando || totalCentavos <= 0 || diferencia == 0)
            }
        }

        if let viatico, !viatico.repartos.isEmpty {
            Section {
                Button("Quitar el reparto", role: .destructive) {
                    guardar(partes: [])
                }
                .frame(minHeight: 44)
                .disabled(enviando)
            } footer: {
                Text("El costo entero vuelve a caer en la actividad del viático.")
            }
        }
    }

    private var barraInferior: some View {
        VStack(spacing: 10) {
            if let aviso = RepartoViatico.mensaje(cuadre) {
                Text(aviso)
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(tonoEstado.fg)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
            Button {
                guardar(partes: partes)
            } label: {
                if enviando {
                    ProgressView().frame(maxWidth: .infinity, minHeight: 44)
                } else {
                    Text("Guardar reparto")
                        .font(.body.weight(.bold))
                        .frame(maxWidth: .infinity, minHeight: 44)
                }
            }
            .buttonStyle(.borderedProminent)
            .tint(NxBrand.primary)
            .disabled(enviando || !cuadre.puedeGuardarse || filas.isEmpty)
        }
        .padding(16)
        .background(.bar)
    }

    // MARK: Datos

    private func etiqueta(_ item: MyActivityItem) -> String {
        [item.anNumber, item.titulo]
            .compactMap { $0 }
            .first { !$0.isEmpty } ?? "Actividad #\(item.id)"
    }

    private func aplicar(_ nuevos: [ParteReparto]) {
        for (i, parte) in nuevos.enumerated() where filas.indices.contains(i) {
            filas[i].texto = Dinero.textoApi(parte.centavos)
        }
    }

    private func cargar() async {
        cargando = true
        do {
            let v = try await ViaticosRepository.shared.detalle(id: viaticoId)
            viatico = v
            error = nil
            precargar(v)
        } catch {
            self.error = error.localizedDescription
        }
        // Las actividades se piden aparte: sin ellas todavía se puede ver y
        // ajustar el reparto que ya existe.
        actividades = (try? await CoreRepository.shared.myActivities().open) ?? []
        cargando = false
    }

    /// Se precarga una sola vez: un refresco no puede borrar lo que la persona
    /// lleva tecleado.
    private func precargar(_ v: Viatico) {
        guard !precargado else { return }
        precargado = true

        let existentes = v.repartos.map { parte in
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
            filas = [
                FilaReparto(
                    actividadId: propia,
                    etiqueta: v.actividad.map { a in
                        [a.anNumber, a.titulo].compactMap { $0 }.first { !$0.isEmpty } ?? "Actividad #\(propia)"
                    } ?? "Actividad #\(propia)",
                    texto: Dinero.textoApi(v.solicitadoCentavos)
                ),
            ]
        }
    }

    private func guardar(partes: [ParteReparto]) {
        enviando = true
        error = nil
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
                self.error = error.localizedDescription
            }
        }
    }
}

/// «¿Qué actividad cubrió el viaje?» — hoja inferior nativa.
private struct HojaElegirActividad: View {
    let actividades: [MyActivityItem]
    let cargando: Bool
    let onElegir: (MyActivityItem) -> Void

    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            List {
                if actividades.isEmpty {
                    Text(cargando ? "Buscando tus actividades…" : "No te quedan actividades abiertas por agregar.")
                        .foregroundStyle(.secondary)
                } else {
                    ForEach(actividades) { item in
                        Button {
                            onElegir(item)
                        } label: {
                            VStack(alignment: .leading, spacing: 2) {
                                Text(item.titulo?.isEmpty == false ? item.titulo! : "Actividad #\(item.id)")
                                    .lineLimit(2)
                                Text(
                                    [item.anNumber, item.cliente]
                                        .compactMap { $0 }
                                        .filter { !$0.isEmpty }
                                        .joined(separator: " · ")
                                )
                                .font(.caption)
                                .foregroundStyle(.secondary)
                            }
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .frame(minHeight: 44)
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
            .navigationTitle("¿Qué actividad cubrió el viaje?")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cerrar") { dismiss() }
                }
            }
        }
        .presentationDetents([.medium, .large])
    }
}
