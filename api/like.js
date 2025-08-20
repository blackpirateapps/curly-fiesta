import { db } from "../lib/db.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { id, type } = await req.json();

    if (!id || !type) {
      return res.status(400).json({ error: "Missing fields" });
    }

    const table = type === "comment" ? "comments" : "posts";

    await db.execute({
      sql: `UPDATE ${table} SET likes = COALESCE(likes, 0) + 1 WHERE id = ?`,
      args: [id],
    });

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error("Like error:", err);
    return res.status(500).json({ error: "Failed to like" });
  }
}