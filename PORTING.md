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

## 2026-11-27(4) pdf/docx・設計の連鎖試験・ガイド・日本語画面 / pdf/docx, chain test, walkthrough, nls
### 日本語
- 追加: `core/extract.ts`(md/txt/docx=mammoth/pdf=pdf-parse)。**実VS Codeで pdf.js が拡張ホスト内で失敗**したため、PDF は別の Node プロセス(`core/pdfChild.ts`、`ELECTRON_RUN_AS_NODE`)で読む方式に変更して直した。取り込み後の 要件→設計→タスク の連鎖(各段階が前の成果物と全資料を見る)を実試験。
- 修正: 回答パネルが操作中のエディターのフォーカスを奪い、直後の Fix が空振りする不具合(実VS Code試験のちらつきで発見)→ `preserveFocus`。
- 追加: 初回ガイド(walkthrough)、`package.nls.json` / `package.nls.ja.json`、翻訳の「文字体系チェック」。試験: 単体12件、実VS Code5件(3回連続成功)。
- 未了は README「未確認・未実施・未了」に一覧化。
### English
- Added `core/extract.ts` (md/txt, docx via mammoth, pdf via pdf-parse). **pdf.js failed inside the real VS Code extension host**, so PDFs are read in a separate Node process (`core/pdfChild.ts`, `ELECTRON_RUN_AS_NODE`) — fixed. The requirements → design → tasks chain after import (each step sees the previous output and all sources) is tested in real VS Code.
- Fixed: the answer panel stole focus from the editor so a following Fix did nothing (found as a flaky real-VS-Code test) → `preserveFocus`.
- Added: first-run walkthrough, `package.nls.json` / `package.nls.ja.json`, a writing-system check for translations. Tests: 12 unit, 5 real VS Code (3 passes in a row).
- Remaining work is listed in the README ("Unverified / not done").

## Versionless API の方針 / Versionless API policy (2026-11-25)
**日本語**: このリポジトリのAPIは **Versionless**(URL・パッケージ名に `v1` 等を付けず、互換性を壊さず足すだけで進化させる)。欄は足すだけ・足す欄は省略可能・知らない欄は無視・名前変更は新名を足して旧を非推奨に(期限は既定で6か月以上、使用0を確認してから削除)・enumは未知の値を許容・安全上の緊急修正は例外。既存の `.v1` は呼び出し側を壊さないよう当面残し、版なしの別名を追加して段階的に畳む。詳細・出典は [`runo/API-POLICY.md`](https://github.com/aon-co-jp/runo/blob/main/API-POLICY.md) 末尾。適用はこれから順に行う。
**English**: This repository's APIs are **Versionless**: no `v1` in URLs or package names; evolve by adding only, without breaking compatibility. Only add fields, new fields are optional, ignore unknown fields, rename by adding the new name and deprecating the old (default deadline 6 months or more, remove only after confirming zero use), tolerate unknown enum values, emergency security fixes are the exception. Existing `.v1` names stay for now so callers do not break; a versionless alias is added and `.v1` is retired in stages. Details and sources: the end of [`runo/API-POLICY.md`](https://github.com/aon-co-jp/runo/blob/main/API-POLICY.md). Rollout is step by step.

## API 方針: REST 全廃・gRPC / Connect へ
**日本語**: このリポジトリでは **REST API を新規に作らない**。ブラウザ・`curl` から呼ぶ API は **Connect の単純呼び出し**(`POST /<パッケージ>.<Service>/<Method>`、`content-type: application/json`)、サービス間は **gRPC / gRPC-web**。GraphQL は読み取り専用。既存の REST は触るときに移し、移したら旧経路は消す。JSON は RS-JSON(`from_str_secure` / `parse_secure`)で読む。例外は相手の規格が形を決めるもの(ACME、OAuth/OIDC のコールバック、第三者の Webhook、ヘルスチェック、静的ファイル、OTLP)のみ。迷ったら Connect。正本は [`runo/API-POLICY.md`](https://github.com/aon-co-jp/runo/blob/main/API-POLICY.md)。
**English**: This repository **does not add new REST APIs**. APIs called from browsers or `curl` use **Connect unary calls** (`POST /<package>.<Service>/<Method>`, `content-type: application/json`); service-to-service calls use **gRPC / gRPC-web**. GraphQL is read-only. Existing REST is migrated when touched and the old route is removed. Read JSON with RS-JSON (`from_str_secure` / `parse_secure`). Exceptions are only shapes dictated by someone else's standard (ACME, OAuth/OIDC callbacks, third-party webhooks, health checks, static files, OTLP). When in doubt, use Connect. Source of truth: the link above.

## 完成まで作り切る方針 / Finish everything policy (2026-11-27)
**日本語**: 全リポジトリで、**未確認は自動で確認し、未実施は実施し、未了は完成させる**(確認を求めず進める)。使用頻度が低いと判断される機能や、**1から作り直す大規模開発になる内容でも、やめずに最後まで開発・TEST・DEBUGする**(別の方式で済ませない、後回しにしない)。進め方: 調査(英語・日本語の検索とGitHub) → 設計 → 実装 → 実機/実データで確認 → 失敗は原因を直して再試験 → README・CLAUDE・PORTING・POLICY を日英で更新 → push。「できた」と書くのは実測した範囲だけ、確認できなかった所は「未確認」と正直に書く。例外(確認を取る): 元に戻せない削除、秘密の公開、所有者の認証・決済・実機操作が要るもの、利用者のシステム設定の変更。
**English**: In every repository, **verify what is unverified, do what is not yet done, and finish what is unfinished** automatically, without asking. Even features that look rarely used, or work that means **a large rewrite from scratch, are developed, tested and debugged to the end** (no substituting another approach, no postponing). Method: research (English and Japanese search plus GitHub) -> design -> implement -> verify on real devices or data -> fix causes and retest on failure -> update README, CLAUDE, PORTING and POLICY in Japanese and English -> push. Write "done" only for what was measured, and say "unverified" honestly for the rest. Exceptions that still need confirmation: irreversible deletions, publishing secrets, anything needing the owner's authentication, payment or real-device actions, and changes to the user's system settings.