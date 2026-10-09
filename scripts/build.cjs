const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
let html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'src/style.css'), 'utf8');
html = html.replace('<link rel="stylesheet" href="src/style.css">', () => `<style>\n${css}\n</style>`);
html = html.replace(/<script src="([^"]+)"><\/script>/g, (_, filename) => {
  const js = fs.readFileSync(path.join(root, filename), 'utf8').replace(/<\/script/gi, '<\\/script');
  return `<script>\n${js}\n</script>`;
});
fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
fs.writeFileSync(path.join(root, 'dist/index.html'), html);
console.log(`离线版本已生成：dist/index.html（${(Buffer.byteLength(html) / 1024).toFixed(1)} KB）`);
