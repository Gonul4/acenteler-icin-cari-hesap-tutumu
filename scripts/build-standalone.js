const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const root = path.resolve(__dirname, "..");
const run = spawnSync(process.platform === "win32" ? "npm.cmd" : "npm", ["run", "build", "--prefix", "frontend"], {
  cwd: root, stdio: "inherit", env: { ...process.env, REACT_APP_LOCAL_DEMO: "true", PUBLIC_URL: ".", GENERATE_SOURCEMAP: "false" },
});
if (run.status !== 0) process.exit(run.status || 1);
const build = path.join(root, "frontend/build");
let html = fs.readFileSync(path.join(build, "index.html"), "utf8");
html = html.replace(/<link[^>]*rel="(?:manifest|apple-touch-icon|icon)"[^>]*>/g, "");
html = html.replace(/<link[^>]*href="([^"]+\.css)"[^>]*>/g, (_, file) => {
  const css = fs.readFileSync(path.join(build, file.replace(/^\.\//, "")), "utf8");
  return `<style>${css.replace(/<\/style/gi, "<\\/style")}</style>`;
});
html = html.replace(/<script[^>]*src="([^"]+\.js)"[^>]*><\/script>/g, (_, file) => {
  const js = fs.readFileSync(path.join(build, file.replace(/^\.\//, "")), "utf8").replace(/<\/script/gi, "<\\/script");
  // The original bundle is deferred. Inline code must run after #root exists.
  return `<script>window.addEventListener('DOMContentLoaded',function(){${js}\n});</script>`;
});
const icon = fs.readFileSync(path.join(root, "frontend/public/apexcari-icon-32.png")).toString("base64");
html = html.replace("</head>", `<link rel="icon" href="data:image/png;base64,${icon}"></head>`);
html = html.replace('<meta charset="utf-8"/>', '<meta charset="utf-8"/><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; script-src \'unsafe-inline\'; style-src \'unsafe-inline\'; img-src data: blob:; connect-src \'none\'; font-src data:; base-uri \'none\'; form-action \'none\'"/>');
if (/<(?:script|link)[^>]+(?:src|href)="(?:https?:|\.?\/static)/.test(html))
  throw new Error("Standalone çıktıda haricî dosya kaldı.");
fs.mkdirSync(path.join(root, "demo"), { recursive: true });
fs.writeFileSync(path.join(root, "demo/index.html"), html);
console.log("Hazır: demo/index.html — tüm kod, stil ve simge tek dosyada; ağ istekleri CSP ile kapalı.");
