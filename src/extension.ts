import * as vscode from 'vscode';
import { PALETTE, ColorId, RangeStore } from './core/ranges';
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

function showAnswer(title: string, question: string, answer: string): void {
  const panel = vscode.window.createWebviewPanel('maidCafeAnswer', title, vscode.ViewColumn.Beside, { enableScripts: false });
  const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
  panel.webview.html = `<!doctype html><html><body style="font-family:var(--vscode-font-family);padding:12px"><h3>${esc(question)}</h3><pre style="white-space:pre-wrap;font-family:var(--vscode-editor-font-family)">${esc(answer)}</pre></body></html>`;
}

async function ask(ctx: vscode.ExtensionContext, ranges: ReturnType<RangeStore['all']>): Promise<void> {
  if (!ranges.length) {
    vscode.window.showInformationMessage('No code is marked. Select code and run "Maid Cafe: Mark selection with a colour" first.');
    return;
  }
  const question = await vscode.window.showInputBox({ prompt: 'Question for the AI', ignoreFocusOut: true });
  if (!question) return;
  const provider = cfg().get<ProviderId>('provider', 'aruaru');
  const key = await getKey(ctx, provider);
  if (key === undefined || (PROVIDERS.find((p) => p.id === provider)!.needsKey && !key)) return;
  const bp = buildPrompt({ question, ranges, redactSecrets: cfg().get('redactSecrets', true), maxChars: cfg().get('maxContextChars', 12000), language: vscode.env.language });
  if (cfg().get('confirmBeforeSend', true)) {
    const ok = await vscode.window.showWarningMessage(`Send ${bp.sentChars} characters of code to ${provider}${bp.truncated ? ' (truncated)' : ''}?`, { modal: true }, 'Send');
    if (ok !== 'Send') return;
  }
  const models = cfg().get<Record<string, string>>('models', {});
  const req = buildRequest({ provider, key, model: models[provider], system: bp.system, user: bp.user, aruaruUrl: cfg().get('aruaruUrl') });
  await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: `Asking ${provider}…` }, async () => {
    try {
      const res = await fetch(req.url, { method: 'POST', headers: req.headers, body: req.body });
      const text = await res.text();
      if (!res.ok) {
        vscode.window.showErrorMessage(explainError(res.status, text));
        return;
      }
      const ans = parseResponse(provider, JSON.parse(text));
      if (!ans) vscode.window.showErrorMessage('The answer could not be read (unexpected format).');
      else showAnswer(`AI: ${provider}`, question, ans);
    } catch (e) {
      vscode.window.showErrorMessage(`Network error: ${(e as Error).message}`);
    }
  });
}

export function activate(ctx: vscode.ExtensionContext): void {
  ctx.subscriptions.push(
    vscode.commands.registerCommand('maidCafe.paintSelection', async () => {
      const ed = vscode.window.activeTextEditor;
      if (!ed || ed.selection.isEmpty) return;
      const c = await pickColor('Pick a colour for this range');
      if (!c) return;
      for (const sel of ed.selections.filter((s) => !s.isEmpty)) {
        store.add(c, ed.document.uri.toString(), sel.start.line + 1, sel.end.line + 1, ed.document.getText(sel));
      }
      repaint(ed);
    }),
    vscode.commands.registerCommand('maidCafe.askAboutColor', async () => {
      const used = store.colorsInUse();
      if (!used.length) return vscode.window.showInformationMessage('No colours are in use yet.');
      const c = await pickColor('Ask about which colour?', used);
      if (c) await ask(ctx, store.byColor(c));
    }),
    vscode.commands.registerCommand('maidCafe.askSelection', async () => {
      const ed = vscode.window.activeTextEditor;
      if (!ed || ed.selection.isEmpty) return;
      const sel = ed.selection;
      await ask(ctx, [{ id: 0, color: 'yellow', file: vscode.workspace.asRelativePath(ed.document.uri), startLine: sel.start.line + 1, endLine: sel.end.line + 1, text: ed.document.getText(sel) }]);
    }),
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
}

export function deactivate(): void {
  for (const d of decos.values()) d.dispose();
}
