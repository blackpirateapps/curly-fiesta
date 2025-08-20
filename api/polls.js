import { db } from "../lib/db.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { optionId } = req.body;

    if (!optionId) {
      return res.status(400).json({ error: "Missing required field 'optionId'" });
    }

    await db.execute({
      sql: `UPDATE poll_options SET votes = COALESCE(votes, 0) + 1 WHERE id = ?`,
      args: [optionId],
    });

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error("Poll vote error:", err);
    return res.status(500).json({ error: "Failed to process vote" });
  }
}
