import { db } from "../lib/db.js";
import { del } from "@vercel/blob";

// This is the single, secure endpoint for all admin actions.
export default async function handler(req, res) {
  const { password, action, id, content, likes } = req.body;

  // IMPORTANT: Every action requires the admin password from the environment variables.
  if (!process.env.ADMIN_PASSWORD) {
    return res.status(500).json({ error: "Admin password is not configured." });
  }

  // Authenticate every request
  if (req.method !== 'GET' && password !== process.env.ADMIN_PASSWORD) {
    if (action !== 'login') { // Login is a special case
        return res.status(401).json({ error: "Unauthorized" });
    }
  }

  try {
    // --- AUTHENTICATION ---
    if (req.method === 'POST' && action === 'login') {
      if (req.body.password === process.env.ADMIN_PASSWORD) {
        return res.status(200).json({ success: true, message: "Login successful" });
      } else {
        return res.status(401).json({ error: "Invalid password" });
      }
    }

    // --- DATA FETCHING ---
    if (req.method === 'GET') {
      // For GET requests, password must be in query params for simplicity
      if (req.query.password !== process.env.ADMIN_PASSWORD) {
          return res.status(401).json({ error: "Unauthorized" });
      }
      
      const postsResult = await db.execute("SELECT * FROM posts ORDER BY created_at DESC");
      const commentsResult = await db.execute("SELECT * FROM comments ORDER BY created_at DESC");
      const pollsResult = await db.execute("SELECT * FROM poll_options");
      const stickersResult = await db.execute("SELECT * FROM stickers ORDER BY created_at DESC");

      return res.status(200).json({
        posts: postsResult.rows,
        comments: commentsResult.rows,
        poll_options: pollsResult.rows,
        stickers: stickersResult.rows
      });
    }

    // --- DELETE ACTIONS ---
    if (req.method === 'POST' && action.startsWith('delete_')) {
      switch (action) {
        case 'delete_post':
          await db.execute({ sql: "DELETE FROM posts WHERE id = ?", args: [id] });
          break;
        case 'delete_comment':
          await db.execute({ sql: "DELETE FROM comments WHERE id = ?", args: [id] });
          break;
        case 'delete_sticker':
          // Also delete from Vercel Blob storage
          await del(content); // content here holds the sticker URL
          await db.execute({ sql: "DELETE FROM stickers WHERE id = ?", args: [id] });
          break;
        case 'delete_poll_option':
          await db.execute({ sql: "DELETE FROM poll_options WHERE id = ?", args: [id] });
          break;
        default:
          return res.status(400).json({ error: "Invalid delete action" });
      }
      return res.status(200).json({ success: true });
    }

    // --- UPDATE ACTIONS ---
    if (req.method === 'POST' && action.startsWith('update_')) {
      switch (action) {
        case 'update_post':
          await db.execute({ sql: "UPDATE posts SET content = ?, likes = ? WHERE id = ?", args: [content, likes, id] });
          break;
        case 'update_comment':
          await db.execute({ sql: "UPDATE comments SET content = ? WHERE id = ?", args: [content, id] });
          break;
        case 'update_poll_option':
          await db.execute({ sql: "UPDATE poll_options SET option_text = ? WHERE id = ?", args: [content, id] });
          break;
        default:
          return res.status(400).json({ error: "Invalid update action" });
      }
      return res.status(200).json({ success: true });
    }

    return res.status(405).json({ error: "Method or action not allowed" });

  } catch (err) {
    console.error(`Admin action failed [${action}]:`, err);
    return res.status(500).json({ error: "An internal server error occurred." });
  }
}
