/** 取り込むファイルから文章を取り出す(md/txt/docx/pdf)。純粋な Node ライブラリのみ(mammoth=BSD-2、pdf-parse=MIT)。 */
import { execFile } from 'node:child_process';
import * as path from 'node:path';
import { extractPdfImages, PdfImage } from './ocr';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const mammoth: { extractRawText(i: { buffer: Buffer }): Promise<{ value: string }> } = require('mammoth');

export type FileKind = 'text' | 'docx' | 'pdf' | 'unsupported';

export function fileKind(name: string): FileKind {
  if (/\.(md|markdown|txt)$/i.test(name)) return 'text';
  if (/\.docx$/i.test(name)) return 'docx';
  if (/\.pdf$/i.test(name)) return 'pdf';
  return 'unsupported';
}

export const MAX_IMPORT_BYTES = 10 * 1024 * 1024;

/** 画像だけの PDF のとき呼ばれる OCR(省略時は分かりやすいエラー)。 */
export type OcrFn = (images: PdfImage[]) => Promise<string>;

export async function extractText(name: string, bytes: Uint8Array, ocr?: OcrFn): Promise<string> {
  if (bytes.byteLength > MAX_IMPORT_BYTES) throw new Error('The file is larger than 10 MB.');
  const kind = fileKind(name);
  const buf = Buffer.from(bytes);
  if (kind === 'text') return buf.toString('utf8');
  if (kind === 'docx') return (await mammoth.extractRawText({ buffer: buf })).value;
  if (kind === 'pdf') {
    let text = '';
    let parseErr: Error | undefined;
    try {
      text = await pdfInChild(buf);
    } catch (e) {
      parseErr = e as Error;
    }
    if (text.trim()) return text;
    const images = extractPdfImages(buf);
    if (!images.length) throw parseErr ?? new Error('This PDF has no text and no readable images (only JPEG or 8-bit Gray/RGB images can be read by OCR).');
    if (!ocr) throw new Error('This PDF has only images; OCR is needed but not available here.');
    return ocr(images);
  }
  throw new Error('Unsupported file type (md, txt, docx and pdf are supported).');
}

/** PDF は別プロセスで読む(拡張ホストの中では pdf.js が失敗したため。実VS Codeの試験で確認)。 */
function pdfInChild(buf: Buffer): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = execFile(process.execPath, [path.join(__dirname, 'pdfChild.js')], { env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, maxBuffer: 64 * 1024 * 1024, timeout: 60000, encoding: 'utf8' }, (err, stdout, stderr) => {
      if (err) reject(new Error(`PDF could not be read (${stderr || err.message}).`));
      else resolve(stdout);
    });
    child.stdin?.end(buf);
  });
}
