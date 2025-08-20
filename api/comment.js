import { createClient } from "@libsql/client";
import Busboy from "busboy";
import { put } from "@vercel/blob";

const db = createClient({
  url: process.env.TURSO_DB_URL,
  authToken: process.env.TURSO_DB_TOKEN,
});

// helper: parse multipart
function parseMultipart(req) {
  return new Promise((resolve, reject) => {
    const busboy = Busboy({ headers: req.headers });
    const fields = {};
    let fileBuffer = null, fileName = null, mimeType = null;

    busboy.on("file", (field, file, info) => {
      fileName = info.filename;
      mimeType = info.mimeType;
      const chunks = [];
      file.on("data", chunk => chunks.push(chunk));
      file.on("end", () => { fileBuffer = Buffer.concat(chunks); });
    });

    busboy.on("field", (name, val) => { fields[name] = val; });
    busboy.on("finish", () => resolve({ fields, fileBuffer, fileName, mimeType }));
    busboy.on("error", reject);

    req.pipe(busboy);
  });
}

export default async function handler(req, res) {
  if (req.method === "POST") {
    try {
      const { fields, fileBuffer, fileName, mimeType } = await parseMultipart(req);

      const { postId, parentId, content } = fields;
      if (!postId || !content) {
        return res.status(400).json({ error: "Missing fields" });
      }

      let imageUrl = null;
      if (fileBuffer) {
        const blob = await put(`comment-${Date.now()}-${fileName}`, fileBuffer, { contentType: mimeType });
        imageUrl = blob.url;
      }

      await db.execute({
        sql: `
          INSERT INTO comments (post_id, parent_id, content, image_url, likes, created_at)
          VALUES (?, ?, ?, ?, 0, datetime('now'))
        `,
        args: [postId, parentId || null, content, imageUrl],
      });

      return res.status(200).json({ success: true });
    } catch (err) {
      console.error("Comment error:", err);
      return res.status(500).json({ error: "Failed to add comment" });
    }
  }

  if (req.method === "GET") {
    try {
      const { postId } = req.query;
      if (!postId) return res.status(400).json({ error: "Missing postId" });

      const result = await db.execute({
        sql: "SELECT * FROM comments WHERE post_id = ? ORDER BY created_at ASC",
        args: [postId],
      });

      return res.status(200).json(result.rows);
    } catch (err) {
      console.error("Fetch comments error:", err);
      return res.status(500).json({ error: "Failed to fetch comments" });
    }
  }

  return res.status(405).json({ error: "Method not allowed" });
}