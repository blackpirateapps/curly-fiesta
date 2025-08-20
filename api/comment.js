import Busboy from "busboy";
import { put } from "@vercel/blob";
import { db } from "../lib/db.js";

// helper: parse multipart
function parseMultipart(req) {
  return new Promise((resolve, reject) => {
    const busboy = Busboy({ headers: req.headers });
    const fields = {};
    let fileBuffer = null,
      fileName = null,
      mimeType = null;

    busboy.on("file", (field, file, info) => {
      fileName = info.filename;
      mimeType = info.mimeType;
      const chunks = [];
      file.on("data", (chunk) => chunks.push(chunk));
      file.on("end", () => {
        fileBuffer = Buffer.concat(chunks);
      });
    });

    busboy.on("field", (name, val) => {
      fields[name] = val;
    });
    busboy.on("finish", () =>
      resolve({ fields, fileBuffer, fileName, mimeType })
    );
    busboy.on("error", reject);

    req.pipe(busboy);
  });
}

export default async function handler(req, res) {
  if (req.method === "POST") {
    try {
      const { fields, fileBuffer, fileName, mimeType } = await parseMultipart(
        req
      );

      const { post_id, parent_id, text } = fields;
      if (!post_id || !text) {
        return res.status(400).json({ error: "Missing fields" });
      }

      let imageUrl = null;
      if (fileBuffer) {
        const blob = await put(`comment-${Date.now()}-${fileName}`, fileBuffer, {
          contentType: mimeType,
          access: "public",
        });
        imageUrl = blob.url;
      }

      await db.execute({
        sql: `
          INSERT INTO comments (post_id, parent_id, content, image_url, likes, created_at)
          VALUES (?, ?, ?, ?, 0, datetime('now'))
        `,
        args: [post_id, parent_id || null, text, imageUrl],
      });

      return res.status(200).json({ success: true });
    } catch (err) {
      console.error("Comment error:", err);
      return res.status(500).json({ error: "Failed to add comment" });
    }
  }

  if (req.method === "GET") {
    try {
      const { post_id } = req.query;
      if (!post_id) return res.status(400).json({ error: "Missing postId" });

      const result = await db.execute({
        sql: "SELECT * FROM comments WHERE post_id = ? ORDER BY created_at ASC",
        args: [post_id],
      });

      const rows = result.rows;
      const commentsById = {};
      const threadedComments = [];

      for (const row of rows) {
        const comment = { ...row, replies: [] };
        commentsById[comment.id] = comment;
      }

      for (const comment of Object.values(commentsById)) {
        if (comment.parent_id) {
          commentsById[comment.parent_id].replies.push(comment);
        } else {
          threadedComments.push(comment);
        }
      }

      return res.status(200).json(threadedComments);
    } catch (err) {
      console.error("Fetch comments error:", err);
      return res.status(500).json({ error: "Failed to fetch comments" });
    }
  }

  return res.status(405).json({ error: "Method not allowed" });
}