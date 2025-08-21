import { db } from "../lib/db.js";
import { del } from "@vercel/blob";

export default async function handler(req, res) {
  if (!process.env.ADMIN_PASSWORD) {
    return res.status(500).json({ error: "Admin password is not configured." });
  }

  if (req.method === 'POST' && req.body.action === 'login') {
    if (req.body.password === process.env.ADMIN_PASSWORD) {
      return res.status(200).json({ success: true, message: "Login successful" });
    } else {
      return res.status(401).json({ error: "Invalid password" });
    }
  }

  const providedPassword = req.method === 'GET' ? req.query.password : req.body.password;
  if (providedPassword !== process.env.ADMIN_PASSWORD) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const { action, id, content, likes } = req.body;

    if (req.method === 'GET') {
      const postsResult = await db.execute("SELECT * FROM posts ORDER BY created_at DESC");
      const commentsResult = await db.execute("SELECT * FROM comments ORDER BY created_at DESC");
      const pollsResult = await db.execute("SELECT * FROM poll_options");
      const stickersResult = await db.execute("SELECT * FROM stickers ORDER BY created_at DESC");
      const noticeResult = await db.execute("SELECT content FROM notice_board WHERE id = 1");

      return res.status(200).json({
        posts: postsResult.rows,
        comments: commentsResult.rows,
        poll_options: pollsResult.rows,
        stickers: stickersResult.rows,
        notice: noticeResult.rows[0]?.content || ''
      });
    }

    if (req.method === 'POST') {
        switch (action) {
            case 'delete_post':
              await db.execute({ sql: "DELETE FROM posts WHERE id = ?", args: [id] });
              break;
            case 'delete_comment':
              await db.execute({ sql: "DELETE FROM comments WHERE id = ?", args: [id] });
              break;
            case 'delete_sticker':
              await del(content);
              await db.execute({ sql: "DELETE FROM stickers WHERE id = ?", args: [id] });
              break;
            case 'delete_poll_option':
              await db.execute({ sql: "DELETE FROM poll_options WHERE id = ?", args: [id] });
              break;
            case 'update_post':
              await db.execute({ sql: "UPDATE posts SET content = ?, likes = ? WHERE id = ?", args: [content, likes, id] });
              break;
            case 'update_comment':
              await db.execute({ sql: "UPDATE comments SET content = ? WHERE id = ?", args: [content, id] });
              break;
            case 'update_poll_option':
              await db.execute({ sql: "UPDATE poll_options SET option_text = ? WHERE id = ?", args: [content, id] });
              break;
            case 'update_notice':
              // Use UPSERT logic to create the notice if it doesn't exist, or update it if it does.
              await db.execute({
                  sql: `INSERT INTO notice_board (id, content, updated_at) VALUES (1, ?, datetime('now'))
                        ON CONFLICT(id) DO UPDATE SET content=excluded.content, updated_at=excluded.updated_at`,
                  args: [content]
              });
              break;
            default:
              return res.status(400).json({ error: "Invalid action specified." });
        }
        return res.status(200).json({ success: true });
    }

    return res.status(405).json({ error: "Method not allowed" });

  } catch (err) {
    console.error(`Admin action failed:`, err);
    return res.status(500).json({ error: "An internal server error occurred." });
  }
}
