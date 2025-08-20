import { db } from "../lib/db.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Only POST" });

  const { content } = JSON.parse(req.body);
  if (!content) return res.status(400).json({ error: "Content required" });

  await db.execute({
    sql: "INSERT INTO posts (content, likes, created_at) VALUES (?, 0, datetime('now'))",
    args: [content],
  });

  res.json({ success: true });
}