/** コードを外部へ送る前に、鍵・トークン・パスワードらしい値を伏せる。 */
const RULES: [RegExp, string][] = [
  [/\bsk-[A-Za-z0-9_-]{16,}\b/g, 'sk-***'],
  [/\bAKIA[0-9A-Z]{16}\b/g, 'AKIA***'],
  [/\bgh[pousr]_[A-Za-z0-9]{20,}\b/g, 'gh*_***'],
  [/\bAIza[0-9A-Za-z_-]{30,}\b/g, 'AIza***'],
  [/\bxai-[A-Za-z0-9]{20,}\b/g, 'xai-***'],
  [/(Bearer\s+)[A-Za-z0-9._~+\/=-]{16,}/gi, '$1***'],
  [/((?:password|passwd|secret|token|api[_-]?key)\s*[:=]\s*)(["']?)[^\s"',;]{4,}\2/gi, '$1$2***$2'],
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g, '-----PRIVATE KEY REMOVED-----'],
];

export function redact(text: string): string {
  let out = text;
  for (const [re, rep] of RULES) out = out.replace(re, rep);
  return out;
}
