import { db } from "../lib/db.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Only POST" });

  const { id } = JSON.parse(req.body);
  if (!id) return res.status(400).json({ error: "Missing id" });

  await db.execute("UPDATE posts SET likes = likes + 1 WHERE id = ?", [id]);

  res.json({ success: true });
}