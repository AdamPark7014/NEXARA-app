import SwiftUI
import UIKit

/// «Cargar gasolina» (Android `CargarGasolinaFlow`, mockup `AppGasolina`): dos fotos, lo que se
/// pudo leer de ellas y la persona confirma. La app solo habla con la API de NEXARA: quien
/// llama a la IA es el servidor.
///
/// Va dentro de un `NavigationStack` que le pone `VehiculosView`, en una hoja.
struct CargarGasolinaView: View {
    let vehicleId: Int
    /// «Nissan Frontier · TXA-12-34».
    let vehiculo: String
    /// Se llama cuando el API guardó la carga.
    var onDone: () -> Void

    @Environment(\.dismiss) private var dismiss

    /// Qué foto está abierta en la cámara.
    private enum FotoCarga: String, Identifiable {
        case ticket = "Foto del ticket"
        case tablero = "Foto del tablero"
        var id: String { rawValue }
    }

    @State private var ficha: FichaVehiculo?
    @State private var cargandoFicha = true
    @State private var errorFicha: String?
    @State private var form = GasolinaRules.FormCarga()
    @State private var ticket: CapturedGeoPhoto?
    @State private var tablero: CapturedGeoPhoto?
    @State private var camara: FotoCarga?
    @State private var leyendoTicket = false
    @State private var leyendoTablero = false
    @State private var leido = false
    @State private var aviso: String?
    @State private var error: String?
    @State private var enviando = false
    @State private var confirmaSalir = false

    private var veCostos: Bool { ficha?.veCostos == true }
    private var leyendo: Bool { leyendoTicket || leyendoTablero }
    private var tieneAvance: Bool { form.tieneDatos || ticket != nil || tablero != nil }

    private var rendimiento: GasolinaRules.Rendimiento? {
        GasolinaRules.rendimientoDelForm(form, cargas: ficha?.cargas ?? [])
    }

    private var rotulo: String {
        if leyendo { return "Leyendo la foto…" }
        if leido { return "Esto leímos en las fotos" }
        if ticket != nil || tablero != nil { return "Escribe los datos de la carga" }
        return "Toma las fotos o escribe los datos"
    }

    var body: some View {
        contenido
            .nxScreenBackground()
            .navigationBarTitleDisplayMode(.inline)
            .interactiveDismissDisabled(tieneAvance || enviando)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cerrar") {
                        if tieneAvance { confirmaSalir = true } else { dismiss() }
                    }
                    .disabled(enviando)
                }
                ToolbarItemGroup(placement: .keyboard) {
                    Spacer()
                    Button("Listo") { cerrarTeclado() }
                }
            }
            .task { if ficha == nil { await cargarFicha() } }
            .fullScreenCover(item: $camara) { foto in
                GeoPhotoCaptureView(
                    title: foto.rawValue,
                    confirmLabel: "Usar esta foto",
                    // La carga no guarda ubicación: una foto sin GPS sirve igual.
                    requireLocation: false,
                    onConfirm: { capturada in
                        camara = nil
                        if foto == .ticket { tomoTicket(capturada) } else { tomoTablero(capturada) }
                        return nil
                    },
                    onCancel: { camara = nil }
                )
            }
            .alert("¿Salir sin guardar?", isPresented: $confirmaSalir) {
                Button("Seguir aquí", role: .cancel) {}
                Button("Salir sin guardar", role: .destructive) { dismiss() }
            } message: {
                Text("La carga y sus fotos solo viven en esta pantalla hasta que la guardas.")
            }
    }

    @ViewBuilder
    private var contenido: some View {
        if ficha != nil {
            formulario
        } else if cargandoFicha {
            ScrollView {
                NxSkeletonList(itemCount: 3, itemHeight: 120)
                    .padding(16)
            }
        } else {
            ScrollView {
                // Sin ficha no se sabe si la persona ve costos: se reintenta, no se adivina.
                NxErrorBlock(message: errorFicha, onRetry: { Task { await cargarFicha() } })
                    .padding(16)
            }
        }
    }

    private var formulario: some View {
        VStack(spacing: 0) {
            ScrollView {
                VStack(alignment: .leading, spacing: 14) {
                    EncabezadoVehiculo(titulo: "Cargar gasolina", lineas: [vehiculo])
                    HStack(spacing: 10) {
                        CasillaFotoVehiculo(
                            etiqueta: FotoCarga.ticket.rawValue,
                            icono: "receipt",
                            foto: ticket?.image,
                            leyendo: leyendoTicket,
                            alto: 132,
                            habilitada: !enviando,
                            onTomar: { camara = .ticket }
                        )
                        CasillaFotoVehiculo(
                            etiqueta: FotoCarga.tablero.rawValue,
                            icono: "camera",
                            foto: tablero?.image,
                            leyendo: leyendoTablero,
                            alto: 132,
                            habilitada: !enviando,
                            onTomar: { camara = .tablero }
                        )
                    }
                    datos
                    tanqueLleno
                    if let rendimiento { tarjeta(rendimiento) }
                    if let aviso { AvisoLectura(texto: aviso) }
                    if let error {
                        NxAlertBanner(alert: NxAlert(id: "carga", title: error, tone: .danger))
                    }
                }
                .padding(.horizontal, 16)
                .padding(.top, 8)
                .padding(.bottom, 6)
            }
            .scrollDismissesKeyboard(.interactively)
            BotonVehiculo(
                texto: enviando ? "Guardando…" : "Guardar carga",
                habilitado: !enviando && !leyendo,
                enviando: enviando,
                accion: guardar
            )
            .padding(.horizontal, 16)
            .padding(.top, 8)
            .padding(.bottom, 20)
        }
    }

    private var datos: some View {
        TarjetaVehiculo {
            RotuloLectura(texto: rotulo, leyendo: leyendo)
            HStack(alignment: .top, spacing: 10) {
                CampoVehiculo(
                    etiqueta: "Litros",
                    texto: Binding(
                        get: { form.litros },
                        set: { nuevo in
                            let limpio = GasolinaRules.soloDecimal(nuevo, maximo: 6)
                            guard limpio != form.litros else { return }
                            form.litros = limpio
                            form.litrosEscritos = true
                        }
                    ),
                    teclado: .decimalPad,
                    habilitado: !enviando
                )
                if GasolinaRules.totalLeidoOculto(veCostos: veCostos, form: form) {
                    CampoSinImporte(etiqueta: "Total", texto: "Leído del ticket")
                } else {
                    CampoVehiculo(
                        etiqueta: "Total",
                        texto: Binding(
                            get: { GasolinaRules.agrupado(form.total) },
                            set: { nuevo in
                                let limpio = GasolinaRules.soloDecimal(nuevo)
                                guard limpio != form.total else { return }
                                form.total = limpio
                                form.totalEscrito = true
                            }
                        ),
                        teclado: .decimalPad,
                        prefijo: "$",
                        habilitado: !enviando
                    )
                }
            }
            CampoVehiculo(
                etiqueta: "Odómetro",
                texto: Binding(
                    get: { GasolinaRules.agrupado(form.odometro) },
                    set: { nuevo in
                        let limpio = GasolinaRules.soloDigitos(nuevo)
                        guard limpio != form.odometro else { return }
                        form.odometro = limpio
                        form.odometroEscrito = true
                    }
                ),
                habilitado: !enviando
            )
        }
    }

    private var tanqueLleno: some View {
        HStack(spacing: 12) {
            Text("¿Llenaste el tanque?")
                .font(.system(size: 15, weight: .medium))
                .foregroundStyle(NxColors.fg)
            Spacer(minLength: 0)
            HStack(spacing: 6) {
                opcionTanque("Sí", elegida: form.lleno) { form.lleno = true }
                opcionTanque("No", elegida: !form.lleno) { form.lleno = false }
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
        .frame(maxWidth: .infinity)
        .background(NxColors.card, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
    }

    private func opcionTanque(_ texto: String, elegida: Bool, accion: @escaping () -> Void) -> some View {
        Button(action: accion) {
            Text(texto)
                .font(.system(size: 15, weight: elegida ? .semibold : .regular))
                .foregroundStyle(elegida ? Color.white : NxColors.fg)
                .frame(minWidth: 56, minHeight: 44)
                .background(elegida ? NxColors.brand : NxColors.card, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
                .overlay {
                    if !elegida {
                        RoundedRectangle(cornerRadius: 10, style: .continuous)
                            .strokeBorder(NxColors.borderStrong, lineWidth: 1)
                    }
                }
                .contentShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
        }
        .buttonStyle(.plain)
        .disabled(enviando)
        .accessibilityAddTraits(elegida ? .isSelected : [])
    }

    private func tarjeta(_ r: GasolinaRules.Rendimiento) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(GasolinaRules.tituloRendimiento(r))
                .font(NxFont.display(size: 20, weight: .semibold))
            Text(GasolinaRules.detalleRendimiento(r))
                .font(.system(size: 13.5))
                .fixedSize(horizontal: false, vertical: true)
        }
        .foregroundStyle(NxColors.brandText)
        .padding(.horizontal, 16)
        .padding(.vertical, 14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(NxColors.brandSoft, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
    }

    // MARK: Acciones

    @MainActor
    private func cargarFicha() async {
        cargandoFicha = true
        errorFicha = nil
        do {
            ficha = try await VehiculosRepository.shared.ficha(vehicleId: vehicleId)
        } catch {
            errorFicha = error.toUserMessage(fallback: "No se pudo abrir la ficha del vehículo")
        }
        cargandoFicha = false
    }

    private func tomoTicket(_ foto: CapturedGeoPhoto) {
        ticket = foto
        leyendoTicket = true
        aviso = nil
        Task { @MainActor in
            let r = try? await VehiculosRepository.shared.leerTicket(foto: foto)
            if let r {
                form = GasolinaRules.conTicket(form, litros: r.litros, total: r.importe, revisar: r.revisar, veCostos: veCostos)
                if r.litros != nil || r.importe != nil { leido = true }
            }
            aviso = GasolinaRules.avisoTicket(legible: r?.legible == true, revisar: r?.revisar == true, veCostos: veCostos)
            leyendoTicket = false
        }
    }

    private func tomoTablero(_ foto: CapturedGeoPhoto) {
        tablero = foto
        leyendoTablero = true
        Task { @MainActor in
            let r = try? await VehiculosRepository.shared.leerTablero(foto: foto, odometroPrevio: ficha?.odometroKm)
            form = GasolinaRules.conTablero(form, odometroKm: r?.odometroKm)
            if r?.odometroKm != nil {
                leido = true
            } else {
                aviso = GasolinaRules.avisoTablero
            }
            leyendoTablero = false
        }
    }

    private func guardar() {
        cerrarTeclado()
        if let falta = GasolinaRules.faltaEnCarga(form) {
            aviso = falta
            return
        }
        guard let odometro = GasolinaRules.aNumero(form.odometro),
              let litros = GasolinaRules.aNumero(form.litros),
              let total = GasolinaRules.aNumero(form.total)
        else { return }
        enviando = true
        error = nil
        aviso = nil
        Task { @MainActor in
            do {
                try await VehiculosRepository.shared.registrarCarga(
                    vehicleId: vehicleId,
                    odometro: Int(odometro),
                    litros: litros,
                    importe: total,
                    tanqueLleno: form.lleno,
                    ticket: ticket,
                    tablero: tablero
                )
                enviando = false
                onDone()
                dismiss()
            } catch {
                enviando = false
                // 400 del servidor: «El odómetro no puede ser menor…». Se enseña igual.
                self.error = error.toUserMessage(fallback: "No se pudo guardar la carga")
            }
        }
    }
}
