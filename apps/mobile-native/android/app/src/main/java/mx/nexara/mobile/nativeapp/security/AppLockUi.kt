package mx.nexara.mobile.nativeapp.security

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Fingerprint
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FilterChipDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import mx.nexara.mobile.nativeapp.R

private val NexaraTeal = Color(0xFF0D9488)
private val NexaraTealDark = Color(0xFF0F766E)
private val Slate = Color(0xFF0F172A)
private val Sub = Color(0xFF64748B)

@Composable
fun AppLockScreen(
    isUnlocking: Boolean,
    onUnlock: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Box(
        modifier = modifier
            .fillMaxSize()
            .background(
                Brush.linearGradient(
                    colors = listOf(Color(0xFFE6F7F6), Color(0xFFEFF6FF)),
                ),
            ),
        contentAlignment = Alignment.Center,
    ) {
        Card(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 28.dp),
            shape = RoundedCornerShape(20.dp),
            colors = CardDefaults.cardColors(containerColor = Color.White),
            elevation = CardDefaults.cardElevation(defaultElevation = 6.dp),
        ) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 28.dp, vertical = 36.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                Box(
                    modifier = Modifier
                        .size(90.dp)
                        .clip(RoundedCornerShape(22.dp))
                        .background(Color(0xFFCCFBF1)),
                    contentAlignment = Alignment.Center,
                ) {
                    Image(
                        painter = painterResource(R.drawable.logo_nexara),
                        contentDescription = "NEXARA",
                        modifier = Modifier.size(62.dp),
                        contentScale = ContentScale.Fit,
                    )
                }

                Spacer(Modifier.height(12.dp))

                Text(
                    "NEXARA",
                    style = MaterialTheme.typography.labelLarge.copy(
                        letterSpacing = 3.sp,
                        color = NexaraTeal,
                        fontWeight = FontWeight.SemiBold,
                    ),
                )

                Spacer(Modifier.height(20.dp))

                Box(
                    modifier = Modifier
                        .size(56.dp)
                        .clip(RoundedCornerShape(16.dp))
                        .background(Color(0xFFF0FDFA)),
                    contentAlignment = Alignment.Center,
                ) {
                    Icon(
                        imageVector = Icons.Default.Lock,
                        contentDescription = null,
                        tint = NexaraTeal,
                        modifier = Modifier.size(28.dp),
                    )
                }

                Spacer(Modifier.height(16.dp))

                Text(
                    "App bloqueada",
                    style = MaterialTheme.typography.headlineSmall.copy(fontWeight = FontWeight.Bold),
                    color = Slate,
                )
                Text(
                    "Confirma tu identidad con huella, rostro o PIN del dispositivo para continuar.",
                    style = MaterialTheme.typography.bodyMedium,
                    color = Sub,
                    textAlign = TextAlign.Center,
                    modifier = Modifier.padding(top = 8.dp),
                )

                Spacer(Modifier.height(28.dp))

                Button(
                    onClick = onUnlock,
                    enabled = !isUnlocking,
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(12.dp),
                    colors = ButtonDefaults.buttonColors(
                        containerColor = NexaraTeal,
                        contentColor = Color.White,
                    ),
                ) {
                    if (isUnlocking) {
                        CircularProgressIndicator(
                            modifier = Modifier.size(20.dp),
                            color = Color.White,
                            strokeWidth = 2.dp,
                        )
                    } else {
                        Icon(
                            imageVector = Icons.Default.Fingerprint,
                            contentDescription = null,
                            modifier = Modifier.size(20.dp),
                        )
                        Spacer(Modifier.size(ButtonDefaults.IconSpacing))
                        Text("Desbloquear")
                    }
                }
            }
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun AppLockSettingsCard(
    modifier: Modifier = Modifier,
    containerColor: Color = Color.White,
    titleColor: Color = Slate,
    subtitleColor: Color = Sub,
) {
    val context = LocalContext.current
    var enabled by remember { mutableStateOf(AppLock.isEnabled(context)) }
    var timeout by remember { mutableStateOf(AppLock.getTimeout(context)) }
    val lockAvailable = remember(context) { AppLock.canAuthenticate(context) }

    Card(
        modifier = modifier.fillMaxWidth(),
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(containerColor = containerColor),
        elevation = CardDefaults.cardElevation(defaultElevation = 1.dp),
    ) {
        Column(Modifier.padding(16.dp)) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween,
                modifier = Modifier.fillMaxWidth(),
            ) {
                Column(Modifier.weight(1f).padding(end = 12.dp)) {
                    Text("Bloqueo de app", fontWeight = FontWeight.SemiBold, color = titleColor)
                    Text(
                        if (lockAvailable) {
                            "Protege tu sesión con huella, rostro o PIN del dispositivo. " +
                                "Recomendado en dispositivos compartidos de campo."
                        } else {
                            "Activa un método de desbloqueo en los ajustes de tu dispositivo " +
                                "(huella, rostro o PIN) para usar esta función."
                        },
                        style = MaterialTheme.typography.bodySmall,
                        color = subtitleColor,
                    )
                }
                Switch(
                    checked = enabled,
                    enabled = lockAvailable,
                    onCheckedChange = { on ->
                        enabled = on
                        AppLock.setEnabled(context, on)
                    },
                )
            }

            if (enabled && lockAvailable) {
                Spacer(Modifier.height(14.dp))
                Text(
                    "Bloquear después de",
                    style = MaterialTheme.typography.labelMedium,
                    color = titleColor,
                    fontWeight = FontWeight.Medium,
                )
                Spacer(Modifier.height(8.dp))
                FlowRow(
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    AppLock.Timeout.entries.forEach { option ->
                        FilterChip(
                            selected = timeout == option,
                            onClick = {
                                timeout = option
                                AppLock.setTimeout(context, option)
                            },
                            label = { Text(option.label) },
                            colors = FilterChipDefaults.filterChipColors(
                                selectedContainerColor = Color(0xFFCCFBF1),
                                selectedLabelColor = NexaraTealDark,
                            ),
                        )
                    }
                }
                Spacer(Modifier.height(4.dp))
                Text(
                    timeoutDescription(timeout),
                    style = MaterialTheme.typography.bodySmall,
                    color = subtitleColor,
                )
            }
        }
    }
}

private fun timeoutDescription(timeout: AppLock.Timeout): String = when (timeout) {
    AppLock.Timeout.IMMEDIATE ->
        "La app se bloqueará cada vez que la dejes en segundo plano."
    AppLock.Timeout.ONE_MIN ->
        "La app se bloqueará si permanece en segundo plano más de 1 minuto."
    AppLock.Timeout.FIVE_MIN ->
        "La app se bloqueará si permanece en segundo plano más de 5 minutos."
    AppLock.Timeout.FIFTEEN_MIN ->
        "La app se bloqueará si permanece en segundo plano más de 15 minutos."
    AppLock.Timeout.THIRTY_MIN ->
        "La app se bloqueará si permanece en segundo plano más de 30 minutos."
}
