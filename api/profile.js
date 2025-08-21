import { db } from "../lib/db.js";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import Busboy from "busboy";
import { put } from "@vercel/blob";

export const config = {
  api: {
    bodyParser: false, // Required for Busboy to work
  },
};

export default async function handler(req, res) {
  // For GET requests, the action is in the query. For POST, it's in the body.
  const action = req.method === 'GET' ? req.query.action : req.body.action;

  // --- Multi-part Form Data Parser for 'complete-profile' ---
  const parseMultipartForm = () => new Promise((resolve, reject) => {
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

  // --- JSON Body Parser for other POST actions ---
  const parseJsonBody = () => new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => body += chunk.toString());
    req.on('end', () => {
        try {
            resolve(JSON.parse(body));
        } catch (e) {
            reject(new Error("Invalid JSON"));
        }
    });
    req.on('error', reject);
  });


  try {
    // =============================================
    //  SIGNUP - STEP 1: GENERATE AUTH TOKEN
    // =============================================
    if (req.method === 'POST' && req.body.includes('"action":"start-signup"')) {
      const chars = "abcd0123456789";
      let randomString = "";
      const randomBytes = crypto.randomBytes(32);
      for (let i = 0; i < 32; i++) {
        randomString += chars[randomBytes[i] % chars.length];
      }
      const authTokenHash = await bcrypt.hash(randomString, 10);
      const result = await db.execute({
        sql: "INSERT INTO users (auth_token_hash) VALUES (?)",
        args: [authTokenHash],
      });
      return res.status(201).json({ success: true, authToken: randomString });
    }

    // =============================================
    //  SIGNUP - STEP 2: COMPLETE PROFILE
    // =============================================
     if (req.method === 'POST' && req.headers['content-type']?.includes('multipart/form-data')) {
        const { fields, fileBuffer, fileName, mimeType } = await parseMultipartForm();
        if (fields.action !== 'complete-profile') {
             return res.status(400).json({ error: 'Invalid action for multipart form' });
        }
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
        if (!user) return res.status(404).json({ error: 'User not found' });

        let profilePictureUrl = null;
        if (fileBuffer) {
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


    // =============================================
    //  LOGIN
    // =============================================
    if (req.method === 'POST' && req.body.includes('"action":"login"')) {
      const body = await parseJsonBody();
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
      if (!user) return res.status(401).json({ error: "Invalid credentials" });

      const token = jwt.sign({ userId: user.id, username: user.username }, process.env.JWT_SECRET, { expiresIn: '7d' });
      res.setHeader('Set-Cookie', `token=${token}; HttpOnly; Path=/; Max-Age=604800; SameSite=Lax`);
      return res.status(200).json({ success: true, message: "Logged in successfully" });
    }

    // =============================================
    //  GET PROFILE
    // =============================================
    if (req.method === 'GET' && req.query.action === 'get-profile') {
      const token = req.cookies.token;
      if (!token) return res.status(401).json({ error: 'Not authenticated' });
      
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const result = await db.execute({
        sql: 'SELECT id, username, profile_picture_url, created_at FROM users WHERE id = ?',
        args: [decoded.userId],
      });
      if (result.rows.length === 0) return res.status(404).json({ error: 'User not found' });
      
      return res.status(200).json({ user: result.rows[0] });
    }

    // If no action matches
    return res.status(400).json({ error: "Invalid or missing action." });

  } catch (err) {
    console.error(`API Error for action:`, err);
    res.status(500).json({ error: "An internal server error occurred." });
  }
}