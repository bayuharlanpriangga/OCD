import { useMemo } from 'react';
import { CONVERSIONS, getExtension } from '../lib/conversion.js';
import { Icon } from './Icon.jsx';

export function FormatPicker({ files, source, target, onSource, onTarget, options, onOptions }) {
  const sources = useMemo(() => [...new Set(files.map((file) => getExtension(file.name)))], [files]);
  const targets = source ? CONVERSIONS[source] || [] : [];
  if (!files.length) return null;

  return <section className="surface format-surface" aria-labelledby="format-title">
    <div className="section-heading"><div className="icon-container tertiary"><Icon name="swap" /></div><div><p className="eyebrow">Langkah 3</p><h2 id="format-title">Pilih format konversi</h2></div></div>
    <div className="format-layout">
      <div className="format-column"><p className="field-label">Dari format</p><div className="format-grid">{sources.map((value) => <button type="button" key={value} className={`format-option ${source === value ? 'selected source' : ''}`} onClick={() => onSource(value)}>{value}</button>)}</div></div>
      <div className="conversion-arrow"><Icon name="arrow" /></div>
      <div className="format-column"><p className="field-label">Ke format</p>{source ? <div className="format-grid">{targets.map((value) => <button type="button" key={value} className={`format-option ${target === value ? 'selected target' : ''}`} onClick={() => onTarget(value)}>{value}</button>)}</div> : <p className="placeholder">Pilih format asal terlebih dahulu.</p>}</div>
    </div>
    {target && <div className="options-panel"><p className="field-label">Opsi output</p><div className="option-controls">
      {target === 'pdf' && <><label>Ukuran<select value={options.pageSize} onChange={(event) => onOptions({ ...options, pageSize: event.target.value })}><option value="a4">A4</option><option value="letter">Letter</option><option value="a3">A3</option></select></label><label>Orientasi<select value={options.orientation} onChange={(event) => onOptions({ ...options, orientation: event.target.value })}><option value="portrait">Portrait</option><option value="landscape">Landscape</option></select></label></>}
      {['png', 'jpg', 'webp', 'bmp'].includes(target) && <label>Kualitas<input type="number" min="1" max="100" value={options.quality} onChange={(event) => onOptions({ ...options, quality: Number(event.target.value) })} /></label>}
      {target === 'csv' && <label>Pemisah<select value={options.delimiter} onChange={(event) => onOptions({ ...options, delimiter: event.target.value })}><option value=",">Koma (,)</option><option value=";">Titik koma (;)</option><option value="\t">Tab</option></select></label>}
      {!['pdf', 'png', 'jpg', 'webp', 'bmp', 'csv'].includes(target) && <p className="options-hint">Tidak ada opsi tambahan untuk format ini.</p>}
    </div></div>}
  </section>;
}
