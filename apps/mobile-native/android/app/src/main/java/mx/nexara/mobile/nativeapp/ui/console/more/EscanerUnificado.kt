package mx.nexara.mobile.nativeapp.ui.console.more

import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import kotlinx.coroutines.launch
import mx.nexara.mobile.nativeapp.data.api.StockAlmacenDto
import mx.nexara.mobile.nativeapp.data.api.isForbidden
import mx.nexara.mobile.nativeapp.data.api.toUserMessage
import mx.nexara.mobile.nativeapp.data.console.EscaneoRepository
import mx.nexara.mobile.nativeapp.ui.common.EscanearOEscribirCodigo
import mx.nexara.mobile.nativeapp.ui.common.FormatosDeEscaneo
import mx.nexara.mobile.nativeapp.ui.console.herramientas.AccionDeHerramienta
import mx.nexara.mobile.nativeapp.ui.console.herramientas.HerramientaEscaneada
import mx.nexara.mobile.nativeapp.ui.console.more.EscaneoRules.ResultadoEscaneo
import mx.nexara.mobile.nativeapp.ui.enterprise.NxColors
import retrofit2.HttpException

/**
 * El escáner de Almacén y el de Herramientas son el mismo: cualquiera de los dos
 * resuelve una etiqueta de herramienta o un código de artículo
 * ([EscaneoRules.resolver] decide qué se busca primero) y pinta lo encontrado con
 * las tarjetas de siempre: herramienta con entregar/recibir, artículo con
 * «Registrar movimiento», o el alta por código si no existe.
 *
 * Quien no puede abrir Almacén ([puedeAlmacen] en falso) solo busca herramientas,
 * como antes, y un código que no lo es dice «No es una herramienta registrada».
 *
 * [enAlmacen] solo cambia textos: el título y cómo se explica un 403.
 */
@Composable
internal fun EscanerDeCodigos(
    enAlmacen: Boolean,
    puedeAlmacen: Boolean,
    onMovimiento: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val context = LocalContext.current
    val repo = remember(context) { EscaneoRepository(context) }
    val scope = rememberCoroutineScope()

    var buscando by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var aviso by remember { mutableStateOf<String?>(null) }
    var resultado by remember { mutableStateOf<ResultadoEscaneo?>(null) }
    var almacenes by remember { mutableStateOf<List<StockAlmacenDto>?>(null) }

    val titulo = EscaneoRules.tituloEscaner(enAlmacen, puedeAlmacen)
    val accionConsulta = if (enAlmacen) "consultar el almacén" else "consultar herramientas"

    fun buscar(valor: String, avisoPrevio: String? = null) {
        val motivo = EscaneoRules.motivoInvalido(valor, puedeAlmacen)
        if (motivo != null) {
            error = motivo
            return
        }
        scope.launch {
            buscando = true
            error = null
            aviso = avisoPrevio
            try {
                val r = EscaneoRules.resolver(
                    valor = valor,
                    puedeAlmacen = puedeAlmacen,
                    buscarHerramienta = { repo.herramientaPorCodigo(it) },
                    buscarArticulo = { repo.productoPorCodigo(it) },
                    codigoHttp = { (it as? HttpException)?.code() },
                )
                resultado = r
                if (r is ResultadoEscaneo.Articulo && almacenes == null) {
                    almacenes = runCatching { repo.almacenes() }.getOrDefault(emptyList())
                }
            } catch (e: Exception) {
                resultado = null
                val texto = e.toUserMessage("No se pudo buscar el código")
                error = if (e.isForbidden()) EscaneoRules.textoSinPermiso(accionConsulta, texto) else texto
            } finally {
                buscando = false
            }
        }
    }

    MoreTarjeta(modifier = modifier) {
        Text(
            titulo,
            style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Bold),
            color = NxColors.Slate,
        )
        Text(
            EscaneoRules.subtituloEscaner(enAlmacen, puedeAlmacen),
            style = MaterialTheme.typography.labelMedium,
            color = NxColors.Muted,
        )
        EscanearOEscribirCodigo(
            titulo = titulo,
            // Code 128 va en los dos: con Almacén se suman EAN/UPC de los artículos.
            formatos = if (puedeAlmacen) FormatosDeEscaneo.PRODUCTO else FormatosDeEscaneo.ETIQUETA_HERRAMIENTA,
            buscando = buscando,
            onCodigo = { buscar(it) },
            etiquetaCampo = if (puedeAlmacen) "Código de barras o etiqueta" else "Código de la etiqueta",
            mayusculas = !enAlmacen,
        )
        error?.let { Text(it, style = MaterialTheme.typography.bodyMedium, color = NxColors.Danger) }
        aviso?.let {
            Text(it, style = MaterialTheme.typography.bodyMedium.copy(fontWeight = FontWeight.SemiBold), color = NxColors.Success)
        }

        when (val actual = resultado) {
            is ResultadoEscaneo.Herramienta -> {
                val r = actual.r
                HorizontalDivider()
                HerramientaEscaneada(r)
                AccionDeHerramienta(
                    r = r,
                    repo = repo,
                    onHecho = { mensaje ->
                        onMovimiento()
                        buscar(r.codigo.orEmpty(), avisoPrevio = mensaje)
                    },
                )
                TextButton(onClick = { resultado = null; aviso = null; error = null }) { Text("Escanear otra") }
            }
            is ResultadoEscaneo.Articulo -> {
                val r = actual.r
                HorizontalDivider()
                ProductoEscaneado(r)
                MovimientoPorCodigo(
                    r = r,
                    almacenes = almacenes,
                    repo = repo,
                    onHecho = { mensaje ->
                        onMovimiento()
                        buscar(r.codigoBarras ?: r.product?.sku.orEmpty(), avisoPrevio = mensaje)
                    },
                )
                TextButton(onClick = { resultado = null; aviso = null; error = null }) { Text("Escanear otro") }
            }
            is ResultadoEscaneo.NoEncontrado -> {
                HorizontalDivider()
                if (actual.puedeDarDeAlta) {
                    AltaPorCodigo(
                        codigo = actual.codigo,
                        repo = repo,
                        onCreado = { buscar(actual.codigo, avisoPrevio = "Producto dado de alta.") },
                        onCancelar = { resultado = null },
                    )
                } else {
                    Text(
                        EscaneoRules.TEXTO_NO_ES_HERRAMIENTA,
                        style = MaterialTheme.typography.bodyLarge.copy(fontWeight = FontWeight.SemiBold),
                        color = NxColors.Slate,
                    )
                    Text("Código «${actual.codigo}»", style = MaterialTheme.typography.labelMedium, color = NxColors.Muted)
                    TextButton(onClick = { resultado = null; aviso = null; error = null }) { Text("Escanear otra") }
                }
            }
            null -> Unit
        }
    }
}
