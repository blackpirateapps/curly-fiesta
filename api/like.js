import { createClient } from "@libsql/client";

const db = createClient({
  url: process.env.TURSO_DB_URL,
  authToken: process.env.TURSO_DB_TOKEN,
});

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { targetId, type } = await req.json(); 
    // type = "post" or "comment"

    if (!targetId || !type) {
      return res.status(400).json({ error: "Missing fields" });
    }

    const table = type === "comment" ? "comments" : "posts";

    await db.execute({
      sql: `UPDATE ${table} SET likes = COALESCE(likes, 0) + 1 WHERE id = ?`,
      args: [targetId],
    });

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error("Like error:", err);
    return res.status(500).json({ error: "Failed to like" });
  }
}