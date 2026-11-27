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
