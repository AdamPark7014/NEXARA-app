package mx.nexara.mobile.nativeapp.ui.console.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Language
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.widget.Toast
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import mx.nexara.mobile.nativeapp.ui.enterprise.NxColors
import mx.nexara.mobile.nativeapp.ui.util.openExternalUrl

private const val WEB_CONSOLE_ORIGIN = "https://consola.nexara.com.mx"

private fun webConsoleUrl(webPath: String): String {
    val path = webPath.trim()
    if (path.startsWith("http://") || path.startsWith("https://")) return path
    val normalized = if (path.startsWith("/")) path else "/$path"
    return WEB_CONSOLE_ORIGIN.trimEnd('/') + normalized
}

private fun copyModuleKey(context: Context, moduleKey: String) {
    val clipboard = context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
    clipboard.setPrimaryClip(ClipData.newPlainText("nexara-module-key", moduleKey))
    Toast.makeText(context, "Clave copiada: $moduleKey", Toast.LENGTH_SHORT).show()
}

private fun notifyTeam(context: Context, title: String, moduleKey: String?, webPath: String?) {
    val body = buildString {
        appendLine("Solicito la implementación nativa de este módulo en la app móvil NEXARA.")
        appendLine()
        appendLine("Módulo: $title")
        if (!moduleKey.isNullOrBlank()) appendLine("Clave: $moduleKey")
        if (!webPath.isNullOrBlank()) appendLine("Ruta web: $webPath")
    }
    val subject = "NEXARA app · módulo pendiente: ${moduleKey?.takeIf { it.isNotBlank() } ?: title}"
    val intent = Intent(Intent.ACTION_SEND).apply {
        type = "text/plain"
        putExtra(Intent.EXTRA_SUBJECT, subject)
        putExtra(Intent.EXTRA_TEXT, body)
    }
    context.startActivity(Intent.createChooser(intent, "Notificar al equipo"))
}

@Composable
fun PlaceholderScreen(
    title: String,
    moduleKey: String? = null,
    webPath: String? = null,
    icon: String? = null,
    contentPadding: PaddingValues = PaddingValues(24.dp),
    onBack: (() -> Unit)? = null,
) {
    val context = LocalContext.current
    val webUrl = webPath?.takeIf { it.isNotBlank() }?.let(::webConsoleUrl)
    val keyForSupport = moduleKey?.trim().orEmpty()

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(NxColors.Surface)
            .padding(contentPadding),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Card(
            shape = RoundedCornerShape(20.dp),
            colors = CardDefaults.cardColors(containerColor = NxColors.Card),
            elevation = CardDefaults.cardElevation(defaultElevation = 2.dp),
            modifier = Modifier.fillMaxWidth(),
        ) {
            Column(
                modifier = Modifier.padding(28.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                Box(
                    modifier = Modifier
                        .size(72.dp)
                        .background(NxColors.TealSoft, CircleShape),
                    contentAlignment = Alignment.Center,
                ) {
                    Text(
                        text = icon ?: "🚀",
                        fontSize = 32.sp,
                    )
                }

                Spacer(modifier = Modifier.height(20.dp))

                Surface(
                    color = NxColors.TealSoft,
                    shape = RoundedCornerShape(8.dp),
                ) {
                    Text(
                        text = "Próximamente en la app",
                        modifier = Modifier.padding(horizontal = 12.dp, vertical = 4.dp),
                        style = MaterialTheme.typography.labelMedium,
                        color = NxColors.Teal,
                        fontWeight = FontWeight.SemiBold,
                    )
                }

                Spacer(modifier = Modifier.height(16.dp))

                Text(
                    text = title,
                    style = MaterialTheme.typography.headlineSmall,
                    fontWeight = FontWeight.Bold,
                    color = NxColors.Slate,
                    textAlign = TextAlign.Center,
                )

                Spacer(modifier = Modifier.height(8.dp))

                Text(
                    text = "Este módulo ya está disponible en la consola web de NEXARA. Mientras llega a la app móvil, puedes continuar desde tu navegador.",
                    style = MaterialTheme.typography.bodyMedium,
                    color = NxColors.Muted,
                    textAlign = TextAlign.Center,
                )

                if (keyForSupport.isNotBlank()) {
                    Spacer(modifier = Modifier.height(12.dp))
                    Text(
                        text = "Clave: $keyForSupport",
                        style = MaterialTheme.typography.labelMedium,
                        color = NxColors.Muted,
                        textAlign = TextAlign.Center,
                    )
                }

                Spacer(modifier = Modifier.height(24.dp))

                if (keyForSupport.isNotBlank()) {
                    OutlinedButton(
                        onClick = { copyModuleKey(context, keyForSupport) },
                        modifier = Modifier.fillMaxWidth(),
                        colors = ButtonDefaults.outlinedButtonColors(contentColor = NxColors.Teal),
                    ) {
                        Text("Copiar clave del módulo")
                    }
                    Spacer(modifier = Modifier.height(8.dp))
                    OutlinedButton(
                        onClick = { notifyTeam(context, title, keyForSupport, webPath) },
                        modifier = Modifier.fillMaxWidth(),
                        colors = ButtonDefaults.outlinedButtonColors(contentColor = NxColors.Teal),
                    ) {
                        Text("Notificar al equipo")
                    }
                    Spacer(modifier = Modifier.height(8.dp))
                }

                if (webUrl != null) {
                    Button(
                        onClick = { openExternalUrl(context, webUrl) },
                        colors = ButtonDefaults.buttonColors(containerColor = NxColors.Teal),
                        modifier = Modifier.fillMaxWidth(),
                    ) {
                        Icon(
                            imageVector = Icons.Outlined.Language,
                            contentDescription = null,
                            modifier = Modifier.size(18.dp),
                        )
                        Spacer(modifier = Modifier.width(8.dp))
                        Text("Abrir en la web")
                    }
                    Spacer(modifier = Modifier.height(8.dp))
                }

                if (onBack != null) {
                    OutlinedButton(
                        onClick = onBack,
                        modifier = Modifier.fillMaxWidth(),
                        colors = ButtonDefaults.outlinedButtonColors(contentColor = NxColors.Teal),
                    ) {
                        Text("Volver")
                    }
                }
            }
        }
    }
}
