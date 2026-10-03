package mx.nexara.mobile.nativeapp.ui.console.more

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.launch
import mx.nexara.mobile.nativeapp.data.api.AltaPorCodigoRequest
import mx.nexara.mobile.nativeapp.data.api.MovimientoPorCodigoRequest
import mx.nexara.mobile.nativeapp.data.api.ProductoPorCodigoDto
import mx.nexara.mobile.nativeapp.data.api.StockAlmacenDto
import mx.nexara.mobile.nativeapp.data.api.isForbidden
import mx.nexara.mobile.nativeapp.data.api.toUserMessage
import mx.nexara.mobile.nativeapp.data.console.EscaneoRepository
import mx.nexara.mobile.nativeapp.ui.common.CodigoBarrasRules
import mx.nexara.mobile.nativeapp.ui.common.EscanearOEscribirCodigo
import mx.nexara.mobile.nativeapp.ui.common.FormatosDeEscaneo
import mx.nexara.mobile.nativeapp.ui.enterprise.NxColors
import retrofit2.HttpException

/** Qué se está viendo después de escanear. */
private sealed interface EscaneoAlmacen {
    data class Encontrado(val r: ProductoPorCodigoDto) : EscaneoAlmacen
    data class NoExiste(val codigo: String) : EscaneoAlmacen
}

private fun Throwable.mensajeAlmacen(accion: String, fallback: String): String =
    if (isForbidden()) EscaneoRules.textoSinPermiso(accion, toUserMessage(fallback)) else toUserMessage(fallback)

/**
 * Escáner de Almacén: lee EAN-13/EAN-8/UPC-A/UPC-E/Code 128 con la cámara (o se
 * teclea), enseña el producto con sus existencias y deja registrar una entrada o
 * una salida. Si el código no existe, ofrece darlo de alta con los datos del
 * catálogo internacional ya puestos.
 */
@Composable
fun EscanerDeAlmacen(onMovimiento: () -> Unit, modifier: Modifier = Modifier) {
    val context = LocalContext.current
    val repo = remember(context) { EscaneoRepository(context) }
    val scope = rememberCoroutineScope()

    var buscando by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var aviso by remember { mutableStateOf<String?>(null) }
    var estado by remember { mutableStateOf<EscaneoAlmacen?>(null) }
    var almacenes by remember { mutableStateOf<List<StockAlmacenDto>?>(null) }

    fun buscar(valor: String, avisoPrevio: String? = null) {
        val motivo = CodigoBarrasRules.motivoInvalido(valor)
        if (motivo != null) {
            error = motivo
            return
        }
        val codigo = CodigoBarrasRules.limpiar(valor)
        scope.launch {
            buscando = true
            error = null
            aviso = avisoPrevio
            try {
                estado = EscaneoAlmacen.Encontrado(repo.productoPorCodigo(codigo))
                if (almacenes == null) almacenes = runCatching { repo.almacenes() }.getOrDefault(emptyList())
            } catch (e: Exception) {
                if ((e as? HttpException)?.code() == 404) {
                    estado = EscaneoAlmacen.NoExiste(codigo)
                } else {
                    estado = null
                    error = e.mensajeAlmacen("consultar el almacén", "No se pudo buscar el código")
                }
            } finally {
                buscando = false
            }
        }
    }

    MoreTarjeta(modifier = modifier) {
        Text(
            "Escanear producto",
            style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Bold),
            color = NxColors.Slate,
        )
        Text(
            "Lee el código de barras o escríbelo para ver existencias y registrar entradas o salidas.",
            style = MaterialTheme.typography.labelMedium,
            color = NxColors.Muted,
        )
        EscanearOEscribirCodigo(
            titulo = "Escanear producto",
            formatos = FormatosDeEscaneo.PRODUCTO,
            buscando = buscando,
            onCodigo = { buscar(it) },
        )
        error?.let { Text(it, style = MaterialTheme.typography.bodyMedium, color = NxColors.Danger) }
        aviso?.let {
            Text(it, style = MaterialTheme.typography.bodyMedium.copy(fontWeight = FontWeight.SemiBold), color = NxColors.Success)
        }

        when (val actual = estado) {
            is EscaneoAlmacen.Encontrado -> {
                HorizontalDivider()
                ProductoEscaneado(actual.r)
                MovimientoPorCodigo(
                    r = actual.r,
                    almacenes = almacenes,
                    repo = repo,
                    onHecho = { mensaje ->
                        onMovimiento()
                        buscar(actual.r.codigoBarras ?: actual.r.product?.sku.orEmpty(), avisoPrevio = mensaje)
                    },
                )
                TextButton(onClick = { estado = null; aviso = null; error = null }) { Text("Escanear otro") }
            }
            is EscaneoAlmacen.NoExiste -> {
                HorizontalDivider()
                AltaPorCodigo(
                    codigo = actual.codigo,
                    repo = repo,
                    onCreado = { buscar(actual.codigo, avisoPrevio = "Producto dado de alta.") },
                    onCancelar = { estado = null },
                )
            }
            null -> Unit
        }
    }
}

@Composable
private fun ProductoEscaneado(r: ProductoPorCodigoDto) {
    val p = r.product
    Text(
        p?.name?.takeIf { it.isNotBlank() } ?: "Producto",
        style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Bold),
        color = NxColors.Slate,
    )
    val tipo = CodigoBarrasRules.etiquetaTipo(CodigoBarrasRules.clasificar(r.codigoBarras).tipo)
    Text(
        listOfNotNull(
            p?.sku?.takeIf { it.isNotBlank() }?.let { "Clave $it" },
            r.codigoBarras?.let { "$tipo $it" },
        ).joinToString(" · "),
        style = MaterialTheme.typography.labelMedium,
        color = NxColors.Muted,
    )
    if (r.match == "empaque") {
        Text(
            "Leíste una caja: las cantidades cuentan ${EscaneoRules.unidad(r)}.",
            style = MaterialTheme.typography.labelMedium,
            color = NxColors.Muted,
        )
    }
    val existencias = r.existencias.orEmpty()
    Text(
        "Existencia total: ${AlmacenRules.formato(EscaneoRules.totalExistencia(existencias))}",
        style = MaterialTheme.typography.bodyLarge.copy(fontWeight = FontWeight.SemiBold),
        color = NxColors.Slate,
    )
    if (existencias.isEmpty()) {
        Text("Sin existencia en ningún almacén.", style = MaterialTheme.typography.bodyMedium, color = NxColors.Muted)
    }
    existencias.forEach { e ->
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            Text(e.almacen ?: "Almacén", style = MaterialTheme.typography.bodyMedium, color = NxColors.Slate)
            val reservado = e.reservado?.takeIf { it > 0 }?.let { " (${AlmacenRules.formato(it)} apartado)" }.orEmpty()
            Text(
                "${AlmacenRules.formato(e.cantidad)}$reservado",
                style = MaterialTheme.typography.bodyMedium.copy(fontWeight = FontWeight.SemiBold),
                color = NxColors.Slate,
            )
        }
    }
}

@Composable
private fun MovimientoPorCodigo(
    r: ProductoPorCodigoDto,
    almacenes: List<StockAlmacenDto>?,
    repo: EscaneoRepository,
    onHecho: (String) -> Unit,
) {
    val scope = rememberCoroutineScope()
    var movimiento by remember(r.codigoBarras) { mutableStateOf(EscaneoRules.Movimiento.ENTRADA) }
    var almacenId by remember(r.codigoBarras) { mutableStateOf<Long?>(null) }
    var cantidadTexto by remember(r.codigoBarras) { mutableStateOf("") }
    var notas by remember(r.codigoBarras) { mutableStateOf("") }
    var guardando by remember { mutableStateOf(false) }
    var error by remember(r.codigoBarras) { mutableStateOf<String?>(null) }

    val opciones = EscaneoRules.almacenesPara(movimiento, r.existencias, almacenes)
    // Lo elegido deja de valer si cambia el tipo de movimiento; con una sola opción no hay que elegir.
    val elegido = almacenId?.takeIf { id -> opciones.any { it.id == id } } ?: opciones.singleOrNull()?.id
    val unidad = EscaneoRules.unidad(r)

    HorizontalDivider()
    Text("Registrar movimiento", style = MaterialTheme.typography.titleSmall.copy(fontWeight = FontWeight.Bold), color = NxColors.Slate)
    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        EscaneoRules.Movimiento.entries.forEach { opcion ->
            val elegida = opcion == movimiento
            if (elegida) {
                Button(
                    onClick = {},
                    colors = ButtonDefaults.buttonColors(containerColor = NxColors.Brand),
                    modifier = Modifier.weight(1f).heightIn(min = 48.dp),
                ) { Text(opcion.etiqueta, fontWeight = FontWeight.Bold) }
            } else {
                OutlinedButton(
                    onClick = { movimiento = opcion; error = null },
                    modifier = Modifier.weight(1f).heightIn(min = 48.dp),
                ) { Text(opcion.etiqueta) }
            }
        }
    }
    Text(
        if (movimiento == EscaneoRules.Movimiento.SALIDA) "¿De qué almacén sale?" else "¿A qué almacén entra?",
        style = MaterialTheme.typography.labelMedium,
        color = NxColors.Muted,
    )
    if (opciones.isEmpty()) {
        Text(
            if (movimiento == EscaneoRules.Movimiento.SALIDA) {
                "No hay existencia de este producto en ningún almacén."
            } else {
                "No se pudieron leer los almacenes de la empresa."
            },
            style = MaterialTheme.typography.bodyMedium,
            color = NxColors.Muted,
        )
    }
    opciones.forEach { opcion ->
        Row(
            verticalAlignment = Alignment.CenterVertically,
            modifier = Modifier.fillMaxWidth().clickable { almacenId = opcion.id },
        ) {
            RadioButton(selected = elegido == opcion.id, onClick = { almacenId = opcion.id })
            Text(opcion.nombre, style = MaterialTheme.typography.bodyMedium, color = NxColors.Slate)
        }
    }
    OutlinedTextField(
        value = cantidadTexto,
        onValueChange = { cantidadTexto = it.take(12) },
        label = { Text("Cantidad ($unidad)") },
        singleLine = true,
        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
        modifier = Modifier.fillMaxWidth(),
    )
    OutlinedTextField(
        value = notas,
        onValueChange = { notas = it.take(300) },
        label = { Text("Nota (opcional)") },
        modifier = Modifier.fillMaxWidth(),
    )
    error?.let { Text(it, style = MaterialTheme.typography.bodyMedium, color = NxColors.Danger) }
    Button(
        onClick = {
            val cantidad = CodigoBarrasRules.parseCantidad(cantidadTexto)
            val disponible = r.existencias?.firstOrNull { it.warehouseId == elegido }?.let { EscaneoRules.disponible(it) }
            val invalido = EscaneoRules.errorMovimiento(
                cantidad = cantidad,
                almacenId = elegido,
                // En cajas no se compara: la existencia está en piezas.
                disponibleEnOrigen = disponible.takeIf { r.match != "empaque" },
                movimiento = movimiento,
            )
            if (invalido != null || cantidad == null) {
                error = invalido
                return@Button
            }
            scope.launch {
                guardando = true
                error = null
                try {
                    val codigo = r.codigoBarras ?: r.product?.sku.orEmpty()
                    repo.movimientoPorCodigo(
                        MovimientoPorCodigoRequest(
                            codigo = codigo,
                            type = movimiento.api,
                            quantity = cantidad,
                            fromWarehouseId = elegido.takeIf { movimiento == EscaneoRules.Movimiento.SALIDA },
                            toWarehouseId = elegido.takeIf { movimiento == EscaneoRules.Movimiento.ENTRADA },
                            notes = notas.trim().takeIf { it.isNotEmpty() },
                        ),
                    )
                    onHecho(EscaneoRules.avisoMovimiento(movimiento, cantidad, unidad, r.product?.name))
                } catch (e: Exception) {
                    error = e.mensajeAlmacen("registrar movimientos de almacén", "No se pudo registrar el movimiento")
                } finally {
                    guardando = false
                }
            }
        },
        enabled = !guardando,
        colors = ButtonDefaults.buttonColors(containerColor = NxColors.Brand),
        modifier = Modifier.fillMaxWidth().heightIn(min = 52.dp),
    ) {
        Text(
            if (guardando) "Registrando…" else "Registrar ${movimiento.etiqueta.lowercase()}",
            fontWeight = FontWeight.Bold,
        )
    }
}

@Composable
private fun AltaPorCodigo(
    codigo: String,
    repo: EscaneoRepository,
    onCreado: () -> Unit,
    onCancelar: () -> Unit,
) {
    val scope = rememberCoroutineScope()
    var abierto by remember(codigo) { mutableStateOf(false) }
    var consultando by remember(codigo) { mutableStateOf(false) }
    var fuente by remember(codigo) { mutableStateOf<String?>(null) }
    var nombre by remember(codigo) { mutableStateOf("") }
    var sku by remember(codigo) { mutableStateOf("") }
    var marca by remember(codigo) { mutableStateOf("") }
    var modelo by remember(codigo) { mutableStateOf("") }
    var unidad by remember(codigo) { mutableStateOf("") }
    var descripcion by remember(codigo) { mutableStateOf("") }
    var imagenUrl by remember(codigo) { mutableStateOf<String?>(null) }
    var categoria by remember(codigo) { mutableStateOf<String?>(null) }
    var guardando by remember { mutableStateOf(false) }
    var error by remember(codigo) { mutableStateOf<String?>(null) }

    Text(
        "No hay producto con el código «$codigo».",
        style = MaterialTheme.typography.bodyLarge.copy(fontWeight = FontWeight.SemiBold),
        color = NxColors.Slate,
    )
    if (!abierto) {
        Text(
            "Si es un producto nuevo, puedes darlo de alta con este código.",
            style = MaterialTheme.typography.labelMedium,
            color = NxColors.Muted,
        )
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Button(
                onClick = {
                    abierto = true
                    if (!CodigoBarrasRules.esConsultableInternacional(codigo)) return@Button
                    scope.launch {
                        consultando = true
                        try {
                            val r = repo.consultaUpc(codigo)
                            val p = r.producto
                            if (r.encontrado == true && p != null) {
                                if (nombre.isBlank()) nombre = p.nombre.orEmpty()
                                if (marca.isBlank()) marca = p.marca.orEmpty()
                                if (modelo.isBlank()) modelo = p.modelo.orEmpty()
                                if (descripcion.isBlank()) descripcion = p.descripcion.orEmpty()
                                imagenUrl = p.imagenUrl
                                categoria = p.categoria
                                fuente = "Datos sugeridos del catálogo internacional. Revísalos antes de guardar."
                            } else {
                                fuente = r.mensaje?.takeIf { it.isNotBlank() }
                                    ?: "El catálogo internacional no conoce este código: escribe los datos."
                            }
                        } catch (e: Exception) {
                            // Sin catálogo se captura a mano; un 403 aquí anticipa el del alta.
                            fuente = if (e.isForbidden()) {
                                EscaneoRules.textoSinPermiso("dar de alta productos", e.toUserMessage(""))
                            } else {
                                "No se pudo consultar el catálogo internacional: escribe los datos."
                            }
                        } finally {
                            consultando = false
                        }
                    }
                },
                colors = ButtonDefaults.buttonColors(containerColor = NxColors.Brand),
                modifier = Modifier.heightIn(min = 48.dp),
            ) { Text("Dar de alta", fontWeight = FontWeight.Bold) }
            TextButton(onClick = onCancelar) { Text("Cancelar") }
        }
        return
    }

    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        if (consultando) {
            Text("Buscando datos del código…", style = MaterialTheme.typography.labelMedium, color = NxColors.Muted)
        }
        fuente?.let { Text(it, style = MaterialTheme.typography.labelMedium, color = NxColors.Muted) }
        OutlinedTextField(
            value = nombre,
            onValueChange = { nombre = it.take(255) },
            label = { Text("Nombre del producto *") },
            modifier = Modifier.fillMaxWidth(),
        )
        OutlinedTextField(
            value = sku,
            onValueChange = { sku = it.take(60) },
            label = { Text("Clave / SKU (opcional, se genera sola)") },
            singleLine = true,
            modifier = Modifier.fillMaxWidth(),
        )
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            OutlinedTextField(
                value = marca,
                onValueChange = { marca = it.take(200) },
                label = { Text("Marca") },
                singleLine = true,
                modifier = Modifier.weight(1f),
            )
            OutlinedTextField(
                value = modelo,
                onValueChange = { modelo = it.take(120) },
                label = { Text("Modelo") },
                singleLine = true,
                modifier = Modifier.weight(1f),
            )
        }
        OutlinedTextField(
            value = unidad,
            onValueChange = { unidad = it.take(50) },
            label = { Text("Unidad (pieza, metro, caja…)") },
            singleLine = true,
            modifier = Modifier.fillMaxWidth(),
        )
        error?.let { Text(it, style = MaterialTheme.typography.bodyMedium, color = NxColors.Danger) }
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Button(
                onClick = {
                    if (nombre.isBlank()) {
                        error = "Escribe el nombre del producto"
                        return@Button
                    }
                    scope.launch {
                        guardando = true
                        error = null
                        try {
                            repo.altaPorCodigo(
                                AltaPorCodigoRequest(
                                    codigo = codigo,
                                    name = nombre.trim(),
                                    sku = sku.trim().takeIf { it.isNotEmpty() },
                                    marca = marca.trim().takeIf { it.isNotEmpty() },
                                    modelo = modelo.trim().takeIf { it.isNotEmpty() },
                                    descripcion = descripcion.trim().takeIf { it.isNotEmpty() },
                                    imagenUrl = imagenUrl,
                                    categoria = categoria,
                                    unidad = unidad.trim().takeIf { it.isNotEmpty() },
                                ),
                            )
                            onCreado()
                        } catch (e: Exception) {
                            error = e.mensajeAlmacen("dar de alta productos", "No se pudo dar de alta el producto")
                        } finally {
                            guardando = false
                        }
                    }
                },
                enabled = !guardando,
                colors = ButtonDefaults.buttonColors(containerColor = NxColors.Brand),
                modifier = Modifier.weight(1f).heightIn(min = 52.dp),
            ) { Text(if (guardando) "Guardando…" else "Crear producto", fontWeight = FontWeight.Bold) }
            TextButton(onClick = onCancelar, enabled = !guardando) { Text("Cancelar") }
        }
    }
}
