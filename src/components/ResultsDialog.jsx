import { Icon } from './Icon.jsx';
import { getExtension, makeDownload } from '../lib/conversion.js';

export function ResultsDialog({ results, errors, onClose, onClear }) {
  if (!results.length && !errors.length) return null;
  return <div className="dialog-backdrop" role="presentation"><section className="m3-dialog" role="dialog" aria-modal="true" aria-labelledby="results-title">
    <div className="dialog-title-row"><div><p className="eyebrow">Selesai</p><h2 id="results-title">Hasil konversi</h2></div><button className="icon-button" type="button" aria-label="Tutup" onClick={onClose}><Icon name="close" /></button></div>
    {results.length > 0 && <><p className="dialog-description">{results.length} file siap diunduh.</p><div className="results-list">{results.map((result, index) => <div className="result-row" key={`${result.filename}-${index}`}><div className="file-type success">{getExtension(result.filename)}</div><strong>{result.filename}</strong><button className="m3-button text" type="button" onClick={() => makeDownload(result.filename, result.blob)}><Icon name="download" size={18} /> Unduh</button></div>)}</div></>}
    {errors.length > 0 && <div className="error-list"><p className="field-label">File yang belum berhasil</p>{errors.map((error, index) => <p key={`${error.filename}-${index}`}>{error.filename}: {error.message}</p>)}</div>}
    <div className="dialog-actions"><button className="m3-button text" type="button" onClick={onClear}>Bersihkan hasil</button><button className="m3-button filled" type="button" onClick={onClose}>Selesai</button></div>
  </section></div>;
}
