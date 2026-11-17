export type CfdiCruce = { id: number; uuid: string; total: number; estatusSat: string; journalEntryId?: number|null; invoiceId?: number|null; lista69B?: string|null }
export type PolizaCruce = { id: number; entryNumber: string; uuid?: string|null; date: string }
export type AlertaCruce = { tipo: 'cfdi_sin_poliza'|'poliza_sin_uuid'|'cfdi_cancelado_contabilizado'|'lista_69b'; id: number; uuid?: string|null; detalle: string }
export function crucesSatLibros(cfdis: CfdiCruce[], polizas: PolizaCruce[]): AlertaCruce[] {
    const alertas: AlertaCruce[] = [];
    
    // 1. Detectar cfdi_sin_poliza: CFDI vigente sin journalEntryId
    for (const cfdi of cfdis) {
        if (!cfdi.journalEntryId && !['cancelado', 'reembolsado'].includes(cfdi.estatusSat.toLowerCase())) {
            alertas.push({
                tipo: 'cfdi_sin_poliza',
                id: cfdi.id,
                uuid: cfdi.uuid,
                detalle: `CFDI con ID ${cfdi.id} no asociado a ninguna póliza.`
            });
        }
    }

    // 2. Detectar poliza_sin_uuid: póliza sin uuid (null/vacío)
    for (const poliza of polizas) {
        if (!poliza.uuid || poliza.uuid.trim() === '') {
            alertas.push({
                tipo: 'poliza_sin_uuid',
                id: poliza.id,
                uuid: poliza.uuid,
                detalle: `Póliza con ID ${poliza.id} no tiene UUID asignado.`
            });
        }
    }

    // 3. Detectar cfdi_cancelado_contabilizado: estatusSat cancelado Y tiene journalEntryId
    for (const cfdi of cfdis) {
        if ((cfdi.estatusSat || '').toLowerCase() === 'cancelado' && cfdi.journalEntryId) {
            alertas.push({
                tipo: 'cfdi_cancelado_contabilizado',
                id: cfdi.id,
                uuid: cfdi.uuid,
                detalle: `CFDI con ID ${cfdi.id} cancelado pero contabilizado.`
            });
        }
    }

    // 4. Detectar lista_69b: lista69B truthy
    for (const cfdi of cfdis) {
        if (cfdi.lista69B && String(cfdi.lista69B).trim() !== '') {
            alertas.push({
                tipo: 'lista_69b',
                id: cfdi.id,
                uuid: cfdi.uuid,
                detalle: `CFDI con ID ${cfdi.id} tiene información de lista 69B.`
            });
        }
    }

    return alertas;
}