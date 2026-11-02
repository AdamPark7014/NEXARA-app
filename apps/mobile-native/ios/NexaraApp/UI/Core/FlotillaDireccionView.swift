import SwiftUI

/// Vehículos para el CEO (Android `FlotillaDireccionScreen`): quién trae cada uno, lo que costó el
/// mes y a dónde se fue. Solo lectura: editar la ficha sigue en la web.
///
/// Va dentro del `NavigationStack` del shell. `encabezado` es la tarjeta de lo que él traiga, si trae algo.
struct FlotillaDireccionView<Encabezado: View>: View {
    private let encabezado: Encabezado

    init(@ViewBuilder encabezado: () -> Encabezado) {
        self.encabezado = encabezado()
    }

    @State private var mes = FlotillaRules.mesDeHoy()
    @State private var vehiculos: [VehiculoFlota] = []
    @State private var datos: FlotillaMes?
    @State private var cargando = true
    @State private var error: String?
    @State private var abierto: VehiculoFlota?

    private var puedeAvanzar: Bool { mes < FlotillaRules.mesDeHoy() }
    private var ocupados: Int { vehiculos.filter { !($0.conductor?.nombre ?? "").isEmpty }.count }

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: NxSpacing.m) {
                NxSectionHeader(title: FlotillaRules.nombreMes(mes), subtitle: "Lo que cuesta la flotilla y a dónde se fue") {
                    HStack(spacing: 4) {
                        Button { cambiar(a: FlotillaRules.mesAnterior(mes)) } label: {
                            Image(systemName: "chevron.left").frame(width: 40, height: 40)
                        }
                        .accessibilityLabel("Mes anterior")
                        Button { cambiar(a: FlotillaRules.mesSiguiente(mes)) } label: {
                            Image(systemName: "chevron.right").frame(width: 40, height: 40)
                        }
                        .disabled(!puedeAvanzar)
                        .accessibilityLabel("Mes siguiente")
                    }
                    .foregroundStyle(NxColors.fg)
                }
                encabezado
                if cargando && vehiculos.isEmpty {
                    NxSkeletonList(itemCount: 3, itemHeight: 96)
                }
                if let error {
                    NxErrorBlock(message: error, onRetry: { Task { await cargar() } })
                }
                if let resumen = datos?.resumen {
                    cifras(resumen)
                }
                ForEach(datos?.avisos ?? [], id: \.self) { aviso in
                    NxAlertBanner(alert: NxAlert(
                        id: aviso.titulo ?? "aviso",
                        title: aviso.titulo ?? "",
                        subtitle: aviso.texto,
                        tone: aviso.tono == "danger" ? .danger : (aviso.tono == "warning" ? .warning : .info)
                    ))
                }
                let reparto = FlotillaRules.repartoDelMes(datos?.reparto)
                if !reparto.isEmpty {
                    NxPanelShell {
                        TituloPanel(texto: "A dónde se fue")
                        ForEach(reparto) { r in
                            FilaImporte(
                                titulo: r.nombre,
                                detalle: r.nota,
                                importe: FlotillaRules.pesos(r.importe),
                                extra: extra(de: r)
                            )
                        }
                    }
                }
                NxSectionHeader(
                    title: "Flotilla",
                    subtitle: vehiculos.isEmpty ? nil : "\(vehiculos.count) en total, \(ocupados) afuera"
                )
                ForEach(vehiculos) { fila($0) }
                if !cargando && error == nil && vehiculos.isEmpty {
                    NxEmptyState(title: "Sin vehículos", subtitle: "Todavía no hay vehículos dados de alta.")
                }
                Spacer(minLength: NxSpacing.l)
            }
            .padding(NxSpacing.l)
        }
        .nxScreenBackground()
        .refreshable { await cargar() }
        .task { await cargar() }
        .navigationDestination(item: $abierto) { vehiculo in
            FichaDireccionView(vehiculo: vehiculo)
        }
    }

    private func cifras(_ r: ResumenMes) -> some View {
        VStack(spacing: 10) {
            HStack(spacing: 10) {
                NxKpiCard(kpi: NxKpi(label: "Costo del mes", value: FlotillaRules.pesos(r.costoMes)))
                NxKpiCard(kpi: NxKpi(label: "Recorridos", value: FlotillaRules.km(r.km)))
            }
            HStack(spacing: 10) {
                NxKpiCard(kpi: NxKpi(label: "Por kilómetro", value: FlotillaRules.pesos2(r.porKm)))
                NxKpiCard(kpi: NxKpi(label: "A indirectos", value: FlotillaRules.pesos(r.aIndirectos), tone: .warning))
            }
        }
    }

    private func extra(de r: FlotillaRules.RenglonGasto) -> String {
        guard let km = r.km, km > 0 else { return "\(r.pct) %" }
        return "\(FlotillaRules.km(km)) · \(r.pct) %"
    }

    private func fila(_ v: VehiculoFlota) -> some View {
        let delMes = datos?.vehiculos.first(where: { $0.id == v.id })
        let estado = delMes?.proximoServicio?.estado
        var partes: [String] = []
        if let km = delMes?.kmDelMes, km > 0 { partes.append("\(FlotillaRules.km(km)) este mes") }
        if let porKm = delMes?.porKm { partes.append("\(FlotillaRules.pesos2(porKm)) por km") }
        var chip: String?
        if estado == "VENCIDO" {
            chip = "Servicio vencido"
        } else if estado == "PRONTO" {
            chip = "Servicio pronto"
        }
        let tono: NxTone = estado == "VENCIDO" ? .danger : .warning
        return NxListRow(
            title: v.titulo,
            subtitle: FlotillaRules.quienLoTrae(v),
            meta: partes.isEmpty ? nil : partes.joined(separator: " · "),
            chipText: chip,
            chipTone: tono,
            onClick: { abierto = v }
        )
    }

    private func cambiar(a nuevo: String) {
        mes = nuevo
        datos = nil
        Task { await cargar() }
    }

    @MainActor
    private func cargar() async {
        cargando = true
        error = nil
        let pedido = mes
        // Van aparte: si falla el mes, la lista de quién trae qué se sigue viendo.
        do {
            vehiculos = try await VehiculosRepository.shared.flotilla()
        } catch {
            self.error = error.toUserMessage(fallback: "No se pudo cargar la flotilla")
        }
        do {
            let d = try await VehiculosRepository.shared.flotillaMes(pedido)
            if pedido == mes { datos = d }
        } catch {
            if self.error == nil { self.error = error.toUserMessage(fallback: "No se pudo cargar el mes") }
        }
        cargando = false
    }
}

/// La ficha de un vehículo para el CEO: en qué se va cada kilómetro, gasolina, viajes y mantenimiento.
struct FichaDireccionView: View {
    let vehiculo: VehiculoFlota

    @State private var ficha: FichaDireccion?
    @State private var cargando = true
    @State private var error: String?

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: NxSpacing.m) {
                NxSectionHeader(title: vehiculo.titulo, subtitle: FlotillaRules.quienLoTrae(vehiculo))
                if cargando && ficha == nil {
                    NxSkeletonList(itemCount: 3, itemHeight: 96)
                }
                if let error {
                    NxErrorBlock(message: error, onRetry: { Task { await cargar() } })
                }
                if let ficha { contenido(ficha) }
                Spacer(minLength: NxSpacing.l)
            }
            .padding(NxSpacing.l)
        }
        .nxScreenBackground()
        .navigationTitle("Ficha")
        .navigationBarTitleDisplayMode(.inline)
        .refreshable { await cargar() }
        .task { await cargar() }
    }

    @ViewBuilder
    private func contenido(_ f: FichaDireccion) -> some View {
        VStack(spacing: 10) {
            HStack(spacing: 10) {
                NxKpiCard(kpi: NxKpi(label: "Cada kilómetro", value: FlotillaRules.pesos2(f.costos?.porKm)))
                NxKpiCard(kpi: NxKpi(label: "Rendimiento", value: FlotillaRules.kmPorLitro(f.rendimiento?.usado)))
            }
            HStack(spacing: 10) {
                NxKpiCard(kpi: NxKpi(label: "Odómetro", value: FlotillaRules.km(f.odometro?.km)))
                NxKpiCard(kpi: NxKpi(label: "Próximo servicio", value: FlotillaRules.textoServicio(f.proximoServicio)))
            }
        }
        if let partes = f.costos?.desglose, !partes.isEmpty {
            NxPanelShell {
                TituloPanel(texto: "En qué se va cada kilómetro")
                ForEach(partes, id: \.self) { p in
                    FilaImporte(titulo: p.nombre ?? "", detalle: nil, importe: FlotillaRules.pesos2(p.importe))
                }
            }
        }
        NxPanelShell {
            TituloPanel(texto: "Gasolina")
            if f.cargas.isEmpty { TextoVacio(texto: "Sin cargas todavía.") }
            ForEach(f.cargas, id: \.self) { c in
                FilaImporte(
                    titulo: FlotillaRules.fechaCorta(c.fecha),
                    detalle: detalle(de: c),
                    importe: FlotillaRules.pesos2(c.importe)
                )
            }
        }
        NxPanelShell {
            TituloPanel(texto: "Viajes")
            if f.viajes.isEmpty { TextoVacio(texto: "Sin viajes registrados.") }
            ForEach(f.viajes, id: \.self) { t in
                FilaImporte(
                    titulo: t.destino?.nombre ?? t.actividad?.titulo ?? "Sin ligar",
                    detalle: detalle(de: t),
                    importe: FlotillaRules.pesos(t.importe)
                )
            }
        }
        NxPanelShell {
            TituloPanel(texto: "Mantenimiento")
            if let m = f.costos?.mantenimiento {
                FilaImporte(titulo: "Gastado", detalle: "Apartado \(FlotillaRules.pesos(m.apartado))", importe: FlotillaRules.pesos(m.gastado))
            }
            if f.servicios.isEmpty { TextoVacio(texto: "Sin servicios registrados.") }
            ForEach(f.servicios, id: \.self) { s in
                FilaImporte(
                    titulo: s.concepto ?? "",
                    detalle: detalle(de: s),
                    importe: FlotillaRules.pesos(s.costo)
                )
            }
        }
        if f.costos == nil {
            Text("Falta llenar su ficha de costos: se hace en la web, en Vehículos.")
                .font(.system(size: 13))
                .foregroundStyle(NxColors.muted)
        }
    }

    private func detalle(de c: CargaDireccion) -> String {
        let tanque = c.tanqueLleno == true ? "Lleno" : "Parcial"
        return "\(FlotillaRules.litros(c.litros)) · \(FlotillaRules.km(c.odometro)) · \(tanque)"
    }

    private func detalle(de t: ViajeFicha) -> String {
        let base = "\(FlotillaRules.fechaCorta(t.fecha)) · \(FlotillaRules.km(t.km))"
        return t.sinFoto == true ? "\(base) · Sin foto" : base
    }

    private func detalle(de s: ServicioFicha) -> String {
        let fecha = FlotillaRules.fechaCorta(s.fecha)
        guard let proveedor = s.proveedor, !proveedor.isEmpty else { return fecha }
        return "\(fecha) · \(proveedor)"
    }

    @MainActor
    private func cargar() async {
        cargando = true
        error = nil
        do {
            ficha = try await VehiculosRepository.shared.fichaDireccion(vehicleId: vehiculo.id)
        } catch {
            self.error = error.toUserMessage(fallback: "No se pudo abrir la ficha del vehículo")
        }
        cargando = false
    }
}

private struct TituloPanel: View {
    let texto: String

    var body: some View {
        Text(texto)
            .font(.system(size: 16, weight: .bold))
            .foregroundStyle(NxColors.fg)
            .padding(.bottom, 2)
    }
}

private struct TextoVacio: View {
    let texto: String

    var body: some View {
        Text(texto)
            .font(.system(size: 13))
            .foregroundStyle(NxColors.muted)
    }
}

/// Un renglón con su importe a la derecha. El nombre va en su propia línea, como en toda la app.
private struct FilaImporte: View {
    let titulo: String
    let detalle: String?
    let importe: String
    var extra: String? = nil

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            VStack(alignment: .leading, spacing: 2) {
                Text(titulo)
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(NxColors.fg)
                if let detalle, !detalle.isEmpty {
                    Text(detalle)
                        .font(NxType.bodySmall)
                        .foregroundStyle(NxColors.muted)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            Spacer(minLength: 0)
            VStack(alignment: .trailing, spacing: 2) {
                Text(importe)
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(NxColors.fg)
                if let extra, !extra.isEmpty {
                    Text(extra)
                        .font(NxType.bodySmall)
                        .foregroundStyle(NxColors.muted)
                }
            }
        }
        .padding(.vertical, 6)
    }
}
