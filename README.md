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

## 現状(正直な記録)
- 単体テスト 8 件(`npm test`)と、**実 VS Code(ダウンロードした公式版)を自動で起動する試験 2 件**(`npm run test:vscode`)が成功: 拡張の読み込み、コマンド登録、色つけ→範囲保存→質問→続きの質問(履歴が送られる)→修正案の適用まで。aruaru 側は**手元の疑似サーバー**で受けました(音は鳴らしません)。
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

**Status (honest)**: 8 unit tests (`npm test`) and **2 automated tests that launch real VS Code (the official download)** (`npm run test:vscode`) pass: extension loads, commands registered, colour → saved range → question → follow-up (history is sent) → fix applied. The aruaru side was a **local mock server**; no sound is played. The aruaru-llm response shape is **confirmed from its source**: request `{prompt, max_new_tokens (max 128), tenant}`, response `{completion, engine, disclosure}`; `parseResponse` now reads `completion`. **Not yet verified**: the real provider APIs, and a **live call to a public aruaru-llm URL**: `https://maid-cafe.tokyo/aruaru_llm.Llm/Generate` and the `.v1` path both return 404 (maid-cafe.tokyo is an info site without this route) and `https://aruaru.tokyo` returns 405; set `maidCafe.aruaruUrl` until the public host is fixed. aruaru-llm's versionless migration is in progress elsewhere (its source still serves `/aruaru_llm.v1.Llm/`). aruaru-llm (GPT-2 class) suits English and answers briefly (max 128 tokens); pick a paid AI (your own contract) for better answers.

**open-vsc-claude integration plan (plan only, no code moved yet)**: (1) move the VS Code-independent stack definitions and file generation to `src/core/stacks/` with unit tests; (2) add a `Maid Cafe: Open Stack Picker` command carrying over the picker, preview and save confirmation; (3) replace the Claude-only generation with this extension's `providers.ts` (chosen AI, keys in SecretStorage); (4) let you colour parts of generated files and ask/fix them (reusing the Fix diff); (5) after migration, point open-vsc-claude's README here. Node.js is used only for the VS Code extension; the web demo is untouched.

**Candidate features still missing**: saving colour marks and notes, streaming, usage and cost hints, solving school exercises inside VS Code with auto-grading, the Q&A inside a panel, adding aruaru-search results as context, a localized UI, a sent-data log, local offline models.