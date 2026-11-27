// 試験用: 文字を持たず、画像だけを1ページに置いた PDF を作る(スキャンした PDF の代わり)。
const zlib = require('node:zlib');
function makeImageOnlyPdf({ kind = 'gray', w = 4, h = 2, jpeg } = {}) {
  let img;
  if (kind === 'jpeg') img = { dict: `/Type /XObject /Subtype /Image /Width ${w} /Height ${h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode`, data: jpeg };
  else {
    const px = Buffer.alloc(w * h, 0);
    for (let i = 0; i < px.length; i++) px[i] = (i * 37) & 0xff;
    img = { dict: `/Type /XObject /Subtype /Image /Width ${w} /Height ${h} /ColorSpace /DeviceGray /BitsPerComponent 8 /Filter /FlateDecode`, data: zlib.deflateSync(px) };
  }
  const content = Buffer.from(`q ${w * 10} 0 0 ${h * 10} 0 0 cm /Im1 Do Q`, 'latin1');
  const objs = [
    Buffer.from('<< /Type /Catalog /Pages 2 0 R >>'),
    Buffer.from('<< /Type /Pages /Kids [3 0 R] /Count 1 >>'),
    Buffer.from(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${w * 10} ${h * 10}] /Resources << /XObject << /Im1 5 0 R >> >> /Contents 4 0 R >>`),
    Buffer.concat([Buffer.from(`<< /Length ${content.length} >>\nstream\n`), content, Buffer.from('\nendstream')]),
    Buffer.concat([Buffer.from(`<< ${img.dict} /Length ${img.data.length} >>\nstream\n`, 'latin1'), img.data, Buffer.from('\nendstream')]),
  ];
  const parts = [Buffer.from('%PDF-1.4\n')];
  const offs = [];
  let pos = parts[0].length;
  objs.forEach((o, i) => {
    const b = Buffer.concat([Buffer.from(`${i + 1} 0 obj\n`), o, Buffer.from('\nendobj\n')]);
    offs.push(pos);
    pos += b.length;
    parts.push(b);
  });
  let x = `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` + offs.map((o) => String(o).padStart(10, '0') + ' 00000 n \n').join('');
  x += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${pos}\n%%EOF\n`;
  parts.push(Buffer.from(x));
  return Buffer.concat(parts);
}
module.exports = { makeImageOnlyPdf };
