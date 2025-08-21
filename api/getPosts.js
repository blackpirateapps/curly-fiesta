import { db } from "../lib/db.js";

export default async function handler(req, res) {
  try {
    // Fetch posts
    const postsResult = await db.execute(
      "SELECT id, content, likes, created_at, image_url FROM posts ORDER BY created_at DESC LIMIT 50"
    );
    const posts = postsResult.rows;

    // Fetch poll options
    const postIds = posts.map(p => p.id);
    let pollOptions = [];
    if (postIds.length > 0) {
        const placeholders = postIds.map(() => '?').join(',');
        const pollsResult = await db.execute({
            sql: `SELECT id, post_id, option_text, votes FROM poll_options WHERE post_id IN (${placeholders})`,
            args: postIds
        });
        pollOptions = pollsResult.rows;
    }
    
    // Fetch the notice board content
    const noticeResult = await db.execute("SELECT content FROM notice_board WHERE id = 1");
    const notice = noticeResult.rows[0]?.content || "Welcome to Curly Fiesta! No notices right now.";

    // Combine data
    const pollOptionsByPostId = {};
    pollOptions.forEach(option => {
        if (!pollOptionsByPostId[option.post_id]) {
            pollOptionsByPostId[option.post_id] = [];
        }
        pollOptionsByPostId[option.post_id].push(option);
    });

    const postsWithPolls = posts.map(post => ({
        ...post,
        poll_options: pollOptionsByPostId[post.id] || null
    }));

    // Return a single object with all homepage data
    res.json({
        posts: postsWithPolls,
        notice: notice
    });

  } catch (error) {
    console.error("Get posts error:", error);
    res.status(500).json({ error: "Failed to fetch homepage data" });
  }
}