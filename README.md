# FamPay Payment Checker

Gmail se last 1 hour ke FamPay payments verify karo.

## Features
- ✅ Last 1 hour ke FamPay emails auto-fetch
- ✅ UTR ya Transaction ID se verify
- ✅ MongoDB me save (duplicate check)
- ✅ Admin panel with password `8435`
- ✅ Public API: `/verify/UTR_OR_ID`

## API Usage

### Verify by UTR or Transaction ID
```
GET /api/verify/612551633446
GET /api/verify/FMPIB5384574647
```

### Response (Found)
```json
{
  "success": true,
  "verified": true,
  "payment": {
    "transactionId": "FMPIB5384574647",
    "utr": "612551633446",
    "amount": 1.0,
    "sender": "SUMIT",
    "date": "2026-05-05T09:39:00.000Z"
  }
}
```

### Response (Not Found)
```json
{
  "success": false,
  "verified": false,
  "message": "Payment not found."
}
```

## Setup Steps

### 1. MongoDB Atlas Setup
1. mongodb.com pe free account banao
2. New cluster banao (free tier)
3. Database user banao
4. Connection string copy karo

### 2. Vercel Deploy
1. GitHub pe repo banao
2. Yeh code upload karo
3. Vercel.com pe import karo
4. Environment variables add karo (see .env.example)

### 3. Google OAuth Redirect URI Update
Vercel deploy hone ke baad:
- Google Cloud Console → Credentials
- Apna OAuth client edit karo
- Authorized redirect URIs me add karo:
  `https://YOUR-APP.vercel.app/api/auth`
