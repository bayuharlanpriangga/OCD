/* OCD — PPTX converter (parse + render, 100% di browser)
   Bergantung pada: JSZip, jsPDF. Mengekspos window.PPTXConverter. */
(function () {
  const NS_A = 'http://schemas.openxmlformats.org/drawingml/2006/main';
  const NS_P = 'http://schemas.openxmlformats.org/presentationml/2006/main';
  const NS_R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  const EMU_PT = 12700;

  const kids = (el, ns, name) => Array.from(el ? el.children : []).filter((c) => c.localName === name && (!ns || c.namespaceURI === ns));
  const kid = (el, ns, name) => kids(el, ns, name)[0] || null;
  const path = (el, ...names) => names.reduce((cur, n) => (cur ? kid(cur, null, n) : null), el);
  const num = (v, d = 0) => (v === null || v === undefined || v === '' || isNaN(+v) ? d : +v);

  const baseName = (n) => n.replace(/\.[^.]+$/, '');
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  async function xml(zip, p) {
    const f = zip.file(p);
    if (!f) return null;
    const doc = new DOMParser().parseFromString(await f.async('string'), 'application/xml');
    return doc.documentElement;
  }

  function relsPath(p) {
    const i = p.lastIndexOf('/');
    return `${p.slice(0, i)}/_rels/${p.slice(i + 1)}.rels`;
  }
  function resolve(from, target) {
    if (target.startsWith('/')) return target.slice(1);
    const parts = from.slice(0, from.lastIndexOf('/')).split('/');
    target.split('/').forEach((seg) => {
      if (seg === '..') parts.pop();
      else if (seg !== '.') parts.push(seg);
    });
    return parts.join('/');
  }
  async function rels(zip, p) {
    const root = await xml(zip, relsPath(p));
    const map = {};
    if (root) kids(root, null, 'Relationship').forEach((r) => {
      if (r.getAttribute('TargetMode') === 'External') return;
      map[r.getAttribute('Id')] = { type: r.getAttribute('Type') || '', path: resolve(p, r.getAttribute('Target')) };
    });
    return map;
  }

  /* ---------- tema & warna ---------- */
  function themeColors(theme) {
    const out = { dk1: '000000', lt1: 'FFFFFF', dk2: '44546A', lt2: 'E7E6E6', accent1: '4472C4', accent2: 'ED7D31', accent3: 'A5A5A5', accent4: 'FFC000', accent5: '5B9BD5', accent6: '70AD47', hlink: '0563C1', folHlink: '954F72' };
    const cs = theme && theme.getElementsByTagNameNS(NS_A, 'clrScheme')[0];
    if (cs) Array.from(cs.children).forEach((c) => {
      const v = c.firstElementChild;
      if (!v) return;
      out[c.localName] = v.getAttribute('val') === null ? v.getAttribute('lastClr') : v.getAttribute('val');
      if (v.localName === 'sysClr') out[c.localName] = v.getAttribute('lastClr') || out[c.localName];
    });
    return out;
  }
  function themeFonts(theme) {
    const out = { major: null, minor: null };
    const fs = theme && theme.getElementsByTagNameNS(NS_A, 'fontScheme')[0];
    if (fs) {
      const mj = kid(fs, NS_A, 'majorFont'), mn = kid(fs, NS_A, 'minorFont');
      out.major = mj && kid(mj, NS_A, 'latin') ? kid(mj, NS_A, 'latin').getAttribute('typeface') : null;
      out.minor = mn && kid(mn, NS_A, 'latin') ? kid(mn, NS_A, 'latin').getAttribute('typeface') : null;
    }
    return out;
  }
  function fontOf(rPr, ctx) {
    const l = rPr && kid(rPr, NS_A, 'latin');
    let f = l ? l.getAttribute('typeface') : null;
    if (f === '+mj-lt') f = ctx.fonts.major;
    else if (f === '+mn-lt') f = ctx.fonts.minor;
    return f && !f.startsWith('+') ? f : null;
  }
  function colorOf(fillEl, ctx) {
    if (!fillEl) return null;
    const c = fillEl.firstElementChild;
    if (!c) return null;
    let hex = null;
    if (c.localName === 'srgbClr') hex = c.getAttribute('val');
    else if (c.localName === 'schemeClr') {
      let v = c.getAttribute('val');
      const map = { tx1: 'dk1', bg1: 'lt1', tx2: 'dk2', bg2: 'lt2' };
      v = map[v] || v;
      hex = (v === 'phClr' ? null : ctx.theme[v]) || '000000';
    } else if (c.localName === 'sysClr') hex = c.getAttribute('lastClr') || '000000';
    if (!hex) return null;
    let [r, g, b] = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16));
    Array.from(c.children).forEach((m) => {
      const val = num(m.getAttribute('val'), 100000) / 100000;
      if (m.localName === 'lumMod') [r, g, b] = [r, g, b].map((x) => x * val);
      if (m.localName === 'lumOff') [r, g, b] = [r, g, b].map((x) => x + 255 * val);
      if (m.localName === 'tint') [r, g, b] = [r, g, b].map((x) => x + (255 - x) * (1 - val));
      if (m.localName === 'shade') [r, g, b] = [r, g, b].map((x) => x * val);
    });
    return `rgb(${[r, g, b].map((x) => Math.max(0, Math.min(255, Math.round(x)))).join(',')})`;
  }
  const solid = (spPr, ctx) => (spPr ? colorOf(kid(spPr, NS_A, 'solidFill'), ctx) : null);

  /* ---------- transform ---------- */
  function xfrmOf(el) {
    if (!el) return null;
    const x = el.getElementsByTagNameNS(NS_A, 'xfrm')[0] || el.getElementsByTagNameNS(NS_P, 'xfrm')[0];
    if (!x) return null;
    const off = kid(x, NS_A, 'off'), ext = kid(x, NS_A, 'ext');
    if (!off || !ext) return null;
    return { x: num(off.getAttribute('x')), y: num(off.getAttribute('y')), w: num(ext.getAttribute('cx')), h: num(ext.getAttribute('cy')), rot: num(x.getAttribute('rot')) / 60000 };
  }
  function phInfo(sp) {
    const nv = kid(sp, NS_P, 'nvSpPr') || kid(sp, NS_P, 'nvPicPr');
    const ph = nv && nv.getElementsByTagNameNS(NS_P, 'ph')[0];
    if (!ph) return null;
    return { type: ph.getAttribute('type') || 'body', idx: ph.getAttribute('idx') };
  }
  function findPlaceholderXfrm(root, ph) {
    if (!root || !ph) return null;
    const tree = path(kid(root, NS_P, 'cSld'), 'spTree');
    if (!tree) return null;
    const norm = (t) => (t === 'ctrTitle' ? 'title' : t);
    const sps = kids(tree, NS_P, 'sp');
    let hit = sps.find((s) => { const p = phInfo(s); return p && ph.idx && p.idx === ph.idx; });
    if (!hit) hit = sps.find((s) => { const p = phInfo(s); return p && norm(p.type) === norm(ph.type); });
    return hit ? xfrmOf(kid(hit, NS_P, 'spPr')) : null;
  }

  /* ---------- teks ---------- */
  function readParagraphs(txBody, ctx, ph) {
    const paras = [];
    kids(txBody, NS_A, 'p').forEach((p) => {
      const pPr = kid(p, NS_A, 'pPr');
      const runs = [];
      Array.from(p.children).forEach((c) => {
        if (c.localName === 'br') { runs.push({ text: '\n' }); return; }
        if (c.localName !== 'r' && c.localName !== 'fld') return;
        const t = kid(c, NS_A, 't');
        if (!t) return;
        const rPr = kid(c, NS_A, 'rPr');
        runs.push({
          text: t.textContent,
          size: rPr && rPr.getAttribute('sz') ? num(rPr.getAttribute('sz')) / 100 : null,
          bold: rPr ? rPr.getAttribute('b') === '1' : false,
          italic: rPr ? rPr.getAttribute('i') === '1' : false,
          color: rPr ? colorOf(kid(rPr, NS_A, 'solidFill'), ctx) : null,
          font: fontOf(rPr, ctx),
        });
      });
      const text = runs.map((r) => r.text).join('').replace(/\n/g, ' ').trim();
      const explicit = pPr && (kid(pPr, NS_A, 'buChar') || kid(pPr, NS_A, 'buAutoNum'));
      const none = pPr && kid(pPr, NS_A, 'buNone');
      const bullet = !!explicit || (!none && !!ph && ph.type === 'body' && ph.idx !== null && p.textContent.trim() !== '');
      paras.push({
        runs,
        text,
        align: pPr ? pPr.getAttribute('algn') || 'l' : null,
        level: pPr ? num(pPr.getAttribute('lvl')) : 0,
        bullet,
        ph,
      });
    });
    return paras;
  }

  function readTable(frame, ctx) {
    const tbl = frame.getElementsByTagNameNS(NS_A, 'tbl')[0];
    if (!tbl) return null;
    const cols = kids(path(tbl, 'tblGrid'), NS_A, 'gridCol').map((c) => num(c.getAttribute('w')));
    const rows = kids(tbl, NS_A, 'tr').map((tr) => ({
      h: num(tr.getAttribute('h')),
      cells: kids(tr, NS_A, 'tc').map((tc) => {
        const tx = kid(tc, NS_A, 'txBody');
        const paras = tx ? readParagraphs(tx, ctx, null) : [];
        const tcPr = kid(tc, NS_A, 'tcPr');
        return { text: paras.map((p) => p.text).filter(Boolean).join(' '), paras, fill: tcPr ? colorOf(kid(tcPr, NS_A, 'solidFill'), ctx) : null };
      }),
    }));
    return { cols, rows };
  }

  /* ---------- baca satu slide ---------- */
  async function readSlide(zip, slidePath, ctx) {
    const root = await xml(zip, slidePath);
    const srels = await rels(zip, slidePath);
    const layoutRel = Object.values(srels).find((r) => /slideLayout$/.test(r.type));
    const layout = layoutRel ? await xml(zip, layoutRel.path) : null;
    let master = null;
    if (layoutRel) {
      const lrels = await rels(zip, layoutRel.path);
      const mr = Object.values(lrels).find((r) => /slideMaster$/.test(r.type));
      if (mr) master = await xml(zip, mr.path);
    }

    const slide = { shapes: [], background: null, texts: [], title: '', notes: '' };
    const bg = path(kid(root, NS_P, 'cSld'), 'bg');
    const bgOf = (r) => { const b = r && path(kid(r, NS_P, 'cSld'), 'bg'); return b ? colorOf(kid(kid(b, NS_P, 'bgPr') || b, NS_A, 'solidFill'), ctx) : null; };
    slide.background = bgOf(root) || bgOf(layout) || bgOf(master) || 'rgb(255,255,255)';
    void bg;

    const walk = async (parent, map) => {
      for (const el of Array.from(parent.children)) {
        const name = el.localName;
        if (name === 'sp') {
          const spPr = kid(el, NS_P, 'spPr');
          const ph = phInfo(el);
          let box = xfrmOf(spPr) || findPlaceholderXfrm(layout, ph) || findPlaceholderXfrm(master, ph);
          if (!box) continue;
          box = map(box);
          const geom = spPr && path(spPr, 'prstGeom');
          const lnEl = spPr && kid(spPr, NS_A, 'ln');
          const shape = {
            kind: 'sp', box, fill: solid(spPr, ctx),
            line: lnEl ? colorOf(kid(lnEl, NS_A, 'solidFill'), ctx) : null,
            ellipse: geom && geom.getAttribute('prst') === 'ellipse',
            round: geom && geom.getAttribute('prst') === 'roundRect',
            paras: [], ph,
            anchor: 't',
          };
          const tx = kid(el, NS_P, 'txBody');
          if (tx) {
            shape.paras = readParagraphs(tx, ctx, ph);
            const bp = kid(tx, NS_A, 'bodyPr');
            shape.anchor = bp ? bp.getAttribute('anchor') || (ph && /title|ctrTitle/.test(ph.type) ? 'ctr' : 't') : 't';
            if (ph && ph.type === 'ctrTitle' && !bp) shape.anchor = 'ctr';
            const real = shape.paras.map((p) => p.text).filter(Boolean);
            if (real.length) {
              const isTitle = ph && /^(title|ctrTitle)$/.test(ph.type);
              if (isTitle && !slide.title) slide.title = real.join(' ');
              else if (!(ph && /^(sldNum|dt|ftr)$/.test(ph.type))) slide.texts.push(...shape.paras.filter((p) => p.text).map((p) => ({ text: p.text, bullet: p.bullet, level: p.level })));
            }
          }
          slide.shapes.push(shape);
        } else if (name === 'pic') {
          const spPr = kid(el, NS_P, 'spPr');
          const box = xfrmOf(spPr) || findPlaceholderXfrm(layout, phInfo(el));
          const blip = el.getElementsByTagNameNS(NS_A, 'blip')[0];
          const rid = blip && blip.getAttributeNS(NS_R, 'embed');
          const rel = rid && srels[rid];
          if (box && rel) slide.shapes.push({ kind: 'pic', box: map(box), src: rel.path });
        } else if (name === 'graphicFrame') {
          const box = xfrmOf(el);
          const table = readTable(el, ctx);
          if (box && table) {
            slide.shapes.push({ kind: 'table', box: map(box), table });
            table.rows.forEach((r) => {
              const line = r.cells.map((c) => c.text).join(' | ');
              if (line.replace(/[|\s]/g, '')) slide.texts.push({ text: line, bullet: false, level: 0, table: true });
            });
          }
        } else if (name === 'grpSp') {
          const gx = el.getElementsByTagNameNS(NS_A, 'xfrm')[0];
          const grp = gx && gx.parentNode.localName === 'grpSpPr' ? gx : null;
          let childMap = map;
          if (grp) {
            const off = kid(grp, NS_A, 'off'), ext = kid(grp, NS_A, 'ext'), co = kid(grp, NS_A, 'chOff'), ce = kid(grp, NS_A, 'chExt');
            if (off && ext && co && ce && num(ce.getAttribute('cx')) && num(ce.getAttribute('cy'))) {
              const sx = num(ext.getAttribute('cx')) / num(ce.getAttribute('cx'));
              const sy = num(ext.getAttribute('cy')) / num(ce.getAttribute('cy'));
              childMap = (b) => map({
                x: num(off.getAttribute('x')) + (b.x - num(co.getAttribute('x'))) * sx,
                y: num(off.getAttribute('y')) + (b.y - num(co.getAttribute('y'))) * sy,
                w: b.w * sx, h: b.h * sy, rot: b.rot,
              });
            }
          }
          await walk(el, childMap);
        }
      }
    };
    const tree = path(kid(root, NS_P, 'cSld'), 'spTree');
    if (tree) await walk(tree, (b) => b);

    // catatan pembicara
    const notesRel = Object.values(srels).find((r) => /notesSlide$/.test(r.type));
    if (notesRel) {
      const n = await xml(zip, notesRel.path);
      if (n) {
        const parts = [];
        Array.from(n.getElementsByTagNameNS(NS_P, 'sp')).forEach((sp) => {
          const ph = phInfo(sp);
          if (ph && ph.type === 'body') parts.push(Array.from(sp.getElementsByTagNameNS(NS_A, 't')).map((t) => t.textContent).join(' ').trim());
        });
        slide.notes = parts.filter(Boolean).join('\n');
      }
    }
    return slide;
  }

  /* ---------- baca seluruh presentasi ---------- */
  async function load(file) {
    if (!window.JSZip) throw new Error('Library JSZip belum termuat.');
    let zip;
    try { zip = await window.JSZip.loadAsync(await file.arrayBuffer()); } catch (e) {
      throw new Error('File PPTX tidak valid atau rusak. (Format .ppt lama belum didukung — simpan ulang sebagai .pptx.)');
    }
    const pres = await xml(zip, 'ppt/presentation.xml');
    if (!pres) throw new Error('File ini bukan presentasi PPTX yang valid.');
    const prels = await rels(zip, 'ppt/presentation.xml');
    const sz = kid(pres, NS_P, 'sldSz');
    const size = { cx: sz ? num(sz.getAttribute('cx'), 9144000) : 9144000, cy: sz ? num(sz.getAttribute('cy'), 6858000) : 6858000 };
    const themeRel = Object.values(prels).find((r) => /theme$/.test(r.type));
    const themeXml = themeRel ? await xml(zip, themeRel.path) : null;
    const ctx = { theme: themeColors(themeXml), fonts: themeFonts(themeXml) };

    const ids = kids(path(pres, 'sldIdLst'), NS_P, 'sldId');
    const slidePaths = ids.map((i) => prels[i.getAttributeNS(NS_R, 'id')]).filter(Boolean).map((r) => r.path);
    if (!slidePaths.length) throw new Error('Presentasi tidak memiliki slide.');
    const slides = [];
    for (const p of slidePaths) slides.push(await readSlide(zip, p, ctx));
    return { zip, size, slides, name: baseName(file.name), fonts: ctx.fonts };
  }

  /* ---------- render ke canvas ---------- */
  const mimeOf = (p) => ({ png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', bmp: 'image/bmp', svg: 'image/svg+xml' }[p.split('.').pop().toLowerCase()]);

  async function loadImage(zip, p, cache) {
    if (cache[p] !== undefined) return cache[p];
    cache[p] = null;
    const mime = mimeOf(p);
    const f = zip.file(p);
    if (!f || !mime) return null;
    try {
      const blob = new Blob([await f.async('uint8array')], { type: mime });
      cache[p] = await createImageBitmap(blob);
    } catch (e) { cache[p] = null; }
    return cache[p];
  }

  let fontsRef = { major: null, minor: null };
  const SCRIPT = /script|dancing|pacifico|lobster|great vibes|allura|brush|hand|cursive|sacramento|satisfy|vibes|signature/i;
  const familyFor = (name) => (name ? `"${name}", ${SCRIPT.test(name) ? 'cursive' : 'Arial, Helvetica, sans-serif'}` : '"Segoe UI", Arial, Helvetica, sans-serif');

  // Muat font yang dipakai slide (Google Fonts) agar tampilan sama dengan aslinya
  async function ensureFonts(deck) {
    const names = new Set();
    deck.slides.forEach((s) => s.shapes.forEach((sh) => {
      (sh.paras || []).forEach((p) => p.runs.forEach((r) => r.font && names.add(r.font)));
      if (sh.table) sh.table.rows.forEach((row) => row.cells.forEach((c) => c.paras.forEach((p) => p.runs.forEach((r) => r.font && names.add(r.font)))));
    }));
    [deck.fonts.major, deck.fonts.minor].forEach((f) => f && names.add(f));
    const system = /^(arial|calibri|cambria|times new roman|segoe ui|verdana|tahoma|georgia|courier new|consolas|trebuchet ms|helvetica|comic sans ms|impact|aptos)/i;
    const need = [...names].filter((n) => !system.test(n) && !(document.fonts && document.fonts.check(`16px "${n}"`)));
    await Promise.all(need.map(async (n) => {
      try {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(n).replace(/%20/g, '+')}:ital,wght@0,400;0,700;1,400;1,700&display=swap`;
        const loaded = new Promise((res) => { link.onload = res; link.onerror = res; setTimeout(res, 4000); });
        document.head.appendChild(link);
        await loaded;
        await Promise.race([
          Promise.all([document.fonts.load(`16px "${n}"`), document.fonts.load(`bold 16px "${n}"`)]),
          new Promise((res) => setTimeout(res, 4000)),
        ]);
      } catch (e) { /* pakai font cadangan */ }
    }));
  }

  function wrapRuns(ctx2d, para, fontFor, maxW) {
    const words = [];
    para.runs.forEach((r) => {
      r.text.split(/(\s+)/).forEach((w) => { if (w) words.push({ w, run: r }); });
    });
    const lines = [];
    let cur = [], curW = 0;
    words.forEach((tok) => {
      ctx2d.font = fontFor(tok.run);
      const w = ctx2d.measureText(tok.w).width;
      if (curW + w > maxW && cur.length && tok.w.trim()) { lines.push({ toks: cur, w: curW }); cur = []; curW = 0; }
      if (!cur.length && !tok.w.trim()) return;
      cur.push({ ...tok, width: w }); curW += w;
    });
    if (cur.length || !lines.length) lines.push({ toks: cur, w: curW });
    return lines;
  }

  function drawShapeText(c, shape, k, W, defaultPt) {
    const pad = 7.2 * EMU_PT * k;
    const bx = shape.box.x * k + pad, by = shape.box.y * k + pad * 0.5;
    const bw = shape.box.w * k - pad * 2, bh = shape.box.h * k - pad;
    const isTitle = shape.ph && /^(title|ctrTitle)$/.test(shape.ph.type);
    const blocks = [];
    let totalH = 0;
    shape.paras.forEach((p) => {
      const ptRaw = (p.runs.find((r) => r.size) || {}).size;
      const pt = ptRaw || (isTitle ? defaultPt * 2.2 : defaultPt);
      const px = pt * EMU_PT * k;
      const indent = (p.bullet ? px * 1.1 : 0) + p.level * px * 1.2;
      const fontFor = (r) => `${r.italic ? 'italic ' : ''}${r.bold || (isTitle && !r.font) ? 'bold ' : ''}${(r.size ? r.size * EMU_PT * k : px).toFixed(1)}px ${familyFor(r.font || (isTitle ? fontsRef.major : fontsRef.minor))}`;
      const lines = p.runs.length ? wrapRuns(c, p, fontFor, Math.max(10, bw - indent)) : [{ toks: [], w: 0 }];
      const lh = px * 1.2;
      blocks.push({ p, lines, lh, px, indent, fontFor });
      totalH += lines.length * lh + px * 0.25;
    });
    let y = by;
    if (shape.anchor === 'ctr') y = by + (bh - totalH) / 2;
    else if (shape.anchor === 'b') y = by + bh - totalH;
    y = Math.max(by * 0.5, y);
    c.textBaseline = 'alphabetic';
    blocks.forEach(({ p, lines, lh, px, indent, fontFor }) => {
      const align = p.align || (shape.ph && shape.ph.type === 'ctrTitle' ? 'ctr' : 'l');
      lines.forEach((ln, i) => {
        let x = bx + indent;
        if (align === 'ctr') x = bx + (bw - ln.w) / 2;
        else if (align === 'r') x = bx + bw - ln.w;
        if (p.bullet && i === 0) {
          c.font = fontFor({}); c.fillStyle = (p.runs[0] && p.runs[0].color) || '#222';
          c.fillText('•', bx + indent - px * 0.9, y + px);
        }
        ln.toks.forEach((tok) => {
          c.font = fontFor(tok.run);
          c.fillStyle = tok.run.color || shape.defaultColor || '#1a1a1a';
          c.fillText(tok.w, x, y + px);
          x += tok.width;
        });
        y += lh;
      });
      y += px * 0.25;
    });
  }

  async function renderSlide(deck, index, width, cache) {
    const { size, slides, zip } = deck;
    fontsRef = deck.fonts || fontsRef;
    const slide = slides[index];
    const W = Math.round(width), H = Math.round(width * size.cy / size.cx);
    const canvas = document.createElement('canvas');
    canvas.width = W; canvas.height = H;
    const c = canvas.getContext('2d');
    const k = W / size.cx;
    c.fillStyle = slide.background; c.fillRect(0, 0, W, H);

    for (const s of slide.shapes) {
      const { x, y, w, h, rot } = s.box;
      c.save();
      if (rot) { c.translate((x + w / 2) * k, (y + h / 2) * k); c.rotate((rot * Math.PI) / 180); c.translate(-(x + w / 2) * k, -(y + h / 2) * k); }
      if (s.kind === 'pic') {
        const img = await loadImage(zip, s.src, cache);
        if (img) c.drawImage(img, x * k, y * k, w * k, h * k);
      } else if (s.kind === 'table') {
        const t = s.table;
        const totalW = t.cols.reduce((a, b) => a + b, 0) || w;
        let cy = y;
        t.rows.forEach((row) => {
          let cx = x;
          row.cells.forEach((cell, ci) => {
            const cw = ((t.cols[ci] || totalW / row.cells.length) / totalW) * w;
            const rh = row.h || h / t.rows.length;
            if (cell.fill) { c.fillStyle = cell.fill; c.fillRect(cx * k, cy * k, cw * k, rh * k); }
            c.strokeStyle = '#999'; c.lineWidth = 1; c.strokeRect(cx * k, cy * k, cw * k, rh * k);
            drawShapeText(c, { box: { x: cx, y: cy, w: cw, h: rh }, paras: cell.paras, anchor: 'ctr', ph: null }, k, W, 14);
            cx += cw;
          });
          cy += row.h || h / t.rows.length;
        });
      } else {
        if (s.fill || s.line) {
          c.beginPath();
          if (s.ellipse) c.ellipse((x + w / 2) * k, (y + h / 2) * k, (w / 2) * k, (h / 2) * k, 0, 0, Math.PI * 2);
          else if (s.round && c.roundRect) c.roundRect(x * k, y * k, w * k, h * k, Math.min(w, h) * k * 0.16);
          else c.rect(x * k, y * k, w * k, h * k);
          if (s.fill) { c.fillStyle = s.fill; c.fill(); }
          if (s.line) { c.strokeStyle = s.line; c.lineWidth = Math.max(1, 1 * k * EMU_PT); c.stroke(); }
        }
        if (s.paras.length && !(s.ph && /^(sldNum|dt|ftr)$/.test(s.ph.type))) {
          const dark = s.fill && /rgb\((\d+),(\d+),(\d+)\)/.exec(s.fill);
          if (dark && (0.299 * dark[1] + 0.587 * dark[2] + 0.114 * dark[3]) < 140) s.defaultColor = '#ffffff';
          drawShapeText(c, s, k, W, 18);
        }
      }
      c.restore();
    }
    return canvas;
  }

  const toBlob = (canvas, type = 'image/png', q = 0.92) => new Promise((res) => canvas.toBlob(res, type, q));

  /* ---------- ekspor teks ---------- */
  function toTxt(deck) {
    return deck.slides.map((s, i) => {
      const lines = [`=== Slide ${i + 1}${s.title ? `: ${s.title}` : ''} ===`];
      s.texts.forEach((t) => lines.push(`${'  '.repeat(t.level)}${t.bullet ? '- ' : ''}${t.text}`));
      if (s.notes) lines.push('', `Catatan: ${s.notes}`);
      return lines.join('\n');
    }).join('\n\n') + '\n';
  }
  function toMd(deck) {
    return deck.slides.map((s, i) => {
      const lines = [`## Slide ${i + 1}${s.title ? `: ${s.title}` : ''}`, ''];
      s.texts.forEach((t) => lines.push(t.table ? `| ${t.text.replace(/ \| /g, ' | ')} |` : `${'  '.repeat(t.level)}${t.bullet ? '- ' : ''}${t.text}${t.bullet ? '' : '\n'}`));
      if (s.notes) lines.push('', `> Catatan: ${s.notes.replace(/\n/g, ' ')}`);
      return lines.join('\n');
    }).join('\n\n---\n\n') + '\n';
  }
  function toHtml(deck) {
    const body = deck.slides.map((s, i) => {
      const items = s.texts.map((t) => `<p style="margin:.35em 0 .35em ${t.level * 1.4}em">${t.bullet ? '• ' : ''}${esc(t.text)}</p>`).join('');
      return `<section><h2>Slide ${i + 1}${s.title ? ` — ${esc(s.title)}` : ''}</h2>${items}${s.notes ? `<blockquote>${esc(s.notes)}</blockquote>` : ''}</section>`;
    }).join('\n');
    return `<!doctype html><html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(deck.name)}</title><style>body{font-family:system-ui,Arial,sans-serif;max-width:800px;margin:2rem auto;padding:0 1rem;line-height:1.5}section{border:1px solid #ccc;border-radius:10px;padding:1rem 1.4rem;margin:1.2rem 0}h2{margin-top:0}blockquote{color:#666;border-left:3px solid #ccc;margin:1rem 0 0;padding-left:1rem}</style></head><body><h1>${esc(deck.name)}</h1>\n${body}\n</body></html>`;
  }

  async function toDocx(deck) {
    const run = (t, o = {}) => `<w:r><w:rPr>${o.b ? '<w:b/>' : ''}${o.i ? '<w:i/>' : ''}${o.sz ? `<w:sz w:val="${o.sz}"/>` : ''}</w:rPr><w:t xml:space="preserve">${esc(t)}</w:t></w:r>`;
    const para = (inner, o = {}) => `<w:p><w:pPr>${o.pb ? '<w:pageBreakBefore/>' : ''}${o.ind ? `<w:ind w:left="${o.ind}"/>` : ''}<w:spacing w:after="${o.after ?? 120}"/></w:pPr>${inner}</w:p>`;
    const parts = [];
    deck.slides.forEach((s, i) => {
      parts.push(para(run(`Slide ${i + 1}${s.title ? `: ${s.title}` : ''}`, { b: true, sz: 32 }), { pb: i > 0, after: 200 }));
      s.texts.forEach((t) => parts.push(para(run(`${t.bullet ? '• ' : ''}${t.text}`), { ind: 360 * (t.level + (t.bullet ? 1 : 0)) })));
      if (s.notes) parts.push(para(run(`Catatan: ${s.notes}`, { i: true })));
    });
    const doc = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${parts.join('')}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr></w:body></w:document>`;
    const z = new window.JSZip();
    z.file('[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');
    z.file('_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
    z.file('word/document.xml', doc);
    return z.generateAsync({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
  }

  /* ---------- API ---------- */
  async function convert(file, target, options = {}) {
    const deck = await load(file);
    const name = deck.name;
    if (target === 'txt') return { filename: `${name}.txt`, blob: new Blob([toTxt(deck)], { type: 'text/plain;charset=utf-8' }) };
    if (target === 'md') return { filename: `${name}.md`, blob: new Blob([toMd(deck)], { type: 'text/markdown;charset=utf-8' }) };
    if (target === 'html') return { filename: `${name}.html`, blob: new Blob([toHtml(deck)], { type: 'text/html;charset=utf-8' }) };
    if (target === 'docx') return { filename: `${name}.docx`, blob: await toDocx(deck) };

    const cache = {};
    if (['pdf', 'png', 'jpg'].includes(target)) await ensureFonts(deck);
    if (target === 'pdf') {
      if (!window.jspdf) throw new Error('Library jsPDF belum termuat.');
      const wmm = deck.size.cx / 36000, hmm = deck.size.cy / 36000;
      const doc = new window.jspdf.jsPDF({ orientation: wmm >= hmm ? 'landscape' : 'portrait', unit: 'mm', format: [wmm, hmm], compress: true });
      for (let i = 0; i < deck.slides.length; i++) {
        const canvas = await renderSlide(deck, i, 1600, cache);
        if (i > 0) doc.addPage([wmm, hmm], wmm >= hmm ? 'landscape' : 'portrait');
        doc.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, wmm, hmm);
        if (options.onProgress) options.onProgress((i + 1) / deck.slides.length);
      }
      return { filename: `${name}.pdf`, blob: doc.output('blob') };
    }
    if (target === 'png' || target === 'jpg') {
      const mime = target === 'jpg' ? 'image/jpeg' : 'image/png';
      const pad = String(deck.slides.length).length;
      const out = [];
      for (let i = 0; i < deck.slides.length; i++) {
        const canvas = await renderSlide(deck, i, 1920, cache);
        out.push({ name: `${name}-slide-${String(i + 1).padStart(Math.max(2, pad), '0')}.${target}`, blob: await toBlob(canvas, mime) });
      }
      if (out.length === 1) return { filename: out[0].name, blob: out[0].blob };
      const z = new window.JSZip();
      out.forEach((o) => z.file(o.name, o.blob));
      return { filename: `${name}-slides.zip`, blob: await z.generateAsync({ type: 'blob' }) };
    }
    throw new Error(`Konversi .pptx ke .${target} belum tersedia.`);
  }

  window.PPTXConverter = { convert, load, renderSlide };
})();
