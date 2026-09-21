import { useCallback, useMemo, useState } from 'react';
import { FileDropzone } from './components/FileDropzone.jsx';
import { FileQueue } from './components/FileQueue.jsx';
import { FormatPicker } from './components/FormatPicker.jsx';
import { ResultsDialog } from './components/ResultsDialog.jsx';
import { Icon } from './components/Icon.jsx';
import { CONVERSIONS, convertFile, getExtension } from './lib/conversion.js';

const initialOptions = { pageSize: 'a4', orientation: 'portrait', quality: 92, delimiter: ',' };

export default function App() {
  const [files, setFiles] = useState([]);
  const [source, setSource] = useState(null);
  const [target, setTarget] = useState(null);
  const [options, setOptions] = useState(initialOptions);
  const [progress, setProgress] = useState(0);
  const [isConverting, setIsConverting] = useState(false);
  const [results, setResults] = useState([]);
  const [errors, setErrors] = useState([]);
  const [showResults, setShowResults] = useState(false);
  const [toast, setToast] = useState('');

  const sourceFiles = useMemo(() => source ? files.filter((file) => getExtension(file.name) === source) : [], [files, source]);
  const canConvert = sourceFiles.length > 0 && Boolean(target) && !isConverting;

  const notify = useCallback((message) => {
    setToast(message);
    window.setTimeout(() => setToast(''), 3_500);
  }, []);

  const addFiles = (fileList) => {
    const accepted = Array.from(fileList).filter((file) => CONVERSIONS[getExtension(file.name)]);
    const rejected = fileList.length - accepted.length;
    setFiles((current) => {
      const next = [...current];
      accepted.forEach((file) => {
        if (!next.some((candidate) => candidate.name === file.name && candidate.size === file.size)) next.push(file);
      });
      return next;
    });
    if (rejected) notify(`${rejected} file dilewati karena formatnya belum didukung.`);
  };

  const changeSource = (value) => { setSource(value); setTarget(null); };
  const removeFile = (index) => {
    setFiles((current) => current.filter((_, itemIndex) => itemIndex !== index));
    setTarget(null);
  };
  const clearQueue = () => { setFiles([]); setSource(null); setTarget(null); setProgress(0); };

  const startConversion = async () => {
    if (!canConvert) return;
    setIsConverting(true);
    setProgress(0);
    const converted = [];
    const failed = [];
    for (let index = 0; index < sourceFiles.length; index += 1) {
      const file = sourceFiles[index];
      try {
        converted.push(await convertFile(file, target, options));
      } catch (error) {
        failed.push({ filename: file.name, message: error.message || 'Konversi gagal.' });
      }
      setProgress(Math.round(((index + 1) / sourceFiles.length) * 100));
    }
    setResults((current) => [...converted, ...current]);
    setErrors(failed);
    setIsConverting(false);
    setShowResults(true);
    notify(failed.length ? `${converted.length} berhasil, ${failed.length} gagal.` : `${converted.length} file berhasil dikonversi.`);
  };

  return <div className="app-shell">
    <header className="top-app-bar"><a className="brand" href="#top" aria-label="OCD beranda"><span className="brand-mark"><Icon name="swap" size={22} /></span><span><strong>OCD</strong><small>Orias Converter Document</small></span></a><div className="header-actions"><span className="status-chip"><Icon name="check" size={16} /> Lokal & privat</span><button className="icon-button" type="button" title="Tentang aplikasi" onClick={() => notify('Semua proses dilakukan langsung di browser Anda.')}><Icon name="info" /></button></div></header>
    <main id="top" className="content-grid">
      <section className="hero"><p className="eyebrow">Konversi dokumen tanpa unggah</p><h1>Ubah file Anda, <span>tetap privat.</span></h1><p>Konversi dokumen, spreadsheet, gambar, dan teks langsung dari perangkat Anda.</p></section>
      <FileDropzone onFiles={addFiles} />
      <FileQueue files={files} onRemove={removeFile} onClear={clearQueue} />
      <FormatPicker files={files} source={source} target={target} onSource={changeSource} onTarget={setTarget} options={options} onOptions={setOptions} />
    </main>
    <footer className="bottom-action"><div><strong>{sourceFiles.length ? `${sourceFiles.length} file .${source} dipilih` : 'Pilih file dan format output'}</strong><div className="progress-track"><span style={{ width: `${progress}%` }} /></div></div><button className="m3-button filled convert-button" type="button" disabled={!canConvert} onClick={startConversion}>{isConverting ? `Mengonversi ${progress}%` : 'Konversi sekarang'} <Icon name="arrow" size={20} /></button></footer>
    {toast && <div className="snackbar" role="status">{toast}</div>}
    {showResults && <ResultsDialog results={results} errors={errors} onClose={() => setShowResults(false)} onClear={() => { setResults([]); setErrors([]); setShowResults(false); }} />}
  </div>;
}
