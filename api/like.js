import { createClient } from "@libsql/client";

const db = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

export default async function handler(req, res) {
  if (req.method === "POST") {
    return handleLike(req, res);
  } else if (req.method === "GET") {
    return handleGetLikes(req, res);
  } else {
    res.status(405).json({ error: "Method not allowed" });
  }
}

/**
 * POST /api/like
 * body: { type: "post" | "comment", id: number, action: "like" | "unlike" }
 */
async function handleLike(req, res) {
  try {
    const { type, id, action } = req.body;

    if (!type || !id || !["post", "comment"].includes(type)) {
      return res.status(400).json({ error: "Invalid type or id" });
    }

    if (!["like", "unlike"].includes(action)) {
      return res.status(400).json({ error: "Invalid action" });
    }

    const table = type === "post" ? "posts" : "comments";

    const op = action === "like" ? "+" : "-";

    await db.execute({
      sql: `UPDATE ${table} SET likes = likes ${op} 1 WHERE id = ?`,
      args: [id],
    });

    const result = await db.execute({
      sql: `SELECT likes FROM ${table} WHERE id = ?`,
      args: [id],
    });

    res.status(200).json({ success: true, likes: result.rows[0].likes });
  } catch (err) {
    console.error("Like POST error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
}

/**
 * GET /api/like?type=post&id=123
 */
async function handleGetLikes(req, res) {
  try {
    const { type, id } = req.query;

    if (!type || !id || !["post", "comment"].includes(type)) {
      return res.status(400).json({ error: "Invalid type or id" });
    }

    const table = type === "post" ? "posts" : "comments";

    const result = await db.execute({
      sql: `SELECT likes FROM ${table} WHERE id = ?`,
      args: [id],
    });

    if (result.rows.length === 0) {
      return res.status(404).json({ error: `${type} not found` });
    }

    res.status(200).json({ likes: result.rows[0].likes });
  } catch (err) {
    console.error("Like GET error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
}