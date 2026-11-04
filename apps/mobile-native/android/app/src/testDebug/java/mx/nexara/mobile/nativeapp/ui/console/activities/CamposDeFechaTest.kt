package mx.nexara.mobile.nativeapp.ui.console.activities

import androidx.activity.ComponentActivity
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import mx.nexara.mobile.nativeapp.ui.theme.NexaraTheme
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

/**
 * Un `clickable` puesto en un campo de solo lectura nunca se dispara, porque el campo se come el toque.
 * Así estuvo el calendario: sin elegir fecha no se podía pedir préstamo, solicitar vehículo ni registrar
 * un pago, y las pruebas de reglas no lo veían (04-11-2026).
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [35], qualifiers = "w390dp-h844dp-xxhdpi", application = android.app.Application::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class CamposDeFechaTest {
    @get:Rule
    val compose = createAndroidComposeRule<ComponentActivity>()

    @Test
    fun `tocar el campo abre el calendario`() {
        compose.setContent {
            NexaraTheme { DatePickerField(label = "Periodo desde", value = "", onValueChange = {}) }
        }
        compose.onNodeWithContentDescription("Periodo desde").performClick()
        compose.onNodeWithText("Aceptar").assertExists()
    }

    @Test
    fun `tocar el icono tambien abre el calendario`() {
        compose.setContent {
            NexaraTheme { DatePickerField(label = "Periodo hasta", value = "2026-11-04", onValueChange = {}) }
        }
        compose.onNodeWithContentDescription("Seleccionar fecha").performClick()
        compose.onNodeWithText("Aceptar").assertExists()
    }

    @Test
    fun `con fecha se lee como persona y limpiar sigue funcionando`() {
        var valor = "2026-11-04"
        compose.setContent {
            NexaraTheme { DatePickerField(label = "Regreso", value = valor, onValueChange = { valor = it }) }
        }
        compose.onNodeWithText("4 nov 2026").assertExists()
        compose.onNodeWithContentDescription("Limpiar").performClick()
        assertEquals("", valor)
    }

    @Test
    fun `fecha y hora tambien abre su calendario`() {
        compose.setContent {
            NexaraTheme { DateTimePickerField(label = "Desde", value = "", onValueChange = {}) }
        }
        compose.onNodeWithContentDescription("Desde").performClick()
        compose.onNodeWithText("Siguiente").assertExists()
    }
}
