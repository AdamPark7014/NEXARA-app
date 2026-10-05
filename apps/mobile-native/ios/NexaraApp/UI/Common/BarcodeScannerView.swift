import SwiftUI
import AVFoundation
import UIKit

/// Qué simbologías lee el escáner según la pantalla. Espejo de `FormatosDeEscaneo` en Android.
/// UPC-A no tiene tipo propio en iOS: llega como EAN-13 con un 0 al frente y el lector le
/// quita ese 0 (`BarcodeScannerViewController.normalizar`), igual que lo entrega ML Kit.
enum FormatosDeEscaneo {
    /// Almacén: EAN-13, EAN-8, UPC-A (como EAN-13), UPC-E y Code 128.
    case producto
    /// Herramientas: la etiqueta Code 128 que imprime el inventario.
    case etiquetaHerramienta

    var tipos: [AVMetadataObject.ObjectType] {
        switch self {
        case .producto: return [.ean13, .ean8, .upce, .code128]
        case .etiquetaHerramienta: return [.code128]
        }
    }
}

// MARK: - Cámara (UIKit)

/// Sesión de cámara con `AVCaptureMetadataOutput`. Acepta un código solo cuando lo lee
/// dos veces seguidas igual (un reflejo a medias no dispara una búsqueda) y deja de
/// leer en cuanto entrega uno. Espejo de `VistaDeEscaneo` + `analizarCuadro` en Android.
final class BarcodeScannerViewController: UIViewController, AVCaptureMetadataOutputObjectsDelegate {
    var tipos: [AVMetadataObject.ObjectType] = FormatosDeEscaneo.producto.tipos
    var onCodigo: ((String) -> Void)?
    var onError: ((String) -> Void)?
    /// La cámara ya manda cuadros: se quita el «Abriendo cámara…».
    var onListo: ((Bool) -> Void)?
    /// Si el equipo tiene linterna (Android enseña «Encender luz» solo entonces).
    var onLinterna: ((Bool) -> Void)?

    private let session = AVCaptureSession()
    private let queue = DispatchQueue(label: "mx.nexara.barcode.session")
    private var previewLayer: AVCaptureVideoPreviewLayer?
    private var device: AVCaptureDevice?
    private var ultimaLectura: String?
    private var entregado = false
    private var linternaPedida = false

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .black
        let preview = AVCaptureVideoPreviewLayer(session: session)
        preview.videoGravity = .resizeAspectFill
        view.layer.addSublayer(preview)
        previewLayer = preview
        configurar()
    }

    override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        previewLayer?.frame = view.bounds
    }

    override func viewWillAppear(_ animated: Bool) {
        super.viewWillAppear(animated)
        arrancar()
    }

    override func viewWillDisappear(_ animated: Bool) {
        super.viewWillDisappear(animated)
        queue.async { [session] in
            if session.isRunning { session.stopRunning() }
        }
    }

    /// Los avisos se publican en la siguiente vuelta: `viewDidLoad` corre mientras SwiftUI
    /// arma la vista, y cambiar su estado ahí no se permite.
    private func fallar(_ mensaje: String) {
        DispatchQueue.main.async { [weak self] in self?.onError?(mensaje) }
    }

    private func configurar() {
        guard let camara = AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: .back) else {
            fallar("No se pudo abrir la cámara")
            return
        }
        guard let entrada = try? AVCaptureDeviceInput(device: camara) else {
            fallar("No se pudo abrir la cámara: revisa el permiso de cámara")
            return
        }
        device = camara
        let salida = AVCaptureMetadataOutput()
        session.beginConfiguration()
        guard session.canAddInput(entrada), session.canAddOutput(salida) else {
            session.commitConfiguration()
            fallar("No se pudo abrir la cámara")
            return
        }
        session.addInput(entrada)
        session.addOutput(salida)
        session.commitConfiguration()
        salida.setMetadataObjectsDelegate(self, queue: .main)
        // Solo los tipos que este equipo sabe leer; pedir uno que no soporta revienta.
        salida.metadataObjectTypes = tipos.filter { salida.availableMetadataObjectTypes.contains($0) }
        // Enfoque continuo de cerca: las etiquetas se leen a 10–20 cm.
        if (try? camara.lockForConfiguration()) != nil {
            if camara.isFocusModeSupported(.continuousAutoFocus) { camara.focusMode = .continuousAutoFocus }
            if camara.isAutoFocusRangeRestrictionSupported { camara.autoFocusRangeRestriction = .near }
            camara.unlockForConfiguration()
        }
        let tieneLinterna = camara.hasTorch
        DispatchQueue.main.async { [weak self] in self?.onLinterna?(tieneLinterna) }
    }

    /// Arranca la sesión fuera del hilo principal y avisa cuando ya corre.
    private func arrancar() {
        queue.async { [weak self, session] in
            if !session.isRunning, !session.inputs.isEmpty { session.startRunning() }
            let corriendo = session.isRunning
            DispatchQueue.main.async {
                self?.onListo?(corriendo)
                if corriendo { self?.aplicarLinterna() }
            }
        }
    }

    /// Enciende o apaga la linterna, si el equipo la tiene. Se puede llamar en cada
    /// actualización de SwiftUI: solo toca el equipo cuando cambia algo.
    func linterna(_ encendida: Bool) {
        linternaPedida = encendida
        aplicarLinterna()
    }

    private func aplicarLinterna() {
        guard let device, device.hasTorch, session.isRunning else { return }
        let modo: AVCaptureDevice.TorchMode = linternaPedida ? .on : .off
        guard device.torchMode != modo, device.isTorchModeSupported(modo) else { return }
        guard (try? device.lockForConfiguration()) != nil else { return }
        device.torchMode = modo
        device.unlockForConfiguration()
    }

    /// iOS entrega el UPC-A como EAN-13 con un 0 al frente; ML Kit (Android) lo da de 12
    /// dígitos. Sin quitarlo, el código salía como «EAN-13», el alta lo guardaba en `ean`
    /// en vez de `upc` y no coincidía con lo que registra el teléfono Android.
    static func normalizar(_ valor: String, tipo: AVMetadataObject.ObjectType) -> String {
        guard tipo == .ean13, valor.count == 13, valor.hasPrefix("0") else { return valor }
        return String(valor.dropFirst())
    }

    func metadataOutput(
        _ output: AVCaptureMetadataOutput,
        didOutput metadataObjects: [AVMetadataObject],
        from connection: AVCaptureConnection
    ) {
        guard !entregado else { return }
        guard let objeto = metadataObjects.compactMap({ $0 as? AVMetadataMachineReadableCodeObject }).first,
              let leido = objeto.stringValue, !leido.trimmingCharacters(in: .whitespaces).isEmpty else { return }
        let valor = Self.normalizar(leido, tipo: objeto.type)
        guard valor == ultimaLectura else {
            ultimaLectura = valor
            return
        }
        entregado = true
        UINotificationFeedbackGenerator().notificationOccurred(.success)
        onCodigo?(valor)
    }
}

/// Puente a SwiftUI de `BarcodeScannerViewController`.
struct BarcodeCameraView: UIViewControllerRepresentable {
    let formatos: FormatosDeEscaneo
    var linterna: Bool
    let onCodigo: (String) -> Void
    let onError: (String) -> Void
    var onListo: (Bool) -> Void = { _ in }
    var onLinterna: (Bool) -> Void = { _ in }

    func makeUIViewController(context: Context) -> BarcodeScannerViewController {
        let controller = BarcodeScannerViewController()
        controller.tipos = formatos.tipos
        controller.onCodigo = onCodigo
        controller.onError = onError
        controller.onListo = onListo
        controller.onLinterna = onLinterna
        return controller
    }

    func updateUIViewController(_ controller: BarcodeScannerViewController, context: Context) {
        controller.onCodigo = onCodigo
        controller.onError = onError
        controller.onListo = onListo
        controller.onLinterna = onLinterna
        controller.linterna(linterna)
    }
}

// MARK: - Pantalla completa del escáner

/// Android `BarcodeScannerDialog`: pantalla pizarra (#0F172A) con el título, la
/// indicación, la cámara en un recuadro negro de radio 14 con la guía (82 % del ancho
/// × 150) y abajo «Encender luz» (si hay linterna) y «Cancelar». Pide el permiso de
/// cámara al abrir; sin permiso lo explica con «Dar permiso». En la demostración no
/// hay cámara: ofrece un código de muestra para recorrer el flujo completo.
struct BarcodeScannerSheet: View {
    let titulo: String
    var subtitulo: String = "Apunta al código de barras y mantenlo dentro del recuadro."
    let formatos: FormatosDeEscaneo
    let onCodigo: (String) -> Void
    let onCancel: () -> Void

    private enum Permiso { case porPreguntar, autorizado, denegado, demo }

    @State private var permiso: Permiso = BarcodeScannerSheet.permisoActual()
    @State private var listo = false
    @State private var tieneLinterna = false
    @State private var linterna = false
    @State private var error: String?
    @Environment(\.openURL) private var openURL

    /// #CBD5E1 (subtítulo y «Cancelar») y #FCA5A5 (error) de Android.
    private static let gris = NxColors.borderStrong
    private static let rojoClaro = NxColors.rgb(0xFCA5A5)

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(titulo)
                .font(.system(size: 18, weight: .bold))
                .foregroundStyle(Color.white)
                .accessibilityAddTraits(.isHeader)
            Text(subtitulo)
                .font(.system(size: 13))
                .foregroundStyle(Self.gris)
                .fixedSize(horizontal: false, vertical: true)
            visor
            if let error {
                Text(error)
                    .font(.system(size: 13))
                    .foregroundStyle(Self.rojoClaro)
                    .fixedSize(horizontal: false, vertical: true)
            }
            HStack(alignment: .center, spacing: 8) {
                if tieneLinterna && permiso == .autorizado {
                    Button(linterna ? "Apagar luz" : "Encender luz") { linterna.toggle() }
                        .buttonStyle(BotonMaterialStyle(tipo: .contorno(Color.white), alto: 48, llenaAncho: true))
                }
                Button("Cancelar", action: onCancel)
                    .buttonStyle(BotonMaterialStyle(tipo: .texto(Self.gris), alto: 48, llenaAncho: true))
            }
        }
        .padding(16)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .background(NxColors.fg.ignoresSafeArea())
        .task { if permiso == .porPreguntar { await pedirPermiso() } }
    }

    /// Recuadro negro con la cámara y su guía, o lo que falta para poder usarla.
    private var visor: some View {
        ZStack {
            Color.black
            switch permiso {
            case .autorizado:
                BarcodeCameraView(
                    formatos: formatos,
                    linterna: linterna,
                    onCodigo: { onCodigo($0) },
                    onError: { error = $0 },
                    onListo: { listo = $0 },
                    onLinterna: { tieneLinterna = $0 }
                )
                guia
                if !listo && error == nil {
                    Text("Abriendo cámara…")
                        .font(.system(size: 14))
                        .foregroundStyle(Color.white)
                }
            case .demo:
                sinCamara(
                    "En la demostración no hay cámara: usa el código de muestra o cierra y escribe el código a mano.",
                    boton: "Usar código de muestra"
                ) {
                    onCodigo(formatos.codigoDeMuestraDemo)
                }
            case .porPreguntar:
                sinCamara("Necesitamos permiso de cámara para leer el código.", boton: "Dar permiso") {
                    Task { await pedirPermiso() }
                }
            case .denegado:
                sinCamara(
                    "Sin permiso de cámara no se puede escanear. Dalo aquí o en Ajustes, o cierra y escribe el código a mano.",
                    boton: "Dar permiso"
                ) {
                    abrirAjustes()
                }
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
    }

    /// Guía donde va el código: 82 % del ancho × 150, filo blanco de 2 y radio 12.
    private var guia: some View {
        GeometryReader { geo in
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .strokeBorder(Color.white.opacity(0.85), lineWidth: 2)
                .frame(width: geo.size.width * 0.82, height: 150)
                .position(x: geo.size.width / 2, y: geo.size.height / 2)
        }
        .allowsHitTesting(false)
        .accessibilityHidden(true)
    }

    private func sinCamara(_ texto: String, boton: String, accion: @escaping () -> Void) -> some View {
        VStack(alignment: .center, spacing: 10) {
            Text(texto)
                .font(.system(size: 14))
                .foregroundStyle(Color.white)
                .fixedSize(horizontal: false, vertical: true)
            Button(boton, action: accion)
                .buttonStyle(BotonMaterialStyle(tipo: .lleno(NxColors.brand)))
        }
        .padding(20)
    }

    private func abrirAjustes() {
        // Un permiso ya negado no se vuelve a preguntar en iOS: se da en Ajustes.
        if let ajustes = URL(string: UIApplication.openSettingsURLString) { openURL(ajustes) }
    }

    /// Se lee al crear la hoja: así no parpadea «Necesitamos permiso…» a quien ya lo dio.
    nonisolated private static func permisoActual() -> Permiso {
        if DemoMode.isActive { return .demo }
        switch AVCaptureDevice.authorizationStatus(for: .video) {
        case .authorized: return .autorizado
        case .notDetermined: return .porPreguntar
        default: return .denegado
        }
    }

    @MainActor
    private func pedirPermiso() async {
        switch AVCaptureDevice.authorizationStatus(for: .video) {
        case .authorized:
            permiso = .autorizado
        case .notDetermined:
            let concedido = await AVCaptureDevice.requestAccess(for: .video)
            permiso = concedido ? .autorizado : .denegado
        default:
            permiso = .denegado
        }
    }
}

// MARK: - Escanear o escribir

/// Android `EscanearOEscribirCodigo`: botón «Escanear con la cámara» a todo lo ancho
/// (dice «Buscando…» mientras se busca) y, debajo, el campo para escribir el código a
/// mano con su «Buscar» (etiquetas rotas o sin luz). Un lector USB o Bluetooth que
/// teclea el código y Enter entra por el mismo campo. Entrega el texto tal cual;
/// quien lo usa lo limpia y valida. Va dentro de una tarjeta (`MoreTarjeta`).
struct EscanearOEscribirCodigo: View {
    let titulo: String
    let formatos: FormatosDeEscaneo
    let buscando: Bool
    var etiquetaCampo: String = "Código de barras"
    var mayusculas: Bool = false
    let onCodigo: (String) -> Void

    @State private var escaneando = false
    @State private var manual = ""

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Button(buscando ? "Buscando…" : "Escanear con la cámara") { escaneando = true }
                .buttonStyle(BotonMaterialStyle(
                    tipo: .lleno(NxColors.brand),
                    alto: 52,
                    llenaAncho: true,
                    fuente: .system(size: 14, weight: .bold)
                ))
                .disabled(buscando)
            HStack(alignment: .center, spacing: 8) {
                CampoDelineadoDeEscaneo(
                    etiqueta: etiquetaCampo,
                    texto: $manual,
                    maxLargo: CodigoBarras.largoMaximo + 8,
                    teclado: .asciiCapable,
                    mayusculas: mayusculas ? .characters : .never,
                    alEnviar: { enviar() }
                )
                Button("Buscar") { enviar() }
                    .buttonStyle(BotonMaterialStyle(tipo: .contorno(NxColors.brand), alto: 52))
                    .disabled(buscando || manual.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .fullScreenCover(isPresented: $escaneando) {
            BarcodeScannerSheet(
                titulo: titulo,
                formatos: formatos,
                onCodigo: { codigo in
                    escaneando = false
                    manual = codigo
                    onCodigo(codigo)
                },
                onCancel: { escaneando = false }
            )
        }
    }

    private func enviar() {
        let valor = manual.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !valor.isEmpty, !buscando else { return }
        onCodigo(valor)
    }
}

// MARK: - Campo delineado del escáner

/// `OutlinedTextField` de Material 3 para los escáneres (código, cantidad, nota y alta
/// de producto): el marco y la etiqueta flotante de `MarcoDelineado` sobre la tarjeta
/// blanca, tope de caracteres como el `take(n)` de Android y «Buscar» en el teclado
/// cuando hay `alEnviar` (`ImeAction.Search`).
struct CampoDelineadoDeEscaneo: View {
    let etiqueta: String
    @Binding var texto: String
    var maxLargo: Int
    var teclado: UIKeyboardType
    var mayusculas: TextInputAutocapitalization
    var autocorreccion: Bool
    /// `false` = una sola línea (Android `singleLine = true`).
    var multilinea: Bool
    var alEnviar: (() -> Void)?

    @FocusState private var enfocado: Bool

    init(
        etiqueta: String,
        texto: Binding<String>,
        maxLargo: Int,
        teclado: UIKeyboardType = .default,
        mayusculas: TextInputAutocapitalization = .never,
        autocorreccion: Bool = false,
        multilinea: Bool = false,
        alEnviar: (() -> Void)? = nil
    ) {
        self.etiqueta = etiqueta
        self._texto = texto
        self.maxLargo = maxLargo
        self.teclado = teclado
        self.mayusculas = mayusculas
        self.autocorreccion = autocorreccion
        self.multilinea = multilinea
        self.alEnviar = alEnviar
    }

    var body: some View {
        MarcoDelineado(etiqueta: etiqueta, enfocado: enfocado, vacio: texto.isEmpty, fondo: NxColors.card) {
            campo
                .font(NxType.bodyLarge)
                .foregroundStyle(NxColors.fg)
                .tint(NxColors.brand)
                .keyboardType(teclado)
                .textInputAutocapitalization(mayusculas)
                .autocorrectionDisabled(!autocorreccion)
                .focused($enfocado)
                .accessibilityLabel(etiqueta)
        }
        .contentShape(Rectangle())
        .onTapGesture { enfocado = true }
    }

    @ViewBuilder
    private var campo: some View {
        if multilinea {
            TextField("", text: limitado, axis: .vertical)
                .lineLimit(1...6)
        } else {
            TextField("", text: limitado)
                .submitLabel(alEnviar == nil ? .done : .search)
                .onSubmit { alEnviar?() }
        }
    }

    /// Recorta como el `take(n)` de Android en `onValueChange`.
    private var limitado: Binding<String> {
        Binding(
            get: { texto },
            set: { nuevo in texto = nuevo.count > maxLargo ? String(nuevo.prefix(maxLargo)) : nuevo }
        )
    }
}
