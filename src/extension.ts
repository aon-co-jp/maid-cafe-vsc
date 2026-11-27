import * as vscode from 'vscode';
import { PALETTE, ColorId, RangeStore, MarkedRange } from './core/ranges';
import { Conversation } from './core/chat';
import { Stage, STAGES, learningInstruction, checkFetchUrl, htmlToText, projectDir, slugify } from './core/project';
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

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

/** 会話全体を 1 つのパネルに表示する。 */
function showConversation(title: string): void {
  if (!panel) {
    panel = vscode.window.createWebviewPanel('maidCafeAnswer', title, vscode.ViewColumn.Beside, { enableScripts: false });
    panel.onDidDispose(() => (panel = undefined));
  }
  panel.title = title;
  const body = conversation
    .all()
    .map((t) => `<h4>${t.role === 'user' ? 'You' : 'AI'}</h4><pre style="white-space:pre-wrap;font-family:var(--vscode-editor-font-family)">${esc(t.content)}</pre>`)
    .join('');
  panel.webview.html = `<!doctype html><html><body style="font-family:var(--vscode-font-family);padding:12px">${body}<p><i>Maid Cafe: Ask a follow-up question</i></p></body></html>`;
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
  kind?: 'url' | 'text' | 'file';
  value?: string | vscode.Uri;
  noConfirm?: boolean;
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
          { label: 'Choose a file (md / txt)', id: 'file' as const, description: 'pdf / docx: not supported yet' },
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
  } else {
    let f: vscode.Uri | undefined = a.value instanceof vscode.Uri ? a.value : undefined;
    f ??= (await vscode.window.showOpenDialog({ canSelectMany: false, filters: { 'Text / Markdown': ['md', 'txt', 'markdown'] } }))?.[0];
    if (!f) return undefined;
    if (!/\.(md|markdown|txt)$/i.test(f.path)) {
      vscode.window.showWarningMessage('Only .md / .txt can be imported for now (pdf and docx are not supported yet).');
      return undefined;
    }
    text = dec.decode(await vscode.workspace.fs.readFile(f));
  }
  if (!text || !text.trim()) {
    vscode.window.showWarningMessage('Nothing to import.');
    return undefined;
  }
  const srcDir = vscode.Uri.joinPath(wsRoot()!, projectDir(name), 'source');
  const n = (await vscode.workspace.fs.readDirectory(srcDir).then((x) => x.length, () => 0)) + 1;
  const uri = await writeProjectFile(name, `source/${String(n).padStart(2, '0')}-${label}.md`, text);
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
    vscode.commands.registerCommand('maidCafe.project.step', (a?: StageArgs) => runStage(ctx, a)),
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
