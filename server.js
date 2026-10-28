const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const cookieParser = require("cookie-parser");
require("dotenv").config();
const authRoutes = require("./routes/auth");
const ticketRoutes = require("./routes/tickets");
const userRoutes = require("./routes/users");
const customerRoutes = require("./routes/customers");
const requireAuth = require("./middleware/auth");
const app = express();
app.disable("x-powered-by");
app.use(
  cors({
    origin: process.env.FRONTEND_URL,
    credentials: true,
    methods: ["GET", "POST", "PATCH", "PUT", "OPTIONS"],
    allowedHeaders: ["Content-Type", "X-Requested-With"],
  }),
);
app.use(express.json({ limit: "64kb" }));
app.use(cookieParser());
app.use("/api", (req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  if (
    ["POST", "PATCH", "PUT", "DELETE"].includes(req.method) &&
    req.get("X-Requested-With") !== "XMLHttpRequest"
  )
    return res.status(403).json({ message: "Geçersiz istek." });
  next();
});
app.get("/api/health", (req, res) => {
  const ready = mongoose.connection.readyState === 1;
  res
    .status(ready ? 200 : 503)
    .json({ status: ready ? "ok" : "database-unavailable" });
});
app.use("/api/auth", authRoutes);
app.use("/api/tickets", requireAuth, ticketRoutes);
app.use("/api/users", requireAuth, userRoutes);
app.use("/api/customers", requireAuth, customerRoutes);
app.use((err, req, res, next) => {
  const status =
    err.status ||
    (err.name === "ValidationError" ||
    err.name === "CastError" ||
    err.type === "entity.parse.failed"
      ? 400
      : err.type === "entity.too.large"
        ? 413
        : 500);
  if (status === 500) console.error("API işlem hatası:", err.name);
  res.status(status).json({
    message:
      status === 500
        ? "İşlem tamamlanamadı. Lütfen tekrar deneyin."
        : err.status
          ? err.message
          : "Geçersiz veya çok büyük veri gönderildi.",
  });
});
async function start() {
  for (const key of ["MONGO_URI", "JWT_SECRET", "FRONTEND_URL"])
    if (!process.env[key])
      throw new Error(`${key} ortam değişkeni tanımlı değil.`);
  if (process.env.JWT_SECRET.length < 32)
    throw new Error("JWT_SECRET en az 32 karakter olmalıdır.");
  if (
    process.env.NODE_ENV === "production" &&
    !process.env.FRONTEND_URL.startsWith("https://")
  )
    throw new Error("Canlı site için FRONTEND_URL HTTPS olmalıdır.");
  await mongoose.connect(process.env.MONGO_URI);
  await Promise.all([
    require("./models/Customer").init(),
    require("./models/AccountEntry").init(),
  ]);
  app.listen(Number(process.env.PORT) || 5000, process.env.NODE_ENV === "production" ? "0.0.0.0" : "127.0.0.1", () =>
    console.log("Bilet takip sunucusu hazır."),
  );
}
if (require.main === module)
  start().catch((e) => {
    console.error(
      "Sunucu başlatılamadı:",
      e.message?.includes("ortam değişkeni") || e.message?.includes("olmalıdır")
        ? e.message
        : e.name,
    );
    process.exitCode = 1;
  });
module.exports = app;
