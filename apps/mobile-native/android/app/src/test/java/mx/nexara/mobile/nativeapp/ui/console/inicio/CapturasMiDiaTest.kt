package mx.nexara.mobile.nativeapp.ui.console.inicio

import android.graphics.Bitmap
import android.graphics.Canvas
import androidx.activity.ComponentActivity
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Text
import androidx.compose.ui.Modifier
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import java.io.File
import mx.nexara.mobile.nativeapp.data.api.MyActivityItemDto
import mx.nexara.mobile.nativeapp.ui.enterprise.NxTheme
import mx.nexara.mobile.nativeapp.ui.theme.NexaraTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

/**
 * «Mi día» pintado en la JVM con los datos del artboard del canvas (App · Mi día), para
 * compararlo sin teléfono ni sesión. No corre en las pruebas normales:
 * `./gradlew :app:testDebugUnitTest -Pcapturas=true --tests "*CapturasMiDiaTest*"`.
 * Deja el PNG en `app/build/capturas/`.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [35], qualifiers = "w390dp-h844dp-xxhdpi", application = android.app.Application::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class CapturasMiDiaTest {
    @get:Rule
    val compose = createAndroidComposeRule<ComponentActivity>()

    private val enCurso = MyActivityItemDto(
        id = 418,
        anNumber = "AN-0418",
        titulo = "Cableado de nodos, planta baja",
        estatus = "En Proceso",
        coreKind = "tarea",
        ticketTypeCustom = "Cableado y canalización",
        cliente = "Biblioteca Central",
        fechaInicio = "2026-10-28T14:00:00.000Z",
        fechaMaxima = "2026-10-28T23:00:00.000Z",
        evidenceStatus = "ENTRY_PHOTO_UPLOADED",
        aceptacion = "ACEPTADA",
        inicioRealAt = "2026-10-28T14:10:00.000Z",
        minutosPlan = 450.0,
        minutosReales = 340.2,
        semaforo = "verde",
        enCurso = true,
        sesionAbiertaDesde = "2026-10-28T18:00:00.000Z",
    )

    private val siguientes = listOf(
        MyActivityItemDto(
            id = 420,
            titulo = "Etiquetado de rack",
            estatus = "Pendiente",
            coreKind = "tarea",
            cliente = "Biblioteca Central",
            fechaInicio = "2026-10-28T22:00:00.000Z",
            minutosPlan = 45.0,
        ),
        MyActivityItemDto(
            id = 421,
            titulo = "Mantenimiento CCTV",
            estatus = "Pendiente",
            coreKind = "servicio",
            cliente = "Plaza Norte",
            fechaInicio = "2026-10-29T14:00:00.000Z",
            minutosPlan = 120.0,
        ),
    )

    @Test
    fun miDia() {
        compose.mainClock.autoAdvance = false
        compose.setContent {
            NexaraTheme {
                Column(
                    modifier = Modifier
                        .fillMaxSize()
                        .background(NxTheme.colors.surface)
                        .padding(horizontal = 16.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    InicioHeader(fecha = "Miércoles 28 de octubre", unreadCount = 2, onOpenNotifications = {})
                    JornadaTarjeta(
                        jornada = InicioRules.Jornada.EN_JORNADA,
                        titulo = "Entraste a las 07:56",
                        detalle = "5:40 h trabajadas · GPS activo",
                        loading = false,
                        entradaHabilitada = false,
                        onEntrada = {},
                        onSalida = {},
                        onComida = {},
                        onVerJornada = {},
                    )
                    ActualCard(
                        a = enCurso,
                        accionEnCurso = false,
                        accionError = null,
                        onPrimary = {},
                        onDetalle = {},
                        onPausar = {},
                    )
                    Text("Lo que sigue hoy", fontSize = 15.sp, fontWeight = FontWeight.SemiBold, color = NxTheme.colors.fg)
                    SiguientesCard(items = siguientes, onOpen = {})
                    AvisoCard(
                        aviso = InicioRules.Aviso(
                            titulo = "Viático de \$350 por comprobar",
                            detalle = "Vence el viernes",
                            activityId = null,
                            tono = InicioRules.Tono.WARNING,
                        ),
                        onClick = {},
                    )
                }
            }
        }
        compose.mainClock.advanceTimeBy(500)
        // El reloj de la banda corre cada segundo: `captureToImage` esperaría un reposo que no
        // llega. Se dibuja la vista raíz tal cual está.
        val raiz = compose.activity.window.decorView.rootView
        val bitmap = Bitmap.createBitmap(raiz.width, raiz.height, Bitmap.Config.ARGB_8888)
        raiz.draw(Canvas(bitmap))
        guardar(bitmap, "mi-dia.png")
    }

    private fun guardar(bitmap: Bitmap, nombre: String) {
        val dir = File("build/capturas").apply { mkdirs() }
        File(dir, nombre).outputStream().use { bitmap.compress(Bitmap.CompressFormat.PNG, 100, it) }
    }
}
