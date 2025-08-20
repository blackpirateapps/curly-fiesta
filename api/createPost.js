import Busboy from "busboy";
import { db } from "../lib/db.js";

export const config = {
  api: {
    bodyParser: false, // disable default body parsing
  },
};

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Only POST allowed" });
  }

  try {
    const { fields, file } = await parseForm(req);

    const content = fields.content || "";
    let imageUrl = null;

    // If file uploaded, push to Vercel Blob
    if (file) {
      const blobRes = await fetch("https://api.vercel.com/v2/blob", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.BLOB_READ_WRITE_TOKEN}`,
          "Content-Type": "application/octet-stream",
        },
        body: file.buffer,
      });

      const blob = await blobRes.json();
      console.log("Blob response:", blob);

      // Make sure it's a string
      if (blob && typeof blob.url === "string") {
        imageUrl = blob.url;
      }
    }

    // Insert into DB
    await db.execute({
      sql: "INSERT INTO posts (content, likes, created_at, image_url) VALUES (?, 0, datetime('now'), ?)",
      args: [content, imageUrl ?? null],
    });

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error("createPost error:", err);
    return res.status(500).json({ error: "Failed to create post" });
  }
}

// --- Helper to parse multipart form ---
function parseForm(req) {
  return new Promise((resolve, reject) => {
    const busboy = Busboy({ headers: req.headers });
    const fields = {};
    let file = null;

    busboy.on("file", (name, stream, info) => {
      const { filename } = info;
      const chunks = [];
      stream.on("data", (chunk) => chunks.push(chunk));
      stream.on("end", () => {
        file = { filename, buffer: Buffer.concat(chunks) };
      });
    });

    busboy.on("field", (name, val) => {
      fields[name] = val;
    });

    busboy.on("finish", () => {
      resolve({ fields, file });
    });

    busboy.on("error", (err) => reject(err));

    req.pipe(busboy);
  });
}