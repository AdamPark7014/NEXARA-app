package mx.nexara.mobile.nativeapp.ui.enterprise

import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusDirection
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType

fun requiredFieldError(value: String, label: String = "Este campo"): String? =
    if (value.trim().isBlank()) "$label es requerido" else null

fun emailFieldError(value: String, required: Boolean = false): String? {
    val trimmed = value.trim()
    if (trimmed.isBlank()) return if (required) "Email es requerido" else null
    if (!trimmed.contains("@") || !trimmed.contains(".")) return "Email inválido"
    return null
}

fun numericFieldError(value: String, label: String = "Valor"): String? {
    val trimmed = value.trim()
    if (trimmed.isBlank()) return null
    return if (trimmed.toDoubleOrNull() == null) "$label debe ser numérico" else null
}

fun intRangeFieldError(value: String, min: Int, max: Int, label: String = "Valor"): String? {
    val trimmed = value.trim()
    if (trimmed.isBlank()) return null
    val n = trimmed.toIntOrNull() ?: return "$label debe ser un número entero"
    if (n !in min..max) return "$label debe estar entre $min y $max"
    return null
}

fun dateFieldError(value: String): String? {
    val trimmed = value.trim()
    if (trimmed.isBlank()) return null
    return if (!trimmed.matches(Regex("""\d{4}-\d{2}-\d{2}"""))) "Formato: YYYY-MM-DD" else null
}

@Composable
fun NxFormTextField(
    value: String,
    onValueChange: (String) -> Unit,
    label: String,
    modifier: Modifier = Modifier.fillMaxWidth(),
    error: String? = null,
    singleLine: Boolean = true,
    minLines: Int = 1,
    readOnly: Boolean = false,
    imeAction: ImeAction = ImeAction.Next,
    keyboardType: KeyboardType = KeyboardType.Text,
    onImeAction: (() -> Unit)? = null,
) {
    val focusManager = LocalFocusManager.current
    OutlinedTextField(
        value = value,
        onValueChange = onValueChange,
        label = { Text(label) },
        modifier = modifier,
        singleLine = singleLine,
        minLines = minLines,
        readOnly = readOnly,
        isError = error != null,
        supportingText = error?.let { err ->
            { Text(err, color = MaterialTheme.colorScheme.error) }
        },
        keyboardOptions = KeyboardOptions(imeAction = imeAction, keyboardType = keyboardType),
        keyboardActions = KeyboardActions(
            onNext = {
                onImeAction?.invoke() ?: focusManager.moveFocus(FocusDirection.Down)
            },
            onDone = {
                onImeAction?.invoke() ?: focusManager.clearFocus()
            },
        ),
    )
}
