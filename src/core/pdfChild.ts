/** PDF を別の Node プロセスで読む(拡張ホストの Electron では pdf.js が失敗することがあるため)。標準入力に PDF、標準出力に文章。 */
const chunks: Buffer[] = [];
process.stdin.on('data', (c: Buffer) => chunks.push(c));
process.stdin.on('end', async () => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const pdf: (b: Buffer) => Promise<{ text: string }> = require('pdf-parse/lib/pdf-parse.js');
    process.stdout.write((await pdf(Buffer.concat(chunks))).text);
  } catch (e) {
    process.stderr.write(String((e as Error)?.message ?? e));
    process.exit(1);
  }
});
