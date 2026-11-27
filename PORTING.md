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

## 2026-11-27(5) 0.2.0 の .vsix・配備・翻訳測定の結果 / 0.2.0 vsix, deployment, translation measurement result
### 日本語
- `package.json` を 0.2.0 にし、`@vscode/vsce package` で .vsix を作成(約10MB、SHA-256 `50c7a61b…49b0`)。展開して PDF/docx 読み込みを確認。サーバー(conoha)の `/var/www/maid-cafe-download/vsc/` に置き、旧 0.1.0 と旧 index.html は `vsc-backup/` に退避。ダウンロードのハッシュ一致を確認。紹介ページを 0.2.0 に更新。GitHub Release は未作成(公開操作のため本人確認待ち)。
- 翻訳の実測は環境の制約(torch 変換不可)でできず、未測定と明記。
### English
- Bumped to 0.2.0 and built the .vsix with `@vscode/vsce package` (about 10 MB, SHA-256 `50c7a61b…49b0`); verified PDF/docx reading from the unpacked package. Placed in `/var/www/maid-cafe-download/vsc/` on conoha; the old 0.1.0 and old index.html moved to `vsc-backup/`. The downloaded hash matches. The intro page now says 0.2.0. No GitHub Release yet (public action; waiting for the user's confirmation).
- Real translation measurement was not possible (no torch conversion environment); recorded as unmeasured.

## 2026-11-27(6) 雇用形態の推定・URLの再確認 / Engagement type, URL recheck
### 日本語
- 取り込んだ案件資料の先頭に、雇用形態(フリーランス・派遣・社員、本文の語から推定、複数可・不明は unknown)と取り込み元を記録する見出しを付けるようにした(`core/project.ts` の `classifyEngagement`/`importHeader`)。単体13件・実VS Code5件が成功。
- URL再確認(2026-11-27): `https://audiocafe.tokyo/aruaru` は200「aruaru | ITエンジニア案件・求人マッチング」、依頼の `/arurau` は200だが全体共通の言語選択ページ。正しいURLは `/aruaru`(設定済み)。
- 4機能(第3言語つき英会話と翻訳=版なし Connect `aruaru_llm.Llm/Translate`、arurau紹介、案件の取り込み、学びながら設計→開発→DEBUG)は既に実装済みで、今回は実VS Code試験で動作を再確認した。**未確認**: 公開 aruaru-llm への実呼び出しと翻訳品質、各社の実API。
### English
- Imported job material now starts with a header recording the engagement type (freelance / dispatch / employee, guessed from the text, several allowed, otherwise unknown) and the source (`classifyEngagement` / `importHeader` in `core/project.ts`). 13 unit and 5 real VS Code tests pass.
- URL recheck (2026-11-27): `https://audiocafe.tokyo/aruaru` returns 200 with the job-matching title; the requested `/arurau` returns 200 but is the site-wide language picker. The correct URL `/aruaru` is configured.
- All four features (third-language English chat and translation via versionless Connect `aruaru_llm.Llm/Translate`, the arurau intro, job import, learn-while-you-design/build/debug) already existed; this round re-verified them in real VS Code. **Unverified**: live calls to a public aruaru-llm and translation quality, real provider APIs.

## 2026-11-27 ドラッグ&ドロップ取り込みと画像だけのPDFのOCR / Drag-and-drop import and OCR for image-only PDFs
**日本語**
- **ドラッグ&ドロップ**: エクスプローラーに「メイドカフェ: 案件資料をここへドロップ」ビューを追加(VS Code のエクスプローラーや OS からのファイルを受ける)。コマンド「案件資料をドラッグ&ドロップで取り込む」で開く Webview にファイルを落としても取り込める(md・txt・docx・pdf、複数可、未対応形式は警告して飛ばす)。取り込み先は今の案件(無ければ名前を聞く)。
- **画像だけのPDFのOCR**: PDF から文字が取れないとき、埋め込み画像(JPEG、または 8bit の Gray/RGB の Flate 画像を PNG にしたもの、最大16ページ)を取り出し、aruaru-llm の版なし Connect `POST /aruaru_llm.Llm/Ocr` に送る(新しいRESTは作らない、`x-tenant: maid-cafe-vsc`)。届かない・404・503 のときは理由と「`maidCafe.aruaruUrl` を確認するか文章を貼り付けて」と表示する。
- **試験(実測)**: `npm test` 17件成功(画像抽出・PNG・要求形・疑似サーバーでのOCR成功/404/接続不可)。`npm run test:vscode` 6件成功(実VS Code 1.148.0: uri-list のドロップ、Webview のファイルのドロップ、画像だけのPDFのOCR、ドロップ用Webviewが開くこと)。
- **未確認・制限(正直に)**: マウスでの実際のドラッグ操作は自動試験で再現できず未確認(処理は同じ関数を通している)。**本番の `https://maid-cafe.tokyo/aruaru_llm.Llm/Ocr` は 2026-11-27 時点で 404**(OCR未公開)なので、既定設定ではOCRはエラー表示になる。OCRを提供する aruaru-llm を `maidCafe.aruaruUrl` に指す必要がある。本物の OCR エンジンでの読み取りは未確認(疑似サーバーのみ)。PDF を描画して画像化する機能は無いので、JPEG/Flate 以外の画像(JBIG2・CCITT・JPX 等)のスキャンPDFは読めない。

**English**
- **Drag and drop**: a "Maid Cafe: Drop job files" view in the Explorer accepts files from the VS Code explorer or the OS; the command "Drop job files (drag & drop import)" opens a webview drop zone (md, txt, docx, pdf; several at once; unsupported types are skipped with a warning). Files go to the current project (asks for a name if none).
- **OCR for image-only PDFs**: when a PDF yields no text, its embedded images (JPEG, or 8-bit Gray/RGB Flate images re-encoded as PNG; up to 16 pages) are sent to aruaru-llm's versionless Connect `POST /aruaru_llm.Llm/Ocr` (no new REST; `x-tenant: maid-cafe-vsc`). Unreachable, 404 or 503 show the reason and "check `maidCafe.aruaruUrl` or paste the text".
- **Tests (measured)**: `npm test` 17 pass; `npm run test:vscode` 6 pass in real VS Code 1.148.0 (uri-list drop, webview file drop, OCR of an image-only PDF, drop webview opens).
- **Unverified / limits**: a real mouse drag is not reproduced by automated tests. **Production `https://maid-cafe.tokyo/aruaru_llm.Llm/Ocr` returns 404 as of 2026-11-27**, so with default settings OCR shows the error; point `maidCafe.aruaruUrl` at an aruaru-llm that serves OCR. Real OCR-engine output is unverified (mock server only). There is no PDF rasterizer, so scans using JBIG2, CCITT, JPX etc. cannot be read.

## 2026-11-27 プログラマー向けアンケート / Programmer survey
**日本語**
- コマンド「プログラマー向けアンケート」: 取り込んだ資料(仕様書・設計書・URL・貼り付けた本文)から、案件で使う言語・フレームワークを自動で判定し、選択画面で印を付けて出す(31種類)。資料が無くても、マウスで選ぶか、類似語で入力できる(例「リアクト」「React.js」「ｒｅａｃｔ」→ React、「パイソン」→ Python)。go・rust・react などの一般の英単語は、大文字で始まるときだけ技術名とみなす。
- 言語・フレームワークごとにレベルを選ぶ: 超初心者・初心者・中級者・上級者・ベテラン。結果は案件フォルダーの `survey.json` に保存し、次回は前回のレベルを初期値として使う。
- 要件→設計→タスク→実装→レビュー→DEBUG の各段階で、保存した技術とレベルを AI への指示に加える。学習モードが有効なら、一番低いレベルに合わせて説明の詳しさ・手順の細かさ・最後の課題を変える(超初心者=用語をすべて説明し1動作ずつの手順+小さな課題、ベテラン=気づきにくい危険だけ指摘+任意の挑戦課題)。新しい REST は作っていない(AI 呼び出しは既存の版なし Connect)。
- 試験(実測): `npm test` 19件成功(類似語の解決・資料からの判定・一般語を誤判定しないこと・レベル別の指示・保存形式)。`npm run test:vscode` 7件成功(実 VS Code: 類似語入力→保存→次回の再利用→設計段階の指示に反映)。
- 未確認: 選択画面をマウスで操作する流れ(試験は引数で指定)。実際の AI がレベルに応じて説明を変えるかの品質(疑似サーバーでは指示が送られることだけ確認)。

**English**
- Command "Programmer survey": detects the job's languages and frameworks (31 entries) from imported documents (specs, designs, URLs, pasted text) and pre-checks them in a picker. Without documents, pick with the mouse or type a similar name (e.g. "リアクト", "React.js", full-width "ｒｅａｃｔ" -> React). Common English words such as go, rust, react only count when capitalized.
- Choose a level per technology: absolute beginner, beginner, intermediate, advanced, veteran. Saved to `survey.json` in the project folder; next time the previous levels are the defaults.
- Every step (requirements, design, tasks, implement, review, debug) adds the saved stack and levels to the AI instruction; with learning mode on, the lowest level sets how detailed the explanation, how small the steps and what the closing practice task is. No new REST (AI calls stay on the existing versionless Connect).
- Tests (measured): `npm test` 19 pass; `npm run test:vscode` 7 pass in real VS Code (similar-name input, save, reuse, design prompt adapts).
- Unverified: the mouse-driven picker flow (tests pass arguments), and whether a real AI actually adapts its answers (the mock only confirms the instruction is sent).
