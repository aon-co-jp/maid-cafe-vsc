# maid-cafe-vsc

**日本語** / [English below](#english)

VS Code の拡張です。コードをマウスやカーソルで選び、**好きな色**で範囲指定して、AI に質問できます。同じ色の範囲はまとめて 1 つの質問に使えます。[maid-cafe.tokyo](https://maid-cafe.tokyo/) の質問と回答、プログラミング教室へも、コマンドから開けます。

## 使い方
1. コードを選び、右クリック → **Maid Cafe: Mark selection with a colour**(または `Ctrl+Alt+M`)で色を選ぶ。
2. **Maid Cafe: Ask AI about a colour's ranges** で色を選び、質問を入力。選んだ範囲だけが送られます。
3. 選んだ範囲だけで聞くなら `Ctrl+Alt+Q`。

## AI の扱い
- **無料**: `aruaru-search + aruaru-llm`(既定。`maidCafe.aruaruUrl`)。
- **有料**: ChatGPT・Gemini・DeepSeek・Grok・Claude は、**利用者が各社と自分で契約**し、自分の API キーを設定します。キーは VS Code の SecretStorage に保存され、リポジトリや設定ファイルには書かれません。運営は課金や決済を扱いません。
- 送る前に、鍵・トークン・パスワードらしい値を自動で伏せ(`maidCafe.redactSecrets`)、送る内容を確認します(`maidCafe.confirmBeforeSend`)。

4. 答えのあと **Maid Cafe: Ask a follow-up question** で続きの質問(会話履歴つき)。
5. 選択して **Explain / Fix / Write tests**(右クリックから)。Fix は AI の修正案を**差分で表示し、承認してから**適用します(質問後にコードが変わっていたら適用しません)。

## arurau(audiocafe.tokyo)
ITエンジニアの案件・求人マッチングのページ(フリーランス・派遣・社員)を、コマンド **Maid Cafe: Open audiocafe.tokyo arurau** で開けます(URLは設定 `maidCafe.arurauPageUrl`)。実測: `https://audiocafe.tokyo/aruaru` は 200 で、タイトルは「aruaru | ITエンジニア案件・求人マッチング」。**依頼文にあった `/arurau`(綴りが違う)は 200 を返しますが、中身は全ページ共通の言語選択ページ**だったため、正しい `/aruaru` を使っています。

## 案件の取り込みと「学びながら 設計→開発→DEBUG」
1. **Maid Cafe: Import job / project information**: URL を貼る / テキスト(クリップボード)/ ファイル(md・txt・**docx・pdf**。エクスプローラーの右クリックからも)。docx は mammoth(BSD-2)、pdf は pdf-parse(MIT、別の Node プロセスで読む)で**端末内で**文章を取り出します。画像だけのPDF(スキャン)は読めません。10MBまで。**ドラッグ&ドロップは未対応**(ファイル選択か右クリックを使う)。
   - URL は**利用者が貼ったものだけ**を、確認のあと **1 回だけ** GET(ログイン・cookie なし、401/403 なら中止、連打しない)。
   - 保存先: ワークスペースの `.maid-cafe/projects/<名前>/source/`。
2. **Maid Cafe: Project step** で段階を選ぶ: ① 要件整理(`requirements.md`)→ ② 設計書の下書き(`design.md`)→ ③ 実装タスクへ分解(`tasks.md`)→ ④ コード生成 → ⑤ レビュー → ⑥ エラー/ログを貼ってデバッグ。④⑥ は選択範囲があれば**差分で見て、承認してから適用**。色つき範囲・会話履歴(続きの質問)もそのまま使えます。
3. **学習モード**(`maidCafe.learningMode`、既定オン): 各段階で「なぜそうするか」を短く説明します。
4. **個人情報**(氏名・メール・電話・郵便番号・単価など)は送信前に伏せます(`maidCafe.redactPersonal`、既定オン。完全ではないので送信前の確認も併用)。鍵やトークンは従来どおり伏せます。

## メイドカフェ英会話と第3言語の翻訳
- **第3言語**(`maidCafe.thirdLanguage`、コマンド **Choose the third language**): 日本語・英語に加えて、世界の約40言語から1つ選ぶと、**AIの回答・英会話の返事**がその言語でもネイティブに近い自然な文で出ます。選択範囲の翻訳は **Translate the selection**(教室の説明などに)。**コードブロックは訳さず**そのまま残します。
- **翻訳の仕組み**: 無料は aruaru-llm の翻訳(別プロセスの M2M100 418M、**MIT**。モデルカードで確認済み)、有料は利用者が自分で契約した AI にネイティブ並みに訳すよう頼みます(プロバイダーの選択に従う)。無料の訳が空・原文のまま・極端に短い/長い・繰り返しのときは、`maidCafe.translateFallbackProvider` に指定した AI(自分の鍵が保存済みのもの)で自動的にやり直します。**NLLB は CC-BY-NC のため使いません**。
- **メイドカフェ英会話**(**English conversation (maid cafe)**、レベルは `maidCafe.englishLevel`): メイドの口調で英語の練習相手になり、間違いは「Correction」で**やさしく直し**、日本語訳も付きます(第3言語を選んでいればその訳も)。**Restart** で履歴を消します。
- 正直な注意: 無料の aruaru-llm(GPT-2 系)の会話は短く質が低いので、本格的に練習するときは有料AI(自分の契約)と上のフォールバック設定をおすすめします。翻訳の `Translate` 経路も、公開ホスト確定までは `maidCafe.aruaruUrl` の指定が要ります(今は疑似サーバーで試験)。

## 配布(プレビュー .vsix)
`maid-cafe-vsc-0.2.0.vsix`(約10MB、署名なし): https://maid-cafe.tokyo/download/vsc/maid-cafe-vsc-0.2.0.vsix / SHA-256 `50c7a61b4709253fa2b2e6c100e09f4900653610ec2e376cce07a0e1ea6b49b0`(ダウンロードして一致を確認済み)。作り方: `npm run compile && npx @vscode/vsce package`。展開したパッケージで PDF/docx の読み込みが動くことを確認済み。旧 0.1.0 はサーバーの `vsc-backup/` に退避。**GitHub Release は未作成**(公開の操作なので、ユーザー本人の確認待ち)。

## 翻訳品質の測定(試みと結果)
測定を試みましたが**できていません**: 公式の M2M100 418M は PyTorch の約1.9GB の重みで、CTranslate2 形式への変換に torch が要ります。この環境は Python 3.14 で pip が無く、変換環境を用意できませんでした。したがって中・韓・西・仏・独・露・アラビア語などの**実際の訳の質は未測定**で、「強い/弱い言語」は書けません(推測では書きません)。測定は、`translate-worker` が動く環境(変換済みモデルのある VPS など)で `maidCafe.aruaruUrl` を向けて行う必要があります。弱い言語への備え(文字体系チェック+自分の鍵のAIへの自動切替)は実装済みで、切替の判定は単体試験済み、**実AIでの切替は未試験**(AI各社の鍵が無いため)。

## 通し試験と学習モードの質
案件取り込み(URL・テキスト・md・docx・pdf)→要件→設計→タスク→デバッグ(差分適用)は、実VS Code の自動試験で通しで動作確認済みです(疑似AI)。学習モードは「Why」を求める指示を送ることまで確認済みで、**実際のAIが返す説明の質は未確認**です。

## 初回ガイドと日本語画面
初回起動時に「はじめてのガイド」(色つけ→質問→AI選択→案件取り込み→英会話)が開きます(コマンド **Open the getting-started guide** でいつでも)。コマンド名・説明は VS Code の表示言語に合わせて日本語/英語(`package.nls*.json`)。設定項目の説明と実行中のメッセージは**まだ英語のみ**です。

## 翻訳の質(正直に)
- 第3言語は中・韓・西・仏・独・露・アラビア語などを含む約40言語から選べます。**実際の翻訳品質は未測定**: M2M100 の変換済みモデル(CTranslate2 形式)がこの環境になく、公開された aruaru-llm の翻訳経路も未公開のため、疑似サーバーでの動作試験のみです。**品質が弱い言語は測定後にここへ記載します**(一般に M2M100 418M は、英語と離れた低資源言語、長文、専門用語で弱い)。
- 品質が足りないときの備え(実装済み): 出力が空・原文のまま・極端な長さ・繰り返し・**期待する文字体系になっていない**(例: ロシア語を頼んだのにラテン文字のまま)なら、`maidCafe.translateFallbackProvider` の AI(自分の鍵)で自動的にやり直します。

## 未確認・未実施・未了(洗い出し)
- 未確認: 各社の実 API(ChatGPT・Gemini・DeepSeek・Grok・Claude)への通信 / 公開された aruaru-llm(会話・翻訳とも。`maidCafe.aruaruUrl` 待ち)/ 翻訳品質(上記)/ マーケットプレイス公開と GitHub Release(`.vsix` は上記のとおり配布済み)。
- 未了: ドラッグ&ドロップでの取り込み / 画像PDFのOCR / 設定の説明と実行時メッセージの日本語化 / 応答のストリーミング / 利用量と費用の表示 / 教室の課題を VS Code 内で自動採点 / 送信ログ / ローカルモデル / open-vsc-claude のスタック選択の移植(計画のみ)。

## 現状(正直な記録)
- 単体テスト 12 件(`npm test`)と、**実 VS Code(ダウンロードした公式版)を自動で起動する試験 5 件(3 回連続成功)**(案件の取り込み〜要件〜デバッグ適用、個人情報の伏せ字、第3言語の翻訳と英会話を含む。毎回、一時フォルダで新しく実行)(`npm run test:vscode`)が成功: 拡張の読み込み、コマンド登録、色つけ→範囲保存→質問→続きの質問(履歴が送られる)→修正案の適用まで。aruaru 側は**手元の疑似サーバー**で受けました(音は鳴らしません)。
- aruaru-llm の応答形式は**ソース(`F:ruaru-llm\src\main.rs`)で確認**: 要求 `{prompt, max_new_tokens(上限128), tenant}`、応答 `{completion, engine, disclosure}`。`parseResponse` を `completion` に合わせた。
- **未確認**: 各社の実 API への通信。**公開されている aruaru-llm の実 URL への実呼び出し**: `https://maid-cafe.tokyo/aruaru_llm.Llm/Generate` と `…/aruaru_llm.v1.Llm/Generate` はどちらも 404(maid-cafe.tokyo は案内サイトで、この経路を持たない)、`https://aruaru.tokyo` は 405。本番の aruaru-llm の公開ホスト名が決まるまで、`maidCafe.aruaruUrl` で指定してください。なお aruaru-llm 側の版なし(`.v1` 削除)移行は別作業で進行中(ソースはまだ `/aruaru_llm.v1.Llm/`)。
- aruaru-llm(GPT-2 系)は英語向きで生成が短い(最大128トークン)。精度の高い答えが要る場合は有料AI(自分の契約)を選んでください。

## open-vsc-claude の統合方針(計画。コードの移植はまだ)
`open-vsc-claude`(スタック選択 → プレビュー → Claude で生成/修正 → フォルダへ保存)を、この拡張へ段階的に統合します。
1. **部品**: スタック定義とファイル生成(VS Code 非依存の部分)を `src/core/stacks/` へ移し、単体テストを付ける。
2. **コマンド**: `Maid Cafe: Open Stack Picker` を追加(既存の画面と保存の確認をそのまま移す)。
3. **AI**: 生成は Claude 固定をやめ、この拡張の `providers.ts`(選択中の AI、各自の鍵は SecretStorage)を使う。
4. **色つき範囲との連携**: 生成物の一部を色で囲んで質問・修正(Fix の差分適用を流用)。
5. **旧拡張**: 移行後は open-vsc-claude の README に「maid-cafe-vsc へ統合」と案内。Node.js は VS Code 拡張に限る例外で、Web デモ側は触らない。

## 足りない機能の候補(これから)
色ごとのメモと保存(ワークスペース) / 応答のストリーミング / 利用量と費用の目安の表示 / 教室の課題を VS Code 内で解く・自動採点 / maid-cafe.tokyo の質問と回答をパネル内で / 複数ファイル・プロジェクト全体の検索を文脈に追加(aruaru-search) / 日本語・英語などの多言語画面 / 送信ログ(何を送ったかの記録) / オフラインで使えるローカルモデル。

---
<a id="english"></a>
## English
A VS Code extension: select code with the mouse or cursor, **mark it with any colour**, and ask AI about it. Ranges with the same colour are sent together as one question. It also opens the [maid-cafe.tokyo](https://maid-cafe.tokyo/) Q&A and programming school from commands.

**AI**: free = `aruaru-search + aruaru-llm` (default). Paid = ChatGPT, Gemini, DeepSeek, Grok, Claude: **you contract with each provider yourself** and set your own API key (kept in VS Code SecretStorage, never in the repo or settings). We handle no billing. Secrets are masked before sending and you confirm what is sent.

**New**: follow-up questions with history; one-click Explain / Fix / Write tests; Fix shows the AI proposal as a **diff and applies it only after you approve** (refused if the code changed meanwhile).

**arurau (audiocafe.tokyo)**: the command **Maid Cafe: Open audiocafe.tokyo arurau** opens the IT engineer job / project matching page (freelance, dispatch, employee; URL in `maidCafe.arurauPageUrl`). Measured: `https://audiocafe.tokyo/aruaru` returns 200 titled "aruaru | IT engineer jobs/projects matching". **`/arurau` (the spelling in the request) also returns 200, but it is the site-wide language-selection page**, so the correct `/aruaru` is used.

**Job/project import and "learn while you design → build → debug"**: (1) **Import job / project information** takes a pasted URL, clipboard text, or an md/txt/**docx/pdf** file (also from the Explorer context menu; text is extracted locally with mammoth (BSD-2) and pdf-parse (MIT, run in a separate Node process); image-only/scanned PDFs and files over 10 MB are not read); drag-and-drop is not supported yet. A URL is only what you paste, fetched **once** after you confirm (GET, no login or cookies, stops on 401/403, no repeated scraping). Saved in `.maid-cafe/projects/<name>/source/` in the workspace. (2) **Project step**: requirements (`requirements.md`) → design draft (`design.md`) → implementation tasks (`tasks.md`) → code generation → review → paste an error/log to debug. Code and debug steps show a **diff and apply only after you approve**; colour ranges and the follow-up history work as before. (3) **Learning mode** (`maidCafe.learningMode`, on) adds a short "why" to each step. (4) **Personal data** (names, e-mail, phone, postal code, rates) is masked before sending (`maidCafe.redactPersonal`, on; not perfect, so the pre-send confirmation stays); keys/tokens are masked as before.

**Maid-cafe English and third-language translation**: pick a **third language** (`maidCafe.thirdLanguage`, command *Choose the third language*) from about 40 world languages besides Japanese and English, and every **AI answer and English-conversation reply** is also shown in it, written as a native speaker would. *Translate the selection* does the same for any text (e.g. school explanations). **Code blocks are never translated.** Free translation = aruaru-llm's translation worker (M2M100 418M, **MIT**, license checked on the model card); paid = your own provider asked for native-quality translation (follows the chosen provider). If the free output is empty, unchanged, extreme in length or repetitive, it retries with `maidCafe.translateFallbackProvider` (your own saved key). **NLLB (CC-BY-NC) is not used.** *English conversation (maid cafe)* (level: `maidCafe.englishLevel`) makes the AI a maid-cafe partner who **gently corrects** your English, adds a Japanese gloss (and the third language), and keeps history; *Restart* clears it. Honest note: the free aruaru-llm (GPT-2 class) chat is short and weak, so use a paid AI plus the fallback setting for serious practice; the `Translate` route also needs `maidCafe.aruaruUrl` until the public host is fixed (tested with a mock server).

**Distribution (preview .vsix)**: `maid-cafe-vsc-0.2.0.vsix` (about 10 MB, unsigned): https://maid-cafe.tokyo/download/vsc/maid-cafe-vsc-0.2.0.vsix, SHA-256 `50c7a61b4709253fa2b2e6c100e09f4900653610ec2e376cce07a0e1ea6b49b0` (downloaded and matched). Build: `npm run compile && npx @vscode/vsce package`. PDF/docx reading was verified from the unpacked package. The old 0.1.0 is kept in `vsc-backup/` on the server. **No GitHub Release is created yet** (it is a public action, waiting for the user's own confirmation).

**Translation quality measurement (attempted, not achieved)**: the official M2M100 418M is a ~1.9 GB PyTorch checkpoint and conversion to CTranslate2 needs torch; this environment has Python 3.14 and no pip, so no conversion environment could be set up. The **real quality for Chinese, Korean, Spanish, French, German, Russian, Arabic etc. is therefore unmeasured**, and no "strong/weak" list is given (no guessing). Measuring needs an environment where `translate-worker` runs (e.g. a VPS with the converted model) with `maidCafe.aruaruUrl` pointed at it. The safety net for weak languages (writing-system check + automatic switch to your own provider key) is implemented; the decision logic is unit-tested, but a **real switch to a paid AI is untested** (no provider keys here).

**End-to-end and learning mode**: import (URL, text, md, docx, pdf) → requirements → design → tasks → debug (diff apply) is verified end to end in real VS Code (mock AI). For learning mode, only that the "Why" instruction is sent is verified; the **quality of a real AI's explanations is unchecked**.

**First-run guide and Japanese UI**: a getting-started walkthrough opens on first launch (also via *Open the getting-started guide*). Command names and descriptions follow VS Code's display language (Japanese/English, `package.nls*.json`); setting descriptions and runtime messages are **still English only**.

**Translation quality (honest)**: about 40 third languages are selectable, including Chinese, Korean, Spanish, French, German, Russian and Arabic. **Real translation quality is not measured yet**: there is no converted M2M100 (CTranslate2) model in this environment and no public aruaru-llm translate route, so only mock-server behaviour is tested. Weak languages will be listed here once measured (M2M100 418M is generally weaker for low-resource languages, long text and jargon). Safety net (implemented): if the output is empty, unchanged, extreme in length, repetitive, or **not in the expected writing system** (e.g. Russian requested but Latin letters returned), it retries with `maidCafe.translateFallbackProvider` (your own key).

**Unverified / not done**: *unverified* — the real provider APIs; a public aruaru-llm (chat and translation, waiting for `maidCafe.aruaruUrl`); translation quality; marketplace publishing and a GitHub Release (the `.vsix` itself is distributed as above). *Not done* — drag-and-drop import, OCR for image PDFs, Japanese setting descriptions/runtime messages, streaming, usage/cost display, auto-graded school exercises, a sent-data log, local models, porting open-vsc-claude's stack picker (plan only).

**Status (honest)**: 12 unit tests (`npm test`) and **5 automated tests that launch real VS Code (the official download), passing 3 runs in a row** (incl. import → requirements → debug apply, personal-data masking, third-language translation and the English chat; each run uses a fresh temp workspace) (`npm run test:vscode`) pass: extension loads, commands registered, colour → saved range → question → follow-up (history is sent) → fix applied. The aruaru side was a **local mock server**; no sound is played. The aruaru-llm response shape is **confirmed from its source**: request `{prompt, max_new_tokens (max 128), tenant}`, response `{completion, engine, disclosure}`; `parseResponse` now reads `completion`. **Not yet verified**: the real provider APIs, and a **live call to a public aruaru-llm URL**: `https://maid-cafe.tokyo/aruaru_llm.Llm/Generate` and the `.v1` path both return 404 (maid-cafe.tokyo is an info site without this route) and `https://aruaru.tokyo` returns 405; set `maidCafe.aruaruUrl` until the public host is fixed. aruaru-llm's versionless migration is in progress elsewhere (its source still serves `/aruaru_llm.v1.Llm/`). aruaru-llm (GPT-2 class) suits English and answers briefly (max 128 tokens); pick a paid AI (your own contract) for better answers.

**open-vsc-claude integration plan (plan only, no code moved yet)**: (1) move the VS Code-independent stack definitions and file generation to `src/core/stacks/` with unit tests; (2) add a `Maid Cafe: Open Stack Picker` command carrying over the picker, preview and save confirmation; (3) replace the Claude-only generation with this extension's `providers.ts` (chosen AI, keys in SecretStorage); (4) let you colour parts of generated files and ask/fix them (reusing the Fix diff); (5) after migration, point open-vsc-claude's README here. Node.js is used only for the VS Code extension; the web demo is untouched.

**Candidate features still missing**: saving colour marks and notes, streaming, usage and cost hints, solving school exercises inside VS Code with auto-grading, the Q&A inside a panel, adding aruaru-search results as context, a localized UI, a sent-data log, local offline models.
## Versionless API の方針 / Versionless API policy (2026-11-25)
**日本語**: このリポジトリのAPIは **Versionless**(URL・パッケージ名に `v1` 等を付けず、互換性を壊さず足すだけで進化させる)。欄は足すだけ・足す欄は省略可能・知らない欄は無視・名前変更は新名を足して旧を非推奨に(期限は既定で6か月以上、使用0を確認してから削除)・enumは未知の値を許容・安全上の緊急修正は例外。既存の `.v1` は呼び出し側を壊さないよう当面残し、版なしの別名を追加して段階的に畳む。詳細・出典は [`runo/API-POLICY.md`](https://github.com/aon-co-jp/runo/blob/main/API-POLICY.md) 末尾。適用はこれから順に行う。
**English**: This repository's APIs are **Versionless**: no `v1` in URLs or package names; evolve by adding only, without breaking compatibility. Only add fields, new fields are optional, ignore unknown fields, rename by adding the new name and deprecating the old (default deadline 6 months or more, remove only after confirming zero use), tolerate unknown enum values, emergency security fixes are the exception. Existing `.v1` names stay for now so callers do not break; a versionless alias is added and `.v1` is retired in stages. Details and sources: the end of [`runo/API-POLICY.md`](https://github.com/aon-co-jp/runo/blob/main/API-POLICY.md). Rollout is step by step.

## API 方針: REST 全廃・gRPC / Connect へ
**日本語**: このリポジトリでは **REST API を新規に作らない**。ブラウザ・`curl` から呼ぶ API は **Connect の単純呼び出し**(`POST /<パッケージ>.<Service>/<Method>`、`content-type: application/json`)、サービス間は **gRPC / gRPC-web**。GraphQL は読み取り専用。既存の REST は触るときに移し、移したら旧経路は消す。JSON は RS-JSON(`from_str_secure` / `parse_secure`)で読む。例外は相手の規格が形を決めるもの(ACME、OAuth/OIDC のコールバック、第三者の Webhook、ヘルスチェック、静的ファイル、OTLP)のみ。迷ったら Connect。正本は [`runo/API-POLICY.md`](https://github.com/aon-co-jp/runo/blob/main/API-POLICY.md)。
**English**: This repository **does not add new REST APIs**. APIs called from browsers or `curl` use **Connect unary calls** (`POST /<package>.<Service>/<Method>`, `content-type: application/json`); service-to-service calls use **gRPC / gRPC-web**. GraphQL is read-only. Existing REST is migrated when touched and the old route is removed. Read JSON with RS-JSON (`from_str_secure` / `parse_secure`). Exceptions are only shapes dictated by someone else's standard (ACME, OAuth/OIDC callbacks, third-party webhooks, health checks, static files, OTLP). When in doubt, use Connect. Source of truth: the link above.

## 完成まで作り切る方針 / Finish everything policy (2026-11-27)
**日本語**: 全リポジトリで、**未確認は自動で確認し、未実施は実施し、未了は完成させる**(確認を求めず進める)。使用頻度が低いと判断される機能や、**1から作り直す大規模開発になる内容でも、やめずに最後まで開発・TEST・DEBUGする**(別の方式で済ませない、後回しにしない)。進め方: 調査(英語・日本語の検索とGitHub) → 設計 → 実装 → 実機/実データで確認 → 失敗は原因を直して再試験 → README・CLAUDE・PORTING・POLICY を日英で更新 → push。「できた」と書くのは実測した範囲だけ、確認できなかった所は「未確認」と正直に書く。例外(確認を取る): 元に戻せない削除、秘密の公開、所有者の認証・決済・実機操作が要るもの、利用者のシステム設定の変更。
**English**: In every repository, **verify what is unverified, do what is not yet done, and finish what is unfinished** automatically, without asking. Even features that look rarely used, or work that means **a large rewrite from scratch, are developed, tested and debugged to the end** (no substituting another approach, no postponing). Method: research (English and Japanese search plus GitHub) -> design -> implement -> verify on real devices or data -> fix causes and retest on failure -> update README, CLAUDE, PORTING and POLICY in Japanese and English -> push. Write "done" only for what was measured, and say "unverified" honestly for the rest. Exceptions that still need confirmation: irreversible deletions, publishing secrets, anything needing the owner's authentication, payment or real-device actions, and changes to the user's system settings.
## 2026-11-27(6) 雇用形態の推定・URLの再確認 / Engagement type, URL recheck
### 日本語
- 取り込んだ案件資料の先頭に、雇用形態(フリーランス・派遣・社員、本文の語から推定、複数可・不明は unknown)と取り込み元を記録する見出しを付けるようにした(`core/project.ts` の `classifyEngagement`/`importHeader`)。単体13件・実VS Code5件が成功。
- URL再確認(2026-11-27): `https://audiocafe.tokyo/aruaru` は200「aruaru | ITエンジニア案件・求人マッチング」、依頼の `/arurau` は200だが全体共通の言語選択ページ。正しいURLは `/aruaru`(設定済み)。
- 4機能(第3言語つき英会話と翻訳=版なし Connect `aruaru_llm.Llm/Translate`、arurau紹介、案件の取り込み、学びながら設計→開発→DEBUG)は既に実装済みで、今回は実VS Code試験で動作を再確認した。**未確認**: 公開 aruaru-llm への実呼び出しと翻訳品質、各社の実API。
### English
- Imported job material now starts with a header recording the engagement type (freelance / dispatch / employee, guessed from the text, several allowed, otherwise unknown) and the source (`classifyEngagement` / `importHeader` in `core/project.ts`). 13 unit and 5 real VS Code tests pass.
- URL recheck (2026-11-27): `https://audiocafe.tokyo/aruaru` returns 200 with the job-matching title; the requested `/arurau` returns 200 but is the site-wide language picker. The correct URL `/aruaru` is configured.
- All four features (third-language English chat and translation via versionless Connect `aruaru_llm.Llm/Translate`, the arurau intro, job import, learn-while-you-design/build/debug) already existed; this round re-verified them in real VS Code. **Unverified**: live calls to a public aruaru-llm and translation quality, real provider APIs.
