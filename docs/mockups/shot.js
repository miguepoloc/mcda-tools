// Uso: node shot.js archivo.html salida.png ancho [alto]
// Si no se da alto, ajusta el viewport a la altura real del contenido (evita el "stitching"
// de fullPage a media carga de fuentes, que produce texto fantasma superpuesto).
const { chromium } = require('../../node_modules/playwright');
const path = require('path');

(async () => {
  const [, , file, out, wArg, hArg] = process.argv;
  const width = parseInt(wArg || '1440', 10);
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width, height: parseInt(hArg || '1200', 10) } });
  await p.goto('file://' + path.resolve(file));
  await p.evaluate(() => document.fonts.ready);
  await p.waitForTimeout(250);
  if (!hArg) {
    const h = await p.evaluate(() => document.documentElement.scrollHeight);
    await p.setViewportSize({ width, height: Math.ceil(h) });
    await p.waitForTimeout(200);
  }
  await p.screenshot({ path: out });
  await b.close();
})();
