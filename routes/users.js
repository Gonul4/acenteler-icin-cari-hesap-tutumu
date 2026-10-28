const express = require("express");
const argon2 = require("argon2");
const User = require("../models/User");
const { badRequest } = require("../lib/tickets");
const router = express.Router();
router.use((req, res, next) =>
  req.user.role === "admin"
    ? next()
    : res
        .status(403)
        .json({ message: "Bu işlem yönetici yetkisi gerektirir." }),
);
router.get("/", async (req, res, next) => {
  try {
    res.json(
      await User.find()
        .select("name username role active")
        .sort({ name: 1 })
        .lean(),
    );
  } catch (e) {
    next(e);
  }
});
router.post("/", async (req, res, next) => {
  try {
    const { name, username, password, role } = req.body;
    if (typeof name !== "string" || !name.trim() || name.trim().length > 80)
      throw badRequest("Çalışan adı zorunlu, en fazla 80 karakter olabilir.");
    if (
      typeof username !== "string" ||
      !/^[a-zA-Z0-9._-]{3,50}$/.test(username.trim())
    )
      throw badRequest(
        "Kullanıcı adı 3–50 karakter olmalı; harf, rakam, nokta, alt çizgi ve tire kullanılabilir.",
      );
    if (
      typeof password !== "string" ||
      password.length < 12 ||
      password.length > 128
    )
      throw badRequest("Parola 12–128 karakter olmalıdır.");
    if (!["staff", "admin"].includes(role))
      throw badRequest("Geçerli bir rol seçin.");
    const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
    const user = await User.create({
      name: name.trim(),
      username: username.trim().toLowerCase(),
      passwordHash,
      role,
    });
    res
      .status(201)
      .json({
        _id: user._id,
        name: user.name,
        username: user.username,
        role: user.role,
        active: user.active,
      });
  } catch (e) {
    if (e.code === 11000)
      return res
        .status(409)
        .json({ message: "Bu kullanıcı adı zaten kullanılıyor." });
    next(e);
  }
});
module.exports = router;
