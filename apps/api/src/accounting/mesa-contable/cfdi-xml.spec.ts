import { CfdiInvalidoError, leerCfdi, uuidCorto } from './cfdi-xml.js';

/** CFDI 4.0 recortado: hospedaje con IVA 16 % y un concepto con su propio bloque de impuestos. */
const HOSPEDAJE = `<?xml version="1.0" encoding="UTF-8"?>
<cfdi:Comprobante xmlns:cfdi="http://www.sat.gob.mx/cfd/4" Version="4.0" Serie="H" Folio="9921"
  Fecha="2026-10-27T21:14:03" SubTotal="1250.00" Moneda="MXN" Total="1450.00" TipoDeComprobante="I"
  MetodoPago="PUE" FormaPago="04" Exportacion="01" LugarExpedicion="74200">
  <cfdi:Emisor Rfc="HAT1203158K1" Nombre="HOTEL DEL ATLIXCO &amp; SPA" RegimenFiscal="601"/>
  <cfdi:Receptor Rfc="NEX150611QJ8" Nombre="NEXARA" DomicilioFiscalReceptor="72000" RegimenFiscalReceptor="601" UsoCFDI="G03"/>
  <cfdi:Conceptos>
    <cfdi:Concepto ClaveProdServ="90111500" Cantidad="1" ClaveUnidad="E48" Descripcion="Hospedaje" ValorUnitario="1250.00" Importe="1250.00" ObjetoImp="02">
      <cfdi:Impuestos><cfdi:Traslados><cfdi:Traslado Base="1250.00" Impuesto="002" TipoFactor="Tasa" TasaOCuota="0.160000" Importe="200.00"/></cfdi:Traslados></cfdi:Impuestos>
    </cfdi:Concepto>
  </cfdi:Conceptos>
  <cfdi:Impuestos TotalImpuestosTrasladados="200.00">
    <cfdi:Traslados><cfdi:Traslado Base="1250.00" Impuesto="002" TipoFactor="Tasa" TasaOCuota="0.160000" Importe="200.00"/></cfdi:Traslados>
  </cfdi:Impuestos>
  <cfdi:Complemento>
    <tfd:TimbreFiscalDigital xmlns:tfd="http://www.sat.gob.mx/TimbreFiscalDigital" Version="1.1"
      UUID="6f1c2b8e-3d4a-4c1e-9b7f-2a5d8e0c9c1e" FechaTimbrado="2026-10-27T21:15:00"/>
  </cfdi:Complemento>
</cfdi:Comprobante>`;

describe('leerCfdi', () => {
  it('lee importes, partes y UUID de un CFDI 4.0', () => {
    const c = leerCfdi(HOSPEDAJE);
    expect(c.uuid).toBe('6F1C2B8E-3D4A-4C1E-9B7F-2A5D8E0C9C1E');
    expect(c.fecha).toBe('2026-10-27');
    expect(c.total).toBe(1450);
    expect(c.subtotal).toBe(1250);
    expect(c.emisor).toEqual({ rfc: 'HAT1203158K1', nombre: 'HOTEL DEL ATLIXCO & SPA', regimen: '601' });
    expect(c.receptor.rfc).toBe('NEX150611QJ8');
    expect(c.receptor.uso).toBe('G03');
    expect(c.metodoPago).toBe('PUE');
  });

  it('cuenta el IVA del documento una sola vez, no el de cada concepto', () => {
    expect(leerCfdi(HOSPEDAJE).iva).toBe(200);
  });

  it('separa IEPS del IVA y lee las retenciones', () => {
    const conIeps = HOSPEDAJE.replace(
      '<cfdi:Impuestos TotalImpuestosTrasladados="200.00">',
      '<cfdi:Impuestos TotalImpuestosTrasladados="262.50" TotalImpuestosRetenidos="125.00">',
    ).replace(
      '</cfdi:Traslados>\n  </cfdi:Impuestos>',
      '<cfdi:Traslado Base="1250.00" Impuesto="003" TipoFactor="Tasa" TasaOCuota="0.050000" Importe="62.50"/></cfdi:Traslados>\n  </cfdi:Impuestos>',
    );
    const c = leerCfdi(conIeps);
    expect(c.iva).toBe(200);
    expect(c.otrosTraslados).toBe(62.5);
    expect(c.retenciones).toBe(125);
  });

  it('no depende del prefijo cfdi:', () => {
    const sinPrefijo = HOSPEDAJE.replace(/cfdi:/g, '');
    expect(leerCfdi(sinPrefijo).iva).toBe(200);
  });

  it('un comprobante sin impuestos da IVA cero', () => {
    const exento = HOSPEDAJE.replace(/<cfdi:Impuestos TotalImpuestosTrasladados[\s\S]*?<\/cfdi:Impuestos>/, '');
    expect(leerCfdi(exento).iva).toBe(0);
  });

  it('rechaza lo que no es CFDI o no está timbrado', () => {
    expect(() => leerCfdi('')).toThrow(CfdiInvalidoError);
    expect(() => leerCfdi('<factura total="10"/>')).toThrow('falta el nodo Comprobante');
    expect(() => leerCfdi(HOSPEDAJE.replace(/UUID="[^"]+"/, ''))).toThrow('no está timbrado');
    expect(() => leerCfdi(HOSPEDAJE.replace('Rfc="HAT1203158K1"', 'Rfc="XXX"'))).toThrow('RFC');
  });

  it('muestra los últimos cuatro del UUID', () => {
    expect(uuidCorto('6f1c2b8e-3d4a-4c1e-9b7f-2a5d8e0c9c1e')).toBe('…9C1E');
    expect(uuidCorto(null)).toBe('');
  });
});
