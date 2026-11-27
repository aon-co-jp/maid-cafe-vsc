/** 第3言語の翻訳と、メイドカフェ英会話。VS Code に依存しない。 / Third-language translation and the maid-cafe English chat. */
import { BuildArgs, Req, ProviderId, buildRequest, parseResponse } from './providers';

export interface Language {
  code: string; // ISO 639-1/-3(M2M100 が受け付ける)
  name: string; // English name
  native: string;
}

/** 世界の主な言語。日本語・英語が基本で、第3言語はここから選ぶ。 */
export const LANGUAGES: Language[] = [
  { code: 'ja', name: 'Japanese', native: '日本語' },
  { code: 'en', name: 'English', native: 'English' },
  { code: 'zh', name: 'Chinese', native: '中文' },
  { code: 'ko', name: 'Korean', native: '한국어' },
  { code: 'es', name: 'Spanish', native: 'Español' },
  { code: 'fr', name: 'French', native: 'Français' },
  { code: 'de', name: 'German', native: 'Deutsch' },
  { code: 'it', name: 'Italian', native: 'Italiano' },
  { code: 'pt', name: 'Portuguese', native: 'Português' },
  { code: 'ru', name: 'Russian', native: 'Русский' },
  { code: 'uk', name: 'Ukrainian', native: 'Українська' },
  { code: 'pl', name: 'Polish', native: 'Polski' },
  { code: 'nl', name: 'Dutch', native: 'Nederlands' },
  { code: 'sv', name: 'Swedish', native: 'Svenska' },
  { code: 'da', name: 'Danish', native: 'Dansk' },
  { code: 'fi', name: 'Finnish', native: 'Suomi' },
  { code: 'cs', name: 'Czech', native: 'Čeština' },
  { code: 'el', name: 'Greek', native: 'Ελληνικά' },
  { code: 'hu', name: 'Hungarian', native: 'Magyar' },
  { code: 'ro', name: 'Romanian', native: 'Română' },
  { code: 'tr', name: 'Turkish', native: 'Türkçe' },
  { code: 'ar', name: 'Arabic', native: 'العربية' },
  { code: 'fa', name: 'Persian', native: 'فارسی' },
  { code: 'he', name: 'Hebrew', native: 'עברית' },
  { code: 'hi', name: 'Hindi', native: 'हिन्दी' },
  { code: 'bn', name: 'Bengali', native: 'বাংলা' },
  { code: 'ta', name: 'Tamil', native: 'தமிழ்' },
  { code: 'ur', name: 'Urdu', native: 'اردو' },
  { code: 'th', name: 'Thai', native: 'ไทย' },
  { code: 'vi', name: 'Vietnamese', native: 'Tiếng Việt' },
  { code: 'id', name: 'Indonesian', native: 'Bahasa Indonesia' },
  { code: 'ms', name: 'Malay', native: 'Bahasa Melayu' },
  { code: 'tl', name: 'Filipino', native: 'Filipino' },
  { code: 'sw', name: 'Swahili', native: 'Kiswahili' },
  { code: 'af', name: 'Afrikaans', native: 'Afrikaans' },
  { code: 'my', name: 'Burmese', native: 'မြန်မာ' },
  { code: 'km', name: 'Khmer', native: 'ខ្មែរ' },
  { code: 'ne', name: 'Nepali', native: 'नेपाली' },
  { code: 'mn', name: 'Mongolian', native: 'Монгол' },
];

export function findLanguage(codeOrName: string): Language | undefined {
  const k = codeOrName.trim().toLowerCase();
  return LANGUAGES.find((l) => l.code === k || l.name.toLowerCase() === k || l.native.toLowerCase() === k);
}

/** 本文をコードブロックとそれ以外に分ける。コードは翻訳しない。 */
export function splitCodeBlocks(text: string): { code: boolean; text: string }[] {
  const out: { code: boolean; text: string }[] = [];
  const re = /```[\s\S]*?```/g;
  let last = 0;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    if (m.index > last) out.push({ code: false, text: text.slice(last, m.index) });
    out.push({ code: true, text: m[0] });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ code: false, text: text.slice(last) });
  return out;
}

/** コードブロックはそのまま、文章だけを fn で翻訳する。fn が undefined を返したら全体を諦める。 */
export async function translateKeepingCode(text: string, fn: (prose: string) => Promise<string | undefined>): Promise<string | undefined> {
  const parts: string[] = [];
  for (const p of splitCodeBlocks(text)) {
    if (p.code || !p.text.trim()) {
      parts.push(p.text);
      continue;
    }
    const lead = /^\s*/.exec(p.text)![0];
    const trail = /\s*$/.exec(p.text)![0];
    const t = await fn(p.text.trim());
    if (t === undefined) return undefined;
    parts.push(lead + t.trim() + trail);
  }
  return parts.join('');
}

export interface TranslateArgs {
  provider: ProviderId;
  key?: string;
  model?: string;
  aruaruUrl?: string;
  text: string;
  target: Language;
  source?: Language;
}

/** 翻訳の要求。無料(aruaru)は翻訳専用の Connect 呼び出し(M2M100、MIT)、有料は利用者の鍵で「ネイティブ並みに訳して」と頼む。 */
export function buildTranslateRequest(a: TranslateArgs): Req {
  if (a.provider === 'aruaru') {
    const base = (a.aruaruUrl ?? 'https://maid-cafe.tokyo').replace(/\/+$/, '');
    return {
      url: `${base}/aruaru_llm.Llm/Translate`,
      headers: { 'content-type': 'application/json', 'x-tenant': 'maid-cafe-vsc' },
      body: JSON.stringify({ text: a.text, target_lang: a.target.code, source_lang: a.source?.code ?? null, tenant: 'maid-cafe-vsc' }),
    };
  }
  const system =
    `You are a professional translator. Translate the user's text into natural, idiomatic ${a.target.name} (${a.target.native}) exactly as an educated native speaker would write it: ` +
    'no literal word-by-word phrasing, keep the tone and register. Keep code, identifiers, URLs, numbers and Markdown unchanged. Output ONLY the translation.';
  const b: BuildArgs = { provider: a.provider, key: a.key, model: a.model, system, user: a.text, maxTokens: 2048 };
  return buildRequest(b);
}

export function parseTranslateResponse(provider: ProviderId, j: any): string | null {
  if (provider === 'aruaru') return typeof j?.translation === 'string' ? j.translation : null;
  return parseResponse(provider, j);
}

/** 文字体系が決まっている言語の、期待する文字(出力にこれが 1 字も無ければ別の言語になっている)。 */
const SCRIPT: Record<string, RegExp> = {
  ja: /[぀-ヿ一-鿿]/, zh: /[一-鿿]/, ko: /[가-힯]/,
  ru: /[Ѐ-ӿ]/, uk: /[Ѐ-ӿ]/, mn: /[Ѐ-ӿ]/,
  ar: /[؀-ۿ]/, fa: /[؀-ۿ]/, ur: /[؀-ۿ]/, he: /[֐-׿]/,
  hi: /[ऀ-ॿ]/, ne: /[ऀ-ॿ]/, bn: /[ঀ-৿]/, ta: /[஀-௿]/,
  th: /[฀-๿]/, el: /[Ͱ-Ͽ]/, my: /[က-႟]/, km: /[ក-៿]/,
};

/** 無料の翻訳の出来が悪そうか(空・原文のまま・長さが極端・同じ語の繰り返し)。悪ければ利用者の鍵の AI に切り替える材料にする。 */
export function looksPoor(source: string, output: string | null | undefined, target: Language): boolean {
  if (!output || !output.trim()) return true;
  const o = output.trim();
  const s = source.trim();
  const sc = SCRIPT[target.code];
  if (sc && /[A-Za-z]{4,}/.test(s) && !sc.test(o)) return true; // 別の文字体系のまま
  if (target.code !== 'en' && o === s && /[A-Za-z]{4,}/.test(s)) return true;
  const ratio = o.length / Math.max(1, s.length);
  if (s.length > 20 && (ratio < 0.2 || ratio > 6)) return true;
  const words = o.split(/\s+/);
  if (words.length >= 8 && new Set(words).size / words.length < 0.3) return true;
  return false;
}

export type EnglishLevel = 'beginner' | 'intermediate' | 'advanced';

/** メイドカフェ英会話の指示。メイドの口調で英語の練習相手になり、間違いは優しく直す。 */
export function englishCafeSystem(level: EnglishLevel, ja = true): string {
  const lv = { beginner: 'very simple words and short sentences (CEFR A1-A2)', intermediate: 'everyday English (CEFR B1-B2)', advanced: 'natural, rich English (CEFR C1)' }[level];
  return (
    'You are a cheerful maid at a cozy maid cafe in Tokyo, and you are the customer\'s English conversation partner. ' +
    'Stay in character: warm, polite and playful ("Welcome back, Master/Mistress!"), never rude, never romantic or sexual; keep it wholesome. ' +
    `Speak ${lv}. Reply in this exact format:\n` +
    'Maid: <your short reply in English, ending with one easy question to keep the talk going>\n' +
    'Correction: <if the customer\'s English had mistakes, kindly show the corrected sentence and a one-line reason; if there were none, write "Perfect!">\n' +
    (ja ? '日本語: <the Maid line translated into natural Japanese>\n' : '') +
    'If the customer writes in Japanese, answer in English anyway and help them say it in English under "Correction".'
  );
}

/** Split the maid's reply into Maid / Correction / 日本語 (anything else is all Maid). */
export function parseCafeReply(reply: string): { maid: string; correction?: string; ja?: string } {
  const out: Record<string, string[]> = {};
  let cur: string | undefined;
  for (const line of reply.split(String.fromCharCode(10))) {
    const m = /^(Maid|Correction|日本語)\s*[:：]\s*(.*)$/.exec(line.trim());
    if (m) {
      cur = m[1];
      out[cur] = [m[2]];
    } else if (cur) out[cur].push(line);
  }
  const g = (k: string) => out[k]?.join(String.fromCharCode(10)).trim() || undefined;
  const maid = g('Maid');
  if (!maid) return { maid: reply.trim() };
  return { maid, correction: g('Correction'), ja: g('日本語') };
}
