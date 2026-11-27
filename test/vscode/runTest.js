// 実 VS Code(ダウンロードした Electron 版)を開き、拡張を読み込んで suite を走らせる。音は鳴らさない。
const path = require('node:path');
const { runTests } = require('@vscode/test-electron');
(async () => {
  try {
    await runTests({
      extensionDevelopmentPath: path.resolve(__dirname, '../..'),
      extensionTestsPath: path.resolve(__dirname, 'suite/index.js'),
      launchArgs: [path.resolve(__dirname, 'fixture'), '--disable-extensions', '--disable-gpu', '--mute-audio'],
    });
  } catch (e) {
    console.error('VS Code test failed:', e);
    process.exit(1);
  } finally {
    // 試験が作った案件フォルダを片づける(VS Code 終了後)。
    require('node:fs').rmSync(path.resolve(__dirname, 'fixture/.maid-cafe'), { recursive: true, force: true });
  }
})();
