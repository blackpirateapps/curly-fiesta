import { db } from "../lib/db.js";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { authToken } = req.body;

    if (!authToken) {
      return res.status(400).json({ error: "Auth token is required" });
    }

    const users = await db.execute("SELECT * FROM users");

    let user = null;
    for (const u of users.rows) {
      if (u.auth_token_hash) {
        const match = await bcrypt.compare(authToken, u.auth_token_hash);
        if (match) {
          user = u;
          break;
        }
      }
    }

    if (!user) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const token = jwt.sign({ userId: user.id, username: user.username }, process.env.JWT_SECRET, {
      expiresIn: "7d",
    });

    res.setHeader("Set-Cookie", `token=${token}; HttpOnly; Path=/; Max-Age=604800; SameSite=Lax`);

    return res.status(200).json({ success: true, message: "Logged in successfully" });
  } catch (err) {
    console.error("Login error:", err);
    return res.status(500).json({ error: "Failed to log in" });
  }
}