// api/verify/[id].js
// Usage: GET /api/verify/UTR_OR_TRANSACTION_ID?amount=500

import { google } from "googleapis";
import mongoose from "mongoose";

// ─── MongoDB Setup ────────────────────────────────────────────────
let isConnected = false;
async function connectDB() {
  if (isConnected) return;
  await mongoose.connect(process.env.MONGO_URI);
  isConnected = true;
}

const PaymentSchema = new mongoose.Schema({
  transactionId: { type: String, unique: true },  // FamPay ID - always saved
  utr:           { type: String, sparse: true },   // UTR - only saved if exists
  amount:        Number,
  sender:        String,
  date:          Date,
  rawSubject:    String,
  usedAt:        { type: Date, default: null },    // When was it verified
  createdAt:     { type: Date, default: Date.now },
});

const Payment =
  mongoose.models.Payment || mongoose.model("Payment", PaymentSchema);

// ─── Gmail Fetch & Parse ──────────────────────────────────────────
async function syncGmailPayments(accessToken) {
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );
  oauth2Client.setCredentials({ access_token: accessToken });

  const gmail = google.gmail({ version: "v1", auth: oauth2Client });

  const oneHourAgo = Math.floor((Date.now() - 60 * 60 * 1000) / 1000);
  const query = `from:no-reply@famapp.in after:${oneHourAgo}`;

  const listRes = await gmail.users.messages.list({
    userId: "me",
    q: query,
    maxResults: 50,
  });

  const messages = listRes.data.messages || [];

  for (const msg of messages) {
    const detail = await gmail.users.messages.get({
      userId: "me",
      id: msg.id,
      format: "full",
    });

    const headers = detail.data.payload.headers;
    const subject = headers.find((h) => h.name === "Subject")?.value || "";
    if (!subject.includes("You received")) continue;

    let body = "";
    const parts = detail.data.payload.parts || [detail.data.payload];
    for (const part of parts) {
      if (part.mimeType === "text/plain" && part.body?.data) {
        body = Buffer.from(part.body.data, "base64").toString("utf-8");
        break;
      }
    }
    if (!body && detail.data.payload.body?.data) {
      body = Buffer.from(detail.data.payload.body.data, "base64").toString("utf-8");
    }

    const amountMatch  = subject.match(/₹([\d.]+)/);
    const txnMatch     = body.match(/Transaction ID\s*:\s*(\S+)/);
    const utrMatch     = body.match(/UTR\s*:\s*(\S+)/);
    const senderMatch  = body.match(/from\s+([A-Z ]+)/i);
    const dateMatch    = body.match(/Date\s*:\s*(.+)/);

    if (!txnMatch) continue;

    const utrValue = utrMatch ? utrMatch[1].trim() : undefined;

    const paymentData = {
      transactionId: txnMatch[1].trim(),
      amount:  amountMatch ? parseFloat(amountMatch[1]) : null,
      sender:  senderMatch ? senderMatch[1].trim() : "Unknown",
      date:    dateMatch ? new Date(dateMatch[1].trim()) : new Date(),
      rawSubject: subject,
    };

    // Only add utr if it exists
    if (utrValue) paymentData.utr = utrValue;

    // Skip if already in DB
    const existing = await Payment.findOne({
      $or: [
        { transactionId: paymentData.transactionId },
        ...(utrValue ? [{ utr: utrValue }] : []),
      ],
    });
    if (existing) continue;

    try {
      await Payment.create(paymentData);
    } catch (e) {
      if (e.code !== 11000) console.error("Save error:", e.message);
    }
  }
}

// ─── Main Handler ─────────────────────────────────────────────────
export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  if (req.method === "OPTIONS") return res.status(200).end();

  const { id, token, admin, amount } = req.query;

  // Admin panel
  if (id === "all") {
    if (admin !== process.env.ADMIN_PASSWORD) {
      return res.status(401).json({ success: false, error: "Unauthorized" });
    }
    await connectDB();
    const payments = await Payment.find().sort({ createdAt: -1 }).limit(100);
    return res.status(200).json({ success: true, payments });
  }

  if (!id) {
    return res.status(400).json({ success: false, error: "ID required" });
  }

  try {
    await connectDB();

    if (token) {
      try { await syncGmailPayments(token); }
      catch (e) { console.error("Gmail sync error:", e.message); }
    }

    const payment = await Payment.findOne({
      $or: [
        { transactionId: id.trim() },
        { utr: id.trim() },
      ],
    });

    // Not Found
    if (!payment) {
      return res.status(404).json({
        success: false,
        verified: false,
        message: "Payment not found.",
      });
    }

    // Already verified (duplicate)
    if (payment.usedAt) {
      return res.status(200).json({
        success: false,
        verified: false,
        duplicate: true,
        message: "This payment has already been verified before.",
        payment: {
          transactionId: payment.transactionId,
          utr: payment.utr || null,
          amount: payment.amount,
          sender: payment.sender,
          date: payment.date,
          usedAt: payment.usedAt,
        },
      });
    }

    // Amount mismatch
    if (amount) {
      const expectedAmount = parseFloat(amount);
      if (payment.amount !== expectedAmount) {
        return res.status(200).json({
          success: false,
          verified: false,
          duplicate: false,
          message: `Amount mismatch! Expected ₹${expectedAmount} but payment was ₹${payment.amount}`,
          payment: {
            transactionId: payment.transactionId,
            utr: payment.utr || null,
            amount: payment.amount,
            sender: payment.sender,
            date: payment.date,
          },
        });
      }
    }

    // Mark as used
    payment.usedAt = new Date();
    await payment.save();

    // Success
    return res.status(200).json({
      success: true,
      verified: true,
      duplicate: false,
      payment: {
        transactionId: payment.transactionId,
        utr: payment.utr || null,
        amount: payment.amount,
        sender: payment.sender,
        date: payment.date,
        usedAt: payment.usedAt,
      },
    });

  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, error: "Server error" });
  }
}
