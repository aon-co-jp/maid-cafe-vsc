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
