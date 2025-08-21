import { db } from "../lib/db.js";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import Busboy from "busboy";
import { put } from "@vercel/blob";

export const config = {
  api: {
    bodyParser: false, // We need to handle the body stream ourselves
  },
};

// --- Helper to parse a JSON request body ---
const parseJsonBody = (req) => new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => body += chunk.toString());
    req.on('end', () => {
        try {
            resolve(JSON.parse(body || '{}'));
        } catch (e) {
            reject(new Error("Invalid JSON"));
        }
    });
    req.on('error', reject);
});

// --- Helper to parse a multipart/form-data request body ---
const parseMultipartForm = (req) => new Promise((resolve, reject) => {
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
    busboy.on('finish', () => resolve({ fields, fileBuffer, fileName, mimeType }));
    busboy.on('error', reject);
    req.pipe(busboy);
});


export default async function handler(req, res) {
  try {
    // =============================================
    //  HANDLE GET PROFILE REQUEST
    // =============================================
    if (req.method === 'GET') {
      if (req.query.action !== 'get-profile') {
        return res.status(400).json({ error: "Invalid action for GET request" });
      }
      
      const token = req.cookies.token;
      if (!token) return res.status(401).json({ error: 'Not authenticated' });
      
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const result = await db.execute({
        // UPDATED: Select new 'bio' and 'urls' columns
        sql: 'SELECT id, username, profile_picture_url, created_at, bio, urls FROM users WHERE id = ?',
        args: [decoded.userId],
      });

      if (result.rows.length === 0) return res.status(404).json({ error: 'User not found' });
      
      return res.status(200).json({ user: result.rows[0] });
    }

    // =============================================
    //  HANDLE ALL POST REQUESTS
    // =============================================
    if (req.method === 'POST') {
        const contentType = req.headers['content-type'] || '';

        // --- Route MULTIPART requests (for profile completion and updates with file upload) ---
        if (contentType.includes('multipart/form-data')) {
            const { fields, fileBuffer, fileName, mimeType } = await parseMultipartForm(req);
            
            // --- ACTION: COMPLETE-PROFILE ---
            if (fields.action === 'complete-profile') {
                const { authToken, username } = fields;
                if (!authToken || !username) return res.status(400).json({ error: 'Auth token and username are required' });

                const users = await db.execute("SELECT * FROM users");
                let user = null;
                for(const u of users.rows){
                    if(await bcrypt.compare(authToken, u.auth_token_hash)) {
                        user = u;
                        break;
                    }
                }
                if (!user) return res.status(404).json({ error: 'Invalid auth token' });

                let profilePictureUrl = null;
                if (fileBuffer && fileName) {
                    const blob = await put(`pfp-${Date.now()}-${fileName}`, fileBuffer, { contentType: mimeType, access: 'public' });
                    profilePictureUrl = blob.url;
                }

                await db.execute({
                    sql: 'UPDATE users SET username = ?, profile_picture_url = ? WHERE id = ?',
                    args: [username, profilePictureUrl, user.id]
                });

                const token = jwt.sign({ userId: user.id, username }, process.env.JWT_SECRET, { expiresIn: '7d' });
                res.setHeader('Set-Cookie', `token=${token}; HttpOnly; Path=/; Max-Age=604800; SameSite=Lax`);
                return res.status(200).json({ success: true, message: 'Profile completed' });
            }

            // --- NEW ACTION: UPDATE-PROFILE ---
            if (fields.action === 'update-profile') {
                const token = req.cookies.token;
                if (!token) return res.status(401).json({ error: 'Not authenticated' });
                
                const decoded = jwt.verify(token, process.env.JWT_SECRET);
                const userId = decoded.userId;

                const { username, bio, urls } = fields;

                let profilePictureUrl = null;
                if (fileBuffer && fileName) {
                    const blob = await put(`pfp-update-${Date.now()}-${fileName}`, fileBuffer, { contentType: mimeType, access: 'public' });
                    profilePictureUrl = blob.url;
                }
                
                const { rows: [currentUser] } = await db.execute({ sql: 'SELECT profile_picture_url FROM users WHERE id = ?', args: [userId] });

                await db.execute({
                    sql: 'UPDATE users SET username = ?, bio = ?, urls = ?, profile_picture_url = ? WHERE id = ?',
                    args: [
                        username, 
                        bio, 
                        urls,
                        profilePictureUrl || currentUser.profile_picture_url, // Use new URL if uploaded, otherwise keep old one
                        userId
                    ]
                });
                
                return res.status(200).json({ success: true, message: 'Profile updated' });
            }

            return res.status(400).json({ error: 'Invalid multipart action' });
        }
        
        // --- Route JSON requests (for signup and login) ---
        else if (contentType.includes('application/json')) {
            const body = await parseJsonBody(req);
            const { action } = body;

            if (action === 'start-signup') {
                const chars = "abcd0123456789";
                let randomString = "";
                const randomBytes = crypto.randomBytes(32);
                for (let i = 0; i < 32; i++) {
                    randomString += chars[randomBytes[i] % chars.length];
                }
                const authTokenHash = await bcrypt.hash(randomString, 10);
                await db.execute({
                    sql: "INSERT INTO users (auth_token_hash) VALUES (?)",
                    args: [authTokenHash],
                });
                return res.status(201).json({ success: true, authToken: randomString });
            }

            if (action === 'login') {
                const { authToken } = body;
                if (!authToken) return res.status(400).json({ error: "Auth token is required" });

                const users = await db.execute("SELECT * FROM users");
                let user = null;
                for (const u of users.rows) {
                    if (u.auth_token_hash && await bcrypt.compare(authToken, u.auth_token_hash)) {
                        user = u;
                        break;
                    }
                }
                if (!user) return res.status(401).json({ error: "Invalid auth token" });

                const token = jwt.sign({ userId: user.id, username: user.username }, process.env.JWT_SECRET, { expiresIn: '7d' });
                res.setHeader('Set-Cookie', `token=${token}; HttpOnly; Path=/; Max-Age=604800; SameSite=Lax`);
                return res.status(200).json({ success: true, message: "Logged in successfully" });
            }
            
            return res.status(400).json({ error: "Invalid JSON action" });
        }
        
        // --- Handle unsupported content types ---
        else {
            return res.status(415).json({ error: `Unsupported content type: ${contentType}` });
        }
    }
    
    return res.status(405).json({ error: `Method ${req.method} not allowed` });

  } catch (err) {
    console.error(`API Error:`, err);
    res.status(500).json({ error: "An internal server error occurred." });
  }
}