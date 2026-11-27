const path = require('node:path');
const Mocha = require('mocha');
exports.run = () =>
  new Promise((resolve, reject) => {
    const m = new Mocha({ ui: 'tdd', timeout: 60000 });
    m.addFile(path.resolve(__dirname, 'extension.test.js'));
    m.run((f) => (f ? reject(new Error(`${f} tests failed`)) : resolve()));
  });
