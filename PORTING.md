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

## 2026-11-27(2) arurau紹介・案件取り込み・学習モード / arurau link, job import, learning mode
### 日本語
- `https://audiocafe.tokyo/aruaru` は curl で 200(案件・求人マッチング)。依頼の `/arurau` も 200 だが全ページ共通の言語選択ページだったので `/aruaru` を採用(綴りの確認をお願いします)。コマンドと設定 `maidCafe.arurauPageUrl` を追加。
- 追加: `core/project.ts`(個人情報の伏せ字・URL検査・HTML→テキスト・段階と学習モード)、コマンド `project.import` / `project.step`、設定 `redactPersonal` / `learningMode`。保存先 `.maid-cafe/projects/<名前>/`。URLは貼られたものを確認後1回だけ。pdf/docx・ドラッグ&ドロップは未対応。
- 試験: 単体9件、実VS Code4件が成功(疑似サーバー、音なし)。各社の実APIは未確認のまま。
### English
- `https://audiocafe.tokyo/aruaru` returns 200 by curl (job/project matching). The requested `/arurau` also returns 200 but is the site-wide language-selection page, so `/aruaru` is used (please confirm the spelling). Added the command and setting `maidCafe.arurauPageUrl`.
- Added: `core/project.ts` (personal-data masking, URL checks, HTML→text, stages and learning mode), commands `project.import` / `project.step`, settings `redactPersonal` / `learningMode`. Saved in `.maid-cafe/projects/<name>/`. A URL is fetched once after confirmation. pdf/docx and drag-and-drop are not supported yet.
- Tests: 9 unit + 4 real-VS-Code tests pass (mock server, no sound). Real provider APIs remain unverified.

## 2026-11-27(3) メイドカフェ英会話・第3言語の翻訳 / Maid-cafe English and third-language translation
### 日本語
- 追加: `core/translate.ts`(約40言語、コードを訳さない翻訳、翻訳要求の形、出来の悪さ判定、メイド英会話の指示と返答の分解)、コマンド `selectThirdLanguage` / `translateSelection` / `englishCafe` / `englishCafe.reset`、設定 `thirdLanguage` / `translateFallbackProvider` / `englishLevel`。
- 既存資産: aruaru-llm の `Translate`(`{text,target_lang(ISO),source_lang,tenant}` → `{translation,engine,disclosure}`)と `tools/translate-worker`(M2M100 418M + CTranslate2)を再利用(自作せず)。M2M100 は HuggingFace のモデルカードで license=mit を確認。**NLLB(CC-BY-NC)は使わない**。
- 試験: 単体10件、実VS Code5件(3回連続成功)。試験が前回の残りで狂う不具合(作業フォルダ・設定の持ち越し)を、毎回一時フォルダにして直した。未確認: 公開された aruaru-llm / 各社の実APIでの翻訳(疑似サーバーのみ)。
### English
- Added: `core/translate.ts` (about 40 languages, code-preserving translation, request shapes, poor-output check, maid English prompt and reply parsing), commands `selectThirdLanguage` / `translateSelection` / `englishCafe` / `englishCafe.reset`, settings `thirdLanguage` / `translateFallbackProvider` / `englishLevel`.
- Reused assets: aruaru-llm's `Translate` (`{text,target_lang(ISO),source_lang,tenant}` → `{translation,engine,disclosure}`) and `tools/translate-worker` (M2M100 418M + CTranslate2), nothing rebuilt. M2M100 license=mit confirmed on the HuggingFace model card. **NLLB (CC-BY-NC) is not used.**
- Tests: 10 unit + 5 real-VS-Code (3 passes in a row). Fixed a test flake caused by leftover workspace/settings by using a fresh temp dir per run. Unverified: translation through a public aruaru-llm or the real provider APIs (mock server only).
