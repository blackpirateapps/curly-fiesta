import Ably from "ably";

export default async function handler(req, res) {
  if (!process.env.ABLY_API_KEY) {
    return res.status(500).json({ error: "Ably API key not configured." });
  }

  // Use the username from the query, or a random guest name if not provided.
  const clientId = req.query.clientId || `guest-${Math.random().toString(36).substr(2, 9)}`;
  
  const ably = new Ably.Rest(process.env.ABLY_API_KEY);

  try {
    // The clientId is now the user's chosen name
    const tokenRequest = await ably.auth.createTokenRequest({ clientId: clientId });
    res.status(200).json(tokenRequest);
  } catch (err) {
    res.status(500).json({ error: "Error creating Ably token." });
  }
}
