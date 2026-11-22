import { ValidationPipe, type ValidationError } from '@nestjs/common';

/**
 * Los mensajes por defecto de `class-validator` salen en inglés y con el nombre interno del campo
 * («amount must be a positive number»). Unas 1,300 reglas de los DTO no traen mensaje propio, así
 * que eso era lo que leía la gente cuando el servidor rechazaba un formulario.
 *
 * Aquí se traducen en un solo lugar. Solo cambia el texto: mismo 400, misma forma de respuesta
 * (`message: string[]`). Un mensaje propio de un DTO (ya en español) pasa tal cual, y uno que no se
 * reconozca también: nunca se esconde lo que el servidor dijo.
 */

/** Nombre del campo como se le dice a una persona, con artículo. Lo que no está aquí sale «el campo «x»». */
const ETIQUETAS: Record<string, string> = {
  name: 'el nombre',
  nombre: 'el nombre',
  description: 'la descripción',
  descripcion: 'la descripción',
  status: 'el estado',
  estado: 'el estado',
  notes: 'la nota',
  notas: 'la nota',
  note: 'la nota',
  nota: 'la nota',
  title: 'el título',
  titulo: 'el título',
  startDate: 'la fecha de inicio',
  endDate: 'la fecha de fin',
  dueDate: 'la fecha límite',
  issueDate: 'la fecha de emisión',
  plannedDate: 'la fecha planeada',
  fecha: 'la fecha',
  from: 'el inicio del rango',
  to: 'el fin del rango',
  responsableId: 'el responsable',
  ownerId: 'el responsable',
  managerId: 'el jefe directo',
  userId: 'la persona',
  usuarioId: 'la persona',
  employeeId: 'el empleado',
  employeeNumber: 'el número de empleado',
  departmentId: 'el área',
  category: 'la categoría',
  categoria: 'la categoría',
  currency: 'la moneda',
  email: 'el correo',
  password: 'la contraseña',
  telefono: 'el teléfono',
  phone: 'el teléfono',
  type: 'el tipo',
  tipo: 'el tipo',
  motivo: 'el motivo',
  reason: 'el motivo',
  cancelReason: 'el motivo de cancelación',
  justificacion: 'la justificación',
  decision: 'la decisión',
  amount: 'el monto',
  monto: 'el monto',
  montoSolicitado: 'el monto solicitado',
  budgetAmount: 'el presupuesto',
  unitPrice: 'el precio unitario',
  unitCost: 'el costo unitario',
  discount: 'el descuento',
  exchangeRate: 'el tipo de cambio',
  quantity: 'la cantidad',
  cantidad: 'la cantidad',
  unit: 'la unidad',
  concepto: 'el concepto',
  detalle: 'el detalle',
  texto: 'el texto',
  message: 'el mensaje',
  indicaciones: 'las indicaciones',
  summary: 'el resumen',
  reference: 'la referencia',
  comprobante: 'el comprobante',
  code: 'el código',
  codigo: 'el código',
  clave: 'la clave',
  sku: 'el SKU',
  rfc: 'el RFC',
  clabe: 'la CLABE',
  bankName: 'el banco',
  accountNumber: 'el número de cuenta',
  tags: 'las etiquetas',
  items: 'los renglones',
  orden: 'el orden',
  progress: 'el avance',
  score: 'la calificación',
  role: 'el rol',
  roleKey: 'el rol',
  clientId: 'el cliente',
  clienteId: 'el cliente',
  cotizacionId: 'la cotización',
  actividadId: 'la actividad',
  activityId: 'la actividad',
  projectId: 'el proyecto',
  vehicleId: 'el vehículo',
  productId: 'el producto',
  supplierId: 'el proveedor',
  vendorId: 'el proveedor',
};

function etiquetaDe(ruta: string): string {
  const partes = ruta.split('.');
  const campo = partes[partes.length - 1] ?? ruta;
  const base = ETIQUETAS[campo] ?? `el campo «${campo}»`;
  // «items.0.quantity»: el renglón se cuenta desde 1, como lo ve quien llenó el formulario.
  const indice = [...partes].reverse().find((p) => /^\d+$/.test(p));
  return indice === undefined ? base : `${base} del renglón ${Number(indice) + 1}`;
}

const mayuscula = (texto: string) => texto.charAt(0).toUpperCase() + texto.slice(1);
/** «de el nombre» se dice «del nombre». */
const de = (etiqueta: string) => (etiqueta.startsWith('el ') ? `del ${etiqueta.slice(3)}` : `de ${etiqueta}`);
const VACIO = /^should not be (empty|null or undefined)$/;

/** «Las etiquetas debe ser una lista» no: con un campo en plural el verbo también va en plural. */
const EN_PLURAL: Array<[RegExp, string]> = [
  [/^Falta /, 'Faltan '],
  [/ debe /, ' deben '],
  [/ admite /, ' admiten '],
  [/ no es /, ' no son '],
  [/ no puede /, ' no pueden '],
  [/ no tiene /, ' no tienen '],
];
function concordar(frase: string, etiqueta: string): string {
  if (!/^(las|los) /.test(etiqueta)) return frase;
  for (const [singular, plural] of EN_PLURAL) {
    if (singular.test(frase)) return frase.replace(singular, plural);
  }
  return frase;
}
const caracteres = (n: string) => (n === '1' ? '1 carácter' : `${n} caracteres`);
const elementos = (n: string) => (n === '1' ? '1 elemento' : `${n} elementos`);

/** Predicado en español para lo que sigue al nombre del campo, o `null` si no es un mensaje por defecto. */
function predicado(resto: string): ((sujeto: string) => string) | null {
  let m: RegExpExecArray | null;
  if (VACIO.test(resto)) return (s) => `Falta ${s}`;
  if (/^must be a string$/.test(resto)) return (s) => `${mayuscula(s)} debe ser texto`;
  if (/^must be a number conforming to the specified constraints$/.test(resto) || /^must be a number string$/.test(resto)) {
    return (s) => `${mayuscula(s)} debe ser un número`;
  }
  if (/^must be an integer number$/.test(resto)) return (s) => `${mayuscula(s)} debe ser un número entero`;
  if (/^must be a positive number$/.test(resto)) return (s) => `${mayuscula(s)} debe ser mayor que cero`;
  if (/^must be a negative number$/.test(resto)) return (s) => `${mayuscula(s)} debe ser menor que cero`;
  if ((m = /^must not be less than (.+)$/.exec(resto))) {
    const n = m[1];
    return (s) => `${mayuscula(s)} no puede ser menor que ${n}`;
  }
  if ((m = /^must not be greater than (.+)$/.exec(resto))) {
    const n = m[1];
    return (s) => `${mayuscula(s)} no puede ser mayor que ${n}`;
  }
  if ((m = /^must be longer than or equal to (\d+) and shorter than or equal to (\d+) characters$/.exec(resto))) {
    const [, min, max] = m;
    return (s) => `${mayuscula(s)} debe tener entre ${min} y ${caracteres(max)}`;
  }
  if ((m = /^must be longer than or equal to (\d+) characters$/.exec(resto))) {
    const n = m[1];
    return (s) => `${mayuscula(s)} debe tener al menos ${caracteres(n)}`;
  }
  if ((m = /^must be shorter than or equal to (\d+) characters$/.exec(resto))) {
    const n = m[1];
    return (s) => `${mayuscula(s)} admite hasta ${caracteres(n)}`;
  }
  if (/^must be an email$/.test(resto)) return (s) => `${mayuscula(s)} no es un correo válido`;
  if (/^must be a boolean (value|string)$/.test(resto)) return (s) => `${mayuscula(s)} debe ser sí o no`;
  if (/^must be a Date instance$/.test(resto) || /^must be a valid ISO 8601 date string$/.test(resto)) {
    return (s) => `${mayuscula(s)} no es una fecha válida`;
  }
  if (/^must be an array$/.test(resto)) return (s) => `${mayuscula(s)} debe ser una lista`;
  if (/^must be an object$/.test(resto) || /^must be a non-empty object$/.test(resto) || /^must be either object or array$/.test(resto)) {
    return (s) => `${mayuscula(s)} no tiene el formato esperado`;
  }
  if ((m = /^must be one of the following values: (.*)$/.exec(resto))) {
    const opciones = m[1];
    return (s) => `${mayuscula(s)} debe ser una de estas opciones: ${opciones}`;
  }
  if (/^must match .+ regular expression$/.test(resto)) return (s) => `${mayuscula(s)} no tiene el formato esperado`;
  if ((m = /^must contain at least (\d+) elements$/.exec(resto))) {
    const n = m[1];
    return (s) => `${mayuscula(s)} debe traer al menos ${elementos(n)}`;
  }
  if ((m = /^must contain no more than (\d+) elements$/.exec(resto))) {
    const n = m[1];
    return (s) => `${mayuscula(s)} admite hasta ${elementos(n)}`;
  }
  if (/^must be a UUID$/.test(resto)) return (s) => `${mayuscula(s)} no es un identificador válido`;
  if (/^must be an? URL address$/.test(resto)) return (s) => `${mayuscula(s)} no es una dirección web válida`;
  return null;
}

const RUTA = String.raw`[A-Za-z_$][\w$]*(?:\.[\w$]+)*`;
const SOBRA = new RegExp(`^property (${RUTA}) should not exist$`);
const ANIDADO = new RegExp(`^(each value in )?nested property (${RUTA}) (must be either object or array)$`);
const CAMPO = new RegExp(`^(each value in )?(${RUTA}) ((?:must|should) .+)$`);

/** Un mensaje de validación, en español. Lo que no es un mensaje por defecto de la librería pasa intacto. */
export function mensajeDeValidacionEnEspanol(mensaje: string): string {
  if (typeof mensaje !== 'string') return mensaje;
  const texto = mensaje.trim();
  if (texto === 'an unknown value was passed to the validate function') {
    return 'Los datos enviados no tienen el formato esperado';
  }
  const sobra = SOBRA.exec(texto);
  if (sobra) {
    const campo = sobra[1].split('.').pop() ?? sobra[1];
    return `El campo «${campo}» no se admite aquí`;
  }
  const hallado = ANIDADO.exec(texto) ?? CAMPO.exec(texto);
  if (!hallado) return mensaje;
  const [, cadaUno, ruta, resto] = hallado;
  const frase = predicado(resto);
  if (!frase) return mensaje;
  const etiqueta = etiquetaDe(ruta);
  if (!cadaUno) return concordar(frase(etiqueta), etiqueta);
  if (VACIO.test(resto)) return `Ningún elemento ${de(etiqueta)} puede ir vacío`;
  return frase(`cada elemento ${de(etiqueta)}`);
}

/** El `ValidationPipe` de siempre; solo cambia el idioma de los mensajes por defecto. */
export class ValidacionEnEspanolPipe extends ValidationPipe {
  protected flattenValidationErrors(errores: ValidationError[]): string[] {
    return super.flattenValidationErrors(errores).map(mensajeDeValidacionEnEspanol);
  }
}
