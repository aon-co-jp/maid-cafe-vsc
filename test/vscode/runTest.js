// 実 VS Code(ダウンロードした公式版)を開き、拡張を読み込んで suite を走らせる。音は鳴らさない。
// 毎回、作業フォルダと設定フォルダを一時ディレクトリに作り直す(前回の残りで試験が狂わないように)。
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { runTests } = require('@vscode/test-electron');
(async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'maid-cafe-vsc-test-'));
  const work = path.join(tmp, 'workspace');
  fs.cpSync(path.resolve(__dirname, 'fixture'), work, { recursive: true });
  try {
    await runTests({
      extensionDevelopmentPath: path.resolve(__dirname, '../..'),
      extensionTestsPath: path.resolve(__dirname, 'suite/index.js'),
      extensionTestsEnv: { MAID_FIXTURE: work },
      launchArgs: [work, `--user-data-dir=${path.join(tmp, 'user')}`, '--disable-extensions', '--disable-gpu', '--mute-audio'],
    });
  } catch (e) {
    console.error('VS Code test failed:', e);
    process.exitCode = 1;
  } finally {
    try {
      fs.rmSync(tmp, { recursive: true, force: true });
    } catch {}
  }
})();
