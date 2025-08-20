import { db } from "../lib/db.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Only POST" });

  const { postId, text } = JSON.parse(req.body);
  if (!postId || !text) return res.status(400).json({ error: "Missing fields" });

  await db.execute({
    sql: "INSERT INTO comments (post_id, text, created_at) VALUES (?, ?, datetime('now'))",
    args: [postId, text],
  });

  res.json({ success: true });
}