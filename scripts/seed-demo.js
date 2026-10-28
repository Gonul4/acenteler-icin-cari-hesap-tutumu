const path = require("node:path");
const mongoose = require("mongoose");
const argon2 = require("argon2");
const crypto = require("node:crypto");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });
const { assertDemoTarget } = require("../lib/demo-target");
const { entryInput, hashEntry } = require("../lib/accounts");
const User = require("../models/User");
const Customer = require("../models/Customer");
const Ticket = require("../models/Ticket");
const Entry = require("../models/AccountEntry");
const Counter = require("../models/Counter");
const DEMO_PASSWORD = "DemoCari2026!";
const date = (offset) => {
  const d = new Date(Date.now() + offset * 86400000);
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Istanbul" }).format(d);
};
async function seed() {
  assertDemoTarget(process.env.MONGO_URI, process.env.NODE_ENV);
  await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 5000 });
  const collections = await mongoose.connection.db.listCollections().toArray();
  for (const collection of collections) {
    if (await mongoose.connection.db.collection(collection.name).countDocuments({}, { limit: 1 }))
      throw new Error("Demo veritabanı boş değil. Kayıtlar silinmedi veya değiştirilmedi. Tekrar örnek yüklemek gerekmiyor.");
  }
  await Promise.all([User.init(), Customer.init(), Entry.init()]);
  const passwordHash = await argon2.hash(DEMO_PASSWORD, { type: argon2.argon2id });
  const admin = await User.create({ name: "Demo Muhasebe", username: "demo.admin", passwordHash, role: "admin", active: true });
  await User.create({ name: "Demo Çalışan", username: "demo.calisan", passwordHash, role: "staff", active: true });
  const cards = [];
  for (const [i, name] of ["Örnek Müşteri A", "Örnek Müşteri B", "Örnek Müşteri C"].entries())
    cards.push(await Customer.create({ code: `C00000${i + 1}`, name, phone: "", email: `demo${i + 1}@example.com`, notes: "Hayalî portföy verisi", defaultPosRate: 2, createdBy: admin._id, staffName: admin.name }));
  await Counter.create({ _id: "customer", value: cards.length });
  for (const [i, customer] of cards.entries())
    await Ticket.create({ customerId: customer._id, customerName: customer.name, price: [10000, 8000, 12000][i], route: ["IST-AYT", "IST-ESB", "IST-ADB"][i], pnr: `DEMO0${i + 1}`, saleDate: date(-7), travelDate: date(10), dueDate: date(i === 0 ? 0 : i === 1 ? -1 : 7), staffId: admin._id, staffName: admin.name, notes: "Hayalî bilet; gerçek yolcu içermez." });
  const data = entryInput({ type: "payment", amount: 3000, method: "Kart", date: date(-1), commissionMode: "percent", commissionValue: 2, description: "Örnek POS tahsilatı", requestId: crypto.randomUUID() }, cards[0]);
  await Entry.create({ ...data, customerId: cards[0]._id, staffId: admin._id, staffName: admin.name, requestHash: hashEntry(data) });
  console.log("3 örnek kart, 3 bilet ve POS tahsilatı oluşturuldu.");
  console.log(`Yönetici: demo.admin | Çalışan: demo.calisan | Yalnızca yerel demo parolası: ${DEMO_PASSWORD}`);
}
seed().catch((error) => { console.error(error.message); process.exitCode = 1; }).finally(() => mongoose.disconnect());
