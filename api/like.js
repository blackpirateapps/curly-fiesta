import { createClient } from "@libsql/client";

const db = createClient({
  url: process.env.TURSO_DB_URL,
  authToken: process.env.TURSO_DB_TOKEN,
});

// Helper function to parse JSON body from request
function parseJSON(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk.toString();
    });
    req.on("end", () => {
      try {
        resolve(JSON.parse(body));
      } catch (err) {
        reject(err);
      }
    });
    req.on("error", (err) => {
      reject(err);
    });
  });
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { id, type } = await parseJSON(req);

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