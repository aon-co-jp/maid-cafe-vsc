/** 各AIへの要求の組み立てと、応答の取り出し。通信そのものはしない(試験しやすいように純粋関数にしてある)。 */
export type ProviderId = 'aruaru' | 'openai' | 'gemini' | 'deepseek' | 'grok' | 'claude';

export const PROVIDERS: { id: ProviderId; label: string; free: boolean; needsKey: boolean; model: string }[] = [
  { id: 'aruaru', label: 'aruaru-search + aruaru-llm (free)', free: true, needsKey: false, model: 'aruaru' },
  { id: 'openai', label: 'ChatGPT (OpenAI)', free: false, needsKey: true, model: 'gpt-5' },
  { id: 'gemini', label: 'Gemini (Google)', free: false, needsKey: true, model: 'gemini-2.5-pro' },
  { id: 'deepseek', label: 'DeepSeek', free: false, needsKey: true, model: 'deepseek-chat' },
  { id: 'grok', label: 'Grok (xAI)', free: false, needsKey: true, model: 'grok-4' },
  { id: 'claude', label: 'Claude (Anthropic)', free: false, needsKey: true, model: 'claude-sonnet-5-5' },
];

export interface Req {
  url: string;
  headers: Record<string, string>;
  body: string;
}

export interface BuildArgs {
  provider: ProviderId;
  key?: string;
  model?: string;
  system: string;
  user: string;
  aruaruUrl?: string;
  maxTokens?: number;
}

const OPENAI_LIKE: Partial<Record<ProviderId, string>> = {
  openai: 'https://api.openai.com/v1/chat/completions',
  deepseek: 'https://api.deepseek.com/chat/completions',
  grok: 'https://api.x.ai/v1/chat/completions',
};

export function defaultModel(p: ProviderId): string {
  return PROVIDERS.find((x) => x.id === p)!.model;
}

export function buildRequest(a: BuildArgs): Req {
  const model = a.model || defaultModel(a.provider);
  const max = a.maxTokens ?? 2048;
  const json = { 'content-type': 'application/json' };
  if (a.provider === 'aruaru') {
    // 版なしの Connect 呼び出し(REST は使わない)。1 つの文字列にまとめて送る。
    const base = (a.aruaruUrl ?? 'https://maid-cafe.tokyo').replace(/\/+$/, '');
    return {
      url: `${base}/aruaru_llm.Llm/Generate`,
      headers: { ...json, 'x-tenant': 'maid-cafe-vsc' },
      body: JSON.stringify({ prompt: `${a.system}\n\n${a.user}`, max_new_tokens: Math.min(max, 512) }),
    };
  }
  if (a.provider === 'claude') {
    return {
      url: 'https://api.anthropic.com/v1/messages',
      headers: { ...json, 'x-api-key': a.key ?? '', 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model, max_tokens: max, system: a.system, messages: [{ role: 'user', content: a.user }] }),
    };
  }
  if (a.provider === 'gemini') {
    return {
      url: `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
      headers: { ...json, 'x-goog-api-key': a.key ?? '' }, // 鍵は URL に載せずヘッダーで送る
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: a.system }] },
        contents: [{ role: 'user', parts: [{ text: a.user }] }],
        generationConfig: { maxOutputTokens: max },
      }),
    };
  }
  const url = OPENAI_LIKE[a.provider]!;
  return {
    url,
    headers: { ...json, authorization: `Bearer ${a.key ?? ''}` },
    body: JSON.stringify({ model, max_tokens: max, messages: [{ role: 'system', content: a.system }, { role: 'user', content: a.user }] }),
  };
}

/** 応答 JSON から本文を取り出す。取り出せなければ null。 */
export function parseResponse(provider: ProviderId, j: any): string | null {
  try {
    if (provider === 'aruaru') return j.text ?? j.output ?? j.generated_text ?? null;
    if (provider === 'claude') return (j.content as any[]).filter((c) => c.type === 'text').map((c) => c.text).join('') || null;
    if (provider === 'gemini') return j.candidates[0].content.parts.map((p: any) => p.text ?? '').join('') || null;
    return j.choices[0].message.content ?? null;
  } catch {
    return null;
  }
}

/** エラー応答から、利用者向けの短い説明を作る(鍵は含めない)。 */
export function explainError(status: number, body: string): string {
  const head = body.replace(/\s+/g, ' ').slice(0, 200);
  if (status === 401 || status === 403) return `Authentication failed (${status}). Check the API key.`;
  if (status === 429) return 'Rate limit or quota reached (429). Wait, or switch provider.';
  if (status >= 500) return `The provider had a problem (${status}). Try again later.`;
  return `Request failed (${status}): ${head}`;
}
