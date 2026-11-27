/**
 * プログラマー向けアンケート: 案件で使う言語・フレームワークの判定と、本人のレベル。
 * 資料(仕様書・設計書・URL・本文)から自動判定し、無ければ選択か類似語の入力で指定する。
 * 結果は案件フォルダーの survey.json に保存し、要件→設計→実装→DEBUG の指示に反映する。
 */
import type { Stage } from './project';

export interface Tech {
  id: string;
  label: string;
  kind: 'language' | 'framework';
  /** 類似語(小文字・空白/記号を除いた形で比べる)。カタカナ表記も含む。 */
  aliases: string[];
}

export const TECHS: Tech[] = [
  { id: 'javascript', label: 'JavaScript', kind: 'language', aliases: ['javascript', 'js', 'ecmascript', 'ジャバスクリプト'] },
  { id: 'typescript', label: 'TypeScript', kind: 'language', aliases: ['typescript', 'ts', 'タイプスクリプト'] },
  { id: 'python', label: 'Python', kind: 'language', aliases: ['python', 'python3', 'py', 'パイソン'] },
  { id: 'java', label: 'Java', kind: 'language', aliases: ['java', 'ジャバ'] },
  { id: 'kotlin', label: 'Kotlin', kind: 'language', aliases: ['kotlin', 'コトリン'] },
  { id: 'csharp', label: 'C#', kind: 'language', aliases: ['c#', 'csharp', 'シーシャープ'] },
  { id: 'cpp', label: 'C++', kind: 'language', aliases: ['c++', 'cpp', 'シープラスプラス'] },
  { id: 'go', label: 'Go', kind: 'language', aliases: ['go', 'golang', 'ゴー', 'ゴーラング'] },
  { id: 'rust', label: 'Rust', kind: 'language', aliases: ['rust', 'ラスト'] },
  { id: 'php', label: 'PHP', kind: 'language', aliases: ['php'] },
  { id: 'ruby', label: 'Ruby', kind: 'language', aliases: ['ruby', 'ルビー'] },
  { id: 'swift', label: 'Swift', kind: 'language', aliases: ['swift', 'スウィフト', 'スイフト'] },
  { id: 'cobol', label: 'COBOL', kind: 'language', aliases: ['cobol', 'コボル'] },
  { id: 'sql', label: 'SQL', kind: 'language', aliases: ['sql', 'mysql', 'postgresql', 'postgres', 'sqlserver', 'oracle'] },
  { id: 'react', label: 'React', kind: 'framework', aliases: ['react', 'reactjs', 'react.js', 'リアクト'] },
  { id: 'nextjs', label: 'Next.js', kind: 'framework', aliases: ['nextjs', 'next.js', 'ネクスト', 'ネクストjs'] },
  { id: 'vue', label: 'Vue.js', kind: 'framework', aliases: ['vue', 'vuejs', 'vue.js', 'ビュー', 'ヴュー'] },
  { id: 'nuxt', label: 'Nuxt', kind: 'framework', aliases: ['nuxt', 'nuxtjs', 'nuxt.js', 'ナクスト'] },
  { id: 'angular', label: 'Angular', kind: 'framework', aliases: ['angular', 'angularjs', 'アンギュラー'] },
  { id: 'nodejs', label: 'Node.js', kind: 'framework', aliases: ['node', 'nodejs', 'node.js', 'ノード'] },
  { id: 'nestjs', label: 'NestJS', kind: 'framework', aliases: ['nest', 'nestjs', 'nest.js', 'ネスト'] },
  { id: 'express', label: 'Express', kind: 'framework', aliases: ['express', 'expressjs', 'エクスプレス'] },
  { id: 'django', label: 'Django', kind: 'framework', aliases: ['django', 'ジャンゴ'] },
  { id: 'fastapi', label: 'FastAPI', kind: 'framework', aliases: ['fastapi', 'ファストapi'] },
  { id: 'flask', label: 'Flask', kind: 'framework', aliases: ['flask', 'フラスク'] },
  { id: 'spring', label: 'Spring Boot', kind: 'framework', aliases: ['spring', 'springboot', 'spring boot', 'スプリング', 'スプリングブート'] },
  { id: 'rails', label: 'Ruby on Rails', kind: 'framework', aliases: ['rails', 'rubyonrails', 'ruby on rails', 'レイルズ', 'レール'] },
  { id: 'laravel', label: 'Laravel', kind: 'framework', aliases: ['laravel', 'ララベル'] },
  { id: 'dotnet', label: '.NET / ASP.NET', kind: 'framework', aliases: ['.net', 'dotnet', 'asp.net', 'aspnet', 'ドットネット'] },
  { id: 'flutter', label: 'Flutter', kind: 'framework', aliases: ['flutter', 'フラッター'] },
  { id: 'axum', label: 'Axum', kind: 'framework', aliases: ['axum'] },
];

export const LEVELS = [
  { id: 'novice', ja: '超初心者', en: 'Absolute beginner' },
  { id: 'beginner', ja: '初心者', en: 'Beginner' },
  { id: 'intermediate', ja: '中級者', en: 'Intermediate' },
  { id: 'advanced', ja: '上級者', en: 'Advanced' },
  { id: 'veteran', ja: 'ベテラン', en: 'Veteran' },
] as const;
export type LevelId = (typeof LEVELS)[number]['id'];

export interface Survey {
  techs: string[];
  levels: Record<string, LevelId>;
  source: 'detected' | 'manual' | 'mixed';
  updatedAt: string;
}

/** 比べやすい形にする(全角→半角、小文字、空白・中黒・ハイフンを除く)。 */
export function normalize(s: string): string {
  return s
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\s・･\-_]/g, '');
}

/** 1語の入力(「リアクト」「React.js」など)を技術に解決する。合わなければ undefined。 */
export function resolveTech(input: string): Tech | undefined {
  const n = normalize(input);
  if (!n) return undefined;
  for (const t of TECHS) if (normalize(t.label) === n || t.id === n || t.aliases.some((a) => normalize(a) === n)) return t;
  // ".js" を外した形でもう一度(例: "Express.js")
  const m = n.replace(/\.?js$/, '');
  if (m !== n && m) return resolveTech(m);
  return undefined;
}

/** カンマ・読点・空白で区切った複数の入力を解決する。解決できなかった語も返す。 */
export function resolveTechList(input: string): { techs: Tech[]; unknown: string[] } {
  const techs: Tech[] = [];
  const unknown: string[] = [];
  for (const w of input.split(/[,、，/／;；\n]+/).map((x) => x.trim()).filter(Boolean)) {
    const t = resolveTech(w);
    if (t) {
      if (!techs.includes(t)) techs.push(t);
    } else unknown.push(w);
  }
  return { techs, unknown };
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** 一般の英単語と紛らわしい語(大文字始まり・全大文字のときだけ技術名とみなす)。 */
const AMBIGUOUS = new Set(['go', 'rust', 'ruby', 'swift', 'spring', 'express', 'node', 'nest', 'flask', 'vue', 'react', 'rails', 'oracle', 'java', 'ts', 'js', 'py', 'angular']);

/** 資料の文章から、使う言語・フレームワークを判定する。 */
export function detectTechs(text: string): string[] {
  const t = text.normalize('NFKC');
  const found: string[] = [];
  for (const tech of TECHS) {
    const hit = [tech.label, ...tech.aliases].some((raw) => {
      const a = raw.normalize('NFKC');
      if (/^[゠-ヿ]/.test(a)) return t.includes(a);
      const re = (w: string, flags: string) => new RegExp(`(^|[^A-Za-z0-9])${escapeRe(w)}(?![A-Za-z0-9#+])`, flags);
      if (AMBIGUOUS.has(a.toLowerCase())) return re(a[0].toUpperCase() + a.slice(1), '').test(t) || re(a.toUpperCase(), '').test(t);
      return re(a, 'i').test(t);
    });
    if (hit) found.push(tech.id);
  }
  return found;
}

export function techLabel(id: string): string {
  return TECHS.find((t) => t.id === id)?.label ?? id;
}

const STYLE: Record<LevelId, string> = {
  novice: 'explain every term in plain words, give very small numbered steps (one action each), show complete code with comments on each line, and end with one tiny practice task',
  beginner: 'explain key terms briefly, give numbered steps, show complete code with comments on the important lines, and end with one small practice task',
  intermediate: 'skip basic terms, give the main steps, explain design choices and trade-offs, and end with one practice task that extends the code',
  advanced: 'be concise, focus on architecture, edge cases, performance and testing, and end with one challenging task',
  veteran: 'be terse like a senior reviewer, only point out non-obvious risks and alternatives, and suggest one stretch task (optional)',
};

/** アンケート結果に合わせた指示(学習モードに追加する)。 */
export function surveyInstruction(s: Survey | undefined, stage: Stage, learning: boolean): string {
  if (!s || !s.techs.length) return '';
  const parts = s.techs.map((id) => {
    const lv = s.levels[id];
    const L = LEVELS.find((x) => x.id === lv);
    return `${techLabel(id)}: ${L ? L.en : 'level unknown'}`;
  });
  const lvls = s.techs.map((id) => s.levels[id]).filter(Boolean) as LevelId[];
  const order = LEVELS.map((l) => l.id);
  const lowest = lvls.sort((a, b) => order.indexOf(a) - order.indexOf(b))[0];
  let out = ` PROJECT STACK AND USER LEVEL: ${parts.join('; ')}. Use these languages/frameworks.`;
  if (learning && lowest) out += ` We build this project together so the user learns while developing (${stage} step): ${STYLE[lowest]}. Adjust per technology to the level listed above.`;
  return out;
}

export function newSurvey(techs: string[], levels: Record<string, LevelId>, source: Survey['source']): Survey {
  return { techs, levels, source, updatedAt: new Date().toISOString() };
}

/** 保存された JSON を安全に読む(壊れていれば undefined)。 */
export function parseSurvey(json: string): Survey | undefined {
  try {
    const j = JSON.parse(json) as Survey;
    if (!Array.isArray(j.techs) || typeof j.levels !== 'object' || !j.levels) return undefined;
    const ids = new Set(LEVELS.map((l) => l.id as string));
    const levels: Record<string, LevelId> = {};
    for (const [k, v] of Object.entries(j.levels)) if (ids.has(v)) levels[k] = v as LevelId;
    return { techs: j.techs.filter((x) => typeof x === 'string'), levels, source: j.source ?? 'manual', updatedAt: j.updatedAt ?? '' };
  } catch {
    return undefined;
  }
}
