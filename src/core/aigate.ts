/**
 * 無料AI(aruaru-llm)への入口の選び方(2026-11-27)。
 * - 手元(localhost / 127.0.0.1 / [::1])の aruaru-llm は、そのまま `/aruaru_llm.Llm/<Method>` を呼ぶ。
 * - それ以外(既定の https://maid-cafe.tokyo など)は、ログイン必須の門 `/openenglish.AiGate/<Method>` を通す。
 *   門はメールのワンタイムパスワードでログインし、`Authorization: Bearer <token>` を付けて呼ぶ。
 *   未ログインは 401、混雑(サーバーの空きメモリ不足・待ち行列あふれ)は 503 + Retry-After。
 * 通信そのものはしない純粋関数(試験しやすいように)。
 */
export type AiMethod = 'Translate' | 'Generate' | 'Ocr';

export const DEFAULT_BASE = 'https://maid-cafe.tokyo';

export function normalizeBase(base: string | undefined): string {
  return (base ?? DEFAULT_BASE).replace(/\/+$/, '');
}

export function isLocalBase(base: string | undefined): boolean {
  try {
    const h = new URL(normalizeBase(base)).hostname;
    return h === 'localhost' || h === '127.0.0.1' || h === '[::1]' || h === '::1';
  } catch {
    return false;
  }
}

/** AI メソッドの URL。手元は aruaru-llm 直接、それ以外は門を通す。 */
export function aiMethodUrl(base: string | undefined, method: AiMethod): string {
  const b = normalizeBase(base);
  return isLocalBase(b) ? `${b}/aruaru_llm.Llm/${method}` : `${b}/openenglish.AiGate/${method}`;
}

/** 門の URL か(Bearer を付けて、401 ならログインする対象か)。 */
export function isGateUrl(url: string): boolean {
  return /\/openenglish\.AiGate\/(Translate|Generate|Ocr|Status)$/.test(url);
}

export function gateLoginUrls(url: string): { requestOtp: string; verifyOtp: string } {
  const b = url.replace(/\/openenglish\.AiGate\/[A-Za-z]+$/, '');
  return { requestOtp: `${b}/openenglish.AiGate/RequestOtp`, verifyOtp: `${b}/openenglish.AiGate/VerifyOtp` };
}

/** 503 のときの案内(Retry-After 秒)。 */
export function busyMessage(retryAfter: string | null): string {
  const s = Number(retryAfter);
  const wait = Number.isFinite(s) && s > 0 ? `${s} seconds` : 'a little while';
  return `The free AI server is busy right now (many users or low server memory). Please try again in ${wait}. / 無料AIサーバーが混み合っています。しばらく待ってから再試行してください。`;
}

export function looksLikeEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());
}
