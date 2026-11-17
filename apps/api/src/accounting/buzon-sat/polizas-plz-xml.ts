export type PolizaXmlLinea = { numCta: string; concepto: string; debe: number; haber: number }
export type PolizaXml = { numUnIdenPol: string; fecha: string /*YYYY-MM-DD*/; concepto: string; lineas: PolizaXmlLinea[] }
export function escapeXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;")
}
export function buildPolizasPeriodoXml(input: { rfc: string; mes: number; anio: number; polizas: PolizaXml[] }): string {
  const { rfc, mes, anio, polizas } = input
  const xmlLines: string[] = []
  for (const plz of polizas) {
    const lines = []
    for (const line of plz.lineas) {
      lines.push(`<PLZ:Transaccion NumCta="${line.numCta}" DesCta="" Concepto="${escapeXml(line.concepto)}" Debe="${line.debe.toFixed(2)}" Haber="${line.haber.toFixed(2)}"/>`)
    }
    const poliza = `<PLZ:Poliza NumUnIdenPol="${plz.numUnIdenPol}" Fecha="${plz.fecha}" Concepto="${escapeXml(plz.concepto)}">${lines.join('')}</PLZ:Poliza>`
    xmlLines.push(poliza)
  }
  return `<?xml version="1.0" encoding="UTF-8"?>
<PLZ:Polizas xmlns:PLZ="http://www.sat.gob.mx/esquemas/ContabilidadE/1_3/PolizasPeriodo" Version="1.3" RFC="${rfc}" Mes="${mes.toString().padStart(2, '0')}" Anio="${anio}" TipoSolicitud="AF">
  ${xmlLines.join('\n')}
</PLZ:Polizas>`
}