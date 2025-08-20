import { db } from "../lib/db.js";

// Disable body parsing so we can handle files
export const config = { api: { bodyParser: false } };

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Only POST" });

  const busboy = (await import("busboy")).default;
  const bb = busboy({ headers: req.headers });
  let content = "";
  let imageBuffer = null;

  bb.on("field", (name, val) => {
    if (name === "content") content = val;
  });

  bb.on("file", (_, file) => {
    const chunks = [];
    file.on("data", (chunk) => chunks.push(chunk));
    file.on("end", () => { imageBuffer = Buffer.concat(chunks); });
  });

  bb.on("finish", async () => {
    let imageUrl = null;
    if (imageBuffer) {
      const blobRes = await fetch("https://api.vercel.com/v2/blob", {
        method: "POST",
        headers: { Authorization: `Bearer ${process.env.BLOB_READ_WRITE_TOKEN}` },
        body: imageBuffer,
      });
      const blob = await blobRes.json();
      imageUrl = blob.url;
    }

    await db.execute({
      sql: "INSERT INTO posts (content, likes, created_at, image_url) VALUES (?, 0, datetime('now'), ?)",
      args: [content, imageUrl],
    });

    res.json({ success: true });
  });

  req.pipe(bb);
}