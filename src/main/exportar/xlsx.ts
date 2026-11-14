// Escribe un archivo .xlsx (Excel) sin librerías. Un .xlsx es un ZIP con unos pocos XML
// adentro; acá se arma justo lo necesario: una hoja con encabezado fijo, filtros, anchos de
// columna, números con formato de moneda y fechas reales.
import { deflateRawSync } from 'node:zlib';

export type Estilo = 'normal' | 'encabezado' | 'moneda' | 'fecha' | 'negrita' | 'moneda-total';
export type Celda =
  | { tipo: 'texto'; valor: string; estilo?: Estilo }
  | { tipo: 'numero'; valor: number; estilo?: Estilo }
  /** AAAA-MM-DD: queda como fecha de verdad (se puede ordenar y filtrar). */
  | { tipo: 'fecha'; valor: string };

export interface Hoja {
  nombre: string;
  /** Ancho de cada columna, en caracteres. */
  anchos: number[];
  /** La primera fila es el encabezado: queda fija y con filtros. */
  filas: (Celda | null)[][];
  /** La última fila es de totales: queda afuera del filtro. */
  conTotales?: boolean;
}

const INDICE_ESTILO: Record<Estilo, number> = { normal: 0, encabezado: 1, moneda: 2, fecha: 3, negrita: 4, 'moneda-total': 5 };

const escapar = (t: string) =>
  t
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    // Los caracteres de control no son válidos en XML.
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '');

/** "A", "B"… "Z", "AA" para el número de columna (desde 0). */
export function letraDeColumna(n: number): string {
  let resto = n;
  let letras = '';
  do {
    letras = String.fromCharCode(65 + (resto % 26)) + letras;
    resto = Math.floor(resto / 26) - 1;
  } while (resto >= 0);
  return letras;
}

/** Excel cuenta las fechas en días desde el 30/12/1899. */
export function fechaComoNumero(iso: string): number {
  const [a, m, d] = iso.split('-').map(Number) as [number, number, number];
  return Math.round((Date.UTC(a, m - 1, d) - Date.UTC(1899, 11, 30)) / 86_400_000);
}

function celdaXml(c: Celda | null, f: number, col: number): string {
  if (!c) return '';
  const ref = `${letraDeColumna(col)}${f + 1}`;
  if (c.tipo === 'fecha') return `<c r="${ref}" s="${INDICE_ESTILO.fecha}"><v>${fechaComoNumero(c.valor)}</v></c>`;
  const s = INDICE_ESTILO[c.estilo ?? (c.tipo === 'numero' ? 'moneda' : 'normal')];
  if (c.tipo === 'numero') return `<c r="${ref}" s="${s}"><v>${Number.isFinite(c.valor) ? c.valor : 0}</v></c>`;
  return `<c r="${ref}" s="${s}" t="inlineStr"><is><t xml:space="preserve">${escapar(c.valor)}</t></is></c>`;
}

function hojaXml(h: Hoja): string {
  const columnas = Math.max(...h.filas.map((f) => f.length), 1);
  const ultima = `${letraDeColumna(columnas - 1)}${h.filas.length}`;
  const filas = h.filas
    .map((fila, f) => `<row r="${f + 1}">${fila.map((c, col) => celdaXml(c, f, col)).join('')}</row>`)
    .join('');
  const anchos = h.anchos.map((a, i) => `<col min="${i + 1}" max="${i + 1}" width="${a}" customWidth="1"/>`).join('');
  // Con una sola fila (solo encabezado) no hace falta fijar ni filtrar.
  const fijar = h.filas.length > 1 ? '<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>' : '';
  const filtro = h.filas.length > 1 ? `<autoFilter ref="A1:${letraDeColumna(columnas - 1)}${h.filas.length - (h.conTotales ? 1 : 0)}"/>` : '';
  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    `<dimension ref="A1:${ultima}"/>` +
    `<sheetViews><sheetView workbookViewId="0">${fijar}</sheetView></sheetViews>` +
    `<cols>${anchos}</cols><sheetData>${filas}</sheetData>${filtro}</worksheet>`
  );
}

const ESTILOS =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
  '<numFmts count="1"><numFmt numFmtId="164" formatCode="dd/mm/yyyy"/></numFmts>' +
  '<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>' +
  '<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>' +
  '<fill><patternFill patternType="solid"><fgColor rgb="FFE7E6E1"/><bgColor indexed="64"/></patternFill></fill></fills>' +
  '<borders count="3"><border><left/><right/><top/><bottom/><diagonal/></border>' +
  '<border><left/><right/><top/><bottom style="thin"><color auto="1"/></bottom><diagonal/></border>' +
  '<border><left/><right/><top style="thin"><color auto="1"/></top><bottom/><diagonal/></border></borders>' +
  '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
  '<cellXfs count="6">' +
  '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' + // 0 normal
  '<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>' + // 1 encabezado
  '<xf numFmtId="4" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' + // 2 moneda (#,##0.00)
  '<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' + // 3 fecha
  '<xf numFmtId="0" fontId="1" fillId="0" borderId="2" xfId="0" applyFont="1" applyBorder="1"/>' + // 4 negrita (fila de totales)
  '<xf numFmtId="4" fontId="1" fillId="0" borderId="2" xfId="0" applyNumberFormat="1" applyFont="1" applyBorder="1"/>' + // 5 moneda en la fila de totales
  '</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>';

// ── ZIP ──
const TABLA_CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
export function crc32(datos: Uint8Array): number {
  let c = 0xffffffff;
  for (const b of datos) c = TABLA_CRC[(c ^ b) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function zip(archivos: { nombre: string; contenido: string }[], ahora: Date): Buffer {
  const hora = (ahora.getHours() << 11) | (ahora.getMinutes() << 5) | Math.floor(ahora.getSeconds() / 2);
  const dia = ((Math.max(ahora.getFullYear(), 1980) - 1980) << 9) | ((ahora.getMonth() + 1) << 5) | ahora.getDate();
  const partes: Buffer[] = [];
  const central: Buffer[] = [];
  let posicion = 0;
  for (const a of archivos) {
    const nombre = Buffer.from(a.nombre, 'utf8');
    const crudo = Buffer.from(a.contenido, 'utf8');
    const comprimido = deflateRawSync(crudo);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4); // versión necesaria
    local.writeUInt16LE(0x0800, 6); // nombres en UTF-8
    local.writeUInt16LE(8, 8); // deflate
    local.writeUInt16LE(hora, 10);
    local.writeUInt16LE(dia, 12);
    local.writeUInt32LE(crc32(crudo), 14);
    local.writeUInt32LE(comprimido.length, 18);
    local.writeUInt32LE(crudo.length, 22);
    local.writeUInt16LE(nombre.length, 26);
    partes.push(local, nombre, comprimido);
    const entrada = Buffer.alloc(46);
    entrada.writeUInt32LE(0x02014b50, 0);
    entrada.writeUInt16LE(20, 4);
    entrada.writeUInt16LE(20, 6);
    entrada.writeUInt16LE(0x0800, 8);
    entrada.writeUInt16LE(8, 10);
    entrada.writeUInt16LE(hora, 12);
    entrada.writeUInt16LE(dia, 14);
    entrada.writeUInt32LE(crc32(crudo), 16);
    entrada.writeUInt32LE(comprimido.length, 20);
    entrada.writeUInt32LE(crudo.length, 24);
    entrada.writeUInt16LE(nombre.length, 28);
    entrada.writeUInt32LE(posicion, 42);
    central.push(entrada, nombre);
    posicion += local.length + nombre.length + comprimido.length;
  }
  const directorio = Buffer.concat(central);
  const fin = Buffer.alloc(22);
  fin.writeUInt32LE(0x06054b50, 0);
  fin.writeUInt16LE(archivos.length, 8);
  fin.writeUInt16LE(archivos.length, 10);
  fin.writeUInt32LE(directorio.length, 12);
  fin.writeUInt32LE(posicion, 16);
  return Buffer.concat([...partes, directorio, fin]);
}

/** Nombre de hoja válido para Excel: sin \ / ? * [ ] : y hasta 31 letras. */
const nombreDeHoja = (n: string) => n.replace(/[\\/?*[\]:]/g, ' ').trim().slice(0, 31) || 'Hoja1';

export function crearXlsx(hojas: Hoja[], ahora: Date = new Date()): Buffer {
  const nombres = hojas.map((h, i) => nombreDeHoja(h.nombre) || `Hoja${i + 1}`);
  const archivos = [
    {
      nombre: '[Content_Types].xml',
      contenido:
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>' +
        '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
        '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
        hojas.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('') +
        '</Types>',
    },
    {
      nombre: '_rels/.rels',
      contenido:
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
    },
    {
      nombre: 'xl/workbook.xml',
      contenido:
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>' +
        nombres.map((n, i) => `<sheet name="${escapar(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('') +
        '</sheets></workbook>',
    },
    {
      nombre: 'xl/_rels/workbook.xml.rels',
      contenido:
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        hojas.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('') +
        `<Relationship Id="rId${hojas.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
    },
    { nombre: 'xl/styles.xml', contenido: ESTILOS },
    ...hojas.map((h, i) => ({ nombre: `xl/worksheets/sheet${i + 1}.xml`, contenido: hojaXml(h) })),
  ];
  return zip(archivos, ahora);
}
