import * as vscode from 'vscode';
import { PALETTE, ColorId, RangeStore, MarkedRange } from './core/ranges';
import { Conversation, Turn } from './core/chat';
import { extractText, fileKind } from './core/extract';
import { ocrImages } from './core/ocr';
import { Language, EnglishLevel, findLanguage, LANGUAGES, buildTranslateRequest, parseTranslateResponse, looksPoor, translateKeepingCode, englishCafeSystem, parseCafeReply } from './core/translate';
import { Stage, STAGES, learningInstruction, checkFetchUrl, htmlToText, projectDir, slugify, importHeader } from './core/project';
import { redact as redactSecrets } from './core/redact';
import { ACTIONS, ActionId, extractCodeBlock, replaceLines } from './core/actions';
import { buildPrompt } from './core/prompt';
import { PROVIDERS, ProviderId, buildRequest, parseResponse, explainError } from './core/providers';

const store = new RangeStore();
const decos = new Map<ColorId, vscode.TextEditorDecorationType>();

function deco(c: ColorId): vscode.TextEditorDecorationType {
  let d = decos.get(c);
  if (!d) {
    d = vscode.window.createTextEditorDecorationType({
      backgroundColor: PALETTE.find((p) => p.id === c)!.css,
      isWholeLine: false,
      overviewRulerColor: PALETTE.find((p) => p.id === c)!.css,
    });
    decos.set(c, d);
  }
  return d;
}

function repaint(editor: vscode.TextEditor | undefined): void {
  if (!editor) return;
  const file = editor.document.uri.toString();
  for (const p of PALETTE) {
    const rs = store
      .byColor(p.id)
      .filter((r) => r.file === file)
      .map((r) => new vscode.Range(r.startLine - 1, 0, r.endLine - 1, editor.document.lineAt(Math.min(r.endLine - 1, editor.document.lineCount - 1)).text.length));
    editor.setDecorations(deco(p.id), rs);
  }
}

function cfg() {
  return vscode.workspace.getConfiguration('maidCafe');
}

async function pickColor(placeHolder: string, only?: ColorId[]): Promise<ColorId | undefined> {
  const items = PALETTE.filter((p) => !only || only.includes(p.id)).map((p) => ({ label: `$(circle-filled) ${p.label}`, id: p.id as ColorId, description: store.byColor(p.id).length ? `${store.byColor(p.id).length} range(s)` : '' }));
  return (await vscode.window.showQuickPick(items, { placeHolder }))?.id;
}

async function getKey(ctx: vscode.ExtensionContext, p: ProviderId): Promise<string | undefined> {
  const meta = PROVIDERS.find((x) => x.id === p)!;
  if (!meta.needsKey) return '';
  let k = await ctx.secrets.get(`maidCafe.key.${p}`);
  if (!k) {
    k = await vscode.window.showInputBox({ prompt: `API key for ${meta.label} (stored in VS Code's secret storage; you contract with the provider yourself)`, password: true, ignoreFocusOut: true });
    if (k) await ctx.secrets.store(`maidCafe.key.${p}`, k.trim());
  }
  return k?.trim();
}

const conversation = new Conversation();
let panel: vscode.WebviewPanel | undefined;
let lastRanges: MarkedRange[] = [];
let lastAnswer: string | undefined;
let lastTranslation: { lang: Language; text: string } | undefined;

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

/** 会話全体を 1 つのパネルに表示する。 */
function showConversation(title: string): void {
  if (!panel) {
    panel = vscode.window.createWebviewPanel('maidCafeAnswer', title, { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true }, { enableScripts: false });
    panel.onDidDispose(() => (panel = undefined));
  }
  panel.title = title;
  const body = conversation
    .all()
    .map((t) => `<h4>${t.role === 'user' ? 'You' : 'AI'}</h4><pre style="white-space:pre-wrap;font-family:var(--vscode-editor-font-family)">${esc(t.content)}</pre>`)
    .join('');
  const tr = lastTranslation ? `<h4>${esc(lastTranslation.lang.native)}</h4><pre style="white-space:pre-wrap;font-family:var(--vscode-editor-font-family)">${esc(lastTranslation.text)}</pre>` : '';
  panel.webview.html = `<!doctype html><html><body style="font-family:var(--vscode-font-family);padding:12px">${body}${tr}<p><i>Maid Cafe: Ask a follow-up question</i></p></body></html>`;
}

/** 質問を送って答えを返す(失敗時は undefined)。続きの質問は conversation に積む。 */
interface AskOpts {
  extraSystem?: string;
  personal?: boolean;
}

async function ask(ctx: vscode.ExtensionContext, ranges: MarkedRange[], questionArg?: string, followUp = false, opts: AskOpts = {}): Promise<string | undefined> {
  if (!ranges.length) {
    vscode.window.showInformationMessage('No code is marked. Select code and run "Maid Cafe: Mark selection with a colour" first.');
    return undefined;
  }
  const question = questionArg ?? (await vscode.window.showInputBox({ prompt: followUp ? 'Follow-up question' : 'Question for the AI', ignoreFocusOut: true }));
  if (!question) return undefined;
  const provider = cfg().get<ProviderId>('provider', 'aruaru');
  const key = await getKey(ctx, provider);
  if (key === undefined || (PROVIDERS.find((p) => p.id === provider)!.needsKey && !key)) return undefined;
  const bp = buildPrompt({ question, ranges, redactSecrets: cfg().get('redactSecrets', true), maxChars: cfg().get('maxContextChars', 12000), language: vscode.env.language, redactPersonal: opts.personal ?? false, extraSystem: opts.extraSystem });
  if (cfg().get('confirmBeforeSend', true)) {
    const ok = await vscode.window.showWarningMessage(`Send ${bp.sentChars} characters of code to ${provider}${bp.truncated ? ' (truncated)' : ''}?`, { modal: true }, 'Send');
    if (ok !== 'Send') return undefined;
  }
  if (!followUp) conversation.clear();
  lastRanges = ranges;
  const models = cfg().get<Record<string, string>>('models', {});
  const req = buildRequest({ provider, key, model: models[provider], system: bp.system, user: followUp ? question : bp.user, aruaruUrl: cfg().get('aruaruUrl'), history: conversation.all() });
  return vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: `Asking ${provider}…` }, async () => {
    try {
      const res = await fetch(req.url, { method: 'POST', headers: req.headers, body: req.body });
      const text = await res.text();
      if (!res.ok) {
        vscode.window.showErrorMessage(explainError(res.status, text));
        return undefined;
      }
      const ans = parseResponse(provider, JSON.parse(text));
      if (!ans) {
        vscode.window.showErrorMessage('The answer could not be read (unexpected format).');
        return undefined;
      }
      conversation.add('user', followUp ? question : `${bp.user}`);
      conversation.add('assistant', ans);
      lastAnswer = ans;
      lastTranslation = undefined;
      const third = thirdLanguage();
      if (third) {
        const t = await translateText(ctx, ans, third);
        if (t) lastTranslation = { lang: third, text: t };
      }
      showConversation(`AI: ${provider}`);
      return ans;
    } catch (e) {
      vscode.window.showErrorMessage(`Network error: ${(e as Error).message}`);
      return undefined;
    }
  });
}

/** 今の選択を、行全体に広げた範囲として取る。 */
function wholeLineSelection(ed: vscode.TextEditor): { range: MarkedRange; uri: vscode.Uri } {
  const sel = ed.selection;
  const start = sel.start.line;
  const end = sel.end.character === 0 && sel.end.line > start ? sel.end.line - 1 : sel.end.line;
  const text = ed.document.getText(new vscode.Range(start, 0, end, ed.document.lineAt(end).text.length));
  return { uri: ed.document.uri, range: { id: 0, color: 'yellow', file: vscode.workspace.asRelativePath(ed.document.uri), startLine: start + 1, endLine: end + 1, text } };
}

const proposals = new Map<string, string>();
const SCHEME = 'maidcafe-proposal';

/** AI の修正案を差分で見せ、承認されたら適用する。 */
async function proposeFix(uri: vscode.Uri, startLine: number, endLine: number, oldText: string, answer: string, autoApply: boolean): Promise<'applied' | 'rejected' | 'stale' | 'no-code'> {
  const code = extractCodeBlock(answer);
  if (code === null) {
    vscode.window.showWarningMessage('The answer has no code block to apply.');
    return 'no-code';
  }
  const doc = await vscode.workspace.openTextDocument(uri);
  const next = replaceLines(doc.getText(), startLine, endLine, code, oldText);
  if (next === null) {
    vscode.window.showWarningMessage('The code changed since the question was asked; the proposal was not applied.');
    return 'stale';
  }
  const key = `${uri.path}#${Date.now()}`;
  proposals.set(key, next);
  const right = vscode.Uri.from({ scheme: SCHEME, path: uri.path, query: key });
  if (!autoApply) {
    await vscode.commands.executeCommand('vscode.diff', uri, right, `AI proposal: ${vscode.workspace.asRelativePath(uri)}`);
    const ok = await vscode.window.showInformationMessage('Apply the AI proposal to this file?', { modal: true }, 'Apply');
    if (ok !== 'Apply') return 'rejected';
  }
  const edit = new vscode.WorkspaceEdit();
  edit.replace(uri, new vscode.Range(0, 0, doc.lineCount, 0), next);
  const done = await vscode.workspace.applyEdit(edit);
  return done ? 'applied' : 'rejected';
}

async function runAction(ctx: vscode.ExtensionContext, id: ActionId, autoApply = false): Promise<unknown> {
  const ed = vscode.window.activeTextEditor;
  if (!ed || ed.selection.isEmpty) {
    vscode.window.showInformationMessage('Select some code first.');
    return undefined;
  }
  const { range, uri } = wholeLineSelection(ed);
  const ans = await ask(ctx, [range], ACTIONS[id].question);
  if (ans === undefined) return undefined;
  if (id === 'fix') return proposeFix(uri, range.startLine, range.endLine, range.text, ans, autoApply);
  return ans;
}

// ---- 第3言語の翻訳と、メイドカフェ英会話 ----
const cafeConv = new Conversation(16);
let cafePanel: vscode.WebviewPanel | undefined;
const cafeLog: { who: string; body: string }[] = [];

function thirdLanguage(): Language | undefined {
  const v = cfg().get<string>('thirdLanguage', '');
  return v ? findLanguage(v) : undefined;
}

/** 1 回の問い合わせ(範囲や確認ダイアログなし)。失敗は undefined。 */
async function callProvider(ctx: vscode.ExtensionContext, provider: ProviderId, system: string, user: string, history: Turn[] = [], maxTokens = 2048, promptKey = false): Promise<string | undefined> {
  const meta = PROVIDERS.find((p) => p.id === provider)!;
  let key = '';
  if (meta.needsKey) {
    key = (promptKey ? await getKey(ctx, provider) : await ctx.secrets.get(`maidCafe.key.${provider}`)) ?? '';
    if (!key) return undefined;
  }
  const models = cfg().get<Record<string, string>>('models', {});
  const req = buildRequest({ provider, key, model: models[provider], system, user, history, maxTokens, aruaruUrl: cfg().get('aruaruUrl') });
  try {
    const res = await fetch(req.url, { method: 'POST', headers: req.headers, body: req.body, signal: AbortSignal.timeout(60000) });
    const text = await res.text();
    if (!res.ok) {
      vscode.window.showErrorMessage(explainError(res.status, text));
      return undefined;
    }
    return parseResponse(provider, JSON.parse(text)) ?? undefined;
  } catch (e) {
    vscode.window.showErrorMessage(`Network error: ${(e as Error).message}`);
    return undefined;
  }
}

/** 無料(aruaru)の結果が悪そうなら、利用者が自分で契約した AI(鍵が保存済みのもの)に切り替える。 */
function fallbackProvider(): ProviderId | undefined {
  const f = cfg().get<string>('translateFallbackProvider', '');
  return f && f !== 'aruaru' ? (f as ProviderId) : undefined;
}

async function translateOne(ctx: vscode.ExtensionContext, text: string, target: Language): Promise<string | undefined> {
  const provider = cfg().get<ProviderId>('provider', 'aruaru');
  const run = async (p: ProviderId): Promise<string | undefined> => {
    const meta = PROVIDERS.find((x) => x.id === p)!;
    const key = meta.needsKey ? ((await ctx.secrets.get(`maidCafe.key.${p}`)) ?? '') : '';
    if (meta.needsKey && !key) return undefined;
    const models = cfg().get<Record<string, string>>('models', {});
    const req = buildTranslateRequest({ provider: p, key, model: models[p], aruaruUrl: cfg().get('aruaruUrl'), text, target });
    try {
      const res = await fetch(req.url, { method: 'POST', headers: req.headers, body: req.body, signal: AbortSignal.timeout(60000) });
      if (!res.ok) return undefined;
      return parseTranslateResponse(p, await res.json()) ?? undefined;
    } catch {
      return undefined;
    }
  };
  let out = await run(provider);
  if (provider === 'aruaru' && looksPoor(text, out, target)) {
    const fb = fallbackProvider();
    if (fb) out = (await run(fb)) ?? out;
  }
  return out;
}

/** 文章だけを第 3 言語へ(コードブロックは訳さない)。 */
async function translateText(ctx: vscode.ExtensionContext, text: string, target: Language): Promise<string | undefined> {
  return translateKeepingCode(text, (prose) => translateOne(ctx, prose, target));
}

function showCafe(): void {
  if (!cafePanel) {
    cafePanel = vscode.window.createWebviewPanel('maidCafeEnglish', 'Maid Cafe English', { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true }, { enableScripts: false });
    cafePanel.onDidDispose(() => (cafePanel = undefined));
  }
  const body = cafeLog.map((l) => `<h4>${esc(l.who)}</h4><pre style="white-space:pre-wrap;font-family:var(--vscode-font-family)">${esc(l.body)}</pre>`).join('');
  cafePanel.webview.html = `<!doctype html><html><body style="font-family:var(--vscode-font-family);padding:12px"><h3>☕ Maid Cafe English</h3>${body}<p><i>Run "Maid Cafe: English conversation (maid cafe)" to continue.</i></p></body></html>`;
}

/** メイドカフェ英会話の 1 往復。 */
async function englishCafe(ctx: vscode.ExtensionContext, messageArg?: string): Promise<string | undefined> {
  const message = messageArg ?? (await vscode.window.showInputBox({ prompt: 'Say something to the maid (English or Japanese)', ignoreFocusOut: true }));
  if (!message) return undefined;
  const level = cfg().get<EnglishLevel>('englishLevel', 'beginner');
  const third = thirdLanguage();
  const system = englishCafeSystem(level, true);
  const user = cfg().get('redactSecrets', true) ? redactSecrets(message) : message;
  const provider = cfg().get<ProviderId>('provider', 'aruaru');
  let reply = await callProvider(ctx, provider, system, user, cafeConv.all(), 512, true);
  if (provider === 'aruaru' && looksPoor(message, reply, findLanguage('en')!)) {
    const fb = fallbackProvider();
    if (fb) reply = (await callProvider(ctx, fb, system, user, cafeConv.all(), 512)) ?? reply;
  }
  if (!reply) return undefined;
  cafeConv.add('user', user);
  cafeConv.add('assistant', reply);
  const parsed = parseCafeReply(reply);
  cafeLog.push({ who: 'You', body: message });
  const lines = [`Maid: ${parsed.maid}`];
  if (parsed.correction) lines.push(`✏ Correction: ${parsed.correction}`);
  if (parsed.ja) lines.push(`日本語: ${parsed.ja}`);
  if (third) {
    const t = await translateText(ctx, parsed.maid, third);
    if (t) lines.push(`${third.native}: ${t}`);
  }
  cafeLog.push({ who: 'Maid', body: lines.join('\n') });
  showCafe();
  return reply;
}

// ---- 案件の取り込みと 設計→開発→DEBUG ----
const ARURAU_URL = 'https://audiocafe.tokyo/aruaru';

function wsRoot(): vscode.Uri | undefined {
  return vscode.workspace.workspaceFolders?.[0]?.uri;
}
const enc = new TextEncoder();
const dec = new TextDecoder();

async function writeProjectFile(name: string, rel: string, text: string): Promise<vscode.Uri> {
  const root = wsRoot();
  if (!root) throw new Error('Open a folder first (projects are saved in .maid-cafe/projects/ inside the workspace).');
  const uri = vscode.Uri.joinPath(root, projectDir(name), rel);
  await vscode.workspace.fs.createDirectory(vscode.Uri.joinPath(uri, '..'));
  await vscode.workspace.fs.writeFile(uri, enc.encode(text));
  return uri;
}

async function readIfExists(uri: vscode.Uri): Promise<string | undefined> {
  try {
    return dec.decode(await vscode.workspace.fs.readFile(uri));
  } catch {
    return undefined;
  }
}

/** 利用者が貼った URL を、確認のあと 1 回だけ GET する(ログインや連打はしない)。 */
async function fetchOnce(raw: string, confirm: boolean): Promise<string | undefined> {
  const c = checkFetchUrl(raw);
  if (!c.ok) {
    vscode.window.showWarningMessage(c.reason);
    return undefined;
  }
  if (confirm) {
    const ok = await vscode.window.showWarningMessage(`Fetch this page once (GET, no login, no cookies)?\n${c.url}`, { modal: true }, 'Fetch');
    if (ok !== 'Fetch') return undefined;
  }
  const res = await fetch(c.url, { redirect: 'follow', signal: AbortSignal.timeout(15000), headers: { 'user-agent': 'maid-cafe-vsc (user-requested single fetch)' } });
  if (res.status === 401 || res.status === 403) {
    vscode.window.showWarningMessage(`The page needs a login (${res.status}); it was not fetched. Copy the text and use "Paste text" instead.`);
    return undefined;
  }
  if (!res.ok) {
    vscode.window.showWarningMessage(`Fetch failed (${res.status}).`);
    return undefined;
  }
  const type = res.headers.get('content-type') ?? '';
  if (!/text\/|json|xml/.test(type)) {
    vscode.window.showWarningMessage(`Unsupported content type (${type || 'unknown'}); only text/HTML pages are read.`);
    return undefined;
  }
  const body = (await res.text()).slice(0, 1_000_000);
  return /html/.test(type) ? htmlToText(body) : body;
}

async function currentProject(ctx: vscode.ExtensionContext): Promise<string | undefined> {
  return ctx.workspaceState.get<string>('maidCafe.project');
}

interface ImportArgs {
  name?: string;
  kind?: 'url' | 'text' | 'file' | 'bytes';
  value?: string | vscode.Uri;
  /** kind='bytes'(Webview へのドロップ)のときのファイル名と中身。 */
  fileName?: string;
  data?: Uint8Array;
  noConfirm?: boolean;
}

/** ファイルの中身を文章にする。画像だけの PDF は aruaru-llm の OCR(版なし Connect)で読む。失敗は警告で知らせる。 */
async function readMaterial(name: string, bytes: Uint8Array): Promise<string | undefined> {
  if (fileKind(name) === 'unsupported') {
    vscode.window.showWarningMessage(`Supported files: md, txt, docx, pdf (${name.split(/[\\/]/).pop()}).`);
    return undefined;
  }
  try {
    return await extractText(name, bytes, (images) => Promise.resolve(
      vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: `Maid Cafe: reading ${images.length} scanned page(s) with OCR...` }, () => ocrImages(cfg().get<string>('aruaruUrl'), images))),
    );
  } catch (e) {
    vscode.window.showWarningMessage('Could not read the file: ' + (e as Error).message);
    return undefined;
  }
}

type DropItem = { uri?: vscode.Uri; name?: string; data?: Uint8Array };

/** ドロップされた複数ファイルを取り込む(エクスプローラー・OS・Webview から)。 */
async function importDropped(ctx: vscode.ExtensionContext, items: DropItem[], name?: string): Promise<string[]> {
  const out: string[] = [];
  if (!items.length) return out;
  const project = name ?? (await currentProject(ctx)) ?? (await vscode.window.showInputBox({ prompt: 'Project name (folder under .maid-cafe/projects/)', ignoreFocusOut: true }));
  if (!project) return out;
  for (const it of items) {
    const r = it.uri
      ? await importMaterial(ctx, { name: project, kind: 'file', value: it.uri })
      : await importMaterial(ctx, { name: project, kind: 'bytes', fileName: it.name, data: it.data });
    if (r) out.push(r);
  }
  return out;
}

/** Webview から届いたドロップの中身を取り込み用の形にする(ファイル実体と uri-list の両方)。 */
function dropMessageToItems(m: { files?: { name: string; data: number[] }[]; uris?: string[] }): DropItem[] {
  return [...(m.uris ?? []).map((u) => ({ uri: vscode.Uri.parse(u) })), ...(m.files ?? []).map((f) => ({ name: f.name, data: Uint8Array.from(f.data) }))];
}

let dropPanel: vscode.WebviewPanel | undefined;
/** ドロップ用の Webview(ファイルをここへドラッグ&ドロップすると案件資料として取り込む)。 */
function openDropPanel(ctx: vscode.ExtensionContext): vscode.WebviewPanel {
  if (dropPanel) {
    dropPanel.reveal();
    return dropPanel;
  }
  dropPanel = vscode.window.createWebviewPanel('maidCafeDrop', 'Maid Cafe: Drop job files', vscode.ViewColumn.Beside, { enableScripts: true });
  dropPanel.onDidDispose(() => (dropPanel = undefined));
  const nonce = Math.random().toString(36).slice(2);
  dropPanel.webview.html = `<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';"></head>
<body style="font-family:var(--vscode-font-family);padding:12px">
<div id="z" style="border:2px dashed var(--vscode-focusBorder);padding:40px;text-align:center">Drop md / txt / docx / pdf files here<br>(scanned PDFs are read with OCR)<br><small>From the VS Code explorer, hold Shift while dropping.</small></div>
<p id="s"></p>
<script nonce="${nonce}">
const vs = acquireVsCodeApi(); const z = document.getElementById('z'); const st = document.getElementById('s');
for (const ev of ['dragenter','dragover']) z.addEventListener(ev, e => { e.preventDefault(); z.style.opacity = .6; });
z.addEventListener('dragleave', () => z.style.opacity = 1);
z.addEventListener('drop', async e => {
  e.preventDefault(); z.style.opacity = 1;
  const files = [...(e.dataTransfer.files || [])];
  const uris = (e.dataTransfer.getData('text/uri-list') || '').split(/\\r?\\n/).filter(u => u && !u.startsWith('#'));
  const payload = [];
  for (const f of files) payload.push({ name: f.name, data: [...new Uint8Array(await f.arrayBuffer())] });
  if (!payload.length && !uris.length) { st.textContent = 'Nothing to import.'; return; }
  st.textContent = 'Importing...'; vs.postMessage({ type: 'drop', files: payload, uris: payload.length ? [] : uris });
});
window.addEventListener('message', e => { if (e.data.type === 'done') st.textContent = e.data.text; });
</script></body></html>`;
  dropPanel.webview.onDidReceiveMessage(
    async (m: { type: string; files?: { name: string; data: number[] }[]; uris?: string[] }) => {
      if (m.type !== 'drop') return;
      const items = dropMessageToItems(m);
      const r = await importDropped(ctx, items);
      dropPanel?.webview.postMessage({ type: 'done', text: `Imported ${r.length} of ${items.length} file(s).` });
    },
    undefined,
    ctx.subscriptions,
  );
  return dropPanel;
}

/** エクスプローラー(または OS)からのドロップを受ける小さなビュー。 */
class DropZoneController implements vscode.TreeDataProvider<string>, vscode.TreeDragAndDropController<string> {
  readonly dropMimeTypes = ['text/uri-list', 'files'];
  readonly dragMimeTypes: string[] = [];
  constructor(private ctx: vscode.ExtensionContext) {}
  getTreeItem(e: string): vscode.TreeItem {
    const t = new vscode.TreeItem(e);
    t.command = { command: 'maidCafe.project.dropPanel', title: e };
    return t;
  }
  getChildren(): string[] {
    return ['Drop job files here (md, txt, docx, pdf)'];
  }
  async handleDrop(_t: string | undefined, dt: vscode.DataTransfer): Promise<void> {
    await importDropped(this.ctx, await dataTransferToItems(dt));
  }
}

/** DataTransfer(uri-list または OS からのファイル)を取り込み用の形にする。 */
async function dataTransferToItems(dt: vscode.DataTransfer): Promise<DropItem[]> {
  const items: DropItem[] = [];
  const list = await dt.get('text/uri-list')?.asString();
  for (const u of (list ?? '').split(/\r?\n/)) if (u.trim() && !u.startsWith('#')) items.push({ uri: vscode.Uri.parse(u.trim()) });
  if (items.length) return items;
  const files: vscode.DataTransferFile[] = [];
  dt.forEach((v) => {
    const f = v.asFile();
    if (f) files.push(f);
  });
  for (const f of files) items.push(f.uri ? { uri: f.uri } : { name: f.name, data: await f.data() });
  return items;
}

async function importMaterial(ctx: vscode.ExtensionContext, a: ImportArgs = {}): Promise<string | undefined> {
  if (!wsRoot()) {
    vscode.window.showWarningMessage('Open a folder first.');
    return undefined;
  }
  const kind =
    a.kind ??
    (
      await vscode.window.showQuickPick(
        [
          { label: 'Paste a URL', id: 'url' as const, description: 'fetched once after you confirm' },
          { label: 'Paste text (from the clipboard)', id: 'text' as const },
          { label: 'Choose a file (md / txt / docx / pdf)', id: 'file' as const, description: 'text is extracted locally; scanned PDFs (images) are not read' },
        ],
        { placeHolder: 'Import job / project information' },
      )
    )?.id;
  if (!kind) return undefined;
  const name = a.name ?? (await vscode.window.showInputBox({ prompt: 'Project name (folder under .maid-cafe/projects/)', value: (await currentProject(ctx)) ?? '', ignoreFocusOut: true }));
  if (!name) return undefined;
  let text: string | undefined;
  let label: string = kind;
  if (kind === 'url') {
    const u = typeof a.value === 'string' ? a.value : await vscode.window.showInputBox({ prompt: 'URL of the job/project page (you paste it; it is fetched once)', ignoreFocusOut: true });
    if (!u) return undefined;
    text = await fetchOnce(u, !a.noConfirm);
  } else if (kind === 'text') {
    text = typeof a.value === 'string' ? a.value : await vscode.env.clipboard.readText();
  } else if (kind === 'bytes') {
    if (!a.fileName || !a.data) return undefined;
    label = 'file';
    text = await readMaterial(a.fileName, a.data);
    if (text === undefined) return undefined;
  } else {
    let f: vscode.Uri | undefined = a.value instanceof vscode.Uri ? a.value : undefined;
    f ??= (await vscode.window.showOpenDialog({ canSelectMany: false, filters: { 'Job info': ['md', 'txt', 'markdown', 'docx', 'pdf'] } }))?.[0];
    if (!f) return undefined;
    text = await readMaterial(f.path, await vscode.workspace.fs.readFile(f));
    if (text === undefined) return undefined;
  }
  if (!text || !text.trim()) {
    vscode.window.showWarningMessage('Nothing to import.');
    return undefined;
  }
  const srcDir = vscode.Uri.joinPath(wsRoot()!, projectDir(name), 'source');
  const n = (await vscode.workspace.fs.readDirectory(srcDir).then((x) => x.length, () => 0)) + 1;
  const uri = await writeProjectFile(name, `source/${String(n).padStart(2, '0')}-${label}.md`, importHeader(text, label) + text);
  await ctx.workspaceState.update('maidCafe.project', slugify(name));
  vscode.window.showInformationMessage(`Imported into ${vscode.workspace.asRelativePath(uri)}`);
  return uri.toString();
}

/** 案件の資料と、これまでの成果物(要件・設計・タスク)を範囲の形にそろえる。 */
async function projectContext(name: string): Promise<MarkedRange[]> {
  const dir = vscode.Uri.joinPath(wsRoot()!, projectDir(name));
  const out: MarkedRange[] = [];
  let id = 1;
  const add = (file: string, text: string) => out.push({ id: id++, color: 'blue', file, startLine: 1, endLine: Math.max(1, text.split('\n').length), text });
  for (const f of ['requirements.md', 'design.md', 'tasks.md']) {
    const t = await readIfExists(vscode.Uri.joinPath(dir, f));
    if (t) add(`${projectDir(name)}/${f}`, t);
  }
  const src = await vscode.workspace.fs.readDirectory(vscode.Uri.joinPath(dir, 'source')).then((x) => x.map((e) => e[0]).sort(), () => [] as string[]);
  for (const f of src) add(`${projectDir(name)}/source/${f}`, dec.decode(await vscode.workspace.fs.readFile(vscode.Uri.joinPath(dir, 'source', f))));
  return out;
}

interface StageArgs {
  stage?: Stage;
  input?: string; // 実装したい内容 / 貼り付けるエラー・ログ
  autoApply?: boolean;
}

async function runStage(ctx: vscode.ExtensionContext, a: StageArgs = {}): Promise<unknown> {
  const name = await currentProject(ctx);
  if (!name) {
    vscode.window.showInformationMessage('Import job/project information first ("Maid Cafe: Import job / project information").');
    return undefined;
  }
  const stage = a.stage ?? (await vscode.window.showQuickPick(Object.entries(STAGES).map(([id, st]) => ({ label: st.label, id: id as Stage })), { placeHolder: 'Which step?' }))?.id;
  if (!stage) return undefined;
  const s = STAGES[stage];
  let input = a.input;
  const ed = vscode.window.activeTextEditor;
  let target: { range: MarkedRange; uri: vscode.Uri } | undefined;
  const code: MarkedRange[] = [];
  if (ed && !ed.selection.isEmpty && (stage === 'implement' || stage === 'review' || stage === 'debug')) {
    target = wholeLineSelection(ed);
    code.push(target.range);
  }
  code.push(...store.all().slice(0, 5)); // 色つき範囲も文脈に加える
  if (stage === 'implement' || stage === 'debug') {
    input ??= await vscode.window.showInputBox({ prompt: stage === 'debug' ? 'Paste the error or log' : 'What should be implemented? (a task from tasks.md)', ignoreFocusOut: true });
    if (!input) return undefined;
  }
  const question = input ? `${s.ask}\n\nUser input:\n${cfg().get('redactSecrets', true) ? redactSecrets(input) : input}` : s.ask;
  const ans = await ask(ctx, [...code, ...(await projectContext(name))], question, false, {
    personal: cfg().get('redactPersonal', true),
    extraSystem: learningInstruction(stage, cfg().get('learningMode', true)),
  });
  if (ans === undefined) return undefined;
  if (s.file) {
    const uri = await writeProjectFile(name, s.file, ans);
    await vscode.window.showTextDocument(uri, { preview: false, viewColumn: vscode.ViewColumn.Beside });
    return uri.toString();
  }
  if (target && (stage === 'implement' || stage === 'debug')) return proposeFix(target.uri, target.range.startLine, target.range.endLine, target.range.text, ans, a.autoApply ?? false);
  return ans;
}

export function activate(ctx: vscode.ExtensionContext): { store: RangeStore; lastAnswer: () => string | undefined } {
  const dropZone = new DropZoneController(ctx);
  // 初回だけ、はじめてのガイドを開く(試験中は開かない)。
  if (ctx.extensionMode !== vscode.ExtensionMode.Test && !ctx.globalState.get('maidCafe.welcomed')) {
    void ctx.globalState.update('maidCafe.welcomed', true);
    void vscode.commands.executeCommand('maidCafe.welcome');
  }
  ctx.subscriptions.push(
    vscode.workspace.registerTextDocumentContentProvider(SCHEME, { provideTextDocumentContent: (u) => proposals.get(u.query) ?? '' }),
    vscode.commands.registerCommand('maidCafe.paintSelection', async (colorArg?: ColorId) => {
      const ed = vscode.window.activeTextEditor;
      if (!ed || ed.selection.isEmpty) return;
      const c = colorArg ?? (await pickColor('Pick a colour for this range'));
      if (!c) return;
      for (const sel of ed.selections.filter((s) => !s.isEmpty)) {
        store.add(c, ed.document.uri.toString(), sel.start.line + 1, sel.end.line + 1, ed.document.getText(sel));
      }
      repaint(ed);
      return store.byColor(c).length;
    }),
    vscode.commands.registerCommand('maidCafe.askAboutColor', async (colorArg?: ColorId, question?: string) => {
      const used = store.colorsInUse();
      if (!used.length) return vscode.window.showInformationMessage('No colours are in use yet.');
      const c = colorArg ?? (await pickColor('Ask about which colour?', used));
      if (c) return ask(ctx, store.byColor(c), question);
    }),
    vscode.commands.registerCommand('maidCafe.askSelection', async (question?: string) => {
      const ed = vscode.window.activeTextEditor;
      if (!ed || ed.selection.isEmpty) return;
      return ask(ctx, [wholeLineSelection(ed).range], question);
    }),
    vscode.commands.registerCommand('maidCafe.followUp', async (question?: string) => {
      if (!conversation.length) return vscode.window.showInformationMessage('Ask a question first.');
      return ask(ctx, lastRanges, question, true);
    }),
    vscode.commands.registerCommand('maidCafe.explain', async () => runAction(ctx, 'explain')),
    vscode.commands.registerCommand('maidCafe.fix', async (opts?: { autoApply?: boolean }) => runAction(ctx, 'fix', opts?.autoApply ?? false)),
    vscode.commands.registerCommand('maidCafe.writeTests', async () => runAction(ctx, 'test')),
    vscode.commands.registerCommand('maidCafe.openArurau', () => vscode.env.openExternal(vscode.Uri.parse(cfg().get<string>('arurauPageUrl', ARURAU_URL)))),
    vscode.commands.registerCommand('maidCafe.project.import', (a?: ImportArgs | vscode.Uri) => importMaterial(ctx, a instanceof vscode.Uri ? { kind: 'file', value: a } : a)),
    vscode.commands.registerCommand('maidCafe.project.importDropped', (uris?: (vscode.Uri | string)[], name?: string) => importDropped(ctx, (uris ?? []).map((u) => ({ uri: typeof u === 'string' ? vscode.Uri.parse(u) : u })), name)),
    vscode.commands.registerCommand('maidCafe.project.dropPanel', () => {
      const p = openDropPanel(ctx);
      return { title: p.title, scripts: !!p.webview.options.enableScripts, hasDropZone: p.webview.html.includes('id="z"') };
    }),
    // 試験用(内部): Webview のドロップ内容・DataTransfer をそのまま渡して取り込む
    vscode.commands.registerCommand('maidCafe.project._dropMessage', (m: { files?: { name: string; data: number[] }[]; uris?: string[] }, name?: string) => importDropped(ctx, dropMessageToItems(m), name)),
    vscode.commands.registerCommand('maidCafe.project._handleDrop', async (dt: vscode.DataTransfer, name?: string) => importDropped(ctx, await dataTransferToItems(dt), name)),
    vscode.window.createTreeView('maidCafe.dropZone', { treeDataProvider: dropZone, dragAndDropController: dropZone }),
    vscode.commands.registerCommand('maidCafe.project.step', (a?: StageArgs) => runStage(ctx, a)),
    vscode.commands.registerCommand('maidCafe.selectThirdLanguage', async (code?: string) => {
      const l = code ? findLanguage(code) : (await vscode.window.showQuickPick(LANGUAGES.map((x) => ({ label: `${x.native} (${x.name})`, description: x.code, l: x })), { placeHolder: 'Third language (shown next to every answer)' }))?.l;
      if (l) await cfg().update('thirdLanguage', l.code, vscode.ConfigurationTarget.Global);
      return l?.code;
    }),
    vscode.commands.registerCommand('maidCafe.translateSelection', async (a?: { text?: string; to?: string }) => {
      const ed = vscode.window.activeTextEditor;
      const text = a?.text ?? (ed && !ed.selection.isEmpty ? ed.document.getText(ed.selection) : undefined);
      if (!text) return vscode.window.showInformationMessage('Select the text to translate (for example a school explanation).');
      const target = (a?.to ? findLanguage(a.to) : thirdLanguage()) ?? findLanguage('en')!;
      const out = await translateText(ctx, cfg().get('redactSecrets', true) ? redactSecrets(text) : text, target);
      if (out === undefined) {
        vscode.window.showWarningMessage('Translation failed (check the provider / aruaruUrl, or set a fallback provider).');
        return undefined;
      }
      const doc = await vscode.workspace.openTextDocument({ content: out, language: 'markdown' });
      await vscode.window.showTextDocument(doc, { viewColumn: vscode.ViewColumn.Beside, preview: true });
      return out;
    }),
    vscode.commands.registerCommand('maidCafe.englishCafe', (message?: string) => englishCafe(ctx, message)),
    vscode.commands.registerCommand('maidCafe.englishCafe.reset', () => {
      cafeConv.clear();
      cafeLog.length = 0;
    }),
    vscode.commands.registerCommand('maidCafe.welcome', () => vscode.commands.executeCommand('workbench.action.openWalkthrough', `${ctx.extension.id}#maidCafe.welcome`, false)),
    vscode.commands.registerCommand('maidCafe.clearColors', () => {
      store.clear();
      repaint(vscode.window.activeTextEditor);
    }),
    vscode.commands.registerCommand('maidCafe.setApiKey', async () => {
      const p = await vscode.window.showQuickPick(PROVIDERS.filter((x) => x.needsKey).map((x) => ({ label: x.label, id: x.id })), { placeHolder: 'Provider' });
      if (!p) return;
      await ctx.secrets.delete(`maidCafe.key.${p.id}`);
      await getKey(ctx, p.id);
    }),
    vscode.commands.registerCommand('maidCafe.selectProvider', async () => {
      const p = await vscode.window.showQuickPick(PROVIDERS.map((x) => ({ label: x.label, description: x.free ? 'free' : 'your own contract', id: x.id })), { placeHolder: 'AI provider' });
      if (p) await cfg().update('provider', p.id, vscode.ConfigurationTarget.Global);
    }),
    vscode.commands.registerCommand('maidCafe.openQA', () => vscode.env.openExternal(vscode.Uri.parse('https://maid-cafe.tokyo/'))),
    vscode.commands.registerCommand('maidCafe.openSchool', () => vscode.env.openExternal(vscode.Uri.parse('https://maid-cafe.tokyo/school/'))),
    vscode.window.onDidChangeActiveTextEditor(repaint),
    vscode.workspace.onDidChangeTextDocument((e) => {
      const file = e.document.uri.toString();
      for (const ch of e.contentChanges) {
        const delta = (ch.text.match(/\n/g)?.length ?? 0) - (ch.range.end.line - ch.range.start.line);
        if (delta) store.shift(file, ch.range.end.line + 1, delta);
      }
      repaint(vscode.window.visibleTextEditors.find((x) => x.document === e.document));
    }),
  );
  return { store, lastAnswer: () => lastAnswer };
}

export function deactivate(): void {
  for (const d of decos.values()) d.dispose();
}
