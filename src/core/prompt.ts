import { MarkedRange } from './ranges';
import { redact } from './redact';

export interface PromptOptions {
  question: string;
  ranges: MarkedRange[];
  redactSecrets: boolean;
  maxChars: number;
  language?: string; // 回答の言語(例: ja, en)
}

export interface BuiltPrompt {
  system: string;
  user: string;
  truncated: boolean;
  sentChars: number;
}

/** 色つき範囲と質問から、プロバイダー共通のプロンプトを作る。 */
export function buildPrompt(o: PromptOptions): BuiltPrompt {
  let budget = o.maxChars;
  let truncated = false;
  const parts: string[] = [];
  for (const r of o.ranges) {
    let body = o.redactSecrets ? redact(r.text) : r.text;
    if (body.length > budget) {
      body = body.slice(0, Math.max(0, budget)) + '\n…(truncated)';
      truncated = true;
    }
    budget -= body.length;
    parts.push(`### ${r.file}:${r.startLine}-${r.endLine} [${r.color}]\n\`\`\`\n${body}\n\`\`\``);
    if (budget <= 0) {
      truncated = truncated || r !== o.ranges[o.ranges.length - 1];
      break;
    }
  }
  const lang = o.language ? ` Answer in ${o.language}.` : '';
  const system = `You are a friendly, precise programming tutor and code reviewer.${lang} Refer to code by file:line. Be concise; show corrected code when useful.`;
  const user = `${parts.join('\n\n')}\n\nQuestion: ${o.question}`;
  return { system, user, truncated, sentChars: user.length };
}
