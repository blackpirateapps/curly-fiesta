import { db } from "../lib/db.js";
import bcrypt from "bcrypt";
import crypto from "crypto";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    // Generate a 32-character random string from 'a', 'b', 'c', 'd', and numbers
    const chars = "abcd0123456789";
    let randomString = "";
    const randomBytes = crypto.randomBytes(32);
    for (let i = 0; i < 32; i++) {
      randomString += chars[randomBytes[i] % chars.length];
    }

    const saltRounds = 10;
    const authTokenHash = await bcrypt.hash(randomString, saltRounds);

    const result = await db.execute({
      sql: "INSERT INTO users (auth_token_hash) VALUES (?)",
      args: [authTokenHash],
    });

    return res.status(201).json({
      success: true,
      authToken: randomString,
      userId: result.lastInsertRowid,
    });
  } catch (err) {
    console.error("Signup error:", err);
    return res.status(500).json({ error: "Failed to start signup" });
  }
}