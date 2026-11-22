// Renders the link-preview image (og-image.jpg, 1200x630) and the GitHub social preview
// (docs/social-preview.jpg, 1280x640) from tools/banner.html with the dev container's Chromium.
// The banner crops the source art below its AI lettering (background-position: bottom), so the
// title is real text.   node tools/build_banners.js
const path = require('path');
const { chromium } = require(require.resolve('playwright', { paths: [path.join(__dirname, '..', 'tests'), process.cwd()] }));
const ROOT = path.join(__dirname, '..');
(async () => {
  const b = await chromium.launch();
  for (const [w, h, out] of [[1200, 630, 'og-image.jpg'], [1280, 640, 'docs/social-preview.jpg']]) {
    const p = await b.newPage({ viewport: { width: w, height: h } });
    await p.goto('file://' + path.join(__dirname, 'banner.html'));
    await p.addStyleTag({ content: `.b{--w:${w}px;--h:${h}px}` });
    await p.waitForTimeout(300);
    await p.screenshot({ path: path.join(ROOT, out), type: 'jpeg', quality: 85 });
    await p.close();
    console.log('wrote', out);
  }
  await b.close();
})();
