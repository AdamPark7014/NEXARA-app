package mx.nexara.mobile.nativeapp.ui.console.vehiculos

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.RectF
import androidx.activity.ComponentActivity
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import java.io.File
import mx.nexara.mobile.nativeapp.ui.console.vehiculos.GasolinaRules.FormCarga
import mx.nexara.mobile.nativeapp.ui.enterprise.NxTheme
import mx.nexara.mobile.nativeapp.ui.theme.NexaraTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

/**
 * «Cargar gasolina» y «Regreso del vehículo» pintadas en la JVM, a 390×844 como los mockups
 * `AppGasolina` y `AppRegreso`. Solo con `-Pcapturas=true`; deja los PNG en `app/build/capturas/`.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [35], qualifiers = "w390dp-h844dp-xxhdpi", application = android.app.Application::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class CapturasVehiculosTest {
    @get:Rule
    val compose = createAndroidComposeRule<ComponentActivity>()

    private val leido = FormCarga(litros = "52.3", total = "1281.35", odometro = "12480")
    private val cargas = listOf(GasolinaRules.CargaPrevia(12030, 50.0, true))

    @Test
    fun gasolinaComoElMockup() = pinta("gasolina-leida.png") {
        Gasolina(leido, veCostos = true, conFotos = true)
    }

    /** Técnico: kilómetros y rendimiento, sin importes. */
    @Test
    fun gasolinaQuienNoVeCostos() = pinta("gasolina-sin-importes.png") {
        Gasolina(leido, veCostos = false, conFotos = true)
    }

    @Test
    fun gasolinaVacia() = pinta("gasolina-vacia.png") {
        Gasolina(FormCarga(), veCostos = false, conFotos = false)
    }

    @Test
    fun gasolinaLeyendo() = pinta("gasolina-leyendo.png") {
        Gasolina(FormCarga(), veCostos = true, conFotos = true, leyendo = true)
    }

    @Test
    fun gasolinaNoSePudoLeer() = pinta("gasolina-no-se-pudo.png") {
        Gasolina(
            FormCarga(lleno = false),
            veCostos = false,
            conFotos = true,
            aviso = GasolinaRules.avisoTicket(legible = false, revisar = false, veCostos = false),
        )
    }

    @Test
    fun regresoComoElMockup() = pinta("regreso-leido.png") {
        Regreso(km = "12480", nivel = "3/4", lectura = LecturaTablero.LEIDA, conFoto = true)
    }

    @Test
    fun regresoSinFoto() = pinta("regreso-sin-foto.png") {
        Regreso(km = "", nivel = null, lectura = LecturaTablero.SIN_FOTO, conFoto = false)
    }

    @Test
    fun regresoNoSePudoLeer() = pinta("regreso-no-se-pudo.png") {
        Regreso(km = "", nivel = null, lectura = LecturaTablero.NO_SE_PUDO, conFoto = true)
    }

    @Test
    fun regresoNumeroQueNoCuadra() = pinta("regreso-no-cuadra.png") {
        Regreso(
            km = "12000",
            nivel = "1/2",
            lectura = LecturaTablero.LEIDA,
            conFoto = true,
            aviso = "El kilometraje final (12000) no puede ser menor al de salida (12324)",
        )
    }

    /** Lo que se ve si la API aún no manda la actividad: una línea menos, nada se rompe. */
    @Test
    fun regresoSinActividad() = pinta("regreso-sin-actividad.png") {
        Regreso(
            km = "12480",
            nivel = "3/4",
            lectura = LecturaTablero.LEIDA,
            conFoto = true,
            encabezado = GasolinaRules.encabezadoRegreso("Nissan Frontier", "TXA-12-34", null, null),
        )
    }

    @Composable
    private fun Gasolina(
        form: FormCarga,
        veCostos: Boolean,
        conFotos: Boolean,
        leyendo: Boolean = false,
        aviso: String? = null,
    ) {
        CargarGasolinaContenido(
            vehiculo = "Nissan Frontier · TXA-12-34",
            form = form,
            veCostos = veCostos,
            ticket = if (conFotos) ticket() else null,
            tablero = if (conFotos) tablero() else null,
            leyendoTicket = leyendo,
            leyendoTablero = leyendo,
            leido = form.tieneDatos,
            rendimiento = GasolinaRules.rendimientoDelForm(form, cargas),
            aviso = aviso,
            error = null,
            enviando = false,
            onForm = {},
            onTicket = {},
            onTablero = {},
            onGuardar = {},
        )
    }

    @Composable
    private fun Regreso(
        km: String,
        nivel: String?,
        lectura: LecturaTablero,
        conFoto: Boolean,
        aviso: String? = null,
        encabezado: List<String> = GasolinaRules.encabezadoRegreso(
            "Nissan Frontier",
            "TXA-12-34",
            "Instalación de cámaras",
            "CCTV Bodega Norte",
        ),
    ) {
        RegresoVehiculoContenido(
            encabezado = encabezado,
            foto = if (conFoto) tablero() else null,
            horaFoto = if (conFoto) "18:12" else null,
            lectura = lectura,
            km = km,
            nivel = nivel,
            kmInicio = 12324,
            aviso = aviso,
            error = null,
            enviando = false,
            onFoto = {},
            onKm = {},
            onNivel = {},
            onConfirmar = {},
        )
    }

    private fun pinta(nombre: String, contenido: @Composable () -> Unit) {
        compose.mainClock.autoAdvance = false
        compose.setContent {
            NexaraTheme {
                Box(Modifier.fillMaxSize().background(NxTheme.colors.surface)) { contenido() }
            }
        }
        compose.mainClock.advanceTimeBy(300)
        val raiz = compose.activity.window.decorView.rootView
        val bitmap = Bitmap.createBitmap(raiz.width, raiz.height, Bitmap.Config.ARGB_8888)
        raiz.draw(Canvas(bitmap))
        val dir = File("build/capturas").apply { mkdirs() }
        File(dir, nombre).outputStream().use { bitmap.compress(Bitmap.CompressFormat.PNG, 100, it) }
    }

    /** Un tablero dibujado, para ver el pie sobre algo oscuro con brillos. */
    private fun tablero(): Bitmap {
        val b = Bitmap.createBitmap(1280, 720, Bitmap.Config.ARGB_8888)
        val c = Canvas(b)
        c.drawColor(Color.rgb(20, 24, 30))
        val aro = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            style = Paint.Style.STROKE
            strokeWidth = 14f
            color = Color.rgb(200, 210, 220)
        }
        c.drawArc(RectF(120f, 90f, 600f, 570f), 150f, 240f, false, aro)
        c.drawArc(RectF(700f, 90f, 1180f, 570f), 150f, 240f, false, aro)
        val aguja = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            style = Paint.Style.STROKE
            strokeWidth = 10f
            color = Color.rgb(240, 120, 60)
        }
        c.drawLine(360f, 330f, 490f, 210f, aguja)
        c.drawLine(940f, 330f, 1070f, 250f, aguja)
        val digitos = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = Color.rgb(150, 240, 200)
            textSize = 70f
        }
        c.drawText("12,480 km", 220f, 470f, digitos)
        return b
    }

    /** Un ticket dibujado: papel blanco, para ver el pie sobre algo claro. */
    private fun ticket(): Bitmap {
        val b = Bitmap.createBitmap(720, 1280, Bitmap.Config.ARGB_8888)
        val c = Canvas(b)
        c.drawColor(Color.rgb(90, 96, 104))
        val papel = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = Color.rgb(250, 250, 246) }
        c.drawRect(RectF(110f, 60f, 610f, 1220f), papel)
        val linea = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = Color.rgb(50, 50, 50)
            textSize = 40f
        }
        listOf("GASOLINERA", "Magna", "52.300 L", "\$24.50 / L", "TOTAL \$1,281.35").forEachIndexed { i, texto ->
            c.drawText(texto, 150f, 170f + i * 90f, linea)
        }
        return b
    }
}
