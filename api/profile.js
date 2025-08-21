import { db } from "../lib/db.js";
import jwt from "jsonwebtoken";

export default async function handler(req, res) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const token = req.cookies.token;
        if (!token) {
            return res.status(401).json({ error: 'Not authenticated' });
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const userId = decoded.userId;

        const result = await db.execute({
            sql: 'SELECT id, username, profile_picture_url, created_at FROM users WHERE id = ?',
            args: [userId],
        });

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        res.status(200).json({ user: result.rows[0] });

    } catch (err) {
        console.error('Profile fetch error:', err);
        if (err instanceof jwt.JsonWebTokenError) {
            return res.status(401).json({ error: 'Invalid token' });
        }
        res.status(500).json({ error: 'Failed to fetch profile' });
    }
}