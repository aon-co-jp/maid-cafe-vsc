# maid-cafe-vsc(CLAUDE.md)
- 目的: 色つき範囲指定 + 複数AI + maid-cafe.tokyo の質問・教室を持つ VS Code 拡張。`open-vsc-claude`(スタック選択+Claude生成)の機能は今後ここへ統合する。
- 純粋な部品は `src/core/`(VS Code に依存しない)。`npm test` で `tsc` と `node --test` が走る。
- 守ること: 新しい REST を作らない(aruaru-llm は版なしの Connect `/aruaru_llm.Llm/Generate`)。秘密は書かない(各社の鍵は SecretStorage)。有料AIは利用者が自分で契約し、運営は課金を扱わない。実測してから「完了」と書く。
- 未確認: 実 VS Code での起動、各社の実 API、aruaru-llm の応答形式。
- 再開: README の「足りない機能の候補」を上から。Node.js は VS Code 拡張に必要なため例外として使う。
# maid-cafe-vsc (CLAUDE.md, English)
Purpose, rules and open items as above: pure logic lives in `src/core/`; no new REST (versionless Connect only); no secrets in files (provider keys in SecretStorage); paid AI is the user's own contract; verify before saying done. Unverified: real VS Code run, real provider APIs, the aruaru-llm response shape.

## 2026-11-27 実VS Code試験・aruaru応答形式・会話/修正機能 / Real VS Code test, aruaru response shape, chat and fix
### 日本語
- 実VS Code(`@vscode/test-electron`)で拡張を読み込み、色つけ→保存→質問→続き→修正適用の2件が成功(`npm run test:vscode`、疑似aruaruサーバー使用、音なし)。単体8件成功。
- aruaru-llm はソースで `{prompt,max_new_tokens<=128,tenant}` → `{completion,engine,disclosure}` を確認し `parseResponse` を修正。公開URLへの実呼び出しは maid-cafe.tokyo が両経路404、aruaru.tokyoは405で**未確認**(本番ホスト確定待ち。版なし移行は別作業)。
- 追加: 会話履歴(`core/chat.ts`)、説明/修正/テスト作成と古い提案を拒む差分適用(`core/actions.ts`)。open-vsc-claude 統合は README に計画を記載(コード移植は未)。
### English
- Real VS Code (`@vscode/test-electron`) loads the extension; colour → save → ask → follow-up → fix-apply (2 tests) pass (`npm run test:vscode`, mock aruaru server, no sound). 8 unit tests pass.
- From the aruaru-llm source: `{prompt,max_new_tokens<=128,tenant}` → `{completion,engine,disclosure}`; `parseResponse` fixed. A live call to a public URL is **unverified**: maid-cafe.tokyo returns 404 on both paths, aruaru.tokyo 405 (waiting for the production host; the versionless migration is separate work).
- Added: conversation history (`core/chat.ts`), explain/fix/test and diff-apply that refuses stale proposals (`core/actions.ts`). The open-vsc-claude integration plan is in the README (no code moved yet).
