import { formatSize, getExtension } from '../lib/conversion.js';
import { Icon } from './Icon.jsx';

export function FileQueue({ files, onRemove, onClear }) {
  if (!files.length) return null;
  return <section className="surface queue-surface" aria-labelledby="queue-title">
    <div className="section-heading compact-heading">
      <div className="icon-container secondary"><Icon name="info" /></div>
      <div><p className="eyebrow">Langkah 2</p><h2 id="queue-title">File dalam antrean <span>{files.length}</span></h2></div>
      <button className="m3-button text danger" type="button" onClick={onClear}>Hapus semua</button>
    </div>
    <div className="file-list">
      {files.map((file, index) => <article className="file-row" key={`${file.name}-${file.size}-${index}`}>
        <div className="file-type">{getExtension(file.name).slice(0, 4)}</div>
        <div className="file-details"><strong>{file.name}</strong><span>{formatSize(file.size)}</span></div>
        <button className="icon-button" type="button" aria-label={`Hapus ${file.name}`} onClick={() => onRemove(index)}><Icon name="close" size={20} /></button>
      </article>)}
    </div>
  </section>;
}
