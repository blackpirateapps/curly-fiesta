import { db } from "../lib/db.js";

export default async function handler(req, res) {
  try {
    // First, get all posts
    const postsResult = await db.execute(
      "SELECT id, content, likes, created_at, image_url FROM posts ORDER BY created_at DESC LIMIT 50"
    );
    const posts = postsResult.rows;

    if (posts.length === 0) {
      return res.json([]);
    }

    // Then, get all poll options for those posts
    const postIds = posts.map(p => p.id);
    const placeholders = postIds.map(() => '?').join(',');
    
    const pollsResult = await db.execute({
        sql: `SELECT id, post_id, option_text, votes FROM poll_options WHERE post_id IN (${placeholders})`,
        args: postIds
    });
    const pollOptions = pollsResult.rows;

    // Create a map for easy lookup
    const pollOptionsByPostId = {};
    pollOptions.forEach(option => {
        if (!pollOptionsByPostId[option.post_id]) {
            pollOptionsByPostId[option.post_id] = [];
        }
        pollOptionsByPostId[option.post_id].push(option);
    });

    // Attach poll options to each post
    const postsWithPolls = posts.map(post => {
        return {
            ...post,
            poll_options: pollOptionsByPostId[post.id] || null
        };
    });

    res.json(postsWithPolls);
  } catch (error) {
    console.error("Get posts error:", error);
    res.status(500).json({ error: "Failed to fetch posts" });
  }
}
