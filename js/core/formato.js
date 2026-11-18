// Formato del código de lote (configurable en Configuración).
// Notación: L = letra, N = número, ? = letra o número. Ej. "LLLLNNLLL" = CCCC44BBB.
// Formato vacío = sin formato (se acepta cualquier código de 5 a 12 caracteres).

const A_LETRA = { 0: 'O', 1: 'I', 2: 'Z', 4: 'A', 5: 'S', 6: 'G', 7: 'T', 8: 'B' };
const A_NUMERO = { O: '0', D: '0', Q: '0', U: '0', I: '1', L: '1', J: '1', T: '7', Z: '2', S: '5', B: '8', G: '6', A: '4' };

export const normalizarFormato = (f) => String(f || '').toUpperCase().replace(/[^LN?]/g, '');

const esLetra = (c) => /[A-Z]/.test(c);
const esNumero = (c) => /[0-9]/.test(c);
const encaja = (c, t) => t === '?' || (t === 'L' ? esLetra(c) : esNumero(c));

export function cumpleFormato(codigo, formato) {
  const f = normalizarFormato(formato);
  if (!f) return true;
  const s = String(codigo || '');
  return s.length === f.length && [...s].every((c, i) => encaja(c, f[i]));
}

/** Corrige cada posición según el formato (ej. un "0" donde va letra → "O"). */
function corregir(s, f) {
  return [...s].map((c, i) => {
    const t = f[i];
    if (!t || t === '?' || encaja(c, t)) return c;
    return (t === 'L' ? A_LETRA[c] : A_NUMERO[c]) || c;
  }).join('');
}

/**
 * Ajusta un texto leído al formato: busca dentro de él el tramo del largo del formato
 * que mejor encaja (quita basura de los bordes) y corrige las confusiones típicas.
 */
export function ajustarAFormato(texto, formato) {
  const f = normalizarFormato(formato);
  const s = String(texto || '');
  if (!f || s.length < f.length) return f ? corregir(s, f) : s;
  // Candidatos: quitar los caracteres sobrantes (hasta 2 en cualquier posición; si sobran más, solo tramos seguidos)
  const sobran = s.length - f.length;
  const candidatos = [];
  if (sobran <= 2) {
    const quitar = (str, desde, k, quitados) => {
      if (k === 0) { candidatos.push({ t: str, q: quitados }); return; }
      for (let i = desde; i < str.length; i++) quitar(str.slice(0, i) + str.slice(i + 1), i, k - 1, [...quitados, i + quitados.length]);
    };
    quitar(s, 0, sobran, []);
  } else {
    for (let i = 0; i + f.length <= s.length; i++) candidatos.push({ t: s.slice(i, i + f.length), q: [] });
  }
  // Mejor: más posiciones que ya encajan; en empate, lo quitado más cerca de las orillas (basura del borde)
  const orilla = (q) => q.reduce((a, i) => a + Math.min(i, s.length - 1 - i), 0);
  let mejor = null, mp = -1, mo = Infinity;
  for (const c of candidatos) {
    const p = [...c.t].filter((x, j) => encaja(x, f[j])).length, o = orilla(c.q);
    if (p > mp || (p === mp && o < mo)) { mejor = c.t; mp = p; mo = o; }
  }
  return corregir(mejor, f);
}

/** Votación por posición entre varias lecturas del mismo largo que el formato. */
export function consenso(lecturas, formato) {
  const f = normalizarFormato(formato);
  const validas = lecturas.filter((x) => x.length === (f.length || x.length));
  if (validas.length < 2) return validas[0] || '';
  const n = validas[0].length;
  let r = '';
  for (let i = 0; i < n; i++) {
    const cuenta = {};
    for (const v of validas) cuenta[v[i]] = (cuenta[v[i]] || 0) + 1;
    r += Object.entries(cuenta).sort((a, b) => b[1] - a[1])[0][0];
  }
  return r;
}

/** "LLLLNNLLL" → "4 letras, 2 números y 3 letras (9 caracteres)". */
export function describirFormato(formato) {
  const f = normalizarFormato(formato);
  if (!f) return 'Sin formato fijo (5 a 12 letras o números)';
  const nombre = { L: ['letra', 'letras'], N: ['número', 'números'], '?': ['letra o número', 'letras o números'] };
  const grupos = f.match(/(L+|N+|\?+)/g) || [];
  const partes = grupos.map((g) => `${g.length} ${nombre[g[0]][g.length === 1 ? 0 : 1]}`);
  const texto = partes.length > 1 ? partes.slice(0, -1).join(', ') + ' y ' + partes.at(-1) : partes[0];
  return `${texto} (${f.length} caracteres)`;
}

/** Ejemplo visual del formato: "LLLLNNLLL" → "ABCD12EFG". */
export function ejemploFormato(formato) {
  const f = normalizarFormato(formato);
  let l = 0, n = 0;
  return [...f].map((t) => (t === 'N' ? String(++n % 10) : t === 'L' ? 'ABCDEFGHIJKL'[l++ % 12] : '*')).join('');
}
