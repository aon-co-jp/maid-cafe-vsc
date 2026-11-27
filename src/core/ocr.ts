/**
 * 画像だけの PDF の文字読み取り(OCR)。
 * PDF に埋め込まれた画像(JPEG=DCTDecode、または 8bit の Gray/RGB を Flate 圧縮したもの)を取り出し、
 * aruaru-llm の版なし Connect 呼び出し `POST /aruaru_llm.Llm/Ocr` に送る(新しい REST は作らない)。
 * PDF を描画して画像にする機能は持たない(文字や図形だけで描かれたページは対象外)。
 */
import * as zlib from 'node:zlib';

export interface PdfImage {
  mime: 'image/jpeg' | 'image/png';
  data: Buffer;
}

export const MAX_OCR_PAGES = 16;

/** PDF の生バイトから画像 XObject を順に取り出す。 */
export function extractPdfImages(pdf: Buffer): PdfImage[] {
  const s = pdf.toString('latin1');
  const out: PdfImage[] = [];
  const re = /stream\r?\n/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) {
    if (m.index > 0 && /[a-z]/i.test(s[m.index - 1])) continue; // "endstream" の一部
    const objAt = s.lastIndexOf(' obj', m.index);
    if (objAt < 0) continue;
    const dict = s.slice(objAt, m.index);
    if (dict.includes('endobj') || !/\/Subtype\s*\/Image\b/.test(dict)) continue;
    const start = m.index + m[0].length;
    let end: number;
    const len = /\/Length\s+(\d+)(?!\s+\d+\s+R)/.exec(dict);
    if (len && s.slice(start + Number(len[1])).match(/^\s*endstream/)) end = start + Number(len[1]);
    else {
      end = s.indexOf('endstream', start);
      if (end < 0) continue;
      while (end > start && (s[end - 1] === '\n' || s[end - 1] === '\r')) end--;
    }
    const raw = pdf.subarray(start, end);
    re.lastIndex = end;
    if (/\/DCTDecode\b/.test(dict)) {
      out.push({ mime: 'image/jpeg', data: Buffer.from(raw) });
      continue;
    }
    if (/\/FlateDecode\b/.test(dict) && !/\/DecodeParms/.test(dict)) {
      const w = Number(/\/Width\s+(\d+)/.exec(dict)?.[1]);
      const h = Number(/\/Height\s+(\d+)/.exec(dict)?.[1]);
      const bpc = Number(/\/BitsPerComponent\s+(\d+)/.exec(dict)?.[1] ?? 8);
      const ch = /\/DeviceRGB\b/.test(dict) ? 3 : /\/DeviceGray\b/.test(dict) ? 1 : 0;
      if (!w || !h || bpc !== 8 || !ch) continue;
      let px: Buffer;
      try {
        px = zlib.inflateSync(raw);
      } catch {
        continue;
      }
      if (px.length < w * h * ch) continue;
      out.push({ mime: 'image/png', data: encodePng(w, h, ch, px) });
    }
  }
  return out;
}

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(b: Buffer): number {
  let c = 0xffffffff;
  for (const x of b) c = CRC_TABLE[(c ^ x) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

/** 8bit の Gray(ch=1)/RGB(ch=3)の画素から PNG を作る。 */
export function encodePng(w: number, h: number, ch: 1 | 3 | number, px: Buffer): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = ch === 3 ? 2 : 0;
  const row = w * ch;
  const raw = Buffer.alloc((row + 1) * h);
  for (let y = 0; y < h; y++) px.copy(raw, y * (row + 1) + 1, y * row, (y + 1) * row);
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

/** aruaru-llm の OCR(版なし Connect)の要求を作る。 */
export function buildOcrRequest(baseUrl: string | undefined, images: PdfImage[]): { url: string; body: string } {
  const base = (baseUrl ?? 'https://maid-cafe.tokyo').replace(/\/+$/, '');
  return {
    url: `${base}/aruaru_llm.Llm/Ocr`,
    body: JSON.stringify({ images_base64: images.slice(0, MAX_OCR_PAGES).map((i) => i.data.toString('base64')), languages: 'jpn+eng', quality: 'best' }),
  };
}

/** OCR の応答 {pages:[{lines:[{text}]}]} を文章にする。 */
export function parseOcrResponse(j: unknown): string {
  const pages = (j as { pages?: { lines?: { text?: string }[] }[] })?.pages;
  if (!Array.isArray(pages)) throw new Error('unexpected OCR response');
  return pages.map((p) => (p.lines ?? []).map((l) => l.text ?? '').join('\n')).join('\n\n');
}

/** OCR を実行する。失敗時は利用者に分かる文で投げる。 */
export async function ocrImages(baseUrl: string | undefined, images: PdfImage[], fetchFn: typeof fetch = fetch): Promise<string> {
  const { url, body } = buildOcrRequest(baseUrl, images);
  let res: Response;
  try {
    res = await fetchFn(url, { method: 'POST', headers: { 'content-type': 'application/json', 'x-tenant': 'maid-cafe-vsc' }, body, signal: AbortSignal.timeout(120000) });
  } catch (e) {
    throw new Error(`This PDF has only images and needs OCR, but the OCR service could not be reached (${url}: ${(e as Error).message}). Check "maidCafe.aruaruUrl" or paste the text instead.`);
  }
  if (!res.ok) {
    const hint = res.status === 404 ? 'this server has no OCR' : res.status === 503 ? 'OCR is not installed or busy on this server' : `HTTP ${res.status}`;
    throw new Error(`This PDF has only images and needs OCR, but OCR failed (${hint}). Check "maidCafe.aruaruUrl" or paste the text instead.`);
  }
  const text = parseOcrResponse(await res.json());
  if (!text.trim()) throw new Error('OCR found no text in this PDF.');
  return text;
}
