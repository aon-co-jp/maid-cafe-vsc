/** 会話の履歴(続きの質問用)。VS Code には依存しない。 / Conversation history for follow-ups. */
export interface Turn {
  role: 'user' | 'assistant';
  content: string;
}

export class Conversation {
  private turns: Turn[] = [];
  constructor(private readonly maxTurns = 12) {}

  add(role: Turn['role'], content: string): void {
    this.turns.push({ role, content });
    // 古いものから捨てる(常に user 始まりにそろえる)。
    while (this.turns.length > this.maxTurns) this.turns.shift();
    while (this.turns.length && this.turns[0].role !== 'user') this.turns.shift();
  }
  all(): Turn[] {
    return [...this.turns];
  }
  get length(): number {
    return this.turns.length;
  }
  clear(): void {
    this.turns = [];
  }
}

/** 履歴を持てない単発の経路(aruaru-llm)向けに、1 つの文字列へ平らにする。 */
export function flattenTurns(system: string, history: Turn[], user: string): string {
  const past = history.map((t) => `${t.role === 'user' ? 'User' : 'Assistant'}: ${t.content}`).join('\n\n');
  return [system, past, `User: ${user}`].filter(Boolean).join('\n\n');
}
