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

## 初回ガイドと日本語画面
初回起動時に「はじめてのガイド」(色つけ→質問→AI選択→案件取り込み→英会話)が開きます(コマンド **Open the getting-started guide** でいつでも)。コマンド名・説明は VS Code の表示言語に合わせて日本語/英語(`package.nls*.json`)。設定項目の説明と実行中のメッセージは**まだ英語のみ**です。

## 翻訳の質(正直に)
- 第3言語は中・韓・西・仏・独・露・アラビア語などを含む約40言語から選べます。**実際の翻訳品質は未測定**: M2M100 の変換済みモデル(CTranslate2 形式)がこの環境になく、公開された aruaru-llm の翻訳経路も未公開のため、疑似サーバーでの動作試験のみです。**品質が弱い言語は測定後にここへ記載します**(一般に M2M100 418M は、英語と離れた低資源言語、長文、専門用語で弱い)。
- 品質が足りないときの備え(実装済み): 出力が空・原文のまま・極端な長さ・繰り返し・**期待する文字体系になっていない**(例: ロシア語を頼んだのにラテン文字のまま)なら、`maidCafe.translateFallbackProvider` の AI(自分の鍵)で自動的にやり直します。

## 未確認・未実施・未了(洗い出し)
- 未確認: 各社の実 API(ChatGPT・Gemini・DeepSeek・Grok・Claude)への通信 / 公開された aruaru-llm(会話・翻訳とも。`maidCafe.aruaruUrl` 待ち)/ 翻訳品質(上記)/ マーケットプレイスからのインストール(`.vsix` の作り直しと配布はまだ)。
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

**First-run guide and Japanese UI**: a getting-started walkthrough opens on first launch (also via *Open the getting-started guide*). Command names and descriptions follow VS Code's display language (Japanese/English, `package.nls*.json`); setting descriptions and runtime messages are **still English only**.

**Translation quality (honest)**: about 40 third languages are selectable, including Chinese, Korean, Spanish, French, German, Russian and Arabic. **Real translation quality is not measured yet**: there is no converted M2M100 (CTranslate2) model in this environment and no public aruaru-llm translate route, so only mock-server behaviour is tested. Weak languages will be listed here once measured (M2M100 418M is generally weaker for low-resource languages, long text and jargon). Safety net (implemented): if the output is empty, unchanged, extreme in length, repetitive, or **not in the expected writing system** (e.g. Russian requested but Latin letters returned), it retries with `maidCafe.translateFallbackProvider` (your own key).

**Unverified / not done**: *unverified* — the real provider APIs; a public aruaru-llm (chat and translation, waiting for `maidCafe.aruaruUrl`); translation quality; marketplace install (the `.vsix` is not rebuilt/published yet). *Not done* — drag-and-drop import, OCR for image PDFs, Japanese setting descriptions/runtime messages, streaming, usage/cost display, auto-graded school exercises, a sent-data log, local models, porting open-vsc-claude's stack picker (plan only).

**Status (honest)**: 12 unit tests (`npm test`) and **5 automated tests that launch real VS Code (the official download), passing 3 runs in a row** (incl. import → requirements → debug apply, personal-data masking, third-language translation and the English chat; each run uses a fresh temp workspace) (`npm run test:vscode`) pass: extension loads, commands registered, colour → saved range → question → follow-up (history is sent) → fix applied. The aruaru side was a **local mock server**; no sound is played. The aruaru-llm response shape is **confirmed from its source**: request `{prompt, max_new_tokens (max 128), tenant}`, response `{completion, engine, disclosure}`; `parseResponse` now reads `completion`. **Not yet verified**: the real provider APIs, and a **live call to a public aruaru-llm URL**: `https://maid-cafe.tokyo/aruaru_llm.Llm/Generate` and the `.v1` path both return 404 (maid-cafe.tokyo is an info site without this route) and `https://aruaru.tokyo` returns 405; set `maidCafe.aruaruUrl` until the public host is fixed. aruaru-llm's versionless migration is in progress elsewhere (its source still serves `/aruaru_llm.v1.Llm/`). aruaru-llm (GPT-2 class) suits English and answers briefly (max 128 tokens); pick a paid AI (your own contract) for better answers.

**open-vsc-claude integration plan (plan only, no code moved yet)**: (1) move the VS Code-independent stack definitions and file generation to `src/core/stacks/` with unit tests; (2) add a `Maid Cafe: Open Stack Picker` command carrying over the picker, preview and save confirmation; (3) replace the Claude-only generation with this extension's `providers.ts` (chosen AI, keys in SecretStorage); (4) let you colour parts of generated files and ask/fix them (reusing the Fix diff); (5) after migration, point open-vsc-claude's README here. Node.js is used only for the VS Code extension; the web demo is untouched.

**Candidate features still missing**: saving colour marks and notes, streaming, usage and cost hints, solving school exercises inside VS Code with auto-grading, the Q&A inside a panel, adding aruaru-search results as context, a localized UI, a sent-data log, local offline models.