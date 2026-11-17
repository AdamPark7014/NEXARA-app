export type TipoCfdiPlantilla = 'I' | 'E' | 'P' | 'N';
export type RenglonPlantilla = { codigo: string; debeExpr: 'base' | 'iva' | 'total' | 'ret_iva' | 'ret_isr' | 'cero'; haberExpr: 'base' | 'iva' | 'total' | 'ret_iva' | 'ret_isr' | 'cero'; etiqueta: string };
export type PlantillaPoliza = { tipo: TipoCfdiPlantilla; nombre: string; renglones: RenglonPlantilla[] };
export const PLANTILLAS_DEFAULT: PlantillaPoliza[] = [
  {
    tipo: 'I',
    nombre: 'Ingreso Emitido Cobrado',
    renglones: [
      { codigo: '10', debeExpr: 'total', haberExpr: 'cero', etiqueta: 'Banco (Debe)' },
      { codigo: '20', debeExpr: 'cero', haberExpr: 'base', etiqueta: 'Ingresos (Haber Base)' },
      { codigo: '30', debeExpr: 'cero', haberExpr: 'iva', etiqueta: 'IVA Traslado (Haber IVA)' }
    ]
  },
  {
    tipo: 'E',
    nombre: 'Egreso Simplificado',
    renglones: [
      { codigo: '10', debeExpr: 'cero', haberExpr: 'base', etiqueta: 'Ingresos o Gastos (Haber)' },
      { codigo: '20', debeExpr: 'base', haberExpr: 'cero', etiqueta: 'Egresos (Debe)' }
    ]
  },
  {
    tipo: 'P',
    nombre: 'Pago REP',
    renglones: [
      { codigo: '10', debeExpr: 'total', haberExpr: 'cero', etiqueta: 'Banco (Debe)' },
      { codigo: '20', debeExpr: 'cero', haberExpr: 'total', etiqueta: 'Clientes / Proveedores (Haber)' }
    ]
  },
  {
    tipo: 'N',
    nombre: 'Nomina',
    renglones: [
      { codigo: '10', debeExpr: 'base', haberExpr: 'cero', etiqueta: 'Gasto Nomina (Debe Base)' },
      { codigo: '20', debeExpr: 'ret_iva', haberExpr: 'cero', etiqueta: 'Retencion IVA ISR (Haber)' },
      { codigo: '30', debeExpr: 'ret_isr', haberExpr: 'cero', etiqueta: 'Retencion ISR (Haber)' },
      { codigo: '40', debeExpr: 'cero', haberExpr: 'base', etiqueta: 'Bancos/Impuestos por Pagar (Haber Base)' }
    ]
  }
];
export function plantillaPorTipo(tipo: string, custom?: PlantillaPoliza[]): PlantillaPoliza | null {
  if (custom && custom.length > 0) {
    const item = custom.find(c => c.tipo === tipo);
    return item || null;
  }
  const defaultItem = PLANTILLAS_DEFAULT.find(p => p.tipo === tipo.toUpperCase());
  return defaultItem || null;
}
export function materializarPlantilla(p: PlantillaPoliza, montos: { base: number; iva: number; total: number; retIva?: number; retIsr?: number }): Array<{ codigo: string; debe: number; haber: number; etiqueta: string }> {
  return p.renglones.map(renglon => {
    const val = (expr: string) => expr === 'cero' ? 0 : expr === 'ret_iva' ? (montos.retIva ?? 0) : expr === 'ret_isr' ? (montos.retIsr ?? 0) : (montos as any)[expr] || 0;
    const debe = val(renglon.debeExpr);
    const haber = val(renglon.haberExpr);
    return { codigo: renglon.codigo, debe, haber, etiqueta: renglon.etiqueta };
  });
}