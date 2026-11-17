export type ItemCierre = { id: string; etiqueta: string; hecho: number; total: number; href: string }
export type TableroMiCierre = { avancePct: number; items: ItemCierre[]; generadoEl?: string }
export function armarMiCierre(input: {
  bancosConciliados: number; bancosTotal: number;
  cfdiSinPoliza: number; cfdiRecibidosVigentes: number;
  repPendientes: number; repTotal: number;
  diotPendiente: boolean;
  efos69b: number;
}): TableroMiCierre {
  const calcularItem = (id: string, etiqueta: string, hecho: number, total: number, href: string): ItemCierre => ({ id, etiqueta, hecho, total, href });

  const itemBancos = calcularItem('bancos', 'Bancos conciliados', input.bancosConciliados, input.bancosTotal, '/erp/contabilidad/conciliacion');
  const itemCfdi = calcularItem('cfdi', 'CFDI sin póliza', input.cfdiRecibidosVigentes - input.cfdiSinPoliza, input.cfdiRecibidosVigentes, '/erp/contabilidad/cfdi?pestana=alertas');
  const itemRep = calcularItem('rep', 'REP pendientes', input.repTotal - input.repPendientes, input.repTotal, '/erp/contabilidad/cfdi?pestana=alertas');
  const itemDiot = calcularItem('diot', 'DIOT', input.diotPendiente ? 0 : 1, 1, '/erp/contabilidad/reportes');
  const itemEfos = calcularItem('efos', 'EFOS 69-B', input.efos69b === 0 ? 1 : 0, 1, '/erp/contabilidad/cfdi?pestana=alertas');

  const items = [itemBancos, itemCfdi, itemRep, itemDiot, itemEfos];
  const sumHecho = items.reduce((acc, item) => acc + item.hecho, 0);
  const sumTotal = items.reduce((acc, item) => acc + item.total, 0);
  const avancePct = sumTotal === 0 ? 100 : Math.round(100 * sumHecho / sumTotal);

  return { avancePct, items, generadoEl: new Date().toISOString() };
}