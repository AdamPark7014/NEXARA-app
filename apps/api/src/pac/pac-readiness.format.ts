import type { PacHallazgo, PacReadinessReport } from './pac-readiness.js';

/**
 * Versión en texto plano del reporte de preparación, para la terminal.
 * Pura: solo formatea lo que ya trae el reporte (que no contiene secretos).
 */

const si = (v: boolean | null | undefined): string => (v === true ? 'sí' : v === false ? 'no' : 'n/d');

const ETAPA: Record<PacReadinessReport['etapa'], string> = {
  apagado_mock: 'APAGADO (modo de prueba)',
  configuracion_incompleta: 'CONFIGURACIÓN INCOMPLETA',
  pruebas_sandbox: 'ENSAYO EN SANDBOX (pruebas)',
  listo_para_produccion: 'LISTO PARA PRODUCCIÓN',
};

function bloque(titulo: string, items: PacHallazgo[], marca: string): string[] {
  if (items.length === 0) return [];
  const out = ['', `${titulo} (${items.length})`];
  items.forEach((h, i) => {
    out.push(`  ${marca} ${i + 1}. ${h.mensaje}`);
    out.push(`       Qué hacer: ${h.accion}`);
    out.push(`       [${h.codigo}]`);
  });
  return out;
}

export function formateaReporteTexto(r: PacReadinessReport): string {
  const l: string[] = [];
  l.push('REVISIÓN PREVIA A FACTURAR (CFDI 4.0)');
  l.push('=====================================');
  l.push(`Fecha:            ${r.generadoEn}`);
  l.push(`Estado:           ${ETAPA[r.etapa]}`);
  l.push(`¿Listo para producción?  ${r.listoParaProduccion ? 'SÍ' : 'NO'}`);
  l.push(r.resumen);
  l.push('');
  l.push('Servidor');
  l.push(`  Modo producción (NODE_ENV):        ${si(r.servidor.esProduccion)}`);
  l.push('Servicio de timbrado (PAC)');
  l.push(`  Proveedor en uso:                  ${r.pac.proveedor}${r.pac.proveedorDeclarado === 'no_reconocido' ? ' (el valor escrito no se reconoce)' : ''}`);
  l.push(`  Es modo de prueba (mock):          ${si(r.pac.esMock)}`);
  l.push(`  Respaldo a mock (configurado/efectivo): ${si(r.pac.respaldoAMock.configurado)}/${si(r.pac.respaldoAMock.efectivo)}`);
  if (!r.pac.esMock) {
    l.push(`  Dirección definida:                ${si(r.pac.url.definida)}${r.pac.url.esPorDefecto ? ' (se usaría la de pruebas por omisión)' : ''}`);
    l.push(`  Servidor del proveedor (hostname): ${r.pac.url.hostname ?? 'n/d'}`);
    l.push(`  Ambiente:                          ${r.pac.url.ambiente ?? 'n/d'}${r.pac.url.https === false ? ' (SIN https)' : ''}`);
    l.push(`  Credenciales completas:            ${si(r.pac.credenciales.completas)}${r.pac.credenciales.faltantes.length ? ` — faltan: ${r.pac.credenciales.faltantes.join(', ')}` : ''}`);
  }
  l.push('Certificado de sello digital (CSD) en el servidor');
  l.push(`  Se exige en el servidor:           ${si(r.csd.requeridoEnServidor)}${r.pac.csdEnElProveedor ? ' (con este proveedor el CSD vive en su cuenta)' : ''}`);
  l.push(`  Estado:                            ${r.csd.estado}${r.csd.motivoError ? ` (${r.csd.motivoError})` : ''}`);
  if (r.csd.cargado) {
    l.push(`  Número de certificado:             ${r.csd.numeroCertificado ?? 'n/d'}`);
    l.push(`  Vigencia:                          ${r.csd.vigenteDesde ?? 'n/d'} a ${r.csd.vigenteHasta ?? 'n/d'} (${r.csd.diasRestantes ?? 'n/d'} día(s) restantes)`);
  }
  l.push('Datos fiscales del emisor (Nexara)');
  if (!r.emisor.verificado) {
    l.push('  No verificados (no se consultó la base de datos; use --db).');
  } else {
    l.push(`  Completos:                         ${si(r.emisor.completo)}${r.emisor.camposFaltantes.length ? ` — faltan: ${r.emisor.camposFaltantes.join(', ')}` : ''}`);
    l.push(`  Origen de los datos:               ${r.emisor.fuente ?? 'n/d'}`);
    l.push(`  RFC con formato válido:            ${si(r.emisor.rfcValido)}${r.emisor.tipoPersona ? ` (persona ${r.emisor.tipoPersona.toLowerCase()})` : ''}`);
    l.push(`  Régimen válido:                    ${si(r.emisor.regimenValido)}`);
    l.push(`  Código postal válido:              ${si(r.emisor.codigoPostalValido)}`);
  }
  if (r.facturas) {
    l.push('Facturas existentes (por cobrar)');
    l.push(`  Timbradas:                         ${r.facturas.timbradas}`);
    l.push(`  Con sello de prueba (mock):        ${r.facturas.conSelloDePrueba}`);
    l.push(`  Timbradas sin póliza contable:     ${r.facturas.timbradasSinPoliza}`);
  }
  l.push(...bloque('BLOQUEOS — impiden facturar en producción', r.bloqueos, '[X]'));
  l.push(...bloque('ADVERTENCIAS — no bloquean, pero conviene revisarlas', r.advertencias, '[!]'));
  if (r.verificacionManual.length) {
    l.push('', `VERIFICACIÓN MANUAL — lo que este reporte no puede comprobar (${r.verificacionManual.length})`);
    r.verificacionManual.forEach((t, i) => l.push(`  [ ] ${i + 1}. ${t}`));
  }
  l.push('');
  return l.join('\n');
}
