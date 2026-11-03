package mx.nexara.mobile.nativeapp.ui.console.inicio

import android.graphics.Bitmap
import android.graphics.Canvas
import androidx.activity.ComponentActivity
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.ui.Modifier
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.unit.dp
import java.io.File
import mx.nexara.mobile.nativeapp.data.api.ActivityDto
import mx.nexara.mobile.nativeapp.ui.console.activities.ActividadTiempoCard
import mx.nexara.mobile.nativeapp.data.api.ActividadEnRiesgoDto
import mx.nexara.mobile.nativeapp.data.api.FormatoActividadDto
import mx.nexara.mobile.nativeapp.data.api.MyActivityItemDto
import mx.nexara.mobile.nativeapp.data.api.PuntoFormatoDto
import mx.nexara.mobile.nativeapp.data.api.RecetaFormatoDto
import mx.nexara.mobile.nativeapp.data.api.RenglonFormatoDto
import mx.nexara.mobile.nativeapp.data.api.RiesgoSalidaDto
import mx.nexara.mobile.nativeapp.ui.console.activities.FormatosScreen
import mx.nexara.mobile.nativeapp.ui.enterprise.NxTheme
import mx.nexara.mobile.nativeapp.ui.theme.NexaraTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

/**
 * «Mi día» de la Ola 3 pintado en la JVM con los datos del mockup, para compararlo sin teléfono. No
 * corre en las pruebas normales: `./gradlew :app:testDebugUnitTest -Pcapturas=true --tests "*CapturasSalidaTest*"`.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [35], qualifiers = "w390dp-h844dp-xxhdpi", application = android.app.Application::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)

class CapturasSalidaTest {
    @get:Rule
    val compose = createAndroidComposeRule<ComponentActivity>()

    private val enCurso = MyActivityItemDto(
        id = 368,
        anNumber = "AN-0368",
        titulo = "Facturas de cierre",
        estatus = "En Proceso",
        coreKind = "tarea",
        fechaInicio = "2026-10-30T16:00:00.000Z",
        fechaMaxima = "2026-10-30T23:59:00.000Z",
        evidenceStatus = "SERVICE_SHEET_DATA",
        aceptacion = "ACEPTADA",
        inicioRealAt = "2026-10-30T16:00:00.000Z",
        minutosPlan = 180.0,
        minutosReales = 100.0,
        semaforo = "amarillo",
        enCurso = true,
        sesionAbiertaDesde = "2026-10-30T20:34:00.000Z",
    )

    private fun guardar(nombre: String) {
        val raiz = compose.activity.window.decorView.rootView
        val bitmap = Bitmap.createBitmap(raiz.width, raiz.height, Bitmap.Config.ARGB_8888)
        raiz.draw(Canvas(bitmap))
        val dir = File("build/capturas").apply { mkdirs() }
        File(dir, nombre).outputStream().use { bitmap.compress(Bitmap.CompressFormat.PNG, 100, it) }
    }

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
                    InicioHeader(fecha = "Viernes 30 de octubre", unreadCount = 2, onOpenNotifications = {})
                    ActualCard(
                        a = enCurso,
                        accionEnCurso = false,
                        accionError = null,
                        onPrimary = {},
                        onDetalle = {},
                        onPausar = {},
                    )
                    JornadaTarjeta(
                        jornada = InicioRules.Jornada.EN_JORNADA,
                        titulo = "Mi jornada",
                        detalle = "Entraste 09:58 · 6:16 h",
                        loading = false,
                        entradaHabilitada = false,
                        onEntrada = {},
                        onSalida = {},
                        onComida = {},
                        onVerJornada = {},
                    )
                }
            }
        }
        compose.mainClock.advanceTimeBy(500)
        guardar("salida-mi-dia.png")
    }

    @Test
    fun formatos() {
        compose.setContent {
            NexaraTheme {
                FormatosScreen(
                    onBack = {},
                    onOpenActivity = {},
                    formatosDePrueba = listOf(
                        FormatoActividadDto(
                            id = 1,
                            nombre = "Instalación CCTV",
                            receta = RecetaFormatoDto(
                                unidad = "Cámaras",
                                cantidadPorOmision = 4,
                                renglones = listOf(
                                    RenglonFormatoDto(titulo = "Levantamiento y marcado de puntos", minutosBase = 60),
                                    RenglonFormatoDto(titulo = "Canalización y cableado", minutosBase = 0, minutosPorUnidad = 45, puntos = listOf(PuntoFormatoDto("Canalización", listOf("ANTES")))),
                                    RenglonFormatoDto(titulo = "Montaje de cámaras", minutosBase = 30, minutosPorUnidad = 45, puntos = listOf(PuntoFormatoDto("Cámaras montadas", listOf("DESPUES")))),
                                    RenglonFormatoDto(titulo = "Pruebas y entrega al cliente", coreKind = "servicio", minutosBase = 30, fotos = 2),
                                ),
                            ),
                        ),
                        FormatoActividadDto(id = 2, nombre = "Sucursal de restaurante"),
                        FormatoActividadDto(id = 3, nombre = "Mantenimiento preventivo"),
                    ),
                )
            }
        }
        compose.waitForIdle()
        guardar("salida-formatos.png")
    }

    @Test
    fun hojaConRiesgo() {
        compose.mainClock.autoAdvance = false
        compose.setContent {
            NexaraTheme {
                Column(Modifier.fillMaxSize().background(NxTheme.colors.card).padding(top = 24.dp)) {
                    val a = ActividadEnRiesgoDto(id = 368, folio = "AN-0368", titulo = "Facturas de cierre")
                    TerminarJornadaContenido(
                        riesgo = RiesgoSalidaDto(listOf(a), listOf(a)),
                        cargando = false,
                        onTerminarActividad = {},
                        onConfirmar = {},
                        onCancelar = {},
                    )
                }
            }
        }
        compose.mainClock.advanceTimeBy(500)
        guardar("salida-hoja-riesgo.png")
    }

    @Test
    fun preguntaDeTiempo() {
        compose.mainClock.autoAdvance = false
        compose.setContent {
            NexaraTheme {
                Column(Modifier.fillMaxSize().background(NxTheme.colors.card).padding(16.dp)) {
                    ActividadTiempoCard(
                        detail = ActivityDto(
                            id = 368,
                            estatus = "Por Validar",
                            minutosPlan = 120.0,
                            minutosReales = 370.0,
                            preguntarTiempo = true,
                        ),
                        miFila = null,
                        soyQuienEjecuta = true,
                    )
                }
            }
        }
        compose.mainClock.advanceTimeBy(500)
        guardar("tiempo-pregunta.png")
    }

    @Test
    fun hojaSinRiesgoYDeshacer() {
        compose.mainClock.autoAdvance = false
        compose.setContent {
            NexaraTheme {
                Column(
                    Modifier.fillMaxSize().background(NxTheme.colors.surface).padding(16.dp),
                    verticalArrangement = Arrangement.spacedBy(16.dp),
                ) {
                    JornadaTarjeta(
                        jornada = InicioRules.Jornada.COMPLETADA,
                        titulo = "Jornada completada · 09:58 – 16:14",
                        detalle = "6:16 h trabajadas · Entrada y salida registradas hoy",
                        loading = false,
                        entradaHabilitada = false,
                        onEntrada = {},
                        onSalida = {},
                        onComida = {},
                        onVerJornada = {},
                        minutosDeshacer = 9,
                    )
                    Column(Modifier.background(NxTheme.colors.card).padding(top = 16.dp)) {
                        TerminarJornadaContenido(
                            riesgo = RiesgoSalidaDto(),
                            cargando = false,
                            onTerminarActividad = null,
                            onConfirmar = {},
                            onCancelar = {},
                        )
                    }
                }
            }
        }
        compose.mainClock.advanceTimeBy(500)
        guardar("salida-deshacer.png")
    }
}
