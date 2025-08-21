import { db } from "../lib/db.js";
import { del } from "@vercel/blob";

export default async function handler(req, res) {
  // IMPORTANT: Check for password configuration first.
  if (!process.env.ADMIN_PASSWORD) {
    return res.status(500).json({ error: "Admin password is not configured." });
  }

  // Handle the login action separately and first.
  if (req.method === 'POST' && req.body.action === 'login') {
    if (req.body.password === process.env.ADMIN_PASSWORD) {
      return res.status(200).json({ success: true, message: "Login successful" });
    } else {
      return res.status(401).json({ error: "Invalid password" });
    }
  }

  // For all other actions, perform a unified authentication check.
  const providedPassword = req.method === 'GET' ? req.query.password : req.body.password;
  if (providedPassword !== process.env.ADMIN_PASSWORD) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  // If authenticated, proceed with the requested action.
  try {
    const { action, id, content, likes } = req.body;

    // --- DATA FETCHING ---
    if (req.method === 'GET') {
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
    
    // If no action matched for an authenticated POST request
    if (req.method === 'POST') {
        return res.status(400).json({ error: "Invalid action specified." });
    }

    return res.status(405).json({ error: "Method not allowed" });

  } catch (err) {
    const action = req.body.action || 'GET';
    console.error(`Admin action failed [${action}]:`, err);
    return res.status(500).json({ error: "An internal server error occurred." });
  }
}
