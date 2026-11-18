// A small .xlsx writer: real Excel files from rows, with JSZip (already a
// dependency for the photo downloads), so no spreadsheet library is added.
//
// Made for the client billing sheet (2026-11-18): dollars as dollars, dates
// as dates Excel can sort and filter, a bold header row that stays put while
// scrolling, a filter on every column and set column widths. Inline strings,
// so there is no shared-strings table to keep in step.
//
// makeXlsx([{ name, columns: [{ header, width, kind, wrap }], rows: [[...]] }])
//   kind: 'text' | 'money' | 'date' (an ISO 'YYYY-MM-DD') | 'number'
//   a cell may also be { v, kind, bold } to override its column
// returns a Uint8Array (type 'uint8array') or a Blob (type 'blob')

import JSZip from 'jszip'

const NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'
const NS_R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
const XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'

// Styles by index in cellXfs (styles.xml below).
const S = { text: 0, header: 1, money: 2, date: 3, wrap: 4, boldMoney: 5, boldText: 6, number: 7, boldNumber: 8 }

export const esc = (v) =>
  String(v)
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')

/** 0 -> A, 25 -> Z, 26 -> AA. */
export function colName(i) {
  let n = i + 1
  let s = ''
  while (n > 0) {
    const m = (n - 1) % 26
    s = String.fromCharCode(65 + m) + s
    n = Math.floor((n - 1) / 26)
  }
  return s
}

/** An ISO date as Excel's day number (days since 1899-12-30), or null. */
export function excelDate(iso) {
  const t = Date.parse(`${String(iso).slice(0, 10)}T00:00:00Z`)
  return Number.isFinite(t) ? t / 86400000 + 25569 : null
}

/** A sheet name Excel accepts: 31 characters, none of []:*?/\ . */
export const sheetName = (s) => String(s || 'Sheet').replace(/[[\]:*?/\\]/g, ' ').trim().slice(0, 31).trim() || 'Sheet'

function cellXml(ref, raw, colKind, wrap) {
  const cell = raw !== null && typeof raw === 'object' && !Array.isArray(raw) ? raw : { v: raw }
  const v = cell.v
  if (v === null || v === undefined || v === '') return ''
  const kind = cell.kind || colKind || 'text'
  const bold = Boolean(cell.bold)
  if (kind === 'money' || kind === 'number') {
    const n = Number(v)
    if (!Number.isFinite(n)) return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${esc(v)}</t></is></c>`
    const s = kind === 'money' ? (bold ? S.boldMoney : S.money) : bold ? S.boldNumber : S.number
    return `<c r="${ref}" s="${s}"><v>${n}</v></c>`
  }
  if (kind === 'date') {
    const n = excelDate(v)
    if (n !== null) return `<c r="${ref}" s="${S.date}"><v>${n}</v></c>`
  }
  const s = bold ? S.boldText : wrap ? S.wrap : S.text
  return `<c r="${ref}" t="inlineStr" s="${s}"><is><t xml:space="preserve">${esc(v)}</t></is></c>`
}

function sheetXml({ columns = [], rows = [], filter = true }) {
  const last = colName(Math.max(columns.length, 1) - 1)
  const height = rows.length + 1
  const cols = columns.map((c, i) => `<col min="${i + 1}" max="${i + 1}" width="${Number(c.width) || 14}" customWidth="1"/>`).join('')
  const head = `<row r="1">${columns.map((c, i) => `<c r="${colName(i)}1" t="inlineStr" s="${S.header}"><is><t xml:space="preserve">${esc(c.header)}</t></is></c>`).join('')}</row>`
  const body = rows
    .map((row, r) => `<row r="${r + 2}">${row.map((v, i) => cellXml(`${colName(i)}${r + 2}`, v, columns[i]?.kind, columns[i]?.wrap)).join('')}</row>`)
    .join('')
  return (
    `${XML}<worksheet xmlns="${NS}" xmlns:r="${NS_R}">` +
    // Printed: landscape, every column on one page wide.
    `<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>` +
    `<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>` +
    `<sheetFormatPr defaultRowHeight="15"/>` +
    (cols ? `<cols>${cols}</cols>` : '') +
    `<sheetData>${head}${body}</sheetData>` +
    (filter && rows.length ? `<autoFilter ref="A1:${last}${height}"/>` : '') +
    `<pageMargins left="0.4" right="0.4" top="0.5" bottom="0.5" header="0.3" footer="0.3"/>` +
    `<pageSetup orientation="landscape" fitToWidth="1" fitToHeight="0"/>` +
    `</worksheet>`
  )
}

const STYLES =
  `${XML}<styleSheet xmlns="${NS}">` +
  `<numFmts count="2"><numFmt numFmtId="164" formatCode="&quot;$&quot;#,##0.00"/><numFmt numFmtId="165" formatCode="mmm d, yyyy"/></numFmts>` +
  `<fonts count="2"><font><sz val="11"/><name val="Calibri"/><family val="2"/></font><font><b/><sz val="11"/><name val="Calibri"/><family val="2"/></font></fonts>` +
  `<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFE8EEF7"/><bgColor indexed="64"/></patternFill></fill></fills>` +
  `<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>` +
  `<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>` +
  `<cellXfs count="9">` +
  // Every body cell sits at the top of its row, so a row made tall by a
  // wrapped note still reads straight across.
  `<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="top"/></xf>` +
  `<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment wrapText="1" vertical="center"/></xf>` +
  `<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyAlignment="1"><alignment vertical="top"/></xf>` +
  `<xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyAlignment="1"><alignment horizontal="left" vertical="top"/></xf>` +
  `<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment wrapText="1" vertical="top"/></xf>` +
  `<xf numFmtId="164" fontId="1" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1" applyAlignment="1"><alignment vertical="top"/></xf>` +
  `<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment vertical="top"/></xf>` +
  `<xf numFmtId="1" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyAlignment="1"><alignment horizontal="left" vertical="top"/></xf>` +
  `<xf numFmtId="1" fontId="1" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1" applyAlignment="1"><alignment horizontal="left" vertical="top"/></xf>` +
  `</cellXfs>` +
  `<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>` +
  `</styleSheet>`

/** The workbook as a zip of its XML parts. */
export function xlsxParts(sheets = []) {
  const list = sheets.map((s, i) => ({ ...s, name: sheetName(s.name || `Sheet${i + 1}`) }))
  const names = list.map((s, i) => `<sheet name="${esc(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')
  const filters = list
    .map((s, i) =>
      s.filter !== false && (s.rows || []).length
        ? `<definedName name="_xlnm._FilterDatabase" localSheetId="${i}" hidden="1">'${esc(s.name.replace(/'/g, "''"))}'!$A$1:$${colName(Math.max((s.columns || []).length, 1) - 1)}$${(s.rows || []).length + 1}</definedName>`
        : ''
    )
    .join('')
  const parts = {
    '[Content_Types].xml':
      `${XML}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
      `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
      `<Default Extension="xml" ContentType="application/xml"/>` +
      `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
      list.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('') +
      `<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>` +
      `</Types>`,
    '_rels/.rels':
      `${XML}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
      `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>` +
      `</Relationships>`,
    'xl/workbook.xml': `${XML}<workbook xmlns="${NS}" xmlns:r="${NS_R}"><sheets>${names}</sheets>${filters ? `<definedNames>${filters}</definedNames>` : ''}</workbook>`,
    'xl/_rels/workbook.xml.rels':
      `${XML}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
      list.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('') +
      `<Relationship Id="rId${list.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>` +
      `</Relationships>`,
    'xl/styles.xml': STYLES,
  }
  list.forEach((s, i) => {
    parts[`xl/worksheets/sheet${i + 1}.xml`] = sheetXml(s)
  })
  return parts
}

export async function makeXlsx(sheets = [], { type = 'blob' } = {}) {
  const zip = new JSZip()
  for (const [path, body] of Object.entries(xlsxParts(sheets))) zip.file(path, body)
  return zip.generateAsync({
    type,
    compression: 'DEFLATE',
    ...(type === 'blob' ? { mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' } : {}),
  })
}
