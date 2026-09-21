export const CONVERSIONS = {
  pdf: ['png', 'jpg', 'webp', 'html', 'txt', 'docx'],
  docx: ['pdf', 'html', 'txt', 'md'],
  xlsx: ['csv', 'json', 'html', 'txt', 'docx', 'pdf'],
  xls: ['csv', 'json', 'html', 'txt', 'docx', 'pdf'],
  pptx: ['png', 'pdf', 'txt', 'html', 'md', 'docx'],
  md: ['html', 'txt', 'pdf', 'docx', 'pptx'],
  txt: ['pdf', 'md', 'html', 'json', 'docx', 'pptx'],
  csv: ['json', 'xlsx', 'html', 'txt', 'docx', 'pdf'],
  json: ['csv', 'txt', 'html', 'docx', 'pdf'],
  png: ['jpg', 'webp', 'pdf', 'bmp'],
  jpg: ['png', 'webp', 'pdf', 'bmp'],
  jpeg: ['png', 'webp', 'pdf', 'bmp'],
  webp: ['png', 'jpg', 'pdf'],
  gif: ['png', 'jpg', 'webp'],
  bmp: ['png', 'jpg', 'webp', 'pdf'],
  html: ['pdf', 'txt', 'md', 'docx', 'pptx'],
};

export const SUPPORTED_ACCEPT = '.pdf,.docx,.xlsx,.xls,.pptx,.ppt,.md,.txt,.csv,.json,.png,.jpg,.jpeg,.webp,.gif,.bmp,.html';

export const getExtension = (filename) => filename.split('.').pop().toLowerCase();
export const getBaseName = (filename) => filename.replace(/\.[^.]+$/, '');

export function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function makeDownload(filename, blob) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 3_000);
}

function textToPdf(text, filename, options) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: options.orientation, format: options.pageSize });
  const lines = doc.splitTextToSize(text, 180);
  let y = 20;
  lines.forEach((line) => {
    if (y > 280) {
      doc.addPage();
      y = 20;
    }
    doc.setFontSize(11);
    doc.text(line, 15, y);
    y += 6;
  });
  return { filename: `${getBaseName(filename)}.pdf`, blob: doc.output('blob') };
}

export async function convertFile(file, target, options = {}) {
  const source = getExtension(file.name);
  const textMime = 'text/plain;charset=utf-8';

  if (source === target) throw new Error('Format asal dan tujuan tidak boleh sama.');

  if (['txt', 'md', 'html'].includes(source)) {
    const raw = await file.text();
    const text = source === 'html'
      ? new DOMParser().parseFromString(raw, 'text/html').body.textContent || ''
      : raw;

    if (target === 'txt') return { filename: `${getBaseName(file.name)}.txt`, blob: new Blob([text], { type: textMime }) };
    if (target === 'md') return { filename: `${getBaseName(file.name)}.md`, blob: new Blob([text], { type: textMime }) };
    if (target === 'html') {
      const body = source === 'md' && window.marked ? window.marked.parse(raw) : `<pre>${escapeHtml(text)}</pre>`;
      return { filename: `${getBaseName(file.name)}.html`, blob: new Blob([`<!doctype html><html lang="id"><meta charset="utf-8"><body>${body}</body></html>`], { type: 'text/html' }) };
    }
    if (target === 'json') return { filename: `${getBaseName(file.name)}.json`, blob: new Blob([JSON.stringify(text.split(/\r?\n/).filter(Boolean), null, 2)], { type: 'application/json' }) };
    if (target === 'pdf') return textToPdf(text, file.name, options);
  }

  if (source === 'json') {
    const data = JSON.parse(await file.text());
    if (target === 'txt') return { filename: `${getBaseName(file.name)}.txt`, blob: new Blob([JSON.stringify(data, null, 2)], { type: textMime }) };
    if (target === 'html') return { filename: `${getBaseName(file.name)}.html`, blob: new Blob([`<pre>${escapeHtml(JSON.stringify(data, null, 2))}</pre>`], { type: 'text/html' }) };
    if (target === 'csv') {
      const rows = Array.isArray(data) ? data : [data];
      const sheet = window.XLSX.utils.json_to_sheet(rows);
      return { filename: `${getBaseName(file.name)}.csv`, blob: new Blob([window.XLSX.utils.sheet_to_csv(sheet, { FS: options.delimiter || ',' })], { type: 'text/csv' }) };
    }
    if (target === 'pdf') return textToPdf(JSON.stringify(data, null, 2), file.name, options);
  }

  if (source === 'csv') {
    const content = await file.text();
    const workbook = window.XLSX.read(content, { type: 'string' });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    if (target === 'xlsx') return { filename: `${getBaseName(file.name)}.xlsx`, blob: new Blob([window.XLSX.write(workbook, { bookType: 'xlsx', type: 'array' })], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }) };
    if (target === 'json') return { filename: `${getBaseName(file.name)}.json`, blob: new Blob([JSON.stringify(window.XLSX.utils.sheet_to_json(sheet), null, 2)], { type: 'application/json' }) };
    if (target === 'html') return { filename: `${getBaseName(file.name)}.html`, blob: new Blob([window.XLSX.utils.sheet_to_html(sheet)], { type: 'text/html' }) };
    if (target === 'txt') return { filename: `${getBaseName(file.name)}.txt`, blob: new Blob([content], { type: textMime }) };
  }

  if (['xlsx', 'xls'].includes(source)) {
    const workbook = window.XLSX.read(await file.arrayBuffer(), { type: 'array' });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    if (target === 'csv') return { filename: `${getBaseName(file.name)}.csv`, blob: new Blob([window.XLSX.utils.sheet_to_csv(sheet, { FS: options.delimiter || ',' })], { type: 'text/csv' }) };
    if (target === 'json') return { filename: `${getBaseName(file.name)}.json`, blob: new Blob([JSON.stringify(window.XLSX.utils.sheet_to_json(sheet), null, 2)], { type: 'application/json' }) };
    if (target === 'html') return { filename: `${getBaseName(file.name)}.html`, blob: new Blob([window.XLSX.utils.sheet_to_html(sheet)], { type: 'text/html' }) };
    if (target === 'txt') return { filename: `${getBaseName(file.name)}.txt`, blob: new Blob([window.XLSX.utils.sheet_to_csv(sheet)], { type: textMime }) };
  }

  if (['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp'].includes(source) && ['png', 'jpg', 'webp', 'bmp'].includes(target)) {
    const bitmap = await createImageBitmap(file);
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext('2d');
    if (target === 'jpg' || target === 'bmp') {
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, canvas.width, canvas.height);
    }
    context.drawImage(bitmap, 0, 0);
    const mime = target === 'jpg' ? 'image/jpeg' : target === 'webp' ? 'image/webp' : 'image/png';
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, mime, (options.quality || 92) / 100));
    return { filename: `${getBaseName(file.name)}.${target}`, blob };
  }

  throw new Error(`Konversi .${source} ke .${target} belum tersedia pada versi React ini.`);
}

function escapeHtml(value) {
  return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
