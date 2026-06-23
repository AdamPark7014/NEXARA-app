package mx.nexara.mobile.nativeapp.ui.screens

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
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
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.viewmodel.compose.viewModel
import mx.nexara.mobile.nativeapp.R

private val NexaraTeal = Color(0xFF0D9488)
private val NexaraTealDark = Color(0xFF0F766E)
private val FieldGray = Color(0xFFF1F5F9)

@Composable
fun LoginScreen(
    onLoggedIn: () -> Unit,
    contentPadding: PaddingValues = PaddingValues(0.dp),
) {
    val vm: LoginViewModel = viewModel()
    val state by vm.state.collectAsState()
    var showPassword by remember { mutableStateOf(false) }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(
                Brush.linearGradient(
                    colors = listOf(Color(0xFFE6F7F6), Color(0xFFEFF6FF)),
                )
            ),
        contentAlignment = Alignment.Center,
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 24.dp)
                .verticalScroll(rememberScrollState()),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Spacer(Modifier.height(32.dp))

            // Card blanca como en la web
            Card(
                modifier = Modifier.fillMaxWidth(),
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
                    // Logo con fondo redondeado teal suave (igual que la web)
                    Box(
                        modifier = Modifier
                            .size(90.dp)
                            .clip(RoundedCornerShape(22.dp))
                            .background(Color(0xFFCCFBF1)),
                        contentAlignment = Alignment.Center,
                    ) {
                        Image(
                            painter = painterResource(R.drawable.logo_nexara),
                            contentDescription = "Nexara",
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

                    Spacer(Modifier.height(6.dp))

                    Text(
                        "Iniciar sesión",
                        style = MaterialTheme.typography.headlineSmall.copy(fontWeight = FontWeight.Bold),
                        color = Color(0xFF0F172A),
                    )
                    Text(
                        "Ingresa a tu cuenta de Nexara",
                        style = MaterialTheme.typography.bodyMedium,
                        color = Color(0xFF64748B),
                        modifier = Modifier.padding(top = 4.dp),
                    )

                    // Perfiles de acceso rápido
                    if (state.quickProfiles.isNotEmpty()) {
                        Spacer(Modifier.height(20.dp))
                        Text(
                            "Acceso rápido",
                            style = MaterialTheme.typography.labelMedium,
                            color = Color(0xFF64748B),
                            modifier = Modifier.fillMaxWidth(),
                        )
                        Spacer(Modifier.height(8.dp))
                        LazyRow(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                        ) {
                            items(state.quickProfiles, key = { it.email }) { profile ->
                                Card(
                                    onClick = { vm.selectQuickProfile(profile) },
                                    shape = RoundedCornerShape(12.dp),
                                    colors = CardDefaults.cardColors(containerColor = Color(0xFFF0FDFA)),
                                    elevation = CardDefaults.cardElevation(0.dp),
                                ) {
                                    Column(modifier = Modifier.padding(horizontal = 14.dp, vertical = 10.dp)) {
                                        Text(
                                            profile.nombre.ifBlank { profile.email },
                                            style = MaterialTheme.typography.labelLarge.copy(fontWeight = FontWeight.SemiBold),
                                            color = NexaraTealDark,
                                        )
                                        Text(
                                            profile.email,
                                            style = MaterialTheme.typography.bodySmall,
                                            color = Color(0xFF64748B),
                                        )
                                    }
                                }
                            }
                        }
                    }

                    Spacer(Modifier.height(24.dp))

                    // Campo de correo
                    Text(
                        "Correo electrónico",
                        style = MaterialTheme.typography.labelMedium.copy(fontWeight = FontWeight.SemiBold),
                        color = Color(0xFF374151),
                        modifier = Modifier.fillMaxWidth(),
                    )
                    Spacer(Modifier.height(6.dp))
                    OutlinedTextField(
                        value = state.email,
                        onValueChange = vm::setEmail,
                        singleLine = true,
                        placeholder = { Text("correo@empresa.com", color = Color(0xFFADB5BD)) },
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email),
                        modifier = Modifier.fillMaxWidth(),
                        shape = RoundedCornerShape(12.dp),
                        colors = OutlinedTextFieldDefaults.colors(
                            focusedBorderColor = NexaraTeal,
                            unfocusedBorderColor = Color(0xFFCBD5E1),
                            focusedContainerColor = Color.White,
                            unfocusedContainerColor = FieldGray,
                        ),
                    )

                    Spacer(Modifier.height(16.dp))

                    // Campo de contraseña
                    Text(
                        "Contraseña",
                        style = MaterialTheme.typography.labelMedium.copy(fontWeight = FontWeight.SemiBold),
                        color = Color(0xFF374151),
                        modifier = Modifier.fillMaxWidth(),
                    )
                    Spacer(Modifier.height(6.dp))
                    OutlinedTextField(
                        value = state.password,
                        onValueChange = vm::setPassword,
                        singleLine = true,
                        placeholder = { Text("••••••••••••", color = Color(0xFFADB5BD)) },
                        visualTransformation = if (showPassword) VisualTransformation.None else PasswordVisualTransformation(),
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
                        trailingIcon = {
                            Text(
                                text = if (showPassword) "🙈" else "👁",
                                modifier = Modifier
                                    .clickable { showPassword = !showPassword }
                                    .padding(end = 12.dp),
                                fontSize = 18.sp,
                            )
                        },
                        modifier = Modifier.fillMaxWidth(),
                        shape = RoundedCornerShape(12.dp),
                        colors = OutlinedTextFieldDefaults.colors(
                            focusedBorderColor = NexaraTeal,
                            unfocusedBorderColor = Color(0xFFCBD5E1),
                            focusedContainerColor = Color.White,
                            unfocusedContainerColor = FieldGray,
                        ),
                    )

                    Spacer(Modifier.height(24.dp))

                    // Botón teal
                    Button(
                        onClick = { vm.submit(onLoggedIn) },
                        enabled = !state.isLoading && state.email.isNotBlank() && state.password.isNotBlank(),
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(52.dp),
                        shape = RoundedCornerShape(12.dp),
                        colors = ButtonDefaults.buttonColors(
                            containerColor = NexaraTeal,
                            disabledContainerColor = Color(0xFFB2DFDB),
                        ),
                    ) {
                        Text(
                            if (state.isLoading) "Entrando..." else "Entrar",
                            style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Bold),
                            color = Color.White,
                        )
                    }

                    if (!state.error.isNullOrBlank()) {
                        Spacer(Modifier.height(14.dp))
                        Text(
                            text = state.error!!,
                            color = MaterialTheme.colorScheme.error,
                            style = MaterialTheme.typography.bodyMedium,
                            textAlign = TextAlign.Center,
                        )
                    }
                }
            }

            Spacer(Modifier.height(24.dp))

            Text(
                "Tecnología que impulsa tu negocio",
                style = MaterialTheme.typography.bodySmall,
                color = Color(0xFF94A3B8),
            )

            Spacer(Modifier.height(32.dp))
        }
    }
}


