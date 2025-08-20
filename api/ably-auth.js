import Ably from "ably";

export default async function handler(req, res) {
  if (!process.env.ABLY_API_KEY) {
    return res.status(500).json({ error: "Ably API key not configured." });
  }

  // Use a simple static client ID for this example.
  // In a real app, you'd get this from your user authentication system.
  const clientId = `client-${Math.random().toString(36).substr(2, 9)}`;
  
  const ably = new Ably.Rest(process.env.ABLY_API_KEY);

  try {
    const tokenRequest = await ably.auth.createTokenRequest({ clientId: clientId });
    res.status(200).json(tokenRequest);
  } catch (err) {
    res.status(500).json({ error: "Error creating Ably token." });
  }
}
