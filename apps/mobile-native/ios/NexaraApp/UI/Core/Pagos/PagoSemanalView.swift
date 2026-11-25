import SwiftUI

/// «Pagos a empleados»: la semana por pagar y la lista de siempre — espejo de `PagosEmpleadosConSemana`.
struct PagosEmpleadosConSemana: View {
    @State private var vista = 0

    var body: some View {
        VStack(spacing: 0) {
            NxSegmented(options: ["Semana", "Lista de pagos"], selection: $vista)
                .padding(.horizontal, 16)
                .padding(.top, 12)
            if vista == 0 {
                PagoSemanalView()
            } else {
                PagosEmpleadosView()
            }
        }
        .nxScreenBackground()
    }
}

/// Pago de la semana: quién falta, cuánto y por qué. Con dinero no se deja un saldo viejo a la vista:
/// si la carga falla, se dice y se reintenta.
struct PagoSemanalView: View {
    /// La semana que se paga es la pasada.
    @State private var lunes = HorariosReglas.sumar(HorariosReglas.lunes(AttendanceClock.today()), -7)
    @State private var datos: PagoSemana?
    @State private var error: String?
    @State private var abierta: PagoFila?

    private var haySiguiente: Bool { HorariosReglas.sumar(lunes, 7) <= AttendanceClock.today() }

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 14) {
                HStack {
                    flecha("chevron.left", "Semana anterior", activa: true) { mover(-7) }
                    Text(HorariosReglas.tituloSemana(lunes))
                        .font(.system(size: 16, weight: .semibold))
                        .foregroundStyle(NxColors.fg)
                        .frame(maxWidth: .infinity, alignment: .leading)
                    flecha("chevron.right", "Semana siguiente", activa: haySiguiente) { mover(7) }
                }
                if let error {
                    NxErrorBlock(message: error, onRetry: { Task { await cargar() } })
                } else if let datos {
                    contenido(datos)
                } else {
                    NxSkeletonList(itemCount: 5, itemHeight: 64)
                }
            }
            .padding(16)
        }
        .nxScreenBackground()
        .refreshable { await cargar() }
        .task(id: lunes) { await cargar() }
        .sheet(item: $abierta) { fila in
            DetallePagoView(lunes: lunes, fila: fila, onPagado: { Task { await cargar() } })
        }
    }

    private func flecha(_ icono: String, _ etiqueta: String, activa: Bool, _ accion: @escaping () -> Void) -> some View {
        Button(action: accion) {
            Image(systemName: icono).frame(width: 44, height: 44)
        }
        .tint(NxColors.brand)
        .disabled(!activa)
        .accessibilityLabel(etiqueta)
    }

    @ViewBuilder
    private func contenido(_ d: PagoSemana) -> some View {
        let filas = d.filas ?? []
        if d.montosOcultos == true {
            NxEmptyState(title: "Montos ocultos", subtitle: "Los montos los ven dirección y contabilidad.")
        } else if filas.isEmpty {
            NxEmptyState(title: "Nadie en esta semana", subtitle: "Aparecen las personas con nómina en la semana elegida.")
        } else {
            VStack(alignment: .leading, spacing: 4) {
                Text("Por pagar").font(NxType.bodySmall).foregroundStyle(NxColors.muted)
                Text(HorariosReglas.pesos(d.totales?.saldo))
                    .font(.system(size: 30, weight: .bold))
                    .monospacedDigit()
                    .foregroundStyle(NxColors.fg)
                Text("Pagado \(HorariosReglas.pesos(d.totales?.pagado)) de \(HorariosReglas.pesos(d.totales?.final))")
                    .font(NxType.bodyMedium)
                    .foregroundStyle(NxColors.fg2)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .nxCard()
            grupo(filas.filter { HorariosReglas.centavos($0.saldo?.saldo) > 0 })
            grupo(filas.filter { HorariosReglas.centavos($0.saldo?.saldo) <= 0 })
        }
    }

    @ViewBuilder
    private func grupo(_ filas: [PagoFila]) -> some View {
        if !filas.isEmpty {
            VStack(spacing: 0) {
                ForEach(Array(filas.enumerated()), id: \.element.id) { i, f in
                    if i > 0 { Divider() }
                    let debe = HorariosReglas.centavos(f.saldo?.saldo) > 0
                    Button { abierta = f } label: {
                        HorarioRenglon(
                            titulo: f.nombre ?? "",
                            detalle: HorariosReglas.estado(f.estado),
                            valor: HorariosReglas.pesos(debe ? f.saldo?.saldo : f.saldo?.final)
                        )
                    }
                    .buttonStyle(.plain)
                    .accessibilityHint("Ver cómo se calculó")
                }
            }
            .nxCard(padding: 0)
        }
    }

    private func mover(_ dias: Int) {
        // Otra semana, otros montos: lo anterior no se queda en pantalla.
        datos = nil
        error = nil
        lunes = HorariosReglas.sumar(lunes, dias)
    }

    private func cargar() async {
        let semana = lunes
        do {
            let r = try await PagoSemanalRepository.shared.semana(semana)
            guard semana == lunes else { return }
            datos = r
            error = nil
        } catch is CancellationError {
            return
        } catch {
            guard semana == lunes else { return }
            datos = nil
            self.error = error.toUserMessage(fallback: "No se pudieron cargar los pagos")
        }
    }
}

/// Cómo se calculó y, si es dirección y hay saldo, registrar el pago.
struct DetallePagoView: View {
    let lunes: String
    let fila: PagoFila
    let onPagado: () -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var datos: PagoDetalle?
    @State private var falla: String?
    @State private var vista = 0
    @State private var importe = ""
    @State private var forma = "transferencia"
    @State private var comprobante: CapturedGeoPhoto?
    @State private var camara = false
    @State private var enviando = false
    @State private var error: String?
    @State private var aviso: String?

    private var puede: Bool {
        datos?.puedeRegistrar == true && HorariosReglas.centavos(datos?.saldo?.saldo) > 0
    }

    private var falta: String? { HorariosReglas.faltaParaPagar(importe: importe, saldo: datos?.saldo?.saldo) }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                Text(fila.nombre ?? "")
                    .font(NxType.headlineSmall)
                    .foregroundStyle(NxColors.fg)
                    .accessibilityAddTraits(.isHeader)
                if let datos {
                    Text("Saldo por pagar").font(NxType.bodySmall).foregroundStyle(NxColors.muted)
                    Text(HorariosReglas.pesos(datos.saldo?.saldo))
                        .font(.system(size: 28, weight: .bold))
                        .monospacedDigit()
                        .foregroundStyle(NxColors.fg)
                    if puede {
                        NxSegmented(options: ["Cómo se calculó", "Registrar pago"], selection: $vista)
                    }
                    if let aviso {
                        Text(aviso)
                            .font(NxType.bodySmall)
                            .foregroundStyle(NxColors.warning)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    if puede && vista == 1 { formulario } else { calculo(datos) }
                } else if let falla {
                    NxErrorBlock(message: falla, onRetry: { Task { await cargar() } })
                } else {
                    NxSkeletonList(itemCount: 3, itemHeight: 48)
                }
                Button("Cerrar") { dismiss() }
                    .buttonStyle(BotonMaterialStyle(tipo: .texto(NxColors.brand), alto: viaticoAlturaToque, llenaAncho: true))
                    .disabled(enviando)
            }
            .padding(NxSpacing.xl)
        }
        .scrollDismissesKeyboard(.interactively)
        .interactiveDismissDisabled(enviando)
        .hojaMaterial()
        .task { await cargar() }
        .fullScreenCover(isPresented: $camara) {
            GeoPhotoCaptureView(
                title: "Comprobante",
                confirmLabel: "Usar esta foto",
                requireLocation: false,
                onConfirm: { foto in
                    comprobante = foto
                    camara = false
                    return nil
                },
                onCancel: { camara = false }
            )
        }
    }

    @ViewBuilder
    private func calculo(_ d: PagoDetalle) -> some View {
        let movs = d.movimientos ?? []
        VStack(spacing: 0) {
            ForEach(Array((d.comoSeCalculo ?? []).enumerated()), id: \.offset) { _, r in
                HorarioRenglon(titulo: r.titulo ?? "", detalle: r.detalle, valor: HorariosReglas.pesos(r.monto))
            }
            ForEach(Array(movs.filter { $0.tipo == "ajuste" }.enumerated()), id: \.offset) { _, m in
                HorarioRenglon(
                    titulo: "Ajuste manual",
                    detalle: [m.motivo, m.autorNombre.map { "Lo puso \($0)" }].compactMap { $0 }.joined(separator: ". "),
                    valor: HorariosReglas.ajuste(m.monto)
                )
            }
            Divider()
            HorarioRenglon(titulo: "A pagar", detalle: nil, valor: HorariosReglas.pesos(d.saldo?.final))
            ForEach(Array(movs.filter { $0.tipo == "pago" }.enumerated()), id: \.offset) { _, m in
                HorarioRenglon(
                    titulo: HorariosReglas.forma(m.forma),
                    detalle: [HorariosReglas.dia(m.fecha), m.autorNombre.map { "la registró \($0)" } ?? ""]
                        .filter { !$0.isEmpty }
                        .joined(separator: ", "),
                    valor: HorariosReglas.pesos(-(m.monto ?? 0))
                )
            }
        }
        .nxCard(padding: 0)
        if let m = d.extraPendienteMin, m > 0 {
            Text("Quedan \(HorariosReglas.horas(m)) extra sin autorizar; no se pagan hasta que su jefe decida.")
                .font(NxType.bodySmall)
                .foregroundStyle(NxColors.muted)
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    @ViewBuilder
    private var formulario: some View {
        CampoImporte(titulo: "¿Cuánto?", crudo: $importe, ayuda: nil, error: nil, habilitado: !enviando)
        NxSegmented(
            options: HorariosReglas.formas.map { $0.texto },
            selectedIndex: HorariosReglas.formas.firstIndex { $0.clave == forma } ?? 0,
            onSelect: { forma = HorariosReglas.formas[$0].clave }
        )
        FotoDeFormulario(
            titulo: "Comprobante (opcional)",
            pista: "La foto de la transferencia o el recibo.",
            foto: comprobante,
            habilitado: !enviando,
            onTomar: { camara = true }
        )
        if let error {
            Text(error)
                .font(NxType.bodySmall)
                .foregroundStyle(NxColors.danger)
                .fixedSize(horizontal: false, vertical: true)
        }
        NxPrimaryButton(
            falta == nil ? "Registrar \(Dinero.pesos(Dinero.parsearCentavos(importe) ?? 0))" : "Registrar pago",
            loading: enviando,
            enabled: falta == nil
        ) {
            registrar()
        }
        Text(falta ?? "Queda con fecha de hoy. Puedes pagar una parte; al completar se marca pagado en la lista.")
            .font(NxType.bodySmall)
            .foregroundStyle(NxColors.muted)
    }

    private func cargar() async {
        do {
            let r = try await PagoSemanalRepository.shared.detalle(lunes, userId: fila.userId)
            datos = r
            falla = nil
            if importe.isEmpty {
                let c = HorariosReglas.centavos(r.saldo?.saldo)
                if c > 0 { importe = Dinero.formatear(c) }
            }
        } catch is CancellationError {
            return
        } catch {
            if datos == nil { falla = error.toUserMessage(fallback: "No se pudo leer el pago") }
        }
    }

    private func registrar() {
        guard falta == nil, !enviando, let centavos = Dinero.parsearCentavos(importe) else { return }
        enviando = true
        error = nil
        let modo = forma
        let foto = comprobante
        Task { @MainActor in
            do {
                let nota = try await PagoSemanalRepository.shared.registrar(
                    lunes: lunes,
                    userId: fila.userId,
                    centavos: centavos,
                    forma: modo,
                    fecha: AttendanceClock.today(),
                    comprobante: foto
                )
                enviando = false
                onPagado()
                // El pago sí quedó; si falta su póliza, se lee antes de cerrar.
                if let nota {
                    aviso = nota
                    await cargar()
                } else {
                    dismiss()
                }
            } catch {
                enviando = false
                self.error = error.toUserMessage(fallback: "No se pudo registrar el pago")
                // Otra persona pudo pagar mientras tanto: se vuelve a leer el saldo.
                await cargar()
            }
        }
    }
}
