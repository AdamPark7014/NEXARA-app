import SwiftUI
import AVFoundation
import UIKit

/// Qué simbologías lee el escáner según la pantalla. Espejo de `FormatosDeEscaneo` en Android.
/// UPC-A no tiene tipo propio en iOS: llega como EAN-13 con un 0 al frente, y el API
/// busca las dos variantes.
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
/// leer en cuanto entrega uno.
final class BarcodeScannerViewController: UIViewController, AVCaptureMetadataOutputObjectsDelegate {
    var tipos: [AVMetadataObject.ObjectType] = FormatosDeEscaneo.producto.tipos
    var onCodigo: ((String) -> Void)?
    var onError: ((String) -> Void)?

    private let session = AVCaptureSession()
    private let queue = DispatchQueue(label: "mx.nexara.barcode.session")
    private var previewLayer: AVCaptureVideoPreviewLayer?
    private var device: AVCaptureDevice?
    private var ultimaLectura: String?
    private var entregado = false

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
        queue.async { [session] in
            if !session.isRunning, !session.inputs.isEmpty { session.startRunning() }
        }
    }

    override func viewWillDisappear(_ animated: Bool) {
        super.viewWillDisappear(animated)
        queue.async { [session] in
            if session.isRunning { session.stopRunning() }
        }
    }

    /// El error se publica en la siguiente vuelta: `viewDidLoad` corre mientras SwiftUI
    /// arma la vista, y cambiar su estado ahí no se permite.
    private func fallar(_ mensaje: String) {
        DispatchQueue.main.async { [weak self] in self?.onError?(mensaje) }
    }

    private func configurar() {
        guard let camara = AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: .back),
              let entrada = try? AVCaptureDeviceInput(device: camara) else {
            fallar("No hay cámara disponible en este dispositivo.")
            return
        }
        device = camara
        let salida = AVCaptureMetadataOutput()
        session.beginConfiguration()
        guard session.canAddInput(entrada), session.canAddOutput(salida) else {
            session.commitConfiguration()
            fallar("No se pudo abrir la cámara para leer códigos.")
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
        queue.async { [session] in session.startRunning() }
    }

    /// Enciende o apaga la linterna, si el equipo la tiene.
    func linterna(_ encendida: Bool) {
        guard let device, device.hasTorch, (try? device.lockForConfiguration()) != nil else { return }
        device.torchMode = encendida ? .on : .off
        device.unlockForConfiguration()
    }

    var tieneLinterna: Bool { device?.hasTorch == true }

    func metadataOutput(
        _ output: AVCaptureMetadataOutput,
        didOutput metadataObjects: [AVMetadataObject],
        from connection: AVCaptureConnection
    ) {
        guard !entregado else { return }
        guard let objeto = metadataObjects.compactMap({ $0 as? AVMetadataMachineReadableCodeObject }).first,
              let valor = objeto.stringValue, !valor.isEmpty else { return }
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

    func makeUIViewController(context: Context) -> BarcodeScannerViewController {
        let controller = BarcodeScannerViewController()
        controller.tipos = formatos.tipos
        controller.onCodigo = onCodigo
        controller.onError = onError
        return controller
    }

    func updateUIViewController(_ controller: BarcodeScannerViewController, context: Context) {
        controller.onCodigo = onCodigo
        controller.onError = onError
        controller.linterna(linterna)
    }
}

// MARK: - Pantalla completa del escáner

/// Escáner a pantalla completa: pide el permiso de cámara, enseña el recuadro guía y
/// entrega el primer código que lee. Sin permiso explica cómo darlo; en la demostración
/// (el simulador no tiene cámara) manda a escribir el código a mano.
struct BarcodeScannerSheet: View {
    let titulo: String
    var subtitulo: String = "Apunta al código de barras y mantén el teléfono quieto."
    let formatos: FormatosDeEscaneo
    let onCodigo: (String) -> Void
    let onCancel: () -> Void

    private enum Permiso { case preguntando, autorizado, denegado }

    @State private var permiso: Permiso = .preguntando
    @State private var linterna = false
    @State private var error: String?
    @Environment(\.openURL) private var openURL

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()
            switch permiso {
            case .autorizado where !DemoMode.isActive:
                BarcodeCameraView(
                    formatos: formatos,
                    linterna: linterna,
                    onCodigo: { onCodigo($0) },
                    onError: { error = $0 }
                )
                .ignoresSafeArea()
                guia
            case .preguntando:
                ProgressView().tint(.white)
            default:
                sinCamara
            }
            VStack {
                barraSuperior
                Spacer()
                if let error {
                    aviso(error, fondo: Color.red.opacity(0.8))
                }
                aviso(subtitulo, fondo: Color.black.opacity(0.55))
                    .padding(.bottom, 24)
            }
        }
        .task { await pedirPermiso() }
    }

    private var barraSuperior: some View {
        HStack {
            Button("Cancelar", action: onCancel)
                .foregroundStyle(Color.white)
                .padding(.horizontal, 14)
                .padding(.vertical, 8)
                .background(Color.black.opacity(0.45), in: Capsule())
            Spacer()
            Text(titulo)
                .font(.subheadline.bold())
                .foregroundStyle(Color.white)
                .padding(.horizontal, 12)
                .padding(.vertical, 6)
                .background(Color.black.opacity(0.45), in: Capsule())
            Spacer()
            Button {
                linterna.toggle()
            } label: {
                Image(systemName: linterna ? "flashlight.on.fill" : "flashlight.off.fill")
                    .foregroundStyle(Color.white)
                    .frame(width: 40, height: 40)
                    .background(Color.black.opacity(0.45), in: Circle())
            }
            .disabled(permiso != .autorizado || DemoMode.isActive)
            .accessibilityLabel(linterna ? "Apagar linterna" : "Encender linterna")
        }
        .padding(.horizontal)
        .padding(.top, 8)
    }

    /// Recuadro donde va el código: más ancho que alto, como un código de barras.
    private var guia: some View {
        RoundedRectangle(cornerRadius: 14)
            .stroke(Color.white.opacity(0.9), lineWidth: 3)
            .frame(width: 280, height: 160)
            .shadow(color: .black.opacity(0.4), radius: 6)
            .accessibilityHidden(true)
    }

    private var sinCamara: some View {
        VStack(spacing: 14) {
            Image(systemName: "camera.metering.unknown")
                .font(.system(size: 44))
                .foregroundStyle(Color.white.opacity(0.8))
            Text(DemoMode.isActive
                 ? "En la demostración no hay cámara. Cierra y escribe el código a mano."
                 : "NEXARA no tiene permiso de usar la cámara. Actívalo en Ajustes › NEXARA › Cámara, o escribe el código a mano.")
                .font(.subheadline)
                .foregroundStyle(Color.white)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 32)
            if !DemoMode.isActive, let ajustes = URL(string: UIApplication.openSettingsURLString) {
                Button("Abrir Ajustes") { openURL(ajustes) }
                    .buttonStyle(.borderedProminent)
                    .tint(NxBrand.primary)
            }
        }
    }

    private func aviso(_ texto: String, fondo: Color) -> some View {
        Text(texto)
            .font(.footnote)
            .foregroundStyle(Color.white)
            .multilineTextAlignment(.center)
            .padding(10)
            .background(fondo, in: RoundedRectangle(cornerRadius: 12))
            .padding(.horizontal)
    }

    @MainActor
    private func pedirPermiso() async {
        if DemoMode.isActive {
            permiso = .denegado
            return
        }
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

/// Botón «Escanear con la cámara» más el campo para escribir el código a mano (para
/// etiquetas rotas o sin luz). Va dentro de una `Section`; entrega el texto tal cual y
/// quien lo usa lo limpia y valida.
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
        // Dos filas de la lista; la cámara cuelga solo del botón (un modificador sobre un
        // `Group` se repetiría en cada fila).
        Button {
            escaneando = true
        } label: {
            Label("Escanear con la cámara", systemImage: "barcode.viewfinder")
        }
        .buttonStyle(NxPrimaryButtonStyle())
        .disabled(buscando)
        .listRowInsets(EdgeInsets(top: 8, leading: 16, bottom: 8, trailing: 16))
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

        HStack(spacing: 8) {
            TextField(etiquetaCampo, text: $manual)
                .textInputAutocapitalization(mayusculas ? .characters : .never)
                .autocorrectionDisabled()
                .keyboardType(.asciiCapable)
                .submitLabel(.search)
                .onSubmit(buscarManual)
            Button(buscando ? "Buscando…" : "Buscar", action: buscarManual)
                .buttonStyle(.bordered)
                .disabled(buscando || manual.trimmingCharacters(in: .whitespaces).isEmpty)
        }
    }

    private func buscarManual() {
        let texto = manual.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !texto.isEmpty, !buscando else { return }
        onCodigo(texto)
    }
}
