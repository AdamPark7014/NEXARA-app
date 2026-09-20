/**
 * Catálogo base NIF-ish para PYME de servicios en México.
 * Códigos de primer nivel: 1 activo · 2 pasivo · 3 capital · 4 ingresos · 5 costos · 6 gastos.
 * `satAgrupador` es orientativo (catálogo SAT); se puede ajustar después en UI.
 */
export type BaseChartAccount = {
  code: string;
  name: string;
  type: 'ASSET' | 'LIABILITY' | 'EQUITY' | 'REVENUE' | 'EXPENSE';
  satAgrupador?: string;
};

export const BASE_CHART_OF_ACCOUNTS: readonly BaseChartAccount[] = [
  // ── Activo ──────────────────────────────────────────────────────────
  { code: '101.01', name: 'Caja', type: 'ASSET', satAgrupador: '101.01' },
  { code: '102.01', name: 'Bancos nacionales', type: 'ASSET', satAgrupador: '102.01' },
  { code: '102.02', name: 'Bancos moneda extranjera', type: 'ASSET', satAgrupador: '102.02' },
  { code: '105.01', name: 'Clientes nacionales', type: 'ASSET', satAgrupador: '105.01' },
  { code: '105.02', name: 'Clientes extranjeros', type: 'ASSET', satAgrupador: '105.02' },
  { code: '107.01', name: 'Deudores diversos', type: 'ASSET', satAgrupador: '107.01' },
  { code: '110.01', name: 'IVA acreditable pendiente de pago', type: 'ASSET', satAgrupador: '110.01' },
  { code: '110.02', name: 'IVA acreditable pagado', type: 'ASSET', satAgrupador: '110.02' },
  { code: '115.01', name: 'Inventario de mercancías', type: 'ASSET', satAgrupador: '115.01' },
  { code: '118.01', name: 'Anticipo a proveedores', type: 'ASSET', satAgrupador: '118.01' },
  { code: '120.01', name: 'Terrenos', type: 'ASSET', satAgrupador: '151.01' },
  { code: '121.01', name: 'Edificios', type: 'ASSET', satAgrupador: '152.01' },
  { code: '122.01', name: 'Mobiliario y equipo de oficina', type: 'ASSET', satAgrupador: '153.01' },
  { code: '123.01', name: 'Equipo de cómputo', type: 'ASSET', satAgrupador: '154.01' },
  { code: '124.01', name: 'Equipo de transporte', type: 'ASSET', satAgrupador: '155.01' },
  { code: '125.01', name: 'Herramientas y equipo de trabajo', type: 'ASSET', satAgrupador: '156.01' },
  { code: '171.01', name: 'Depreciación acumulada mobiliario', type: 'ASSET', satAgrupador: '171.01' },
  { code: '172.01', name: 'Depreciación acumulada cómputo', type: 'ASSET', satAgrupador: '172.01' },
  { code: '173.01', name: 'Depreciación acumulada transporte', type: 'ASSET', satAgrupador: '173.01' },

  // ── Pasivo ──────────────────────────────────────────────────────────
  { code: '201.01', name: 'Proveedores nacionales', type: 'LIABILITY', satAgrupador: '201.01' },
  { code: '201.02', name: 'Proveedores extranjeros', type: 'LIABILITY', satAgrupador: '201.02' },
  { code: '205.01', name: 'Acreedores diversos', type: 'LIABILITY', satAgrupador: '205.01' },
  { code: '206.01', name: 'Anticipo de clientes', type: 'LIABILITY', satAgrupador: '206.01' },
  { code: '208.01', name: 'IVA trasladado cobrado', type: 'LIABILITY', satAgrupador: '208.01' },
  { code: '208.02', name: 'IVA trasladado no cobrado', type: 'LIABILITY', satAgrupador: '208.02' },
  { code: '209.01', name: 'IVA acreditable pagado', type: 'ASSET', satAgrupador: '110.02' },
  { code: '216.01', name: 'IVA por pagar', type: 'LIABILITY', satAgrupador: '209.01' },
  { code: '210.01', name: 'ISR por pagar', type: 'LIABILITY', satAgrupador: '210.01' },
  { code: '211.01', name: 'IMSS por pagar', type: 'LIABILITY', satAgrupador: '211.01' },
  { code: '212.01', name: 'INFONAVIT por pagar', type: 'LIABILITY', satAgrupador: '212.01' },
  { code: '213.01', name: 'ISR retenido por sueldos', type: 'LIABILITY', satAgrupador: '213.01' },
  { code: '214.01', name: 'Sueldos por pagar', type: 'LIABILITY', satAgrupador: '214.01' },
  { code: '215.01', name: 'PTU por pagar', type: 'LIABILITY', satAgrupador: '215.01' },
  { code: '220.01', name: 'Préstamos bancarios corto plazo', type: 'LIABILITY', satAgrupador: '220.01' },
  { code: '250.01', name: 'Préstamos bancarios largo plazo', type: 'LIABILITY', satAgrupador: '250.01' },

  // ── Capital ─────────────────────────────────────────────────────────
  { code: '301.01', name: 'Capital social', type: 'EQUITY', satAgrupador: '301.01' },
  { code: '302.01', name: 'Aportaciones para futuros aumentos', type: 'EQUITY', satAgrupador: '302.01' },
  { code: '304.01', name: 'Utilidades retenidas', type: 'EQUITY', satAgrupador: '304.01' },
  { code: '305.01', name: 'Resultado del ejercicio', type: 'EQUITY', satAgrupador: '305.01' },
  { code: '306.01', name: 'Pérdidas acumuladas', type: 'EQUITY', satAgrupador: '306.01' },

  // ── Ingresos ────────────────────────────────────────────────────────
  { code: '401.01', name: 'Ingresos por servicios', type: 'REVENUE', satAgrupador: '401.01' },
  { code: '401.02', name: 'Ingresos por proyectos', type: 'REVENUE', satAgrupador: '401.02' },
  { code: '401.03', name: 'Ingresos por mantenimiento', type: 'REVENUE', satAgrupador: '401.03' },
  { code: '402.01', name: 'Venta de mercancías', type: 'REVENUE', satAgrupador: '402.01' },
  { code: '403.01', name: 'Otros ingresos', type: 'REVENUE', satAgrupador: '403.01' },
  { code: '404.01', name: 'Productos financieros', type: 'REVENUE', satAgrupador: '404.01' },

  // ── Costos ──────────────────────────────────────────────────────────
  { code: '501.01', name: 'Costo de ventas', type: 'EXPENSE', satAgrupador: '501.01' },
  { code: '502.01', name: 'Costo de servicios', type: 'EXPENSE', satAgrupador: '502.01' },
  { code: '503.01', name: 'Costo de proyectos', type: 'EXPENSE', satAgrupador: '503.01' },

  // ── Gastos de operación ─────────────────────────────────────────────
  { code: '601.01', name: 'Gastos de administración', type: 'EXPENSE', satAgrupador: '601.01' },
  { code: '601.02', name: 'Viáticos y gastos de viaje', type: 'EXPENSE', satAgrupador: '601.02' },
  { code: '601.03', name: 'Papelería y útiles', type: 'EXPENSE', satAgrupador: '601.03' },
  { code: '601.04', name: 'Teléfono e internet', type: 'EXPENSE', satAgrupador: '601.04' },
  { code: '601.05', name: 'Energía eléctrica', type: 'EXPENSE', satAgrupador: '601.05' },
  { code: '601.06', name: 'Renta de oficinas', type: 'EXPENSE', satAgrupador: '601.06' },
  { code: '601.07', name: 'Seguros y fianzas', type: 'EXPENSE', satAgrupador: '601.07' },
  { code: '601.08', name: 'Honorarios profesionales', type: 'EXPENSE', satAgrupador: '601.08' },
  { code: '601.09', name: 'Mantenimiento y conservación', type: 'EXPENSE', satAgrupador: '601.09' },
  { code: '601.10', name: 'Combustibles y lubricantes', type: 'EXPENSE', satAgrupador: '601.10' },
  { code: '601.11', name: 'Publicidad y propaganda', type: 'EXPENSE', satAgrupador: '601.11' },
  { code: '601.12', name: 'Capacitación', type: 'EXPENSE', satAgrupador: '601.12' },
  { code: '601.13', name: 'Software y suscripciones', type: 'EXPENSE', satAgrupador: '601.13' },
  { code: '601.14', name: 'Gastos de representación', type: 'EXPENSE', satAgrupador: '601.14' },
  { code: '601.15', name: 'Depreciación del ejercicio', type: 'EXPENSE', satAgrupador: '601.15' },
  { code: '602.01', name: 'Sueldos y salarios', type: 'EXPENSE', satAgrupador: '602.01' },
  { code: '602.02', name: 'Cuotas patronales IMSS', type: 'EXPENSE', satAgrupador: '602.02' },
  { code: '602.03', name: 'Aportaciones INFONAVIT', type: 'EXPENSE', satAgrupador: '602.03' },
  { code: '602.04', name: 'Prima vacacional', type: 'EXPENSE', satAgrupador: '602.04' },
  { code: '602.05', name: 'Aguinaldo', type: 'EXPENSE', satAgrupador: '602.05' },
  { code: '602.06', name: 'PTU', type: 'EXPENSE', satAgrupador: '602.06' },
  { code: '603.01', name: 'Comisiones bancarias', type: 'EXPENSE', satAgrupador: '603.01' },
  { code: '603.02', name: 'Intereses a cargo', type: 'EXPENSE', satAgrupador: '603.02' },
  { code: '604.01', name: 'ISR del ejercicio', type: 'EXPENSE', satAgrupador: '604.01' },
  { code: '605.01', name: 'Gastos no deducibles', type: 'EXPENSE', satAgrupador: '605.01' },
  { code: '606.01', name: 'Pérdida cambiaria', type: 'EXPENSE', satAgrupador: '606.01' },
];
