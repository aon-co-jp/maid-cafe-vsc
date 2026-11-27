const assert = require('node:assert');
const http = require('node:http');
const path = require('node:path');
const vscode = require('vscode');

suite('maid-cafe-vsc in real VS Code', () => {
  let server;
  const received = [];
  let port;
  suiteSetup(async () => {
    // 疑似 aruaru-llm(Connect 形式、応答は {completion,...})。外には出ない。
    server = http.createServer((req, res) => {
      let b = '';
      req.on('data', (c) => (b += c));
      req.on('end', () => {
        received.push({ url: req.url, body: JSON.parse(b) });
        const fixed = 'Fixed the operator.\n```js\nfunction add(a, b) {\n  return a + b;\n}\n```';
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify({ completion: received.length === 2 ? 'follow-up ok' : fixed, engine: 'mock', disclosure: 'mock' }));
      });
    });
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    port = server.address().port;
    const cfg = vscode.workspace.getConfiguration('maidCafe');
    await cfg.update('aruaruUrl', `http://127.0.0.1:${port}`, vscode.ConfigurationTarget.Global);
    await cfg.update('confirmBeforeSend', false, vscode.ConfigurationTarget.Global);
    await vscode.extensions.getExtension('aon-co-jp.maid-cafe-vsc').activate();
  });
  suiteTeardown(() => server && server.close());

  test('commands are registered', async () => {
    const all = await vscode.commands.getCommands(true);
    for (const c of ['paintSelection', 'askAboutColor', 'askSelection', 'followUp', 'explain', 'fix', 'writeTests']) assert.ok(all.includes(`maidCafe.${c}`), c);
  });

  test('paint -> ask -> follow-up -> fix with diff apply', async () => {
    const file = vscode.Uri.file(path.resolve(__dirname, '../fixture/sample.js'));
    const doc = await vscode.workspace.openTextDocument(file);
    const ed = await vscode.window.showTextDocument(doc);
    ed.selection = new vscode.Selection(0, 0, 2, 1);
    assert.strictEqual(await vscode.commands.executeCommand('maidCafe.paintSelection', 'red'), 1);

    const a1 = await vscode.commands.executeCommand('maidCafe.askAboutColor', 'red', 'What is wrong?');
    assert.ok(a1.includes('Fixed the operator'));
    assert.strictEqual(received[0].url, '/aruaru_llm.Llm/Generate');
    assert.ok(received[0].body.prompt.includes('sample.js:1-3'));
    assert.ok(received[0].body.max_new_tokens <= 128);

    const a2 = await vscode.commands.executeCommand('maidCafe.followUp', 'And now?');
    assert.strictEqual(a2, 'follow-up ok');
    assert.ok(received[1].body.prompt.includes('What is wrong?') && received[1].body.prompt.includes('Fixed the operator'), 'history is sent');

    const original = doc.getText();
    try {
      const r = await vscode.commands.executeCommand('maidCafe.fix', { autoApply: true });
      assert.strictEqual(r, 'applied');
      assert.ok(doc.getText().includes('return a + b;'));
      assert.ok(doc.getText().includes('console.log(add(1, 2));'));
    } finally {
      const e = new vscode.WorkspaceEdit();
      e.replace(file, new vscode.Range(0, 0, doc.lineCount, 0), original);
      await vscode.workspace.applyEdit(e);
      await doc.save();
    }
  });
});
