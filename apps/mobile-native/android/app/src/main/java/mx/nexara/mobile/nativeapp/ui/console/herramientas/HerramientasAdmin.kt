package mx.nexara.mobile.nativeapp.ui.console.herramientas

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import java.time.Instant
import java.time.LocalDate
import mx.nexara.mobile.nativeapp.data.api.KitAsignacionDto
import mx.nexara.mobile.nativeapp.data.api.KitPiezaDto
import mx.nexara.mobile.nativeapp.data.api.PrestamoHerramientaDto
import mx.nexara.mobile.nativeapp.data.api.RenovacionPendienteDto
import mx.nexara.mobile.nativeapp.ui.console.more.MoreCabecera
import mx.nexara.mobile.nativeapp.ui.console.more.MoreFilaDePastillas
import mx.nexara.mobile.nativeapp.ui.console.more.MorePastilla
import mx.nexara.mobile.nativeapp.ui.console.more.MoreTarjeta
import mx.nexara.mobile.nativeapp.ui.enterprise.NxColors
import mx.nexara.mobile.nativeapp.ui.enterprise.NxEmptyState
import mx.nexara.mobile.nativeapp.ui.enterprise.NxSearchField
import mx.nexara.mobile.nativeapp.ui.enterprise.NxStatusChip
import mx.nexara.mobile.nativeapp.ui.enterprise.NxTone

/**
 * Lo que dirección e Iván ven de toda la empresa: por aprobar, préstamos e inventario, y los diálogos
 * de Iván. Aquí no se decide nada: lo resuelve [HerramientasRules].
 */

/** Por aprobar: préstamos pedidos y prórrogas. Lo más viejo primero, que es lo que más lleva esperando. */
internal fun LazyListScope.seccionPorAprobar(
    prestamos: List<PrestamoHerramientaDto>,
    renovaciones: List<RenovacionPendienteDto>,
    hoy: LocalDate,
    enviando: Boolean,
    onAprobarPrestamo: (PrestamoHerramientaDto) -> Unit,
    onAprobarRenovacion: (RenovacionPendienteDto) -> Unit,
    onRechazar: (DialogoDeAlmacen) -> Unit,
) {
    if (prestamos.isEmpty() && renovaciones.isEmpty()) {
        item(key = "aprobar-vacio") {
            NxEmptyState(
                title = HerramientasRules.VACIO_POR_APROBAR.titulo,
                subtitle = HerramientasRules.VACIO_POR_APROBAR.texto,
            )
        }
        return
    }
    if (prestamos.isNotEmpty()) {
        item(key = "aprobar-prestamos") {
            MoreCabecera(titulo = "Préstamos pedidos", trailing = "${prestamos.size}")
        }
        items(prestamos, key = { "aprobar-p-${it.id}" }) { prestamo ->
            TarjetaPorAprobar(
                titulo = HerramientasRules.tituloPrestamo(prestamo),
                persona = HerramientasRules.personaDe(prestamo),
                detalle = listOfNotNull(
                    HerramientasRules.identificacionPrestamo(prestamo),
                    HerramientasRules.fechaCorta(prestamo.expectedReturnDate).takeIf { it.isNotEmpty() }
                        ?.let { "La regresa el $it" },
                ),
                motivo = prestamo.reason,
                enviando = enviando,
                onAprobar = { onAprobarPrestamo(prestamo) },
                onRechazar = { onRechazar(DialogoDeAlmacen.RechazarPrestamo(prestamo)) },
            )
        }
    }
    if (renovaciones.isNotEmpty()) {
        item(key = "aprobar-renovaciones") {
            MoreCabecera(titulo = "Más plazo", trailing = "${renovaciones.size}")
        }
        items(renovaciones, key = { "aprobar-r-${it.id ?: it.hashCode()}" }) { renovacion ->
            TarjetaPorAprobar(
                titulo = HerramientasRules.nombreRenovacion(renovacion),
                persona = HerramientasRules.quienPideRenovacion(renovacion),
                detalle = listOfNotNull(
                    HerramientasRules.fechaCorta(renovacion.newReturnDate).takeIf { it.isNotEmpty() }
                        ?.let { "La pide hasta el $it" },
                    HerramientasRules.textoPlazo(renovacion.toolRequest?.expectedReturnDate, hoy),
                ),
                motivo = renovacion.renewalReason,
                enviando = enviando,
                onAprobar = { onAprobarRenovacion(renovacion) },
                onRechazar = { onRechazar(DialogoDeAlmacen.RechazarRenovacion(renovacion)) },
            )
        }
    }
}

@Composable
private fun TarjetaPorAprobar(
    titulo: String,
    persona: String,
    detalle: List<String>,
    motivo: String?,
    enviando: Boolean,
    onAprobar: () -> Unit,
    onRechazar: () -> Unit,
) {
    MoreTarjeta {
        Text(
            titulo,
            style = MaterialTheme.typography.bodyLarge.copy(fontWeight = FontWeight.SemiBold),
            color = NxColors.Slate,
            maxLines = 2,
            overflow = TextOverflow.Ellipsis,
        )
        Text(persona, style = MaterialTheme.typography.bodyMedium, color = NxColors.Slate)
        detalle.forEach { renglon ->
            Text(renglon, style = MaterialTheme.typography.labelMedium, color = NxColors.Muted)
        }
        motivo?.trim()?.takeIf { it.isNotEmpty() }?.let {
            Text("«$it»", style = MaterialTheme.typography.bodySmall, color = NxColors.Muted, maxLines = 3)
        }
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Button(
                onClick = onAprobar,
                enabled = !enviando,
                colors = ButtonDefaults.buttonColors(containerColor = NxColors.Brand),
                modifier = Modifier.weight(1f).heightIn(min = AlturaToque),
            ) { Text("Aprobar", fontWeight = FontWeight.Bold) }
            OutlinedButton(
                onClick = onRechazar,
                enabled = !enviando,
                modifier = Modifier.weight(1f).heightIn(min = AlturaToque),
            ) { Text("Rechazar") }
        }
    }
}

/** Los préstamos abiertos de la empresa. Dirección los lee; Iván, además, entrega y recibe. */
internal fun LazyListScope.seccionEmpresa(
    prestamos: List<PrestamoHerramientaDto>,
    perfil: HerramientasRules.Perfil,
    filtro: HerramientasRules.FiltroEmpresa,
    total: Int,
    consulta: String,
    hoy: LocalDate,
    ahora: Instant,
    enviando: Boolean,
    onFiltro: (HerramientasRules.FiltroEmpresa) -> Unit,
    onBuscar: (String) -> Unit,
    onEntregar: (PrestamoHerramientaDto) -> Unit,
    onRecibir: (PrestamoHerramientaDto) -> Unit,
    onOtroCodigo: (PrestamoHerramientaDto) -> Unit,
) {
    item(key = "empresa-filtros") {
        MoreFilaDePastillas(
            HerramientasRules.FiltroEmpresa.entries.map { opcion ->
                MorePastilla(
                    etiqueta = opcion.etiqueta,
                    seleccionada = opcion == filtro,
                    onClick = { onFiltro(opcion) },
                )
            },
        )
    }
    if (total > 6) {
        item(key = "empresa-buscar") {
            NxSearchField(
                value = consulta,
                onValueChange = onBuscar,
                placeholder = "Buscar por herramienta, serie o persona",
            )
        }
    }
    if (prestamos.isEmpty()) {
        item(key = "empresa-vacio") {
            if (consulta.isNotBlank()) {
                NxEmptyState(
                    title = "Sin coincidencias",
                    subtitle = "Ningún préstamo coincide con «$consulta».",
                    actionLabel = "Limpiar búsqueda",
                    onAction = { onBuscar("") },
                )
            } else {
                val vacio = HerramientasRules.vacioPrestamosEmpresa(perfil, filtro, total)
                NxEmptyState(title = vacio.titulo, subtitle = vacio.texto)
            }
        }
        return
    }
    item(key = "empresa-cabecera") {
        MoreCabecera(
            titulo = filtro.etiqueta,
            subtitulo = "Primero lo vencido y lo que vence antes",
            trailing = "${prestamos.size}",
        )
    }
    items(prestamos, key = { "empresa-${it.id}" }) { prestamo ->
        TarjetaPrestamoEmpresa(
            prestamo = prestamo,
            hoy = hoy,
            accion = HerramientasRules.accionAlmacen(prestamo, ahora)
                .takeIf { HerramientasRules.puedeOperar(perfil) },
            enviando = enviando,
            onEntregar = { onEntregar(prestamo) },
            onRecibir = { onRecibir(prestamo) },
            onOtroCodigo = { onOtroCodigo(prestamo) },
        )
    }
}

/**
 * Un préstamo visto desde fuera: qué, quién y hasta cuándo. El código de recolección no sale aquí:
 * lo enseña quien la recoge, y es lo único que separa a cualquiera de llevarse la herramienta.
 */
@Composable
private fun TarjetaPrestamoEmpresa(
    prestamo: PrestamoHerramientaDto,
    hoy: LocalDate,
    accion: HerramientasRules.AccionAlmacen?,
    enviando: Boolean,
    onEntregar: () -> Unit,
    onRecibir: () -> Unit,
    onOtroCodigo: () -> Unit,
) {
    val devolver = HerramientasRules.fechaCorta(prestamo.expectedReturnDate)
    val plazo = HerramientasRules.textoPlazo(prestamo.expectedReturnDate, hoy)
    MoreTarjeta {
        Text(
            HerramientasRules.tituloPrestamo(prestamo),
            style = MaterialTheme.typography.bodyLarge.copy(fontWeight = FontWeight.SemiBold),
            color = NxColors.Slate,
            maxLines = 2,
            overflow = TextOverflow.Ellipsis,
        )
        Text(
            HerramientasRules.personaDe(prestamo),
            style = MaterialTheme.typography.bodyMedium,
            color = NxColors.Slate,
        )
        Text(
            HerramientasRules.identificacionPrestamo(prestamo),
            style = MaterialTheme.typography.labelMedium,
            color = NxColors.Muted,
        )
        Row(
            horizontalArrangement = Arrangement.spacedBy(6.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            NxStatusChip(
                HerramientasRules.etiquetaEstadoEmpresa(prestamo.status),
                HerramientasRules.tonoEstado(prestamo.status).nx(),
            )
            plazo?.let { NxStatusChip(it, HerramientasRules.tonoPlazo(prestamo.expectedReturnDate, hoy).nx()) }
        }
        if (devolver.isNotEmpty()) {
            Text("Devolver el $devolver", style = MaterialTheme.typography.labelSmall, color = NxColors.Muted)
        }
        accion?.let { hecha ->
            if (hecha == HerramientasRules.AccionAlmacen.NUEVO_CODIGO) {
                Text(
                    "El código para recogerla ya venció.",
                    style = MaterialTheme.typography.bodySmall,
                    color = NxColors.Danger,
                )
            }
            OutlinedButton(
                onClick = when (hecha) {
                    HerramientasRules.AccionAlmacen.ENTREGAR -> onEntregar
                    HerramientasRules.AccionAlmacen.RECIBIR -> onRecibir
                    HerramientasRules.AccionAlmacen.NUEVO_CODIGO -> onOtroCodigo
                },
                enabled = !enviando,
                modifier = Modifier.fillMaxWidth().heightIn(min = AlturaToque),
            ) {
                Text(hecha.etiqueta, color = NxColors.Brand, fontWeight = FontWeight.SemiBold)
            }
        }
    }
}

/** El inventario con quién trae cada pieza. El alta es el botón principal de la pantalla. */
internal fun LazyListScope.seccionInventario(
    piezas: List<KitPiezaDto>,
    total: Int,
    perfil: HerramientasRules.Perfil,
    prestamos: List<PrestamoHerramientaDto>,
    kits: List<KitAsignacionDto>,
    consulta: String,
    onBuscar: (String) -> Unit,
) {
    if (total > 6) {
        item(key = "inventario-buscar") {
            NxSearchField(
                value = consulta,
                onValueChange = onBuscar,
                placeholder = "Buscar por nombre, modelo, serie o código",
            )
        }
    }
    if (piezas.isEmpty()) {
        item(key = "inventario-vacio") {
            if (total > 0) {
                NxEmptyState(
                    title = "Sin coincidencias",
                    subtitle = "Ninguna herramienta coincide con «$consulta».",
                    actionLabel = "Limpiar búsqueda",
                    onAction = { onBuscar("") },
                )
            } else {
                val vacio = HerramientasRules.vacioInventario(perfil)
                NxEmptyState(title = vacio.titulo, subtitle = vacio.texto)
            }
        }
        return
    }
    item(key = "inventario-cabecera") {
        MoreCabecera(titulo = "Inventario", subtitulo = "En orden alfabético", trailing = "${piezas.size}")
    }
    items(piezas, key = { "pieza-${it.id ?: it.hashCode()}" }) { pieza ->
        MoreTarjeta {
            Text(
                HerramientasRules.tituloPieza(pieza),
                style = MaterialTheme.typography.bodyLarge.copy(fontWeight = FontWeight.SemiBold),
                color = NxColors.Slate,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
            )
            Text(
                HerramientasRules.renglonesPieza(pieza).joinToString("\n").ifEmpty { "Sin identificación registrada" },
                style = MaterialTheme.typography.labelMedium,
                color = NxColors.Muted,
                maxLines = 3,
                overflow = TextOverflow.Ellipsis,
            )
            Text(
                HerramientasRules.quienLaTrae(pieza, prestamos, kits),
                style = MaterialTheme.typography.bodyMedium.copy(fontWeight = FontWeight.SemiBold),
                color = NxColors.Slate,
            )
            NxStatusChip(
                HerramientasRules.etiquetaEstadoPieza(pieza.status),
                HerramientasRules.tonoEstadoPieza(pieza.status).nx(),
            )
        }
    }
}

/** Qué diálogo de almacén está abierto. */
internal sealed interface DialogoDeAlmacen {
    data class Entregar(val prestamo: PrestamoHerramientaDto) : DialogoDeAlmacen
    data class Recibir(val prestamo: PrestamoHerramientaDto) : DialogoDeAlmacen
    data class RechazarPrestamo(val prestamo: PrestamoHerramientaDto) : DialogoDeAlmacen
    data class RechazarRenovacion(val renovacion: RenovacionPendienteDto) : DialogoDeAlmacen
}

@Composable
internal fun DialogoAlmacen(
    dialogo: DialogoDeAlmacen,
    enviando: Boolean,
    error: String?,
    onCerrar: () -> Unit,
    onEntregar: (PrestamoHerramientaDto, String?) -> Unit,
    onRecibir: (PrestamoHerramientaDto, String?) -> Unit,
    onRechazarPrestamo: (PrestamoHerramientaDto, String) -> Unit,
    onRechazarRenovacion: (RenovacionPendienteDto, String) -> Unit,
) {
    when (dialogo) {
        is DialogoDeAlmacen.Entregar -> {
            val pideCodigo = HerramientasRules.pideCodigo(dialogo.prestamo)
            DialogoConTexto(
                titulo = HerramientasRules.tituloPrestamo(dialogo.prestamo),
                explicacion = if (pideCodigo) {
                    "Teclea el código que te enseña ${HerramientasRules.personaDe(dialogo.prestamo)}."
                } else {
                    "Se la entregas a ${HerramientasRules.personaDe(dialogo.prestamo)}."
                },
                etiquetaCampo = if (pideCodigo) "Código para recoger" else null,
                maximo = 12,
                confirmar = "Entregar",
                listo = { texto -> !pideCodigo || texto.isNotBlank() },
                enviando = enviando,
                error = error,
                onCerrar = onCerrar,
                onConfirmar = { texto -> onEntregar(dialogo.prestamo, texto.trim().takeIf { pideCodigo }) },
            )
        }
        is DialogoDeAlmacen.Recibir -> DialogoConTexto(
            titulo = HerramientasRules.tituloPrestamo(dialogo.prestamo),
            explicacion = "La regresa ${HerramientasRules.personaDe(dialogo.prestamo)}. " +
                "Con daño, queda en reparación.",
            etiquetaCampo = "¿Llegó con daño? Descríbelo (opcional)",
            confirmar = "Recibir",
            listo = { true },
            enviando = enviando,
            error = error,
            onCerrar = onCerrar,
            onConfirmar = { texto -> onRecibir(dialogo.prestamo, texto.trim().takeIf { it.isNotEmpty() }) },
        )
        is DialogoDeAlmacen.RechazarPrestamo -> DialogoConTexto(
            titulo = "Rechazar préstamo",
            explicacion = "${HerramientasRules.tituloPrestamo(dialogo.prestamo)} para " +
                "${HerramientasRules.personaDe(dialogo.prestamo)}. Este motivo lo verá en su préstamo.",
            etiquetaCampo = "¿Por qué?",
            confirmar = "Rechazar",
            listo = HerramientasRules::motivoValido,
            enviando = enviando,
            error = error,
            onCerrar = onCerrar,
            onConfirmar = { texto -> onRechazarPrestamo(dialogo.prestamo, texto) },
        )
        is DialogoDeAlmacen.RechazarRenovacion -> DialogoConTexto(
            titulo = "Rechazar más plazo",
            explicacion = "${HerramientasRules.nombreRenovacion(dialogo.renovacion)} de " +
                "${HerramientasRules.quienPideRenovacion(dialogo.renovacion)}. Se le avisa que no se aprobó.",
            etiquetaCampo = "¿Por qué?",
            confirmar = "Rechazar",
            listo = HerramientasRules::motivoValido,
            enviando = enviando,
            error = error,
            onCerrar = onCerrar,
            onConfirmar = { texto -> onRechazarRenovacion(dialogo.renovacion, texto) },
        )
    }
}

@Composable
internal fun DialogoReportarDanio(
    pieza: String,
    enviando: Boolean,
    error: String?,
    onCerrar: () -> Unit,
    onConfirmar: (String) -> Unit,
) {
    DialogoConTexto(
        titulo = "Reportar daño",
        explicacion = "$pieza. Cuenta qué le pasó: almacén lo revisa y dictamina.",
        etiquetaCampo = "¿Qué le pasó?",
        confirmar = "Reportar",
        listo = HerramientasRules::motivoValido,
        enviando = enviando,
        error = error,
        onCerrar = onCerrar,
        onConfirmar = onConfirmar,
    )
}

/** Un diálogo con una explicación y, si hace falta, un campo. Mientras falle se queda abierto. */
@Composable
private fun DialogoConTexto(
    titulo: String,
    explicacion: String,
    etiquetaCampo: String?,
    confirmar: String,
    listo: (String) -> Boolean,
    enviando: Boolean,
    error: String?,
    onCerrar: () -> Unit,
    onConfirmar: (String) -> Unit,
    maximo: Int = 500,
) {
    var texto by remember { mutableStateOf("") }
    AlertDialog(
        onDismissRequest = { if (!enviando) onCerrar() },
        title = {
            Text(
                titulo,
                style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Bold),
                color = NxColors.Slate,
            )
        },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Text(explicacion, style = MaterialTheme.typography.bodyMedium, color = NxColors.Slate)
                etiquetaCampo?.let { etiqueta ->
                    OutlinedTextField(
                        value = texto,
                        onValueChange = { texto = it.take(maximo) },
                        label = { Text(etiqueta) },
                        enabled = !enviando,
                        modifier = Modifier.fillMaxWidth(),
                    )
                }
                error?.let { Text(it, style = MaterialTheme.typography.bodySmall, color = NxColors.Danger) }
            }
        },
        confirmButton = {
            Button(
                onClick = { onConfirmar(texto) },
                enabled = !enviando && listo(texto),
                colors = ButtonDefaults.buttonColors(containerColor = NxColors.Brand),
                modifier = Modifier.heightIn(min = AlturaToque),
            ) { Text(if (enviando) "Enviando…" else confirmar, fontWeight = FontWeight.Bold) }
        },
        dismissButton = {
            TextButton(onClick = onCerrar, enabled = !enviando) { Text("Mejor no") }
        },
    )
}
