const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { DEMO_URI } = require("../lib/demo-target");
const root = path.resolve(__dirname, "..");
const files = [path.join(root, ".env"), path.join(root, "frontend/.env")];
if (files.some((file) => fs.existsSync(file))) {
  console.error(".env dosyası zaten mevcut. Var olan ayarlar değiştirilmedi.");
  process.exitCode = 1;
} else {
  fs.writeFileSync(files[0], `MONGO_URI=${DEMO_URI}\nJWT_SECRET=${crypto.randomBytes(64).toString("hex")}\nFRONTEND_URL=http://127.0.0.1:3000\nNODE_ENV=development\nPORT=5000\n`, { flag: "wx", mode: 0o600 });
  fs.writeFileSync(files[1], "REACT_APP_API_URL=http://127.0.0.1:5000/api\nHOST=127.0.0.1\n", { flag: "wx", mode: 0o600 });
  console.log("Yerel demo ayarları oluşturuldu. docker compose up -d ve npm run demo:seed ile devam edin.");
}
