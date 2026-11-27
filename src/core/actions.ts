/** ワンクリック操作(説明・修正・テスト作成)と、AI 応答からのコード取り出し。 / One-click actions and code extraction. */
export type ActionId = 'explain' | 'fix' | 'test';

export const ACTIONS: Record<ActionId, { label: string; question: string }> = {
  explain: { label: 'Explain', question: 'Explain what this code does, step by step, and point out anything surprising.' },
  fix: {
    label: 'Fix',
    question:
      'Find bugs or problems in this code and fix them. Reply with a one-sentence summary, then the complete corrected code for the marked lines as ONE fenced code block. Do not change anything unrelated.',
  },
  test: { label: 'Write tests', question: 'Write unit tests for this code using the usual test framework for its language. Reply with one fenced code block.' },
};

/** 最初のコードブロックの中身。無ければ null。 */
export function extractCodeBlock(answer: string): string | null {
  const m = /```[^\n`]*\r?\n([\s\S]*?)\r?\n?```/.exec(answer);
  return m ? m[1] : null;
}

/** 行番号(1 始まり、両端含む)の範囲を置き換える。範囲の今の中身が expectedOld と違えば null(古い提案を適用しない)。 */
export function replaceLines(text: string, startLine: number, endLine: number, replacement: string, expectedOld: string): string | null {
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  const lines = text.split(/\r?\n/);
  if (startLine < 1 || endLine < startLine || endLine > lines.length) return null;
  const current = lines.slice(startLine - 1, endLine).join('\n');
  if (current !== expectedOld.replace(/\r\n/g, '\n')) return null;
  const repl = replacement.replace(/\r?\n$/, '').split(/\r?\n/);
  lines.splice(startLine - 1, endLine - startLine + 1, ...repl);
  return lines.join(eol);
}
