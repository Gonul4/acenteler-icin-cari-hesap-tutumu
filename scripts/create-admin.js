const mongoose = require("mongoose");
const argon2 = require("argon2");
require("dotenv").config();

const User = require("../models/User");

async function createAdmin() {
  const username = String(process.env.ADMIN_USERNAME || "")
    .trim()
    .toLowerCase();
  const name = String(process.env.ADMIN_NAME || "").trim();
  const password = String(process.env.ADMIN_PASSWORD || "");

  if (!process.env.MONGO_URI || !username || !name || !password) {
    throw new Error(
      "MONGO_URI, ADMIN_USERNAME, ADMIN_NAME ve ADMIN_PASSWORD tanımlanmalıdır.",
    );
  }

  if (password.length < 12) {
    throw new Error("ADMIN_PASSWORD en az 12 karakter olmalıdır.");
  }

  await mongoose.connect(process.env.MONGO_URI);

  const passwordHash = await argon2.hash(password, {
    type: argon2.argon2id,
  });

  await User.findOneAndUpdate(
    { username },
    {
      name,
      username,
      passwordHash,
      role: "admin",
      active: true,
    },
    { upsert: true, returnDocument: "after", runValidators: true },
  );

  console.log(`Yönetici hazır: ${username}`);
}

createAdmin()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
