const test = require('node:test');
const assert = require('node:assert');
const { redact } = require('../out/core/redact');
const { RangeStore } = require('../out/core/ranges');
const { buildPrompt } = require('../out/core/prompt');
const { buildRequest, parseResponse, explainError } = require('../out/core/providers');

test('redact masks keys, bearer tokens and passwords', () => {
  const s = 'const k = "sk-abcdefghijklmnop1234"; password = "hunter22"; Authorization: Bearer abcdefghijklmnop1234';
  const r = redact(s);
  assert.ok(!r.includes('sk-abcdefghijklmnop1234'));
  assert.ok(!r.includes('hunter22'));
  assert.ok(!r.includes('abcdefghijklmnop1234'));
  assert.ok(redact('let total = a + b;') === 'let total = a + b;');
});

test('range store groups by colour and shifts lines', () => {
  const s = new RangeStore();
  s.add('red', 'f', 10, 12, 'x');
  s.add('blue', 'f', 1, 2, 'y');
  assert.deepStrictEqual(s.colorsInUse(), ['red', 'blue']);
  s.shift('f', 5, 3);
  assert.strictEqual(s.byColor('red')[0].startLine, 13);
  assert.strictEqual(s.byColor('blue')[0].startLine, 1);
  s.clear('red');
  assert.strictEqual(s.all().length, 1);
});

test('prompt includes file:line, redacts, truncates', () => {
  const r = [{ id: 1, color: 'red', file: 'a.ts', startLine: 3, endLine: 4, text: 'token = "abcdefghij12345"\n' + 'x'.repeat(200) }];
  const p = buildPrompt({ question: 'why?', ranges: r, redactSecrets: true, maxChars: 100 });
  assert.ok(p.user.includes('a.ts:3-4'));
  assert.ok(!p.user.includes('abcdefghij12345'));
  assert.ok(p.truncated);
  assert.ok(p.user.endsWith('Question: why?'));
});

test('request shapes per provider', () => {
  const a = { system: 'S', user: 'U', key: 'KEY' };
  const o = buildRequest({ ...a, provider: 'openai' });
  assert.strictEqual(o.url, 'https://api.openai.com/v1/chat/completions');
  assert.strictEqual(o.headers.authorization, 'Bearer KEY');
  const c = buildRequest({ ...a, provider: 'claude' });
  assert.strictEqual(c.headers['x-api-key'], 'KEY');
  assert.strictEqual(JSON.parse(c.body).system, 'S');
  const g = buildRequest({ ...a, provider: 'gemini', model: 'gemini-2.5-pro' });
  assert.ok(!g.url.includes('KEY'), 'key must not be in the URL');
  assert.strictEqual(g.headers['x-goog-api-key'], 'KEY');
  const ar = buildRequest({ ...a, provider: 'aruaru', aruaruUrl: 'https://example.test/' });
  assert.strictEqual(ar.url, 'https://example.test/aruaru_llm.Llm/Generate');
  assert.ok(!('authorization' in ar.headers));
  for (const p of ['deepseek', 'grok']) assert.ok(buildRequest({ ...a, provider: p }).url.startsWith('https://api.'));
});

test('response parsing and error text', () => {
  assert.strictEqual(parseResponse('openai', { choices: [{ message: { content: 'hi' } }] }), 'hi');
  assert.strictEqual(parseResponse('claude', { content: [{ type: 'text', text: 'a' }, { type: 'text', text: 'b' }] }), 'ab');
  assert.strictEqual(parseResponse('gemini', { candidates: [{ content: { parts: [{ text: 'z' }] } }] }), 'z');
  assert.strictEqual(parseResponse('aruaru', { text: 'q' }), 'q');
  assert.strictEqual(parseResponse('openai', {}), null);
  assert.ok(explainError(401, 'x').includes('API key'));
  assert.ok(explainError(429, 'x').includes('429'));
});

const { Conversation, flattenTurns } = require('../out/core/chat');
const { extractCodeBlock, replaceLines } = require('../out/core/actions');

test('aruaru response is read from completion; history is flattened; tokens capped at 128', () => {
  assert.strictEqual(parseResponse('aruaru', { completion: 'hi', engine: 'e', disclosure: 'd' }), 'hi');
  const r = buildRequest({ provider: 'aruaru', system: 'S', user: 'U2', history: [{ role: 'user', content: 'U1' }, { role: 'assistant', content: 'A1' }], maxTokens: 4096 });
  const b = JSON.parse(r.body);
  assert.ok(b.prompt.includes('U1') && b.prompt.includes('A1') && b.prompt.endsWith('User: U2'));
  assert.strictEqual(b.max_new_tokens, 128);
  assert.strictEqual(JSON.parse(buildRequest({ provider: 'claude', system: 'S', user: 'U2', key: 'k', history: [{ role: 'user', content: 'U1' }, { role: 'assistant', content: 'A1' }] }).body).messages.length, 3);
});

test('conversation keeps a bounded user-first history', () => {
  const c = new Conversation(3);
  for (let i = 0; i < 4; i++) { c.add('user', 'q' + i); c.add('assistant', 'a' + i); }
  assert.ok(c.length <= 3 && c.all()[0].role === 'user');
  assert.ok(flattenTurns('S', [], 'Q').includes('User: Q'));
});

test('extractCodeBlock and replaceLines (stale proposals are refused)', () => {
  assert.strictEqual(extractCodeBlock('x\n```js\nlet a = 1;\n```\ny'), 'let a = 1;');
  assert.strictEqual(extractCodeBlock('no code'), null);
  const t = 'a\r\nb\r\nc\r\nd';
  assert.strictEqual(replaceLines(t, 2, 3, 'B\nC', 'b\nc'), 'a\r\nB\r\nC\r\nd');
  assert.strictEqual(replaceLines(t, 2, 3, 'B', 'changed'), null);
});

const { redactPersonal, slugify, checkFetchUrl, htmlToText, learningInstruction, projectDir } = require('../out/core/project');

test('personal info is masked, urls are checked, html is flattened', () => {
  const t = '氏名: 山田太郎\nメール yamada@example.com 電話 03-1234-5678\n単価: 80万円/月\n〒123-4567\nPython';
  const r = redactPersonal(t);
  for (const x of ['山田太郎', 'yamada@example.com', '03-1234-5678', '80万円', '123-4567']) assert.ok(!r.includes(x), x);
  assert.ok(r.includes('Python'));
  assert.strictEqual(checkFetchUrl('ftp://x/').ok, false);
  assert.strictEqual(checkFetchUrl('https://a:b@x.com/').ok, false);
  assert.strictEqual(checkFetchUrl('https://x.com/a').ok, true);
  assert.strictEqual(htmlToText('<style>a{}</style><p>Hi &amp; bye</p><script>1</script>'), 'Hi & bye');
  assert.strictEqual(slugify('../My Job:1'), 'My-Job-1');
  assert.strictEqual(projectDir('A b'), '.maid-cafe/projects/A-b');
  assert.ok(learningInstruction('debug', true).includes('Why') && learningInstruction('debug', false) === '');
});

const T = require('../out/core/translate');
test('translate: languages, code-preserving split, request shapes, poor-output check, cafe reply parsing', async () => {
  assert.strictEqual(T.findLanguage('Français').code, 'fr');
  assert.ok(T.LANGUAGES.length >= 30 && T.findLanguage('ja') && T.findLanguage('en'));
  const pkg = JSON.parse(require('fs').readFileSync(require('path').join(__dirname, '../package.json'), 'utf8'));
  assert.deepStrictEqual(pkg.contributes.configuration.properties['maidCafe.thirdLanguage'].enum, ['', ...T.LANGUAGES.map((l) => l.code)]);
  const out = await T.translateKeepingCode('A\n```x\ncode\n```\nB', async (p) => `<${p}>`);
  assert.strictEqual(out, '<A>\n```x\ncode\n```\n<B>');
  assert.strictEqual(await T.translateKeepingCode('A', async () => undefined), undefined);
  const fr = T.findLanguage('fr');
  const free = T.buildTranslateRequest({ provider: 'aruaru', text: 'hi', target: fr });
  assert.ok(free.url.endsWith('/aruaru_llm.Llm/Translate') && JSON.parse(free.body).target_lang === 'fr');
  assert.strictEqual(T.parseTranslateResponse('aruaru', { translation: 'salut' }), 'salut');
  const paid = T.buildTranslateRequest({ provider: 'claude', key: 'K', text: 'hi', target: fr });
  assert.ok(JSON.parse(paid.body).system.includes('native speaker') && paid.url.includes('anthropic'));
  assert.ok(T.looksPoor('Hello world this is a test', '', fr) && T.looksPoor('Hello world this is a test', 'Hello world this is a test', fr));
  assert.ok(!T.looksPoor('Hello world this is a test sentence', 'Bonjour le monde, ceci est une phrase de test', fr));
  const p = T.parseCafeReply('Maid: Hi!\nCorrection: Perfect!\n日本語: やあ');
  assert.deepStrictEqual([p.maid, p.correction, p.ja], ['Hi!', 'Perfect!', 'やあ']);
  assert.strictEqual(T.parseCafeReply('just text').maid, 'just text');
  assert.ok(T.englishCafeSystem('beginner').includes('maid cafe'));
});

test('script check flags output that is not in the target writing system; file kinds', async () => {
  const L = T.findLanguage;
  assert.ok(T.looksPoor('Please restart the server now', 'Please restart the server now!', L('ru')));
  assert.ok(T.looksPoor('Please restart the server now', 'Bitte starten Sie den Server neu', L('ar')));
  assert.ok(!T.looksPoor('Please restart the server now', 'Пожалуйста, перезапустите сервер сейчас', L('ru')));
  assert.ok(!T.looksPoor('Please restart the server now', '请现在重新启动服务器', L('zh')));
  const X = require('../out/core/extract');
  assert.deepStrictEqual(['a.MD', 'b.docx', 'c.pdf', 'd.exe'].map(X.fileKind), ['text', 'docx', 'pdf', 'unsupported']);
  await assert.rejects(X.extractText('d.exe', new Uint8Array(1)));
});

test('every %key% in package.json exists in the English and Japanese nls files; walkthrough files exist', () => {
  const fs = require('fs'), path = require('path');
  const root = path.join(__dirname, '..');
  const pkg = fs.readFileSync(path.join(root, 'package.json'), 'utf8');
  const en = JSON.parse(fs.readFileSync(path.join(root, 'package.nls.json'), 'utf8'));
  const ja = JSON.parse(fs.readFileSync(path.join(root, 'package.nls.ja.json'), 'utf8'));
  const keys = [...pkg.matchAll(/"%([\w.]+)%"/g)].map((m) => m[1]).concat([...pkg.matchAll(/%([\w.]+)%/g)].map((m) => m[1]));
  assert.ok(keys.length > 20);
  for (const k of new Set(keys)) assert.ok(en[k] && ja[k], k);
  for (const s of JSON.parse(pkg).contributes.walkthroughs[0].steps) assert.ok(fs.existsSync(path.join(root, s.media.markdown)));
  for (const c of JSON.parse(pkg).contributes.commands) assert.ok(c.title.startsWith('%'), c.command);
});

test('engagement type (freelance / dispatch / employee) is guessed from job text', () => {
  const P = require('../out/core/project');
  assert.deepStrictEqual(P.classifyEngagement('業務委託・リモート可 単価70万'), ['freelance']);
  assert.deepStrictEqual(P.classifyEngagement('紹介予定派遣のお仕事'), ['dispatch']);
  assert.deepStrictEqual(P.classifyEngagement('正社員募集(中途採用)'), ['employee']);
  assert.deepStrictEqual(P.classifyEngagement('Full-time employee or freelance contractor'), ['freelance', 'employee']);
  assert.deepStrictEqual(P.classifyEngagement('Rust engineer'), []);
  assert.ok(P.importHeader('派遣', 'url').includes('engagement=dispatch'));
});
