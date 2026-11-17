/**
 * Parsers de estado de cuenta (BBVA, Banorte, Santander, OFX). Sin Nest ni exceljs.
 */

export type MovimientoImportado = {
  date: string;
  amount: number;
  isDebit: boolean;
  description: string;
  reference?: string | null;
  balance?: number | null;
};

export type BancoLayout = 'bbva' | 'banorte' | 'santander' | 'auto';

export function parseNumeroMx(raw: string | number | null | undefined): number {
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : 0;
  if (raw == null) return 0;
  let s = String(raw).trim().replace(/\$/g, '').replace(/\s/g, '');
  if (!s || s === '-') return 0;
  if (s.includes(',') && s.includes('.')) {
    if (s.lastIndexOf(',') > s.lastIndexOf('.')) {
      s = s.replace(/\./g, '').replace(',', '.');
    } else {
      s = s.replace(/,/g, '');
    }
  } else if (s.includes(',')) {
    s = s.replace(',', '.');
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

export function parseFechaMx(raw: string | number | null | undefined): string | null {
  if (raw == null || raw === '') return null;
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    // Excel serial (días desde 1899-12-30)
    const epoch = Date.UTC(1899, 11, 30) + Math.round(raw) * 86_400_000;
    return new Date(epoch).toISOString().slice(0, 10);
  }
  const s = String(raw).trim();
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const dmy = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/);
  if (dmy) {
    const dd = dmy[1].padStart(2, '0');
    const mm = dmy[2].padStart(2, '0');
    let yy = dmy[3];
    if (yy.length === 2) yy = Number(yy) > 70 ? `19${yy}` : `20${yy}`;
    return `${yy}-${mm}-${dd}`;
  }
  const ofx = s.match(/^(\d{4})(\d{2})(\d{2})/);
  if (ofx) return `${ofx[1]}-${ofx[2]}-${ofx[3]}`;
  return null;
}

function normHeader(h: string): string {
  return h
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function detectarLayout(headers: string[]): Exclude<BancoLayout, 'auto'> | null {
  const h = headers.map(normHeader).join('|');
  if (h.includes('retiro') || h.includes('deposito')) {
    return 'banorte';
  }
  if (h.includes('cargo') && h.includes('abono')) {
    // BBVA y Santander comparten Cargo/Abono; sin señal extra asumimos BBVA.
    return 'bbva';
  }
  if (h.includes('concepto') || h.includes('descripcion')) return 'bbva';
  return null;
}

function splitCsvLine(line: string, sep: string): string[] {
  const out: string[] = [];
  let cur = '';
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      q = !q;
      continue;
    }
    if (!q && c === sep) {
      out.push(cur);
      cur = '';
      continue;
    }
    cur += c;
  }
  out.push(cur);
  return out.map((x) => x.trim());
}

function detectarSeparador(primera: string): string {
  const commas = (primera.match(/,/g) || []).length;
  const semis = (primera.match(/;/g) || []).length;
  return semis > commas ? ';' : ',';
}

function idxDe(headers: string[], ...nombres: string[]): number {
  const n = headers.map(normHeader);
  for (const nombre of nombres) {
    const i = n.findIndex((h) => h === nombre || h.includes(nombre));
    if (i >= 0) return i;
  }
  return -1;
}

function filasAMovimientos(
  filas: string[][],
  layout: BancoLayout,
): MovimientoImportado[] {
  if (!filas.length) return [];
  const headers = filas[0];
  const resolved = layout === 'auto' ? detectarLayout(headers) ?? 'bbva' : layout;
  const iFecha = idxDe(headers, 'fecha', 'date');
  const iDesc = idxDe(headers, 'concepto', 'descripcion', 'description', 'detalle');
  const iCargo = idxDe(headers, 'cargo', 'retiro', 'retiros', 'cargo/abono');
  const iAbono = idxDe(headers, 'abono', 'deposito', 'depositos', 'depósito');
  const iImporte = idxDe(headers, 'importe', 'monto', 'amount');
  const iSaldo = idxDe(headers, 'saldo', 'balance');
  const iRef = idxDe(headers, 'referencia', 'ref', 'folio', 'clave');

  const out: MovimientoImportado[] = [];
  for (let r = 1; r < filas.length; r++) {
    const row = filas[r];
    if (!row || row.every((c) => !String(c ?? '').trim())) continue;
    const date = parseFechaMx(iFecha >= 0 ? row[iFecha] : row[0]);
    if (!date) continue;
    const description = String((iDesc >= 0 ? row[iDesc] : row[1]) ?? '').trim() || 'Movimiento';
    const reference = iRef >= 0 ? String(row[iRef] ?? '').trim() || null : null;
    const balance = iSaldo >= 0 ? parseNumeroMx(row[iSaldo]) : null;

    let amount = 0;
    let isDebit = false;
    if (resolved === 'banorte') {
      const retiro = iCargo >= 0 ? parseNumeroMx(row[iCargo]) : 0;
      const deposito = iAbono >= 0 ? parseNumeroMx(row[iAbono]) : 0;
      if (retiro > 0) {
        amount = retiro;
        isDebit = true;
      } else {
        amount = Math.abs(deposito);
        isDebit = false;
      }
    } else if (iCargo >= 0 || iAbono >= 0) {
      const cargo = iCargo >= 0 ? parseNumeroMx(row[iCargo]) : 0;
      const abono = iAbono >= 0 ? parseNumeroMx(row[iAbono]) : 0;
      if (cargo > 0) {
        amount = cargo;
        isDebit = true;
      } else {
        amount = Math.abs(abono);
        isDebit = false;
      }
    } else {
      const importe = parseNumeroMx(iImporte >= 0 ? row[iImporte] : row[2]);
      amount = Math.abs(importe);
      isDebit = importe < 0;
    }
    if (amount === 0 && !description) continue;
    out.push({ date, amount, isDebit, description, reference, balance });
  }
  return out;
}

export function parseCsvEstadoCuenta(texto: string, layout: BancoLayout): MovimientoImportado[] {
  const lines = texto.replace(/^\uFEFF/, '').split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length) return [];
  const sep = detectarSeparador(lines[0]);
  const filas = lines.map((l) => splitCsvLine(l, sep));
  return filasAMovimientos(filas, layout);
}

export function parseExcelFilasEstadoCuenta(
  filas: Array<Array<string | number | null | undefined>>,
  layout: BancoLayout,
): MovimientoImportado[] {
  const normalizadas = filas.map((row) => row.map((c) => (c == null ? '' : String(c))));
  return filasAMovimientos(normalizadas, layout);
}

export function parseOfxEstadoCuenta(texto: string): MovimientoImportado[] {
  const bloques = texto.split(/<STMTTRN>/i).slice(1);
  const out: MovimientoImportado[] = [];
  for (const b of bloques) {
    const tag = (name: string) => {
      const m = b.match(new RegExp(`<${name}>([^<\\r\\n]+)`, 'i'));
      return m?.[1]?.trim() ?? '';
    };
    const date = parseFechaMx(tag('DTPOSTED'));
    const amt = parseNumeroMx(tag('TRNAMT'));
    if (!date || !Number.isFinite(amt) || amt === 0) continue;
    const description = tag('MEMO') || tag('NAME') || 'Movimiento OFX';
    const reference = tag('FITID') || tag('CHECKNUM') || null;
    out.push({
      date,
      amount: Math.abs(amt),
      isDebit: amt < 0,
      description,
      reference,
      balance: null,
    });
  }
  return out;
}
