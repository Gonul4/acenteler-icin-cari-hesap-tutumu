const express = require("express");
const argon2 = require("argon2");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const requireAuth = require("../middleware/auth");

const router = express.Router();
const SESSION_SECONDS = 24 * 60 * 60;

function cookieOptions() {
  const production = process.env.NODE_ENV === "production";

  return {
    httpOnly: true,
    secure: production,
    sameSite: production ? "none" : "lax",
    maxAge: SESSION_SECONDS * 1000,
    path: "/",
  };
}

const attempts = new Map();
router.post("/login", async (req, res) => {
  const now = Date.now();
  for (const [key, value] of attempts)
    if (value.until <= now) attempts.delete(key);
  const usernameKey = String(req.body.username || "")
    .trim()
    .toLowerCase()
    .slice(0, 50);
  const key = `${req.socket.remoteAddress}:${usernameKey}`;
  const attempt = attempts.get(key) || {
    count: 0,
    until: now + 15 * 60 * 1000,
  };
  if (attempt.count >= 10)
    return res
      .status(429)
      .json({
        message: "Çok fazla giriş denemesi. 15 dakika sonra tekrar deneyin.",
      });
  if (attempts.size > 10000)
    return res
      .status(429)
      .json({ message: "Giriş şu anda yoğun. Daha sonra tekrar deneyin." });
  attempt.count++;
  attempts.set(key, attempt);
  try {
    const username = String(req.body.username || "")
      .trim()
      .toLowerCase();
    const password = String(req.body.password || "");

    if (!username || !password) {
      return res.status(400).json({
        message: "Kullanıcı adı ve parola zorunludur.",
      });
    }

    const user = await User.findOne({ username, active: true }).select(
      "+passwordHash",
    );

    const passwordCorrect = user
      ? await argon2.verify(user.passwordHash, password)
      : false;

    if (!user || !passwordCorrect) {
      return res.status(401).json({
        message: "Kullanıcı adı veya parola hatalı.",
      });
    }

    const token = jwt.sign({ role: user.role, authVersion: user.authVersion || 0 }, process.env.JWT_SECRET, {
      algorithm: "HS256",
      subject: user._id.toString(),
      issuer: "turizm-takip-api",
      audience: "turizm-takip-web",
      expiresIn: SESSION_SECONDS,
    });

    attempts.delete(key);
    res.cookie("access_token", token, cookieOptions());

    res.json({
      user: {
        id: user._id,
        name: user.name,
        username: user.username,
        role: user.role,
      },
    });
  } catch (error) {
    console.error("Giriş hatası:", error.name);
    res.status(500).json({ message: "Giriş işlemi tamamlanamadı." });
  }
});

router.post("/account", requireAuth, async (req, res) => {
  const key = `account:${req.user._id}`;
  const now = Date.now();
  const attempt = attempts.get(key);
  if (attempt && attempt.until > now && attempt.count >= 5)
    return res.status(429).json({ message: "Çok fazla parola denemesi. 15 dakika sonra tekrar deneyin." });
  const username = typeof req.body.username === "string" ? req.body.username.trim().toLowerCase() : "";
  const { currentPassword, newPassword } = req.body;
  if (!/^[a-z0-9._-]{3,50}$/.test(username) || typeof currentPassword !== "string" || !currentPassword || currentPassword.length > 128 || typeof newPassword !== "string" || newPassword.length < 8 || newPassword.length > 128)
    return res.status(400).json({ message: "Kullanıcı adı 3–50, yeni parola 8–128 karakter olmalıdır. Mevcut parolanızı girin." });
  try {
    const account = await User.findById(req.user._id).select("+passwordHash");
    if (!account || !(await argon2.verify(account.passwordHash, currentPassword))) {
      const state = attempt && attempt.until > now ? attempt : { count: 0, until: now + 15 * 60 * 1000 };
      state.count++; attempts.set(key, state);
      return res.status(400).json({ message: "Mevcut parola hatalı." });
    }
    const passwordHash = await argon2.hash(newPassword, { type: argon2.argon2id });
    const changed = await User.findOneAndUpdate(
      { _id: account._id, passwordHash: account.passwordHash },
      { $set: { username, passwordHash, credentialsChangedAt: new Date() }, $inc: { authVersion: 1 } },
      { returnDocument: "after", runValidators: true },
    );
    if (!changed) return res.status(409).json({ message: "Hesap değişti. Yeniden giriş yapıp deneyin." });
    attempts.delete(key);
    const options = cookieOptions();
    res.clearCookie("access_token", { httpOnly: options.httpOnly, secure: options.secure, sameSite: options.sameSite, path: options.path });
    res.json({ message: "Giriş bilgileriniz değiştirildi. Yeni bilgilerinizle giriş yapın." });
  } catch (error) {
    res.status(error.code === 11000 ? 409 : 500).json({ message: error.code === 11000 ? "Bu kullanıcı adı kullanılıyor." : "Hesap bilgileri değiştirilemedi." });
  }
});

router.post("/logout", (req, res) => {
  const options = cookieOptions();

  res.clearCookie("access_token", {
    httpOnly: options.httpOnly,
    secure: options.secure,
    sameSite: options.sameSite,
    path: options.path,
  });

  res.status(204).send();
});

router.get("/me", requireAuth, (req, res) => {
  res.json({
    user: {
      id: req.user._id,
      name: req.user.name,
      username: req.user.username,
      role: req.user.role,
    },
  });
});

module.exports = router;
