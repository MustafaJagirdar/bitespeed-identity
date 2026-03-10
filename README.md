# Bitespeed Identity Reconciliation

## Live Endpoint
POST https://bitespeed-identity-xofb.onrender.com/identify

## How to test
curl -X POST https://bitespeed-identity-xofb.onrender.com/identify \
  -H "Content-Type: application/json" \
  -d '{"email":"lorraine@hillvalley.edu","phoneNumber":"123456"}'

## Tech Stack
- Node.js + TypeScript
- Express
- SQLite (better-sqlite3)

## How it works
- Links customer contacts by shared email or phone number
- Oldest contact is always the primary
- New info on existing contact creates a secondary
- Two separate clusters get merged when a request links them
