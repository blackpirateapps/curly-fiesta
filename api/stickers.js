import { db } from "../lib/db.js";
import { put } from "@vercel/blob";
import Busboy from "busboy";

export const config = {
  api: {
    bodyParser: false,
  },
};

// Helper function to parse multipart form data
function parseForm(req) {
  return new Promise((resolve, reject) => {
    const busboy = Busboy({ headers: req.headers });
    let file = null;

    busboy.on("file", (name, stream, info) => {
      const { filename, mimeType } = info;
      const chunks = [];
      stream.on("data", (chunk) => chunks.push(chunk));
      stream.on("end", () => {
        file = { buffer: Buffer.concat(chunks), filename, mimeType };
      });
    });

    busboy.on("finish", () => resolve({ file }));
    busboy.on("error", (err) => reject(err));
    req.pipe(busboy);
  });
}

export default async function handler(req, res) {
  // GET: Fetch all sticker URLs
  if (req.method === "GET") {
    try {
      const result = await db.execute("SELECT url FROM stickers ORDER BY created_at DESC");
      return res.status(200).json(result.rows);
    } catch (err) {
      console.error("Fetch stickers error:", err);
      return res.status(500).json({ error: "Failed to fetch stickers" });
    }
  }

  // POST: Upload a new sticker
  if (req.method === "POST") {
    try {
      const { file } = await parseForm(req);

      if (!file) {
        return res.status(400).json({ error: "No file uploaded." });
      }
      
      // Server-side validation for file type and size
      if (!['image/png', 'image/gif'].includes(file.mimeType)) {
          return res.status(400).json({ error: "Invalid file type. Only PNG and GIF are allowed." });
      }
      if (file.buffer.length > 500 * 1024) { // 500kb limit
          return res.status(400).json({ error: "File is too large. Max size is 500kb." });
      }

      // Upload the file to Vercel Blob
      const blob = await put(`stickers/${Date.now()}-${file.filename}`, file.buffer, {
        access: "public",
        contentType: file.mimeType,
      });

      // Save the public URL to our database
      await db.execute({
        sql: "INSERT INTO stickers (url) VALUES (?)",
        args: [blob.url],
      });

      return res.status(200).json({ success: true, url: blob.url });
    } catch (err) {
      console.error("Upload sticker error:", err);
      return res.status(500).json({ error: "Failed to upload sticker" });
    }
  }

  return res.status(405).json({ error: "Method not allowed" });
}
