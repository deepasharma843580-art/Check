// api/auth.js - Google OAuth Login
import { google } from "googleapis";

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);

export default function handler(req, res) {
  const { code } = req.query;

  if (!code) {
    // Step 1: Redirect to Google Login
    const url = oauth2Client.generateAuthUrl({
      access_type: "offline",
      scope: ["https://www.googleapis.com/auth/gmail.readonly"],
      prompt: "consent",
    });
    return res.redirect(url);
  }

  // Step 2: Exchange code for tokens
  oauth2Client.getToken(code, (err, tokens) => {
    if (err) return res.status(400).json({ error: "Auth failed" });

    // Redirect to frontend with tokens
    const params = new URLSearchParams({
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token || "",
    });
    res.redirect(`/?${params.toString()}`);
  });
}

