import { db } from "../lib/db.js";

export default async function handler(req, res) {
  const result = await db.execute(
    "SELECT id, content, likes, created_at, image_url FROM posts ORDER BY created_at DESC LIMIT 50"
  );
  res.json(result.rows);
}