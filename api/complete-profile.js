import { db } from "../lib/db.js";
import { put } from "@vercel/blob";
import Busboy from "busboy";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";

export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const busboy = Busboy({ headers: req.headers });
    const fields = {};
    let fileBuffer, fileName, mimeType;

    busboy.on('file', (fieldname, file, info) => {
        fileName = info.filename;
        mimeType = info.mimeType;
        const chunks = [];
        file.on('data', (chunk) => chunks.push(chunk));
        file.on('end', () => fileBuffer = Buffer.concat(chunks));
    });

    busboy.on('field', (name, val) => fields[name] = val);

    busboy.on('finish', async () => {
        try {
            const { authToken, username } = fields;

            if (!authToken || !username) {
                return res.status(400).json({ error: 'Auth token and username are required' });
            }

            // Find user by auth token
            const users = await db.execute("SELECT * FROM users");
            let user = null;
            for(const u of users.rows){
                const match = await bcrypt.compare(authToken, u.auth_token_hash);
                if(match){
                    user = u;
                    break;
                }
            }

            if (!user) {
                return res.status(404).json({ error: 'User not found' });
            }
            
            let profilePictureUrl = null;
            if (fileBuffer) {
                const blob = await put(`pfp-${Date.now()}-${fileName}`, fileBuffer, {
                    contentType: mimeType,
                    access: 'public',
                });
                profilePictureUrl = blob.url;
            }

            // Update user with username and profile picture
            await db.execute({
                sql: 'UPDATE users SET username = ?, profile_picture_url = ? WHERE id = ?',
                args: [username, profilePictureUrl, user.id]
            });

            // Log the user in
            const token = jwt.sign({ userId: user.id, username }, process.env.JWT_SECRET, {
                expiresIn: '7d',
            });

            res.setHeader('Set-Cookie', `token=${token}; HttpOnly; Path=/; Max-Age=604800; SameSite=Lax`);
            res.status(200).json({ success: true, message: 'Profile completed successfully' });

        } catch (err) {
            console.error('Complete profile error:', err);
            res.status(500).json({ error: 'Failed to complete profile' });
        }
    });

    req.pipe(busboy);
}