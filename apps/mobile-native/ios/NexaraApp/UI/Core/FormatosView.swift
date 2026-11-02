import SwiftUI

/// Reglas de los formatos en la app, espejo de `FormatosRules` en Android y de
/// `lib/formatos-actividad.ts` en la web.
enum FormatosRules {
    /// Con 3 días laborales de cronómetro para comparar: viernes 06-11 a las 6:00 de México.
    private static let visiblesDesde: Date = AttendanceClock.parse("2026-11-06T12:00:00Z") ?? .distantFuture

    private static let roles: Set<String> = [
        "ceo", "dir_admin", "dir_operaciones", "arquitecto", "coord_operaciones", "coord_admin", "enc_soporte",
        "superadmin",
    ]

    /// Solo decide si se enseña el acceso; quien manda es la API.
    static func visible(_ user: SessionUser?, ahora: Date = Date()) -> Bool {
        guard ahora >= visiblesDesde, let user else { return false }
        return user.isSuperAdmin
            || user.permissions.contains("activities.manage")
            || roles.contains(user.roleKey ?? "")
    }

    static func minutos(_ r: RenglonFormato, cantidad: Int) -> Int {
        max(5, r.minutosBase + r.minutosPorUnidad * max(0, cantidad))
    }

    /// Una jornada de 10 a 18 con una hora de comida.
    static func jornadas(_ totalMin: Int) -> Int {
        max(1, Int((Double(totalMin) / 420).rounded(.up)))
    }

    static func duracion(_ min: Int) -> String {
        let h = min / 60
        let m = min % 60
        if h == 0 { return "\(m) min" }
        if m == 0 { return "\(h) h" }
        return "\(h) h \(m) min"
    }

    static func total(_ totalMin: Int) -> String {
        let j = jornadas(totalMin)
        return "Total \(duracion(totalMin)) · cabe en \(j) \(j == 1 ? "jornada" : "jornadas")"
    }

    static func evidencia(_ r: RenglonFormato) -> String {
        let puntos = r.puntos
            .map { $0.nombre }
            .filter { !$0.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }
        return puntos.isEmpty ? "\(r.fotos) fotos" : puntos.joined(separator: ", ")
    }

    /// Mañana, o el lunes si mañana cae en fin de semana. Días `yyyy-MM-dd` de México.
    static func siguienteDiaLaboral(_ hoy: String) -> String {
        guard var dia = AttendanceClock.date(fromDay: hoy) else { return hoy }
        let calendario = AttendanceClock.calendar
        repeat {
            dia = calendario.date(byAdding: .day, value: 1, to: dia) ?? dia.addingTimeInterval(86_400)
        } while calendario.component(.weekday, from: dia) == 1 || calendario.component(.weekday, from: dia) == 7
        return AttendanceClock.dayString(dia)
    }

    /// «Mañana» o «Lun 9»: se lee mejor que una fecha.
    static func etiquetaDia(_ dia: String, hoy: String) -> String {
        if let h = AttendanceClock.date(fromDay: hoy), let d = AttendanceClock.date(fromDay: dia) {
            let calendario = AttendanceClock.calendar
            if let manana = calendario.date(byAdding: .day, value: 1, to: h), calendario.isDate(d, inSameDayAs: manana) {
                return "Mañana"
            }
            let nombres = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"]
            return "\(nombres[calendario.component(.weekday, from: d) - 1]) \(calendario.component(.day, from: d))"
        }
        return dia
    }

    static func faltante(responsableId: Int?, clienteId: Int?, renglones: [RenglonEditable]) -> String? {
        if renglones.isEmpty { return "Deja al menos una actividad" }
        if renglones.contains(where: { $0.titulo.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }) {
            return "A una actividad le falta el título"
        }
        if renglones.contains(where: { $0.base.coreKind == "servicio" }) && clienteId == nil {
            return "Elige el cliente: lleva actividades de servicio"
        }
        if responsableId == nil { return "Elige quién la lleva" }
        return nil
    }

    static func etiqueta(_ n: Int) -> String {
        n == 1 ? "Asignar 1 actividad" : "Asignar \(n) actividades"
    }
}

/// Un renglón en pantalla: lo que se edita al asignar no cambia el formato.
struct RenglonEditable: Identifiable {
    let id = UUID()
    let base: RenglonFormato
    var titulo: String
    var minutos: Int
    var minutosEditado: Bool = false
}

/// Asignar con un formato: se elige el formato, cliente, quién y cuándo, y salen todas sus actividades
/// de un toque, con cronómetro (`POST proceso-tiempos`). Espejo de `FormatosScreen.kt`.
struct FormatosView: View {
    @State private var formatos: [FormatoActividad]?
    @State private var fallo: String?
    @State private var personas: [PersonaAsignable] = []
    @State private var clientes: [CoreSalesClient] = []

    @State private var elegido: FormatoActividad?
    @State private var cantidad = 1
    @State private var renglones: [RenglonEditable] = []
    @State private var cliente: CoreSalesClient?
    @State private var clienteServicioId: Int?
    @State private var buscaCliente = ""
    @State private var sucursal = ""
    @State private var responsable: PersonaAsignable?
    @State private var fecha = FormatosRules.siguienteDiaLaboral(AttendanceClock.today())
    @State private var intento = false
    @State private var enviando = false
    @State private var resultado: ResultadoAplicarFormato?
    /// Evita duplicar con dos toques: se renueva solo al pedir «Asignar otro».
    @State private var clave = UUID().uuidString

    @State private var inicio: Date?
    @State private var toques = 0
    @State private var segundos = 0
    /// Actividad recién creada que se abrió desde el resultado.
    @State private var actividadAbierta: Int?

    private var total: Int { renglones.reduce(0) { $0 + $1.minutos } }

    private var faltante: String? {
        FormatosRules.faltante(responsableId: responsable?.id, clienteId: clienteServicioId, renglones: renglones)
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                contenido
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 8)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .scrollDismissesKeyboard(.interactively)
        .safeAreaInset(edge: .bottom, spacing: 0) { barraInferior }
        .nxScreenBackground()
        .nxOcultaBarraInferior()
        // El cronómetro empieza con el primer toque y cuenta todos los que se dan aquí.
        .simultaneousGesture(TapGesture().onEnded {
            toques += 1
            if inicio == nil { inicio = Date() }
        })
        .task { await cargar() }
        .navigationDestination(item: $actividadAbierta) { id in
            ActivityCoreDetailView(activityId: id, initialTab: nil)
                .nxBrandNavBar()
        }
    }

    // MARK: Contenido

    @ViewBuilder
    private var contenido: some View {
        if let fallo {
            Text(fallo)
                .font(.system(size: 13))
                .foregroundStyle(NxColors.danger)
                .fixedSize(horizontal: false, vertical: true)
        }
        if formatos == nil && fallo == nil {
            Text("Cargando formatos…")
                .font(.system(size: 13))
                .foregroundStyle(NxColors.muted)
        }
        if let lista = formatos {
            CoreFlowLayout(spacing: 8) {
                ForEach(lista) { formato in
                    NxFiltroChipM3(label: formato.nombre, selected: formato.id == elegido?.id) {
                        elegir(formato)
                    }
                    .disabled(resultado != nil)
                }
            }
        }
        if let formato = elegido {
            formulario(formato)
        }
    }

    @ViewBuilder
    private func formulario(_ formato: FormatoActividad) -> some View {
        titulo(renglones.contains(where: { $0.base.coreKind == "servicio" }) ? "Cliente *" : "Cliente")
        seccionCliente
        NxOutlinedCampo(
            label: "Sucursal (opcional)",
            text: Binding(
                get: { sucursal },
                set: { sucursal = String($0.prefix(160)) }
            ),
            fondoEtiqueta: NxColors.surface
        )
        titulo("Quién *")
        seccionQuien
        titulo("Cuándo")
        seccionCuando
        if let unidad = formato.receta.unidad {
            titulo(unidad)
            seccionCantidad
        }
        ForEach(renglones) { renglon in
            filaRenglon(renglon)
        }
        if let resultado {
            seccionResultado(resultado)
        }
    }

    private func titulo(_ texto: String) -> some View {
        Text(texto)
            .font(.system(size: 13, weight: .semibold))
            .foregroundStyle(NxColors.fg)
    }

    // MARK: Cliente

    @ViewBuilder
    private var seccionCliente: some View {
        if let elegidoCliente = cliente {
            HStack(alignment: .center, spacing: 8) {
                Text(elegidoCliente.name)
                    .font(.system(size: 14))
                    .foregroundStyle(NxColors.fg)
                    .frame(maxWidth: .infinity, alignment: .leading)
                NxIconButton(systemName: "xmark", label: "Quitar cliente", tint: NxColors.muted) {
                    cliente = nil
                    clienteServicioId = nil
                }
            }
        } else {
            NxSearchField(text: $buscaCliente, placeholder: "Buscar cliente")
            let texto = buscaCliente.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
            if texto.count >= 2 {
                ForEach(Array(clientes.filter { $0.name.lowercased().contains(texto) }.prefix(5))) { opcion in
                    Button {
                        elegirCliente(opcion)
                    } label: {
                        Text(opcion.name)
                            .font(.system(size: 14))
                            .foregroundStyle(NxColors.fg)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .padding(.vertical, 8)
                            .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }

    private func elegirCliente(_ opcion: CoreSalesClient) {
        cliente = opcion
        buscaCliente = ""
        clienteServicioId = opcion.serviceClientId
        guard opcion.serviceClientId == nil else { return }
        Task { @MainActor in
            let servicio = try? await ClientesRepository.shared.provisionServiceClient(id: opcion.id)
            if cliente?.id == opcion.id { clienteServicioId = servicio }
        }
    }

    // MARK: Quién y cuándo

    @ViewBuilder
    private var seccionQuien: some View {
        Menu {
            ForEach(personas) { persona in
                Button(persona.nombre) { responsable = persona }
            }
        } label: {
            Text(responsable?.nombre ?? "Elige a la persona")
                .font(.system(size: 14, weight: .semibold))
                .foregroundStyle(NxColors.fg)
                .lineLimit(1)
                .padding(.horizontal, 12)
                .frame(maxWidth: .infinity, minHeight: 48)
                .overlay(
                    RoundedRectangle(cornerRadius: 12, style: .continuous)
                        .strokeBorder(NxColors.borderStrong, lineWidth: 1)
                )
                .contentShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
        }
        if intento && responsable == nil {
            Text("Elige quién la lleva")
                .font(.system(size: 12))
                .foregroundStyle(NxColors.danger)
        }
    }

    @ViewBuilder
    private var seccionCuando: some View {
        let hoy = AttendanceClock.today()
        let manana = FormatosRules.siguienteDiaLaboral(hoy)
        let otro = FormatosRules.siguienteDiaLaboral(manana)
        HStack(alignment: .center, spacing: 8) {
            NxFiltroChipM3(label: FormatosRules.etiquetaDia(manana, hoy: hoy), selected: fecha == manana) { fecha = manana }
            NxFiltroChipM3(label: "Hoy", selected: fecha == hoy) { fecha = hoy }
            NxFiltroChipM3(label: FormatosRules.etiquetaDia(otro, hoy: hoy), selected: fecha == otro) { fecha = otro }
        }
    }

    private var seccionCantidad: some View {
        HStack(alignment: .center, spacing: 8) {
            NxIconButton(systemName: "minus", label: "Menos") { cambiarCantidad(cantidad - 1) }
                .disabled(cantidad <= 1)
            Text("\(cantidad)")
                .font(.system(size: 16, weight: .semibold))
                .monospacedDigit()
                .foregroundStyle(NxColors.fg)
            NxIconButton(systemName: "plus", label: "Más") { cambiarCantidad(cantidad + 1) }
        }
    }

    // MARK: Renglones

    private func filaRenglon(_ renglon: RenglonEditable) -> some View {
        let sinTitulo = intento && renglon.titulo.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        return VStack(alignment: .leading, spacing: 4) {
            HStack(alignment: .center, spacing: 6) {
                NxOutlinedCampo(
                    label: "Actividad",
                    text: tituloDe(renglon.id),
                    fondoEtiqueta: NxColors.surface
                )
                .overlay {
                    if sinTitulo {
                        RoundedRectangle(cornerRadius: 6, style: .continuous)
                            .strokeBorder(NxColors.danger, lineWidth: 1)
                    }
                }
                NxOutlinedCampo(
                    label: "min",
                    text: minutosDe(renglon.id),
                    keyboard: .numberPad,
                    fondoEtiqueta: NxColors.surface
                )
                .frame(width: 92)
                NxIconButton(systemName: "xmark", label: "Quitar \(renglon.titulo)", tint: NxColors.muted) {
                    renglones.removeAll { $0.id == renglon.id }
                }
            }
            Text(FormatosRules.evidencia(renglon.base))
                .font(.system(size: 12))
                .foregroundStyle(NxColors.brandText)
        }
    }

    private func tituloDe(_ id: UUID) -> Binding<String> {
        Binding(
            get: { renglones.first(where: { $0.id == id })?.titulo ?? "" },
            set: { valor in
                if let i = renglones.firstIndex(where: { $0.id == id }) { renglones[i].titulo = valor }
            }
        )
    }

    private func minutosDe(_ id: UUID) -> Binding<String> {
        Binding(
            get: { renglones.first(where: { $0.id == id }).map { String($0.minutos) } ?? "" },
            set: { valor in
                guard let i = renglones.firstIndex(where: { $0.id == id }) else { return }
                renglones[i].minutos = Int(String(valor.filter { $0.isNumber }.prefix(4))) ?? 0
                renglones[i].minutosEditado = true
            }
        )
    }

    // MARK: Resultado

    private func textoListo(_ res: ResultadoAplicarFormato) -> String {
        let nombreCliente = cliente.map { " en \($0.name)" } ?? ""
        let persona = responsable?.nombre ?? ""
        return "Listo en \(segundos) s y \(toques) toques: \(res.actividades.count) actividades para \(persona)\(nombreCliente)."
    }

    private func seccionResultado(_ res: ResultadoAplicarFormato) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            if !res.actividades.isEmpty {
                Text(textoListo(res))
                    .font(.system(size: 14))
                    .foregroundStyle(NxColors.fg)
                    .fixedSize(horizontal: false, vertical: true)
            }
            ForEach(res.actividades) { actividad in
                Button {
                    actividadAbierta = actividad.id
                } label: {
                    Text("\(actividad.anNumber ?? "") \(actividad.titulo)")
                        .font(.system(size: 13))
                        .foregroundStyle(NxColors.brandText)
                        .multilineTextAlignment(.leading)
                        .padding(.vertical, 4)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
            }
            ForEach(res.fallidas, id: \.self) { fallida in
                Text("No se pudo crear: \(fallida.titulo) (\(fallida.motivo))")
                    .font(.system(size: 13))
                    .foregroundStyle(NxColors.danger)
                    .fixedSize(horizontal: false, vertical: true)
            }
            NxSecondaryButton("Asignar otro", tint: NxColors.fg) { asignarOtro() }
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(NxColors.successSoft, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
    }

    // MARK: Barra inferior

    @ViewBuilder
    private var barraInferior: some View {
        if elegido != nil {
            let aviso: String? = intento ? faltante : nil
            let linea: String = aviso.map { "\(FormatosRules.total(total)) · \($0)" } ?? FormatosRules.total(total)
            VStack(alignment: .leading, spacing: 6) {
                Text(linea)
                    .font(.system(size: 13))
                    .foregroundStyle(aviso != nil ? NxColors.danger : NxColors.fg2)
                    .fixedSize(horizontal: false, vertical: true)
                NxPrimaryButton(
                    enviando ? "Asignando…" : FormatosRules.etiqueta(renglones.count),
                    enabled: !enviando && resultado == nil && !renglones.isEmpty
                ) {
                    asignar()
                }
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 10)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(NxColors.card.ignoresSafeArea(edges: .bottom))
        }
    }

    // MARK: Acciones

    @MainActor
    private func cargar() async {
        // Al volver de una actividad abierta, lo capturado se queda como estaba.
        guard formatos == nil else { return }
        fallo = nil
        do {
            let lista = try await CoreRepository.shared.formatosActividad()
            formatos = lista
            if let primero = lista.first { elegir(primero) }
            personas = await CoreRepository.shared.personasAsignables()
            clientes = (try? await ClientesRepository.shared.listAll()) ?? []
        } catch {
            fallo = error.toUserMessage(fallback: "No se pudieron cargar los formatos")
        }
    }

    private func elegir(_ formato: FormatoActividad) {
        let n = formato.receta.unidad != nil ? formato.receta.cantidadPorOmision : 1
        elegido = formato
        cantidad = n
        renglones = formato.receta.renglones.map { r in
            RenglonEditable(base: r, titulo: r.titulo, minutos: FormatosRules.minutos(r, cantidad: n))
        }
    }

    private func cambiarCantidad(_ n: Int) {
        let nueva = min(200, max(1, n))
        cantidad = nueva
        for i in renglones.indices where !renglones[i].minutosEditado {
            renglones[i].minutos = FormatosRules.minutos(renglones[i].base, cantidad: nueva)
        }
    }

    private func asignar() {
        guard let formato = elegido else { return }
        intento = true
        guard faltante == nil, let quien = responsable?.id else { return }
        enviando = true
        fallo = nil
        let lugar = sucursal.trimmingCharacters(in: .whitespacesAndNewlines)
        let datos = AplicarFormatoBody(
            clave: clave,
            responsableId: quien,
            equipoIds: [],
            fecha: fecha,
            clientId: clienteServicioId,
            sucursal: lugar.isEmpty ? nil : lugar,
            renglones: renglones.map { r in
                RenglonAplicar(
                    titulo: r.titulo.trimmingCharacters(in: .whitespacesAndNewlines),
                    coreKind: r.base.coreKind,
                    tipo: r.base.tipo,
                    minutos: max(5, r.minutos),
                    minutosBase: r.base.minutosBase,
                    minutosPorUnidad: r.base.minutosPorUnidad,
                    fotos: r.base.fotos,
                    indicaciones: r.base.indicaciones,
                    puntos: r.base.puntos,
                    herramientas: r.base.herramientas
                )
            }
        )
        Task { @MainActor in
            defer { enviando = false }
            do {
                let res = try await CoreRepository.shared.aplicarFormato(id: formato.id, datos: datos)
                resultado = res
                let ms = inicio.map { Int(Date().timeIntervalSince($0) * 1000) } ?? 0
                segundos = ms / 1000
                if let primera = res.actividades.first {
                    await CoreRepository.shared.registrarTiempo(ProcesoTiempoBody(
                        proceso: "asignar_formato",
                        duracionMs: ms,
                        clics: toques,
                        entidadId: primera.id,
                        detalle: "\(res.actividades.count) actividades · app"
                    ))
                }
            } catch {
                fallo = error.toUserMessage(fallback: "No se pudo asignar")
            }
        }
    }

    private func asignarOtro() {
        resultado = nil
        intento = false
        clave = UUID().uuidString
        inicio = nil
        toques = 0
        cliente = nil
        clienteServicioId = nil
        sucursal = ""
        responsable = nil
        if let formato = elegido { elegir(formato) }
    }
}
