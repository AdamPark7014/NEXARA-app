package mx.nexara.mobile.nativeapp.ui.ventas

import android.app.Application
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Remove
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.Receipt
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.rememberScrollState
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Slider
import androidx.compose.material3.TextButton
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.compose.viewModel
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import mx.nexara.mobile.nativeapp.ui.common.NxAsyncImage
import mx.nexara.mobile.nativeapp.data.api.CommercialRuleDto
import mx.nexara.mobile.nativeapp.data.api.LogisticsZoneDto
import mx.nexara.mobile.nativeapp.data.api.MarginCheckDto
import mx.nexara.mobile.nativeapp.data.api.SmartOfferDto
import mx.nexara.mobile.nativeapp.data.api.toAbsoluteAssetUrl
import mx.nexara.mobile.nativeapp.data.crm.QuoteCartLine
import mx.nexara.mobile.nativeapp.data.crm.SmartQuoteRepository
import mx.nexara.mobile.nativeapp.data.crm.badgeLabelEs
import mx.nexara.mobile.nativeapp.data.crm.codesForCity
import mx.nexara.mobile.nativeapp.data.crm.formatLeadTimeDays
import mx.nexara.mobile.nativeapp.data.crm.formatStockByWarehouse
import mx.nexara.mobile.nativeapp.data.crm.hasPromotion
import mx.nexara.mobile.nativeapp.data.crm.sortedWarehouseRows
import mx.nexara.mobile.nativeapp.data.crm.stockAtPreferred
import mx.nexara.mobile.nativeapp.data.crm.warehouseLabel
import mx.nexara.mobile.nativeapp.data.crm.warehouseRowLabel
import mx.nexara.mobile.nativeapp.ui.enterprise.NxColors
import mx.nexara.mobile.nativeapp.ui.enterprise.NxEmptyState
import mx.nexara.mobile.nativeapp.ui.enterprise.NxSearchField
import mx.nexara.mobile.nativeapp.ui.enterprise.NxSectionHeader
import mx.nexara.mobile.nativeapp.ui.enterprise.NxSkeletonList
import mx.nexara.mobile.nativeapp.ui.enterprise.NxSnackbarHost
import mx.nexara.mobile.nativeapp.ui.enterprise.NxStatusChip
import mx.nexara.mobile.nativeapp.ui.enterprise.NxTone
import mx.nexara.mobile.nativeapp.ui.enterprise.rememberNxSnackbarHostState

data class SmartQuoteUiState(
    val loading: Boolean = false,
    val saving: Boolean = false,
    val error: String? = null,
    val query: String = "",
    val results: List<SmartOfferDto> = emptyList(),
    val cart: List<QuoteCartLine> = emptyList(),
    val clientName: String = "",
    val projectName: String = "",
    val targetMargin: Int = 30,
    val optimizeMode: String = "BALANCE",
    val showCosts: Boolean = true,
    val catalogCount: Int = 0,
    val savedQuoteId: Long? = null,
    val brands: List<String> = emptyList(),
    val categories: List<String> = emptyList(),
    val selectedBrand: String? = null,
    val selectedCategory: String? = null,
    val copilotPrompt: String = "",
    val copilotLoading: Boolean = false,
    val copilotNote: String? = null,
    val substitutes: List<SmartOfferDto> = emptyList(),
    val substituteFor: String? = null,
    val laborLoading: Boolean = false,
    val step: Int = 1,
    val clientNameError: String? = null,
    val configureLoading: Boolean = false,
    val logisticsZones: List<LogisticsZoneDto> = emptyList(),
    val selectedLogisticsZone: String? = null,
    val marginRules: List<CommercialRuleDto> = emptyList(),
    val lineMarginChecks: Map<Int, MarginCheckDto> = emptyMap(),
)

class SmartQuoteViewModel(app: Application) : AndroidViewModel(app) {
    private val repo = SmartQuoteRepository(app.applicationContext)
    private val _state = MutableStateFlow(SmartQuoteUiState())
    val state: StateFlow<SmartQuoteUiState> = _state
    private var searchJob: Job? = null
    private var marginCheckJob: Job? = null

    init {
        viewModelScope.launch {
            val n = repo.ctProductCount()
            _state.update { it.copy(catalogCount = n) }
            runCatching { repo.facets() }.onSuccess { f ->
                _state.update {
                    it.copy(
                        brands = f.brands.mapNotNull { b -> b.name }.filter { n -> n.isNotBlank() }.take(12),
                        categories = f.categories.mapNotNull { c -> c.name }.filter { n -> n.isNotBlank() }.take(12),
                    )
                }
            }
            val rules = repo.marginRules()
            val zones = repo.logisticsZones()
            _state.update {
                it.copy(
                    marginRules = rules.filter { r -> r.active && r.scope == "CATEGORY" && r.minMarginPercent != null },
                    logisticsZones = zones.filter { z -> z.active },
                    selectedLogisticsZone = zones.firstOrNull { z -> z.zoneCode == "LOCAL_PUE" }?.zoneCode
                        ?: zones.firstOrNull()?.zoneCode,
                )
            }
        }
    }

    private fun scheduleMarginChecks() {
        marginCheckJob?.cancel()
        val cart = _state.value.cart
        if (cart.isEmpty()) {
            _state.update { it.copy(lineMarginChecks = emptyMap()) }
            return
        }
        marginCheckJob = viewModelScope.launch {
            delay(300)
            val checks = mutableMapOf<Int, MarginCheckDto>()
            cart.forEachIndexed { idx, line ->
                if (line.unitCost <= 0 || line.unitPrice <= 0) return@forEachIndexed
                runCatching {
                    repo.checkMargin(line.unitCost, line.unitPrice, line.category ?: line.brand, line.brand)
                }.onSuccess { checks[idx] = it }
            }
            _state.update { it.copy(lineMarginChecks = checks) }
        }
    }

    fun setQuery(q: String) {
        _state.update { it.copy(query = q, error = null) }
        searchJob?.cancel()
        if (q.length < 2 && _state.value.selectedBrand == null && _state.value.selectedCategory == null) {
            _state.update { it.copy(results = emptyList(), loading = false) }
            return
        }
        searchJob = viewModelScope.launch {
            delay(350)
            performSearch()
        }
    }

    private suspend fun performSearch() {
        val s = _state.value
        _state.update { it.copy(loading = true) }
        try {
            val list = repo.search(s.query, s.targetMargin, s.optimizeMode, s.selectedBrand, s.selectedCategory)
            _state.update { it.copy(loading = false, results = list) }
        } catch (e: Exception) {
            _state.update { it.copy(loading = false, error = e.message ?: "Error de búsqueda") }
        }
    }

    fun setClientName(v: String) = _state.update { it.copy(clientName = v, clientNameError = null) }
    fun setProjectName(v: String) = _state.update { it.copy(projectName = v) }
    fun toggleCosts() = _state.update { it.copy(showCosts = !it.showCosts) }
    fun setTargetMargin(v: Int) {
        _state.update { it.copy(targetMargin = v.coerceIn(5, 80)) }
        searchJob?.cancel()
        searchJob = viewModelScope.launch { delay(200); performSearch() }
        scheduleMarginChecks()
    }
    fun setOptimizeMode(mode: String) {
        _state.update { it.copy(optimizeMode = mode) }
        searchJob?.cancel()
        searchJob = viewModelScope.launch { performSearch() }
    }
    fun setBrand(brand: String?) {
        _state.update { it.copy(selectedBrand = brand) }
        searchJob?.cancel()
        searchJob = viewModelScope.launch { performSearch() }
    }
    fun setCategory(category: String?) {
        _state.update { it.copy(selectedCategory = category) }
        searchJob?.cancel()
        searchJob = viewModelScope.launch { performSearch() }
    }
    fun setCopilotPrompt(v: String) = _state.update { it.copy(copilotPrompt = v) }
    fun setLogisticsZone(zoneCode: String?) = _state.update { it.copy(selectedLogisticsZone = zoneCode) }

    fun nextStep() {
        val s = _state.value
        if (s.step == 1 && s.clientName.isBlank()) {
            _state.update { it.copy(clientNameError = "Indica el nombre del cliente") }
            return
        }
        val next = (s.step + 1).coerceAtMost(3)
        _state.update { it.copy(step = next, error = null, clientNameError = null) }
        if (next == 3) scheduleMarginChecks()
    }

    fun prevStep() = _state.update { it.copy(step = (it.step - 1).coerceAtLeast(1), error = null, clientNameError = null) }

    fun clearError() = _state.update { it.copy(error = null) }

    fun configureTemplate(template: String, cameras: Int? = null, storageDays: Int? = null, accessPoints: Int? = null, doors: Int? = null) {
        viewModelScope.launch {
            _state.update { it.copy(configureLoading = true, error = null) }
            try {
                val res = repo.configureSolution(
                    template = template,
                    cameras = cameras,
                    storageDays = storageDays,
                    accessPoints = accessPoints,
                    doors = doors,
                    margin = _state.value.targetMargin,
                    optimize = _state.value.optimizeMode,
                    logisticsZone = _state.value.selectedLogisticsZone,
                )
                val hw = linesFromHardware(res.hardware)
                val labor = res.labor.map { l ->
                    QuoteCartLine(
                        productCtId = null,
                        name = l.name,
                        category = l.category,
                        brand = l.category,
                        model = null,
                        sku = l.code,
                        partNumber = null,
                        qty = l.qty.coerceAtLeast(1),
                        unitCost = l.unitCost,
                        unitPrice = l.unitPrice,
                        marginPercent = _state.value.targetMargin.toDouble(),
                        stockSnapshot = null,
                        isLabor = true,
                        supplierCode = "LABOR",
                    )
                }
                val logistics = res.logistics?.let { h ->
                    listOf(
                        QuoteCartLine(
                            productCtId = h.productCtId,
                            name = h.name.ifBlank { "Logística" },
                            category = "LOGISTICS",
                            brand = null,
                            model = null,
                            sku = h.sku,
                            partNumber = null,
                            qty = h.qty.coerceAtLeast(1),
                            unitCost = h.unitCost,
                            unitPrice = h.unitPrice,
                            marginPercent = h.marginPercent ?: _state.value.targetMargin.toDouble(),
                            stockSnapshot = null,
                            supplierCode = "LOGISTICS",
                        ),
                    )
                }.orEmpty()
                _state.update {
                    it.copy(
                        configureLoading = false,
                        cart = it.cart + hw + labor + logistics,
                        copilotNote = res.notes.firstOrNull(),
                        step = 2,
                    )
                }
                scheduleMarginChecks()
            } catch (e: Exception) {
                _state.update { it.copy(configureLoading = false, error = e.message ?: "No se pudo configurar") }
            }
        }
    }

    private fun linesFromHardware(items: List<mx.nexara.mobile.nativeapp.data.api.CopilotHardwareLineDto>): List<QuoteCartLine> =
        items.map { h ->
            QuoteCartLine(
                productCtId = h.productCtId,
                name = h.name.ifBlank { "Producto" },
                category = null,
                brand = h.brand,
                model = null,
                sku = h.sku,
                partNumber = null,
                qty = h.qty.coerceAtLeast(1),
                unitCost = h.unitCost,
                unitPrice = h.unitPrice,
                marginPercent = h.marginPercent ?: _state.value.targetMargin.toDouble(),
                stockSnapshot = null,
                supplierCode = h.supplierCode,
            )
        }

    fun runCopilot() {
        val prompt = _state.value.copilotPrompt.trim()
        if (prompt.length < 8) {
            _state.update { it.copy(error = "Describe el proyecto con más detalle") }
            return
        }
        viewModelScope.launch {
            _state.update { it.copy(copilotLoading = true, error = null) }
            try {
                val draft = repo.copilotDraft(prompt)
                val lines = draft.proposal?.hardware.orEmpty().map { h ->
                    QuoteCartLine(
                        productCtId = h.productCtId,
                        name = h.name.ifBlank { "Producto" },
                        category = null,
                        brand = h.brand,
                        model = null,
                        sku = h.sku,
                        partNumber = null,
                        qty = h.qty.coerceAtLeast(1),
                        unitCost = h.unitCost,
                        unitPrice = h.unitPrice,
                        marginPercent = h.marginPercent ?: _state.value.targetMargin.toDouble(),
                        stockSnapshot = null,
                        supplierCode = h.supplierCode,
                    )
                }
                _state.update {
                    it.copy(
                        copilotLoading = false,
                        cart = it.cart + lines,
                        copilotNote = draft.disclaimer ?: draft.proposal?.notes?.firstOrNull(),
                        step = 2,
                    )
                }
                scheduleMarginChecks()
            } catch (e: Exception) {
                _state.update { it.copy(copilotLoading = false, error = e.message ?: "Copilot no disponible") }
            }
        }
    }

    fun loadSubstitutes(clave: String) {
        viewModelScope.launch {
            try {
                val subs = repo.substitutes(clave, _state.value.targetMargin, _state.value.optimizeMode)
                _state.update { it.copy(substitutes = subs, substituteFor = clave) }
            } catch (_: Exception) {
                _state.update { it.copy(substitutes = emptyList(), substituteFor = clave) }
            }
        }
    }

    fun clearSubstitutes() = _state.update { it.copy(substitutes = emptyList(), substituteFor = null) }

    fun suggestLabor() {
        val cart = _state.value.cart
        if (cart.isEmpty()) {
            _state.update { it.copy(error = "Agrega productos antes de sugerir mano de obra") }
            return
        }
        viewModelScope.launch {
            _state.update { it.copy(laborLoading = true) }
            try {
                val items = repo.laborSuggest(cart)
                val laborLines = items.map { l ->
                    QuoteCartLine(
                        productCtId = null,
                        name = l.name,
                        category = l.category,
                        brand = l.category,
                        model = null,
                        sku = l.code,
                        partNumber = null,
                        qty = l.qty.coerceAtLeast(1),
                        unitCost = l.unitCost,
                        unitPrice = l.unitPrice,
                        marginPercent = _state.value.targetMargin.toDouble(),
                        stockSnapshot = null,
                        isLabor = true,
                        supplierCode = "LABOR",
                    )
                }
                _state.update { it.copy(laborLoading = false, cart = it.cart + laborLines) }
                scheduleMarginChecks()
            } catch (e: Exception) {
                _state.update { it.copy(laborLoading = false, error = e.message ?: "No se pudo sugerir MO") }
            }
        }
    }

    fun addToCart(offer: SmartOfferDto) {
        val sell = if (offer.sellPriceSuggested > 0) offer.sellPriceSuggested else offer.costMxn * 1.3
        val line = QuoteCartLine(
            productCtId = offer.id.takeIf { it > 0 },
            name = offer.nombre ?: offer.clave ?: "Producto CT",
            category = offer.categoria,
            brand = offer.marca,
            model = offer.modelo,
            sku = offer.clave,
            partNumber = offer.numParte,
            qty = 1,
            unitCost = offer.costMxn,
            unitPrice = sell,
            marginPercent = offer.marginPercent.takeIf { it > 0 } ?: _state.value.targetMargin.toDouble(),
            stockSnapshot = offer.stockPreferred.takeIf { it > 0 } ?: offer.stockTotal,
        )
        _state.update { s ->
            val existing = s.cart.indexOfFirst { it.sku == line.sku && line.sku != null }
            val cart = if (existing >= 0) {
                s.cart.toMutableList().also { it[existing] = it[existing].copy(qty = it[existing].qty + 1) }
            } else s.cart + line
            s.copy(cart = cart)
        }
        scheduleMarginChecks()
    }

    fun updateQty(index: Int, delta: Int) {
        _state.update { s ->
            val cart = s.cart.toMutableList()
            if (index !in cart.indices) return@update s
            val n = (cart[index].qty + delta).coerceAtLeast(1)
            cart[index] = cart[index].copy(qty = n)
            s.copy(cart = cart)
        }
        scheduleMarginChecks()
    }

    fun removeFromCart(index: Int) {
        _state.update { s -> s.copy(cart = s.cart.filterIndexed { i, _ -> i != index }) }
        scheduleMarginChecks()
    }

    fun save(onDone: (Long) -> Unit) {
        val s = _state.value
        if (s.clientName.isBlank()) {
            _state.update { it.copy(clientNameError = "Indica el nombre del cliente", step = 1) }
            return
        }
        if (s.cart.isEmpty()) {
            _state.update { it.copy(error = "Agrega al menos un producto") }
            return
        }
        viewModelScope.launch {
            _state.update { it.copy(saving = true, error = null) }
            try {
                val id = repo.createQuote(s.clientName.trim(), s.projectName.trim().ifBlank { null }, s.cart, s.optimizeMode)
                _state.update { it.copy(saving = false, savedQuoteId = id) }
                onDone(id)
            } catch (e: Exception) {
                _state.update { it.copy(saving = false, error = e.message ?: "No se pudo guardar") }
            }
        }
    }

    val subtotal: Double get() = _state.value.cart.sumOf { it.unitPrice * it.qty }
    val tax: Double get() = subtotal * 0.16
    val total: Double get() = subtotal + tax
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SmartQuoteBuilderScreen(onBack: () -> Unit, onSaved: (Long) -> Unit = {}) {
    val ctx = LocalContext.current
    val haptic = LocalHapticFeedback.current
    val snackbarHostState = rememberNxSnackbarHostState()
    val scope = rememberCoroutineScope()
    var showConfirmGenerate by remember { mutableStateOf(false) }
    val vm: SmartQuoteViewModel = viewModel(factory = object : androidx.lifecycle.ViewModelProvider.Factory {
        override fun <T : androidx.lifecycle.ViewModel> create(c: Class<T>): T {
            @Suppress("UNCHECKED_CAST")
            return SmartQuoteViewModel(ctx.applicationContext as Application) as T
        }
    })
    val state by vm.state.collectAsState()

    LaunchedEffect(state.error) {
        state.error?.let { msg ->
            snackbarHostState.showSnackbar(msg)
            vm.clearError()
        }
    }

    val stepLabel = when (state.step) {
        1 -> "Paso 1/3 · Contexto"
        2 -> "Paso 2/3 · Catálogo"
        else -> "Paso 3/3 · Revisar"
    }

    val onAddToCart: (SmartOfferDto) -> Unit = { offer ->
        haptic.performHapticFeedback(HapticFeedbackType.LongPress)
        vm.addToCart(offer)
    }

    Scaffold(
        snackbarHost = { NxSnackbarHost(snackbarHostState) },
        topBar = {
            TopAppBar(
                title = { Column { Text("Cotizar en minutos", fontWeight = FontWeight.Bold); Text(stepLabel, fontSize = 12.sp) } },
                navigationIcon = {
                    IconButton(onClick = { if (state.step > 1) vm.prevStep() else onBack() }) {
                        Icon(Icons.Default.ArrowBack, "Volver")
                    }
                },
                actions = {
                    if (state.step >= 2) {
                        TextButton(onClick = { vm.toggleCosts() }) {
                            Text(if (state.showCosts) "Vista cliente" else "Costos", fontSize = 12.sp)
                        }
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = NxColors.Teal, titleContentColor = androidx.compose.ui.graphics.Color.White, navigationIconContentColor = androidx.compose.ui.graphics.Color.White, actionIconContentColor = androidx.compose.ui.graphics.Color.White),
            )
        },
        bottomBar = {
            Surface(tonalElevation = 8.dp) {
                Column(Modifier.fillMaxWidth().padding(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    when (state.step) {
                        1 -> Button(onClick = { vm.nextStep() }, modifier = Modifier.fillMaxWidth()) {
                            Text("Siguiente: Catálogo")
                        }
                        2 -> {
                            if (state.cart.isNotEmpty()) {
                                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                                    Text("${state.cart.size} partidas", fontWeight = FontWeight.SemiBold)
                                    Text(sqFmtMxn(vm.total), fontWeight = FontWeight.Bold, color = NxColors.Teal)
                                }
                            }
                            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                OutlinedButton(onClick = { vm.prevStep() }, modifier = Modifier.weight(1f)) { Text("Atrás") }
                                Button(onClick = { vm.nextStep() }, modifier = Modifier.weight(1f)) { Text("Revisar") }
                            }
                        }
                        else -> {
                            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                                Text("${state.cart.size} partidas · Total c/IVA", fontWeight = FontWeight.SemiBold)
                                Text(sqFmtMxn(vm.total), fontWeight = FontWeight.Bold, color = NxColors.Teal)
                            }
                            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                OutlinedButton(onClick = { vm.prevStep() }, modifier = Modifier.weight(1f)) { Text("Atrás") }
                                Button(
                                    onClick = { showConfirmGenerate = true },
                                    modifier = Modifier.weight(1f),
                                    enabled = !state.saving && state.cart.isNotEmpty(),
                                ) {
                                    if (state.saving) CircularProgressIndicator(Modifier.size(18.dp), strokeWidth = 2.dp)
                                    else Text("Generar")
                                }
                            }
                        }
                    }
                }
            }
        },
    ) { padding ->
        Box(Modifier.fillMaxSize().padding(padding)) {
            LazyColumn(
                Modifier.fillMaxSize().background(NxColors.Surface),
                contentPadding = PaddingValues(12.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp),
            ) {
            item {
                SmartQuoteStepIndicator(step = state.step)
            }
            item {
                if (state.catalogCount > 0) {
                    Text("${state.catalogCount} productos CT sincronizados", fontSize = 12.sp, color = NxColors.Muted)
                }
            }

            if (state.step == 1) {
                stepOneItems(state, vm)
            }
            if (state.step == 2) {
                stepTwoItems(state, vm, onAddToCart)
            }
            if (state.step == 3) {
                stepThreeItems(state, vm)
            }
            }

            if (state.step == 2 && state.cart.isNotEmpty()) {
                Box(
                    Modifier
                        .align(Alignment.BottomCenter)
                        .padding(bottom = 8.dp),
                ) {
                    SmartQuoteMiniCartChip(itemCount = state.cart.size, total = vm.total)
                }
            }
        }
    }

    if (showConfirmGenerate) {
        AlertDialog(
            onDismissRequest = { if (!state.saving) showConfirmGenerate = false },
            title = { Text("Generar cotización") },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    Text("¿Confirmas la cotización para este cliente?")
                    Text(state.clientName, fontWeight = FontWeight.Bold)
                    Text(
                        "Total c/IVA: ${sqFmtMxn(vm.total)}",
                        fontWeight = FontWeight.SemiBold,
                        color = NxColors.Teal,
                    )
                }
            },
            confirmButton = {
                Button(
                    onClick = {
                        showConfirmGenerate = false
                        vm.save { id ->
                            scope.launch {
                                snackbarHostState.showSnackbar("Cotización generada correctamente")
                                delay(700)
                                onSaved(id)
                            }
                        }
                    },
                    enabled = !state.saving,
                ) {
                    if (state.saving) CircularProgressIndicator(Modifier.size(18.dp), strokeWidth = 2.dp)
                    else Text("Generar")
                }
            },
            dismissButton = {
                TextButton(onClick = { showConfirmGenerate = false }, enabled = !state.saving) {
                    Text("Cancelar")
                }
            },
        )
    }
}

private fun LazyListScope.stepOneItems(state: SmartQuoteUiState, vm: SmartQuoteViewModel) {
    item {
        SmartQuoteStepEmptyState(
            icon = Icons.Default.Person,
            title = "Define el contexto",
            subtitle = "Captura el cliente y el proyecto. Usa plantillas preconfiguradas o Copilot IA para armar un borrador en segundos.",
        )
    }
    item {
        OutlinedTextField(
            value = state.clientName,
            onValueChange = { vm.setClientName(it) },
            label = { Text("Cliente *") },
            modifier = Modifier.fillMaxWidth(),
            singleLine = true,
            isError = state.clientNameError != null,
            supportingText = state.clientNameError?.let { err ->
                { Text(err, color = MaterialTheme.colorScheme.error) }
            },
        )
    }
    item {
        OutlinedTextField(
            value = state.projectName,
            onValueChange = { vm.setProjectName(it) },
            label = { Text("Proyecto (opcional)") },
            modifier = Modifier.fillMaxWidth(),
            singleLine = true,
        )
    }
    item {
        NxSectionHeader(
            "Cuéntanos el alcance",
            subtitle = "Con estos datos armamos una propuesta completa: equipos, instalación y entrega.",
        )
        if (state.logisticsZones.isNotEmpty()) {
            Text("Zona de entrega / instalación", fontWeight = FontWeight.SemiBold, fontSize = 13.sp)
            Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                state.logisticsZones.forEach { zone ->
                    FilterChip(
                        selected = state.selectedLogisticsZone == zone.zoneCode,
                        onClick = { vm.setLogisticsZone(zone.zoneCode) },
                        label = { Text(zone.zoneName, fontSize = 11.sp) },
                    )
                }
            }
            Spacer(Modifier.height(8.dp))
        }
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            OutlinedButton(
                onClick = { vm.configureTemplate("CCTV", cameras = 8, storageDays = 30) },
                enabled = !state.configureLoading,
                modifier = Modifier.weight(1f),
            ) { Text("Videovigilancia") }
            OutlinedButton(
                onClick = { vm.configureTemplate("WIFI", accessPoints = 4) },
                enabled = !state.configureLoading,
                modifier = Modifier.weight(1f),
            ) { Text("Red WiFi") }
        }
        OutlinedButton(
            onClick = { vm.configureTemplate("ACCESS", doors = 2) },
            enabled = !state.configureLoading,
            modifier = Modifier.fillMaxWidth(),
        ) { Text("Control de acceso") }
        if (state.configureLoading) {
            Spacer(Modifier.height(6.dp))
            Text("Armando propuesta…", fontSize = 11.sp, color = NxColors.Muted)
        }
    }
    item {
        NxSectionHeader(
            "Descríbelo como se lo dirías a un colega",
            subtitle = "Generamos un borrador con precios y stock reales del mayorista. Tú solo revisas y ajustas.",
        )
        OutlinedTextField(
            value = state.copilotPrompt,
            onValueChange = { vm.setCopilotPrompt(it) },
            placeholder = { Text("Ej. Necesito 8 cámaras IP 4MP exterior + NVR 32ch en Puebla, priorizando disponibilidad") },
            modifier = Modifier.fillMaxWidth(),
            minLines = 2,
        )
        Button(onClick = { vm.runCopilot() }, enabled = !state.copilotLoading, modifier = Modifier.fillMaxWidth()) {
            if (state.copilotLoading) CircularProgressIndicator(Modifier.size(18.dp), strokeWidth = 2.dp)
            else Text("Generar borrador con IA")
        }
        state.copilotNote?.let { Text(it, fontSize = 11.sp, color = NxColors.Muted) }
    }
    item {
        Text("Margen objetivo: ${state.targetMargin}%", fontWeight = FontWeight.SemiBold, fontSize = 13.sp)
        Slider(
            value = state.targetMargin.toFloat(),
            onValueChange = { vm.setTargetMargin(it.toInt()) },
            valueRange = 10f..60f,
            steps = 10,
        )
    }
    if (state.marginRules.isNotEmpty()) {
        item {
            Card(Modifier.fillMaxWidth(), shape = RoundedCornerShape(10.dp), colors = CardDefaults.cardColors(containerColor = NxColors.Surface)) {
                Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Text("Reglas de margen por categoría", fontWeight = FontWeight.SemiBold, fontSize = 12.sp)
                    state.marginRules.take(6).forEach { rule ->
                        val min = rule.minMarginPercent?.toInt() ?: 0
                        val label = rule.scopeValue?.takeIf { it.isNotBlank() } ?: rule.name
                        Text("· $label: mín. $min%", fontSize = 11.sp, color = NxColors.Muted)
                    }
                }
            }
        }
    }
    item {
        Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            listOf("BALANCE" to "Equilibrado", "PRICE" to "Más económico", "SPEED" to "Entrega rápida", "MARGIN" to "Más rentable", "PREMIUM" to "Premium").forEach { (id, label) ->
                FilterChip(selected = state.optimizeMode == id, onClick = { vm.setOptimizeMode(id) }, label = { Text(label, fontSize = 11.sp) })
            }
        }
    }
}

private fun LazyListScope.stepTwoItems(
    state: SmartQuoteUiState,
    vm: SmartQuoteViewModel,
    onAddToCart: (SmartOfferDto) -> Unit,
) {
    if (state.brands.isNotEmpty()) {
        item {
            Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                FilterChip(selected = state.selectedBrand == null, onClick = { vm.setBrand(null) }, label = { Text("Todas marcas") })
                state.brands.take(8).forEach { b ->
                    FilterChip(selected = state.selectedBrand == b, onClick = { vm.setBrand(b) }, label = { Text(b, fontSize = 11.sp) })
                }
            }
        }
    }
    if (state.categories.isNotEmpty()) {
        item {
            Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                SmartQuoteCategoryChip(
                    label = "Todas categorías",
                    selected = state.selectedCategory == null,
                    onClick = { vm.setCategory(null) },
                )
                state.categories.take(6).forEach { c ->
                    SmartQuoteCategoryChip(
                        label = c,
                        selected = state.selectedCategory == c,
                        onClick = { vm.setCategory(c) },
                    )
                }
            }
        }
    }
    item {
        NxSearchField(
            value = state.query,
            onValueChange = vm::setQuery,
            placeholder = "Buscar SKU, marca o producto CT…",
        )
    }
    if (state.loading) item { NxSkeletonList(itemCount = 5, itemHeight = 72.dp) }
    if (state.query.length < 2 && state.selectedBrand == null && state.selectedCategory == null && !state.loading) {
        item {
            SmartQuoteStepEmptyState(
                icon = Icons.Default.Search,
                title = "Explora el catálogo CT",
                subtitle = "Busca por SKU, marca o descripción. Filtra por categoría y agrega productos al carrito con un toque.",
            )
        }
    }
    if (state.query.length >= 2 && !state.loading) {
        item { NxSectionHeader("Resultados", subtitle = "${state.results.size} productos") }
        if (state.results.isEmpty()) {
            item { NxEmptyState("Sin resultados", "Prueba otro término o SKU") }
        } else {
            items(state.results, key = { it.id }) { offer ->
                OfferCard(
                    offer,
                    showCosts = state.showCosts,
                    onAdd = { onAddToCart(offer) },
                    onSubstitutes = { offer.clave?.let { vm.loadSubstitutes(it) } },
                )
            }
        }
    }
    if (state.substitutes.isNotEmpty()) {
        item {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                Text("Sustitutos · ${state.substituteFor}", fontWeight = FontWeight.Bold)
                TextButton(onClick = { vm.clearSubstitutes() }) { Text("Cerrar") }
            }
        }
        items(state.substitutes, key = { "sub-${it.id}" }) { offer ->
            OfferCard(offer, showCosts = state.showCosts, onAdd = { onAddToCart(offer); vm.clearSubstitutes() })
        }
    }
}

private fun LazyListScope.stepThreeItems(state: SmartQuoteUiState, vm: SmartQuoteViewModel) {
    if (state.cart.isNotEmpty()) {
        item {
            Card(Modifier.fillMaxWidth(), shape = RoundedCornerShape(12.dp)) {
                Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                        Text("Subtotal", color = NxColors.Muted)
                        Text(sqFmtMxn(vm.subtotal), fontWeight = FontWeight.SemiBold)
                    }
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                        Text("IVA 16%", color = NxColors.Muted)
                        Text(sqFmtMxn(vm.tax))
                    }
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                        Text("Total", fontWeight = FontWeight.Bold)
                        Text(sqFmtMxn(vm.total), fontWeight = FontWeight.Bold, color = NxColors.Teal)
                    }
                }
            }
        }
    }
    item {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            OutlinedButton(onClick = { vm.suggestLabor() }, enabled = !state.laborLoading, modifier = Modifier.weight(1f)) {
                Text(if (state.laborLoading) "MO…" else "+ Mano de obra")
            }
        }
    }
    item { NxSectionHeader("Tu propuesta", subtitle = if (state.showCosts) "Costo CT → venta + IVA 16%" else "Precio al cliente + IVA") }
    if (state.cart.isEmpty()) {
        item {
            SmartQuoteStepEmptyState(
                icon = Icons.Default.Receipt,
                title = "Tu propuesta está vacía",
                subtitle = "Regresa al catálogo y agrega productos, mano de obra o logística. Cuando estés listo, genera la cotización.",
            )
        }
    } else {
        itemsIndexed(
            state.cart,
            key = { idx, line -> "cart-$idx-${line.productCtId}-${line.sku}-${line.name}" },
        ) { idx, line ->
            val marginCheck = state.lineMarginChecks[idx]
            CartLineCard(
                line,
                showCosts = state.showCosts,
                marginCheck = marginCheck,
                onMinus = { vm.updateQty(idx, -1) },
                onPlus = { vm.updateQty(idx, 1) },
                onRemove = { vm.removeFromCart(idx) },
            )
        }
    }
}

@Composable
private fun SmartQuoteCategoryChip(label: String, selected: Boolean, onClick: () -> Unit) {
    Box(Modifier.clickable(onClick = onClick)) {
        NxStatusChip(label, if (selected) NxTone.Brand else NxTone.Neutral)
    }
}

@Composable
private fun SmartQuoteMiniCartChip(itemCount: Int, total: Double) {
    Surface(
        shape = RoundedCornerShape(20.dp),
        color = NxColors.TealSoft,
        tonalElevation = 4.dp,
    ) {
        Row(
            Modifier.padding(horizontal = 14.dp, vertical = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Icon(Icons.Default.Receipt, contentDescription = null, tint = NxColors.Teal, modifier = Modifier.size(16.dp))
            Text("$itemCount partidas", fontSize = 12.sp, fontWeight = FontWeight.SemiBold)
            Text("·", color = NxColors.Muted, fontSize = 12.sp)
            Text(sqFmtMxn(total), fontSize = 12.sp, fontWeight = FontWeight.Bold, color = NxColors.Teal)
        }
    }
}

@Composable
private fun OfferCard(offer: SmartOfferDto, showCosts: Boolean, onAdd: () -> Unit, onSubstitutes: (() -> Unit)? = null) {
    val img = offer.imagen?.takeIf { it.isNotBlank() }?.let { toAbsoluteAssetUrl(it).ifBlank { it } }
    val productName = offer.nombre ?: offer.clave ?: "Producto"
    val pickupCodes = codesForCity("Puebla")
    val warehouseRows = sortedWarehouseRows(offer.stockByWarehouse, pickupCodes, max = 5)
    val prefQty = stockAtPreferred(offer.stockByWarehouse, pickupCodes).takeIf { it > 0 } ?: offer.stockPreferred
    val leadLabel = formatLeadTimeDays(offer.leadTimeDays)
    val promo = hasPromotion(offer.promociones)
    val offerBadges = offer.badges.orEmpty()
    Card(Modifier.fillMaxWidth(), shape = RoundedCornerShape(12.dp)) {
        Row(Modifier.padding(12.dp), verticalAlignment = Alignment.Top) {
            if (!img.isNullOrBlank()) {
                NxAsyncImage(
                    model = img,
                    contentDescription = productName,
                    modifier = Modifier.size(52.dp).clip(RoundedCornerShape(8.dp)),
                )
                Spacer(Modifier.width(10.dp))
            }
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Text(offer.nombre ?: offer.clave ?: "—", fontWeight = FontWeight.SemiBold, fontSize = 14.sp)
                Text(listOfNotNull(offer.marca, offer.clave).joinToString(" · "), fontSize = 11.sp, color = NxColors.Muted)
                OfferStockSummary(
                    stockTotal = offer.stockTotal,
                    prefQty = prefQty,
                    pickupCodes = pickupCodes,
                    locText = formatStockByWarehouse(offer.stockByWarehouse, preferredCodes = pickupCodes),
                )
                if (warehouseRows.isNotEmpty()) {
                    Row(
                        Modifier.horizontalScroll(rememberScrollState()),
                        horizontalArrangement = Arrangement.spacedBy(4.dp),
                    ) {
                        warehouseRows.forEach { row ->
                            WarehouseStockChip(
                                label = warehouseRowLabel(row),
                                qty = row.qty,
                                preferred = pickupCodes.any { it.equals(row.code, ignoreCase = true) },
                            )
                        }
                    }
                }
                Row(
                    Modifier.horizontalScroll(rememberScrollState()),
                    horizontalArrangement = Arrangement.spacedBy(4.dp),
                ) {
                    if (leadLabel.isNotBlank()) {
                        NxStatusChip(leadLabel, if (offer.leadTimeDays <= 1) NxTone.Success else NxTone.Info)
                    }
                    if (offer.stockTotal > 0) {
                        NxStatusChip("Stock ${offer.stockTotal}", NxTone.Success)
                    }
                    if (promo) {
                        NxStatusChip("Promo", NxTone.Warning)
                    }
                    offerBadges.forEach { badge ->
                        val tone = when (badge.uppercase()) {
                            "RECOMMENDED" -> NxTone.Brand
                            "BEST_STOCK", "FASTEST" -> NxTone.Success
                            else -> NxTone.Neutral
                        }
                        NxStatusChip(badgeLabelEs(badge), tone)
                    }
                    if (showCosts) NxStatusChip("CT ${sqFmtMxn(offer.costMxn)}", NxTone.Neutral)
                    NxStatusChip("Venta ${sqFmtMxn(offer.sellPriceSuggested)}", NxTone.Brand)
                }
            }
            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                FilledTonalIconButton(onClick = onAdd) { Icon(Icons.Default.Add, "Agregar") }
                if (onSubstitutes != null && !offer.clave.isNullOrBlank()) {
                    TextButton(onClick = onSubstitutes) { Text("Alt.", fontSize = 10.sp) }
                }
            }
        }
    }
}

@Composable
private fun OfferStockSummary(
    stockTotal: Int,
    prefQty: Int,
    pickupCodes: List<String>,
    locText: String,
) {
    if (stockTotal <= 0) {
        Text("Sin stock en red CT", fontSize = 10.sp, color = NxColors.Muted)
        return
    }
    Text(
        buildString {
            append("$stockTotal u. total")
            if (prefQty > 0) {
                append(" · Recoger ${warehouseLabel(pickupCodes.firstOrNull() ?: "PUE")}: $prefQty u.")
            } else {
                append(" · Sin stock local — pedir traslado")
            }
        },
        fontSize = 10.sp,
        color = if (prefQty > 0) NxColors.Teal else NxColors.Muted,
    )
    if (locText.isNotBlank() && stockTotal > 0) {
        Text("Almacenes: $locText", fontSize = 10.sp, color = NxColors.Muted)
    }
}

@Composable
private fun WarehouseStockChip(label: String, qty: Int, preferred: Boolean) {
    Surface(
        shape = RoundedCornerShape(6.dp),
        color = if (preferred) NxColors.TealSoft else NxColors.Surface,
        modifier = Modifier.border(
            width = 1.dp,
            color = if (preferred) NxColors.Teal.copy(alpha = 0.45f) else NxColors.Muted.copy(alpha = 0.25f),
            shape = RoundedCornerShape(6.dp),
        ),
    ) {
        Text(
            "$label $qty",
            Modifier.padding(horizontal = 6.dp, vertical = 2.dp),
            fontSize = 10.sp,
            color = if (preferred) NxColors.Teal else NxColors.Muted,
        )
    }
}

@Composable
private fun CartLineCard(
    line: QuoteCartLine,
    showCosts: Boolean,
    marginCheck: MarginCheckDto? = null,
    onMinus: () -> Unit,
    onPlus: () -> Unit,
    onRemove: () -> Unit,
) {
    Card(Modifier.fillMaxWidth(), shape = RoundedCornerShape(12.dp)) {
        Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Text(line.name, fontWeight = FontWeight.SemiBold, fontSize = 13.sp)
            if (showCosts && line.unitCost > 0) {
                Text("Costo ${sqFmtMxn(line.unitCost)} · Venta ${sqFmtMxn(line.unitPrice)} · Margen ${line.marginPercent.toInt()}%", fontSize = 10.sp, color = NxColors.Muted)
            }
            if (marginCheck != null && !marginCheck.ok) {
                NxStatusChip(
                    marginCheck.message ?: "Margen ${marginCheck.marginPercent.toInt()}% < ${marginCheck.minRequired.toInt()}%",
                    NxTone.Warning,
                )
            }
            Row(verticalAlignment = Alignment.CenterVertically) {
                IconButton(onClick = onMinus) { Icon(Icons.Default.Remove, "Disminuir cantidad") }
                Text("${line.qty}", fontWeight = FontWeight.Bold, modifier = Modifier.padding(horizontal = 8.dp))
                IconButton(onClick = onPlus) { Icon(Icons.Default.Add, "Aumentar cantidad") }
                Spacer(Modifier.weight(1f))
                Text(sqFmtMxn(line.unitPrice * line.qty), fontWeight = FontWeight.Bold, color = NxColors.Teal)
                TextButton(onClick = onRemove) { Text("Quitar", fontSize = 11.sp) }
            }
        }
    }
}

private fun sqFmtMxn(v: Double): String = when {
    v >= 1_000_000 -> String.format("$%.1fM", v / 1_000_000)
    v >= 10_000 -> String.format("$%.0fK", v / 1_000)
    else -> String.format("$%,.0f", v)
}

@Composable
private fun SmartQuoteStepIndicator(step: Int, modifier: Modifier = Modifier) {
    val steps = listOf("Contexto", "Catálogo", "Revisar")
    Column(modifier.fillMaxWidth()) {
        LinearProgressIndicator(
            progress = { step / 3f },
            modifier = Modifier
                .fillMaxWidth()
                .height(4.dp)
                .clip(RoundedCornerShape(2.dp)),
            color = NxColors.Teal,
            trackColor = NxColors.TealSoft,
        )
        Spacer(Modifier.height(12.dp))
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            steps.forEachIndexed { idx, label ->
                val n = idx + 1
                val active = n == step
                val done = n < step
                Column(
                    horizontalAlignment = Alignment.CenterHorizontally,
                    modifier = Modifier.weight(1f),
                ) {
                    Box(
                        Modifier
                            .size(28.dp)
                            .background(
                                when {
                                    done || active -> NxColors.Teal
                                    else -> NxColors.TealSoft
                                },
                                CircleShape,
                            ),
                        contentAlignment = Alignment.Center,
                    ) {
                        if (done) {
                            Icon(
                                Icons.Default.Check,
                                contentDescription = "Completado",
                                tint = Color.White,
                                modifier = Modifier.size(14.dp),
                            )
                        } else {
                            Text(
                                "$n",
                                color = if (active) Color.White else NxColors.Muted,
                                fontSize = 12.sp,
                                fontWeight = FontWeight.Bold,
                            )
                        }
                    }
                    Spacer(Modifier.height(4.dp))
                    Text(
                        label,
                        fontSize = 10.sp,
                        fontWeight = if (active) FontWeight.Bold else FontWeight.Normal,
                        color = if (active || done) NxColors.Teal else NxColors.Muted,
                    )
                }
            }
        }
    }
}

@Composable
private fun SmartQuoteStepEmptyState(
    icon: ImageVector,
    title: String,
    subtitle: String,
) {
    Card(
        Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(14.dp),
        colors = CardDefaults.cardColors(containerColor = NxColors.TealSoft.copy(alpha = 0.45f)),
    ) {
        Column(
            Modifier
                .fillMaxWidth()
                .padding(vertical = 24.dp, horizontal = 20.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Box(
                Modifier
                    .size(56.dp)
                    .background(NxColors.Teal.copy(alpha = 0.12f), CircleShape),
                contentAlignment = Alignment.Center,
            ) {
                Icon(icon, contentDescription = title, tint = NxColors.Teal, modifier = Modifier.size(28.dp))
            }
            Text(title, fontWeight = FontWeight.Bold, fontSize = 15.sp, color = NxColors.Slate)
            Text(
                subtitle,
                fontSize = 12.sp,
                color = NxColors.Muted,
                modifier = Modifier.padding(horizontal = 8.dp),
                lineHeight = 17.sp,
            )
        }
    }
}
