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

## 現状(正直な記録)
- 純粋な部品(秘密の伏せ字・色つき範囲・プロンプト作成・各社の要求/応答の形)の単体テスト 5 件が成功。
- **未確認**: 実際の VS Code での起動と画面操作、各社の実 API への通信、aruaru-llm の応答形式(`text` など)と maid-cafe.tokyo 側の Connect 経路。

## 足りない機能の候補(これから)
会話の履歴と続きの質問 / 「説明・修正・テスト作成」のワンクリック / AI の修正案を差分で見て適用 / 色ごとのメモと保存(ワークスペース) / 応答のストリーミング / 利用量と費用の目安の表示 / 教室の課題を VS Code 内で解く・自動採点 / maid-cafe.tokyo の質問と回答をパネル内で / 複数ファイル・プロジェクト全体の検索を文脈に追加(aruaru-search) / 日本語・英語などの多言語画面 / 送信ログ(何を送ったかの記録) / オフラインで使えるローカルモデル。

---
<a id="english"></a>
## English
A VS Code extension: select code with the mouse or cursor, **mark it with any colour**, and ask AI about it. Ranges with the same colour are sent together as one question. It also opens the [maid-cafe.tokyo](https://maid-cafe.tokyo/) Q&A and programming school from commands.

**AI**: free = `aruaru-search + aruaru-llm` (default). Paid = ChatGPT, Gemini, DeepSeek, Grok, Claude: **you contract with each provider yourself** and set your own API key (kept in VS Code SecretStorage, never in the repo or settings). We handle no billing. Secrets are masked before sending and you confirm what is sent.

**Status (honest)**: 5 unit tests of the pure parts pass. **Not yet verified**: running inside real VS Code, calls to the real provider APIs, the aruaru-llm response shape and the maid-cafe.tokyo Connect route.

**Candidate features still missing**: chat history and follow-ups, one-click explain/fix/test, applying AI fixes as diffs, saving colour marks and notes, streaming, usage and cost hints, solving school exercises inside VS Code with auto-grading, the Q&A inside a panel, adding aruaru-search results as context, a localized UI, a sent-data log, local offline models.