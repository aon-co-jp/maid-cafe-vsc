import * as vscode from 'vscode';
import { PALETTE, ColorId, RangeStore, MarkedRange } from './core/ranges';
import { Conversation } from './core/chat';
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
async function ask(ctx: vscode.ExtensionContext, ranges: MarkedRange[], questionArg?: string, followUp = false): Promise<string | undefined> {
  if (!ranges.length) {
    vscode.window.showInformationMessage('No code is marked. Select code and run "Maid Cafe: Mark selection with a colour" first.');
    return undefined;
  }
  const question = questionArg ?? (await vscode.window.showInputBox({ prompt: followUp ? 'Follow-up question' : 'Question for the AI', ignoreFocusOut: true }));
  if (!question) return undefined;
  const provider = cfg().get<ProviderId>('provider', 'aruaru');
  const key = await getKey(ctx, provider);
  if (key === undefined || (PROVIDERS.find((p) => p.id === provider)!.needsKey && !key)) return undefined;
  const bp = buildPrompt({ question, ranges, redactSecrets: cfg().get('redactSecrets', true), maxChars: cfg().get('maxContextChars', 12000), language: vscode.env.language });
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
