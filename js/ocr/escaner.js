// Cámara + lector de texto (OCR) 100% local, sin internet.
// Flujo: video -> recorte del recuadro guía -> limpieza de imagen -> Tesseract.

import { OCR, CODIGO_MIN, CODIGO_MAX } from '../config.js';
import { normalizarCodigo } from '../core/repo.js';

let workerPromesa = null;

function cargarScript(src) {
  return new Promise((resolve, reject) => {
    if (window.Tesseract) return resolve();
    const s = document.createElement('script');
    s.src = src; s.onload = resolve; s.onerror = () => reject(new Error('No se pudo cargar el lector de texto.'));
    document.head.append(s);
  });
}

export function prepararOCR(onProgreso) {
  if (workerPromesa) return workerPromesa;
  workerPromesa = (async () => {
    await cargarScript('./vendor/tesseract/tesseract.min.js');
    const w = await window.Tesseract.createWorker(OCR.idioma, 1 /* solo LSTM */, {
      workerPath: OCR.workerPath, corePath: OCR.corePath, langPath: OCR.langPath,
      gzip: true, workerBlobURL: false, cacheMethod: 'none',
      logger: (m) => onProgreso && onProgreso(m),
    });
    await w.setParameters({
      tessedit_char_whitelist: OCR.listaBlanca,
      tessedit_pageseg_mode: '7', // una sola línea de texto
    });
    return w;
  })();
  workerPromesa.catch(() => { workerPromesa = null; });
  return workerPromesa;
}

// ---------- Cámara ----------

export async function abrirCamara(video) {
  if (!navigator.mediaDevices?.getUserMedia) throw new Error('Este navegador no permite usar la cámara.');
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: false,
    video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
  });
  video.srcObject = stream;
  await video.play();
  const pista = stream.getVideoTracks()[0];
  try { await pista.applyConstraints({ advanced: [{ focusMode: 'continuous' }] }); } catch (_) {}
  return stream;
}

export function cerrarCamara(stream) {
  stream?.getTracks().forEach((t) => t.stop());
}

/** Recorta del video exactamente lo que se ve dentro del recuadro guía. */
export function recortarGuia(video, guia) {
  const vr = video.getBoundingClientRect();
  const gr = guia.getBoundingClientRect();
  const vw = video.videoWidth, vh = video.videoHeight;
  const escala = Math.max(vr.width / vw, vr.height / vh); // object-fit: cover
  const offX = (vr.width - vw * escala) / 2, offY = (vr.height - vh * escala) / 2;
  const sx = (gr.left - vr.left - offX) / escala, sy = (gr.top - vr.top - offY) / escala;
  const sw = gr.width / escala, sh = gr.height / escala;
  const c = document.createElement('canvas');
  c.width = Math.round(sw); c.height = Math.round(sh);
  c.getContext('2d').drawImage(video, sx, sy, sw, sh, 0, 0, c.width, c.height);
  return c;
}

// ---------- Limpieza de imagen (tinta de puntos) ----------

function variantes(origen) {
  // Escala a ~1200 px de ancho para que los puntos se unan al suavizar
  const factor = Math.min(4, Math.max(1, 1200 / origen.width));
  const w = Math.round(origen.width * factor), hgt = Math.round(origen.height * factor);
  const c = document.createElement('canvas'); c.width = w; c.height = hgt;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.filter = 'grayscale(1) blur(2px)';
  ctx.drawImage(origen, 0, 0, w, hgt);
  ctx.filter = 'none';
  const img = ctx.getImageData(0, 0, w, hgt);
  const d = img.data;
  const gris = new Uint8Array(w * hgt);
  const hist = new Array(256).fill(0);
  for (let i = 0; i < gris.length; i++) { gris[i] = d[i * 4]; hist[gris[i]]++; }

  // Umbral automático de Otsu
  let total = gris.length, suma = 0, sumaB = 0, wB = 0, max = 0, umbral = 127;
  for (let i = 0; i < 256; i++) suma += i * hist[i];
  for (let i = 0; i < 256; i++) {
    wB += hist[i]; if (!wB) continue;
    const wF = total - wB; if (!wF) break;
    sumaB += i * hist[i];
    const mB = sumaB / wB, mF = (suma - sumaB) / wF;
    const v = wB * wF * (mB - mF) ** 2;
    if (v > max) { max = v; umbral = i; }
  }
  const bin = new Uint8Array(gris.length);
  for (let i = 0; i < gris.length; i++) bin[i] = gris[i] > umbral ? 255 : 0;

  // Variante engrosada: une puntos de la impresión
  const gruesa = new Uint8Array(bin);
  for (let y = 1; y < hgt - 1; y++) for (let x = 1; x < w - 1; x++) {
    const i = y * w + x;
    if (bin[i - 1] === 0 || bin[i + 1] === 0 || bin[i - w] === 0 || bin[i + w] === 0) gruesa[i] = 0;
  }
  const aCanvas = (arr) => {
    const m = 30;
    const k = document.createElement('canvas'); k.width = w + 2 * m; k.height = hgt + 2 * m;
    const kx = k.getContext('2d'); kx.fillStyle = '#fff'; kx.fillRect(0, 0, k.width, k.height);
    const out = kx.createImageData(w, hgt);
    for (let i = 0; i < arr.length; i++) { out.data[i * 4] = out.data[i * 4 + 1] = out.data[i * 4 + 2] = arr[i]; out.data[i * 4 + 3] = 255; }
    kx.putImageData(out, m, m);
    return k;
  };
  // Variante en gris con contraste estirado (sin binarizar)
  let lo = 0, hi = 255, acum = 0;
  for (let i = 0; i < 256; i++) { acum += hist[i]; if (acum > total * 0.02) { lo = i; break; } }
  acum = 0;
  for (let i = 255; i >= 0; i--) { acum += hist[i]; if (acum > total * 0.02) { hi = i; break; } }
  const contraste = new Uint8Array(gris.length);
  const rango = Math.max(1, hi - lo);
  for (let i = 0; i < gris.length; i++) contraste[i] = Math.max(0, Math.min(255, ((gris[i] - lo) * 255) / rango));
  return [aCanvas(bin), aCanvas(gruesa), aCanvas(contraste)];
}

/**
 * Lee el código del recorte. Devuelve sugerencias únicas (de 0 a 3).
 * El usuario SIEMPRE confirma o corrige antes de guardar.
 */
export async function leerCodigo(recorte) {
  const w = await prepararOCR();
  const sugerencias = [];
  for (const img of variantes(recorte)) {
    const { data } = await w.recognize(img);
    // Toma la "palabra" más larga que encaje con la longitud esperada
    const partes = (data.text || '').split(/\s*\n\s*/).map(normalizarCodigo).filter(Boolean);
    const unido = normalizarCodigo(data.text);
    for (const p of [unido, ...partes]) {
      const recortado = p.slice(0, CODIGO_MAX);
      if (recortado.length >= CODIGO_MIN && !sugerencias.includes(recortado)) { sugerencias.push(recortado); break; }
    }
  }
  return sugerencias;
}
