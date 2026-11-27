const assert = require('node:assert');
const http = require('node:http');
const path = require('node:path');
const vscode = require('vscode');
const FIX = process.env.MAID_FIXTURE;

suite('maid-cafe-vsc in real VS Code', () => {
  let server;
  const received = [];
  const translated = [];
  let port;
  suiteSetup(async () => {
    // 疑似 aruaru-llm(Connect 形式、応答は {completion,...})。外には出ない。
    server = http.createServer((req, res) => {
      if (req.method === 'GET' && req.url === '/job') {
        res.setHeader('content-type', 'text/html; charset=utf-8');
        return res.end('<html><script>x=1</script><body><h1>Backend engineer</h1><p>単価: 80万円 / 月</p><p>担当: 山田太郎 yamada@example.com 03-1234-5678</p><p>Python, FastAPI</p></body></html>');
      }
      let b = '';
      req.on('data', (c) => (b += c));
      req.on('end', () => {
        const body = JSON.parse(b);
        if (req.url === '/aruaru_llm.Llm/Translate') {
          translated.push(body);
          res.setHeader('content-type', 'application/json');
          return res.end(JSON.stringify({ translation: `[${body.target_lang}] ${body.text}`, engine: 'mock-m2m100', disclosure: 'mock' }));
        }
        received.push({ url: req.url, body });
        const fixed = 'Fixed the operator.\n```js\nfunction add(a, b) {\n  return a + b;\n}\n```';
        res.setHeader('content-type', 'application/json');
        const prompt = received[received.length - 1].body.prompt;
        const completion = prompt.includes('maid at a cozy maid cafe') ? 'Maid: Welcome back, Master! What would you like to drink?\nCorrection: Say "I want tea" (not "I wants tea").\n日本語: おかえりなさいませ、ご主人様!' : prompt.includes('And now?') ? 'follow-up ok' : prompt.includes('Organize the imported') ? '# Requirements\n- Python API\n\nWhy: unknowns first.' : fixed;
        res.end(JSON.stringify({ completion, engine: 'mock', disclosure: 'mock' }));
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
    for (const c of ['openArurau', 'project.import', 'project.step', 'welcome', 'selectThirdLanguage', 'translateSelection', 'englishCafe']) assert.ok(all.includes(`maidCafe.${c}`), c);
  });

  test('paint -> ask -> follow-up -> fix with diff apply', async () => {
    const file = vscode.Uri.file(path.join(FIX, 'sample.js'));
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

  test('import (url once, text, md file) -> requirements -> debug fix; personal info is masked', async () => {
    const root = FIX;
    await vscode.commands.executeCommand('maidCafe.project.import', { name: 'Demo Job', kind: 'url', value: `http://127.0.0.1:${port}/job`, noConfirm: true });
    await vscode.commands.executeCommand('maidCafe.project.import', { name: 'Demo Job', kind: 'text', value: 'Remote OK, 3 days a week' });
    await vscode.commands.executeCommand('maidCafe.project.import', { name: 'Demo Job', kind: 'file', value: vscode.Uri.file(path.resolve(root, 'brief.md')) });
    const fs = require('node:fs');
    const src = path.join(root, '.maid-cafe/projects/Demo-Job/source');
    assert.deepStrictEqual(fs.readdirSync(src), ['01-url.md', '02-text.md', '03-file.md']);
    assert.ok(fs.readFileSync(path.join(src, '01-url.md'), 'utf8').includes('Backend engineer'), 'html is converted to text');
    assert.ok(!fs.readFileSync(path.join(src, '01-url.md'), 'utf8').includes('x=1'), 'script removed');

    const before = received.length;
    const uri = await vscode.commands.executeCommand('maidCafe.project.step', { stage: 'requirements' });
    assert.ok(uri.endsWith('requirements.md'));
    const sent = received[before].body.prompt;
    assert.ok(sent.includes('Backend engineer') && sent.includes('Python, FastAPI'));
    assert.ok(!sent.includes('yamada@example.com') && !sent.includes('03-1234-5678') && !sent.includes('80万円') && !sent.includes('山田太郎'), 'personal info masked: ' + sent);
    assert.ok(sent.includes('LEARNING MODE'), 'learning mode asks for Why');
    assert.ok(fs.readFileSync(path.join(root, '.maid-cafe/projects/Demo-Job/requirements.md'), 'utf8').includes('Why:'));

    // docx / pdf import, then requirements -> design -> tasks chain (each step sees the previous result)
    await vscode.commands.executeCommand('maidCafe.project.import', { name: 'Demo Job', kind: 'file', value: vscode.Uri.file(path.resolve(root, 'spec.docx')) });
    await vscode.commands.executeCommand('maidCafe.project.import', { name: 'Demo Job', kind: 'file', value: vscode.Uri.file(path.resolve(root, 'spec.pdf')) });
    assert.strictEqual(fs.readdirSync(src).length, 5);
    const all = fs.readdirSync(src).map((f) => fs.readFileSync(path.join(src, f), 'utf8')).join(String.fromCharCode(10));
    assert.ok(all.includes('FastAPI の経験') && all.includes('Freelance Rust engineer wanted'), 'docx and pdf text extracted');
    const d0 = received.length;
    await vscode.commands.executeCommand('maidCafe.project.step', { stage: 'design' });
    const designPrompt = received[d0].body.prompt;
    assert.ok(designPrompt.includes('draft a design document') && designPrompt.includes('# Requirements') && designPrompt.includes('FastAPI の経験') && designPrompt.includes('Freelance Rust engineer wanted'), 'design sees requirements + all imports');
    assert.ok(fs.existsSync(path.join(root, '.maid-cafe/projects/Demo-Job/design.md')));
    await vscode.commands.executeCommand('maidCafe.project.step', { stage: 'tasks' });
    assert.ok(received[received.length - 1].body.prompt.includes('implementation tasks') && fs.existsSync(path.join(root, '.maid-cafe/projects/Demo-Job/tasks.md')));

    const file = vscode.Uri.file(path.resolve(root, 'sample.js'));
    const doc = await vscode.workspace.openTextDocument(file);
    const ed = await vscode.window.showTextDocument(doc);
    ed.selection = new vscode.Selection(0, 0, 2, 1);
    const original = doc.getText();
    try {
      const r = await vscode.commands.executeCommand('maidCafe.project.step', { stage: 'debug', input: 'add(1,2) returned -1, expected 3. key=sk-abcdefghijklmnop1234', autoApply: true });
      assert.strictEqual(r, 'applied');
      assert.ok(doc.getText().includes('return a + b;'));
      const last = received[received.length - 1].body.prompt;
      assert.ok(last.includes('returned -1') && !last.includes('sk-abcdefghijklmnop1234'), 'pasted log is secret-masked');
    } finally {
      const e = new vscode.WorkspaceEdit();
      e.replace(file, new vscode.Range(0, 0, doc.lineCount, 0), original);
      await vscode.workspace.applyEdit(e);
      await doc.save();
    }
  });

  test('url import refuses non-http and credentials', async () => {
    const { checkFetchUrl } = require('../../../out/core/project');
    assert.strictEqual(checkFetchUrl('file:///etc/passwd').ok, false);
    assert.strictEqual(checkFetchUrl('https://u:p@example.com/').ok, false);
  });

  test('third language: answers, selection translation and maid-cafe English chat', async () => {
    assert.strictEqual(await vscode.commands.executeCommand('maidCafe.selectThirdLanguage', 'fr'), 'fr');
    try {
      // 1) selection translation keeps code blocks untouched
      const src = 'Use a loop.\n```js\nfor (;;) {}\n```\nThen stop.';
      const out = await vscode.commands.executeCommand('maidCafe.translateSelection', { text: src, to: 'de' });
      assert.ok(out.includes('[de] Use a loop.') && out.includes('[de] Then stop.') && out.includes('for (;;) {}'));
      assert.ok(translated.every((t) => !t.text.includes('for (;;)')), 'code is not sent to the translator');
      assert.strictEqual(translated[translated.length - 1].target_lang, 'de');

      // 2) the maid-cafe conversation: persona, correction, Japanese gloss, third-language line, history
      const n = received.length;
      const r1 = await vscode.commands.executeCommand('maidCafe.englishCafe', 'I wants tea');
      assert.ok(r1.startsWith('Maid:'));
      assert.ok(received[n].body.prompt.includes('maid at a cozy maid cafe') && received[n].body.prompt.includes('I wants tea'));
      assert.ok(translated.some((t) => t.target_lang === 'fr' && t.text.startsWith('Welcome back')), 'maid line translated into the third language');
      await vscode.commands.executeCommand('maidCafe.englishCafe', 'Green tea please');
      assert.ok(received[n + 1].body.prompt.includes('I wants tea'), 'conversation history is sent');
      await vscode.commands.executeCommand('maidCafe.englishCafe.reset');
      await vscode.commands.executeCommand('maidCafe.englishCafe', 'Hello');
      assert.ok(!received[n + 2].body.prompt.includes('I wants tea'), 'reset clears history');
      // 3) AI answers about code are also translated into the third language (code block untouched)
      const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(path.join(FIX, 'sample.js')));
      const ed = await vscode.window.showTextDocument(doc);
      ed.selection = new vscode.Selection(0, 0, 2, 1);
      const ans = await vscode.commands.executeCommand('maidCafe.askSelection', 'Explain please');
      assert.ok(ans.includes('Fixed the operator'));
      assert.ok(translated.some((t) => t.target_lang === 'fr' && t.text.includes('Fixed the operator') && !t.text.includes('return a + b')), 'answer prose translated, code kept');
    } finally {
      await vscode.workspace.getConfiguration('maidCafe').update('thirdLanguage', '', vscode.ConfigurationTarget.Global);
    }
  });
});
