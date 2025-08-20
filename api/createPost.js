import Busboy from "busboy";
import { db } from "../lib/db.js";
import { put } from "@vercel/blob";   // 👈 new SDK

export const config = {
  api: {
    bodyParser: false,
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

    if (file) {
      // 👇 Use Vercel Blob SDK to store
      const blob = await put(file.filename, file.buffer, {
        access: "public", // public URL
      });
      console.log("Blob response:", blob);

      imageUrl = blob.url; // permanent URL
    }

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