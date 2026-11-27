/** 色つきの範囲指定。色は「グループ名」として使い、同じ色の範囲をまとめてAIに質問できる。 */
export const PALETTE = [
  { id: 'yellow', label: 'Yellow', css: 'rgba(255, 220, 0, 0.30)' },
  { id: 'red', label: 'Red', css: 'rgba(255, 70, 70, 0.28)' },
  { id: 'green', label: 'Green', css: 'rgba(60, 200, 90, 0.28)' },
  { id: 'blue', label: 'Blue', css: 'rgba(70, 130, 255, 0.28)' },
  { id: 'purple', label: 'Purple', css: 'rgba(170, 90, 255, 0.28)' },
  { id: 'orange', label: 'Orange', css: 'rgba(255, 150, 40, 0.30)' },
  { id: 'pink', label: 'Pink', css: 'rgba(255, 110, 190, 0.30)' },
  { id: 'cyan', label: 'Cyan', css: 'rgba(40, 210, 220, 0.28)' },
] as const;

export type ColorId = (typeof PALETTE)[number]['id'];

export interface MarkedRange {
  id: number;
  color: ColorId;
  file: string;
  startLine: number; // 1 始まり
  endLine: number;
  text: string;
}

export class RangeStore {
  private items: MarkedRange[] = [];
  private seq = 1;

  add(color: ColorId, file: string, startLine: number, endLine: number, text: string): MarkedRange {
    const r = { id: this.seq++, color, file, startLine, endLine, text };
    this.items.push(r);
    return r;
  }
  byColor(color: ColorId): MarkedRange[] {
    return this.items.filter((r) => r.color === color);
  }
  colorsInUse(): ColorId[] {
    return PALETTE.map((p) => p.id).filter((c) => this.items.some((r) => r.color === c));
  }
  all(): MarkedRange[] {
    return [...this.items];
  }
  clear(color?: ColorId): void {
    this.items = color ? this.items.filter((r) => r.color !== color) : [];
  }
  /** 編集で行数が変わったときに、後ろの範囲をずらす(file 内で line 以降に delta 行の増減)。 */
  shift(file: string, afterLine: number, delta: number): void {
    for (const r of this.items) {
      if (r.file !== file) continue;
      if (r.startLine > afterLine) r.startLine += delta;
      if (r.endLine > afterLine) r.endLine += delta;
    }
  }
}
