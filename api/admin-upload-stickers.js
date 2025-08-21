import { db } from "../lib/db.js";
import { put } from "@vercel/blob";
import Busboy from "busboy";

export const config = {
  api: {
    bodyParser: false,
  },
};

// Helper to parse a form with multiple files
function parseMultipartForm(req) {
  return new Promise((resolve, reject) => {
    const busboy = Busboy({ headers: req.headers });
    const fields = {};
    const files = [];

    busboy.on("file", (fieldname, file, info) => {
      const { filename, mimeType } = info;
      const chunks = [];
      file.on("data", (chunk) => chunks.push(chunk));
      file.on("end", () => {
        files.push({
          buffer: Buffer.concat(chunks),
          filename,
          mimeType,
        });
      });
    });

    busboy.on("field", (name, val) => {
      fields[name] = val;
    });

    busboy.on("finish", () => resolve({ fields, files }));
    busboy.on("error", (err) => reject(err));

    req.pipe(busboy);
  });
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!process.env.ADMIN_PASSWORD) {
    return res.status(500).json({ error: "Admin password is not configured." });
  }

  try {
    const { fields, files } = await parseMultipartForm(req);

    // Authenticate the request
    if (fields.password !== process.env.ADMIN_PASSWORD) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    if (!files || files.length === 0) {
      return res.status(400).json({ error: "No files were uploaded." });
    }

    const uploadPromises = files.map(async (file) => {
      // Validate each file
      const allowedMimeTypes = ['image/png', 'image/gif', 'image/webp'];
      if (!allowedMimeTypes.includes(file.mimeType)) {
        console.warn(`Skipping invalid file type: ${file.filename}`);
        return null; // Skip this file
      }
      if (file.buffer.length > 2 * 1024 * 1024) { // 2MB limit
        console.warn(`Skipping oversized file: ${file.filename}`);
        return null; // Skip this file
      }

      // Upload valid file to Vercel Blob
      const blob = await put(`stickers/${Date.now()}-${file.filename}`, file.buffer, {
        access: "public",
        contentType: file.mimeType,
      });
      return blob.url;
    });

    const uploadedUrls = (await Promise.all(uploadPromises)).filter(url => url !== null);

    if (uploadedUrls.length === 0) {
      return res.status(400).json({ error: "No valid files were uploaded." });
    }

    // Save all new URLs to the database
    const insertPromises = uploadedUrls.map(url => 
        db.execute({ sql: "INSERT INTO stickers (url) VALUES (?)", args: [url] })
    );
    await Promise.all(insertPromises);

    return res.status(200).json({ success: true, uploadedCount: uploadedUrls.length });

  } catch (err) {
    console.error("Admin sticker upload error:", err);
    return res.status(500).json({ error: "An internal server error occurred during upload." });
  }
}
