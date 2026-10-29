package mx.nexara.mobile.nativeapp.ui.console.activities

import android.graphics.Bitmap
import android.graphics.Canvas
import androidx.activity.ComponentActivity
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.unit.dp
import java.io.File
import mx.nexara.mobile.nativeapp.data.api.DesgloseTiempoDto
import mx.nexara.mobile.nativeapp.data.api.TiempoCalculadoDto
import mx.nexara.mobile.nativeapp.data.console.CoreActivitiesRepository
import mx.nexara.mobile.nativeapp.ui.enterprise.NxTheme
import mx.nexara.mobile.nativeapp.ui.theme.NexaraTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

/**
 * El alta de una tarea pintada en la JVM: tipos por familia, complejidad y «Entregar a más
 * tardar». Sin servidor, la complejidad no trae tiempos ni sugerencia (así se ve si la API
 * falla). Solo con `-Pcapturas=true`; deja el PNG en `app/build/capturas/`.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [35], qualifiers = "w390dp-h2200dp-xxhdpi", application = android.app.Application::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class CapturasFormularioTest {
    @get:Rule
    val compose = createAndroidComposeRule<ComponentActivity>()

    @Test
    fun altaDeTarea() {
        val k = CoreActivityKinds
        val inicial = k.pickTareaTipo(
            k.initialForm(k.TAREA, 7L, null).copy(
                titulo = "Cableado de nodos, planta baja",
                fecha = "2026-10-29",
                hora = "09:00",
                horaCompromiso = "17:00",
                complejidad = "COMPLEJA",
            ),
            "cableado",
        )
        compose.mainClock.autoAdvance = false
        compose.setContent {
            NexaraTheme {
                Column(
                    Modifier
                        .fillMaxSize()
                        .background(NxTheme.colors.surface)
                        .padding(16.dp),
                ) {
                    ActivityFormPanel(
                        stepTitle = "Datos de la actividad",
                        meta = requireNotNull(k.meta(k.TAREA)),
                        initial = inicial,
                        creatorEmail = null,
                        creadoPorId = 2L,
                        repo = CoreActivitiesRepository(LocalContext.current),
                        onCancel = {},
                        onSubmit = {},
                    )
                }
            }
        }
        compose.mainClock.advanceTimeBy(300)
        guardar("alta-tarea.png")
    }

    /**
     * Autoasignación: sin complejidad, entrega ni tiempos que capturar; arriba, la tarjeta de lo que
     * fija el sistema con una respuesta de muestra de `me/activities/tiempo-calculado`, y abajo el
     * alta como queda (sin servidor, la tarjeta dice que se calculan al guardar).
     */
    @Test
    fun autoasignacion() {
        val k = CoreActivityKinds
        val inicial = k.pickTareaTipo(
            k.initialForm(k.TAREA, 7L, null).copy(
                titulo = "Cableado de 8 nodos, planta baja",
                fecha = "2026-10-29",
                hora = "09:00",
            ),
            "cableado",
        )
        val muestra = TiempoCalculadoDto(
            tiempoEstandarMin = 220.0,
            desglose = listOf(
                DesgloseTiempoDto("Cableado: 8 nodos × 20 min", 160.0),
                DesgloseTiempoDto("Traslado aproximado (ida y vuelta)", 60.0),
                DesgloseTiempoDto("Supuesto: complejidad estándar", 0.0),
            ),
            supuestos = listOf("una sola visita"),
            complejidad = "ESTANDAR",
            fechaEntregaEsperada = "2026-10-29T18:40:00.000Z",
        )
        compose.mainClock.autoAdvance = false
        compose.setContent {
            NexaraTheme {
                Column(
                    Modifier
                        .fillMaxSize()
                        .background(NxTheme.colors.surface)
                        .padding(16.dp),
                    verticalArrangement = Arrangement.spacedBy(16.dp),
                ) {
                    TiempoCalculadoContenido(listo = true, pensando = false, dato = muestra, inicioIso = "2026-10-29T15:00:00.000Z")
                    ActivityFormPanel(
                        stepTitle = "Auto-asignarme",
                        meta = requireNotNull(k.meta(k.TAREA)),
                        initial = inicial,
                        creatorEmail = null,
                        creadoPorId = 7L,
                        repo = CoreActivitiesRepository(LocalContext.current),
                        onCancel = {},
                        onSubmit = {},
                        autoasignacion = true,
                    )
                }
            }
        }
        compose.mainClock.advanceTimeBy(300)
        guardar("autoasignacion.png")
    }

    private fun guardar(nombre: String) {
        val raiz = compose.activity.window.decorView.rootView
        val bitmap = Bitmap.createBitmap(raiz.width, raiz.height, Bitmap.Config.ARGB_8888)
        raiz.draw(Canvas(bitmap))
        val dir = File("build/capturas").apply { mkdirs() }
        File(dir, nombre).outputStream().use { bitmap.compress(Bitmap.CompressFormat.PNG, 100, it) }
    }
}
