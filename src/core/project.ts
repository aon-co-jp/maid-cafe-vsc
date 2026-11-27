/** 案件(求人・案件情報)の取り込みと、設計→開発→DEBUG の段階。VS Code に依存しない。 */

/** 個人情報らしい値を伏せる(氏名の項目・メール・電話・住所の郵便番号・単価/金額)。完全ではないので、送る前の確認も併用する。 */
export function redactPersonal(text: string): string {
  return text
    .replace(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g, '[email]')
    .replace(/(?<![\d])(?:\+?\d{1,3}[-\s]?)?\(?0\d{1,4}\)?[-\s]?\d{1,4}[-\s]?\d{3,4}(?![\d])/g, '[phone]')
    .replace(/〒?\s?\d{3}-\d{4}/g, '[postal]')
    .replace(/((?:氏名|お名前|名前|担当者?|担当|連絡先|Name|Contact)\s*[:：]\s*)[^\n]{1,40}/gi, '$1[name]')
    .replace(/((?:単価|報酬|月額|年収|時給|日給|給与|Rate|Salary|Pay)\s*[:：]?\s*)[^\n]{0,40}?(?:\d[\d,.]*\s*(?:万円|万|円|千円|JPY|USD|\$|¥|￥)[^\n]{0,20})/gi, '$1[amount]')
    .replace(/[¥￥]\s?\d[\d,]*/g, '[amount]');
}

/** フォルダ名に使える短い名前にする。 */
export function slugify(name: string): string {
  const s = name
    .normalize('NFKC')
    .trim()
    .replace(/[\/:*?"<>|\u0000-\u001f]/g, '-')
    .replace(/\s+/g, '-')
    .replace(/\.+/g, '.')
    .replace(/^[.-]+|[.-]+$/g, '')
    .slice(0, 60);
  return s || 'project';
}

/** 取得してよい URL か(http/https のみ、ID・パスワード入りは不可)。理由つきで返す。 */
export function checkFetchUrl(raw: string): { ok: true; url: string } | { ok: false; reason: string } {
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    return { ok: false, reason: 'Not a valid URL.' };
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return { ok: false, reason: 'Only http/https URLs are fetched.' };
  if (u.username || u.password) return { ok: false, reason: 'URLs with a user name or password are not fetched.' };
  return { ok: true, url: u.toString() };
}

/** 取得した HTML を読める文字にする(スクリプト・スタイルを除き、タグを落とす)。 */
export function htmlToText(html: string): string {
  const ent: Record<string, string> = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&nbsp;': ' ' };
  return html
    .replace(/<(script|style|noscript|svg)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<\/(p|div|li|h[1-6]|tr|br|section|article)>|<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&(?:amp|lt|gt|quot|#39|nbsp);/g, (m) => ent[m])
    .replace(/[ \t　]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n\n')
    .trim();
}

export type Stage = 'requirements' | 'design' | 'tasks' | 'implement' | 'review' | 'debug';

export const STAGES: Record<Stage, { label: string; file?: string; ask: string; why: string }> = {
  requirements: {
    label: '1. Requirements from the job/project info',
    file: 'requirements.md',
    ask: 'Organize the imported job/project information into requirements in Markdown: goal, users, must-have, nice-to-have, constraints, unknowns/questions to ask the client. Do not invent facts; mark unknowns.',
    why: 'Wrong or missing requirements are the most expensive bugs, so we list unknowns before designing.',
  },
  design: {
    label: '2. Draft the design document',
    file: 'design.md',
    ask: 'Using the requirements, draft a design document in Markdown: architecture, data model, main flows, technology choices with reasons, risks. Keep it small enough to build.',
    why: 'A short design lets us judge trade-offs before writing code, when changes are still cheap.',
  },
  tasks: {
    label: '3. Break the design into implementation tasks',
    file: 'tasks.md',
    ask: 'Break the design into small implementation tasks as a Markdown checklist, in build order, each with a one-line "done when" check.',
    why: 'Small tasks with a clear finish line can be built, tested and reviewed one at a time.',
  },
  implement: {
    label: '4. Generate code for a task (uses your selection)',
    ask: 'Implement the task described by the user, in the marked/selected code context. Reply with a one-sentence summary, then the complete code for the marked lines as ONE fenced code block.',
    why: 'Generating against real surrounding code keeps style and interfaces consistent.',
  },
  review: {
    label: '5. Review code (uses your selection)',
    ask: 'Review the marked code against the requirements and design: correctness, edge cases, security, readability. List issues by severity with file:line and a fix suggestion.',
    why: 'Reviewing against the requirements finds "works but is wrong" problems that tests alone miss.',
  },
  debug: {
    label: '6. Debug from an error or log',
    ask: 'The user pasted an error or log. Find the most likely root cause, explain how you reached it from the evidence, and propose the smallest fix. If code is marked, reply with the corrected code for the marked lines as ONE fenced code block.',
    why: 'Debugging is reading evidence: error text, stack trace, then the code path; we fix the cause, not the symptom.',
  },
};

/** 学習モードの指示(各段階で「なぜそうするか」を短く教える)。 */
export function learningInstruction(stage: Stage, on: boolean): string {
  if (!on) return '';
  return ` LEARNING MODE: the user is learning. After your answer add a short section "Why" (2-4 sentences, plain words) explaining why this step is done this way. Hint: ${STAGES[stage].why}`;
}

export function projectDir(name: string): string {
  return `.maid-cafe/projects/${slugify(name)}`;
}

/** 雇用形態(フリーランス・派遣・社員)。本文の語から推定する。複数当たれば全部返す。 / Engagement types guessed from the text. */
export type Engagement = 'freelance' | 'dispatch' | 'employee';
const ENGAGEMENT_WORDS: Record<Engagement, RegExp> = {
  freelance: /フリーランス|業務委託|準委任|請負|個人事業|freelanc|contractor|contract work|SES/i,
  dispatch: /派遣|紹介予定派遣|temp(?:orary)? staff|staffing agency|dispatch/i,
  employee: /正社員|社員募集|契約社員|中途採用|新卒|full[- ]?time|permanent|employee|正規雇用/i,
};
export function classifyEngagement(text: string): Engagement[] {
  return (Object.keys(ENGAGEMENT_WORDS) as Engagement[]).filter((k) => ENGAGEMENT_WORDS[k].test(text));
}
/** 取り込んだ資料の先頭に付ける見出し(雇用形態と取り込み元)。 */
export function importHeader(text: string, source: string): string {
  const e = classifyEngagement(text);
  return `<!-- maid-cafe import: source=${source}; engagement=${e.length ? e.join(',') : 'unknown'} -->\n`;
}
