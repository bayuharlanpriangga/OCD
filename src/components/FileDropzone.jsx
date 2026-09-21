import { useRef, useState } from 'react';
import { SUPPORTED_ACCEPT } from '../lib/conversion.js';
import { Icon } from './Icon.jsx';

const formats = ['PDF', 'DOCX', 'XLSX', 'PPTX', 'MD', 'TXT', 'CSV', 'JSON', 'PNG', 'JPG', 'WEBP', 'HTML'];

export function FileDropzone({ onFiles }) {
  const inputRef = useRef(null);
  const [dragging, setDragging] = useState(false);

  const receive = (files) => {
    if (files?.length) onFiles(files);
  };

  return <section className="surface upload-surface" aria-labelledby="upload-title">
    <div className="section-heading">
      <div className="icon-container primary"><Icon name="upload" /></div>
      <div><p className="eyebrow">Langkah 1</p><h2 id="upload-title">Upload dokumen</h2></div>
    </div>
    <div
      className={`dropzone ${dragging ? 'is-dragging' : ''}`}
      onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={(event) => { event.preventDefault(); setDragging(false); receive(event.dataTransfer.files); }}
      onClick={() => inputRef.current?.click()}
      role="button"
      tabIndex="0"
      onKeyDown={(event) => event.key === 'Enter' && inputRef.current?.click()}
    >
      <div className="upload-hero-icon"><Icon name="upload" size={34} /></div>
      <h3>Tarik dan lepas file di sini</h3>
      <p>atau pilih file dari perangkat Anda</p>
      <button className="m3-button filled" type="button" onClick={(event) => { event.stopPropagation(); inputRef.current?.click(); }}>Pilih file</button>
      <div className="format-chips">{formats.map((format) => <span key={format}>{format}</span>)}</div>
      <div className="privacy-note"><Icon name="check" size={16} /> Diproses sepenuhnya di browser Anda</div>
    </div>
    <input ref={inputRef} className="visually-hidden" type="file" multiple accept={SUPPORTED_ACCEPT} onChange={(event) => receive(event.target.files)} />
  </section>;
}
