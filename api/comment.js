import { createClient } from "@libsql/client";
import { put } from "@vercel/blob";
import Busboy from "busboy";

const db = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

export default async function handler(req, res) {
  if (req.method === "POST") {
    return handlePost(req, res);
  } else if (req.method === "GET") {
    return handleGet(req, res);
  } else {
    res.status(405).json({ error: "Method not allowed" });
  }
}

/**
 * Handle creating a new comment or reply
 */
async function handlePost(req, res) {
  try {
    const busboy = Busboy({ headers: req.headers });
    let post_id, parent_id, text, imageUrl = null;

    const buffers = [];

    busboy.on("file", async (fieldname, file, filename, encoding, mimetype) => {
      const chunks = [];
      file.on("data", (chunk) => chunks.push(chunk));
      file.on("end", async () => {
        const buffer = Buffer.concat(chunks);
        const blob = await put(`comments/${Date.now()}-${filename}`, buffer, {
          access: "public",
        });
        imageUrl = blob.url;
      });
    });

    busboy.on("field", (fieldname, val) => {
      if (fieldname === "post_id") post_id = val;
      if (fieldname === "parent_id") parent_id = val || null;
      if (fieldname === "text") text = val;
    });

    busboy.on("finish", async () => {
      if (!post_id || !text) {
        return res.status(400).json({ error: "post_id and text are required" });
      }

      const now = new Date().toISOString();
      const result = await db.execute({
        sql: `
          INSERT INTO comments (post_id, parent_id, text, created_at, image_url, likes)
          VALUES (?, ?, ?, ?, ?, 0)
        `,
        args: [post_id, parent_id, text, now, imageUrl],
      });

      res.status(200).json({ success: true, id: result.lastInsertRowid, imageUrl });
    });

    req.pipe(busboy);
  } catch (err) {
    console.error("Comment POST error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
}

/**
 * Handle fetching all comments + replies for a post
 */
async function handleGet(req, res) {
  try {
    const { post_id } = req.query;
    if (!post_id) {
      return res.status(400).json({ error: "post_id required" });
    }

    const result = await db.execute({
      sql: "SELECT * FROM comments WHERE post_id = ? ORDER BY created_at ASC",
      args: [post_id],
    });

    const rows = result.rows.map((row) => row);

    // Build threaded structure
    const map = {};
    const roots = [];

    rows.forEach((c) => {
      c.replies = [];
      map[c.id] = c;
    });

    rows.forEach((c) => {
      if (c.parent_id) {
        if (map[c.parent_id]) map[c.parent_id].replies.push(c);
      } else {
        roots.push(c);
      }
    });

    res.status(200).json(roots);
  } catch (err) {
    console.error("Comment GET error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
}