# DESIGN_SPEC.md — NorthRiver Banking Agent

## Overview

NorthRiver Banking Agent is a voice-first AI customer support agent for a retail bank,
built on Google ADK with Gemini Live API. Customers interact entirely through
natural voice conversation; no typing, no forms, no redirects.

The agent is pre-authenticated — before the conversation starts, the customer
selects their account and all personal financial context is loaded into session
state. The agent knows who it is speaking to without ever asking.

Three core capabilities are demonstrated:
1. **Personalised Q&A**: Query transaction history with natural language
2. **Action Fulfillment**: Execute transfers to saved contacts by voice
3. **QR Bill Payment**: Snap a photo of a physical bill → agent reads the QR code
   → confirms payment details → executes — entirely within the conversation

## Example Use Cases

### 1. Spending Query
- Customer: "How much did I spend on coffee last year?"
- Agent: calls `get_transactions(category="coffee", year=2025)`
- Agent: "You spent €342.50 on coffee in 2025 — about €28 a month."

### 2. Contact Transfer
- Customer: "Transfer €10 to David"
- Agent: calls `find_contact(name="David")` → finds IBAN
- Agent: "I found David's account at ING. Shall I send him €10 from your current account?"
- Customer: "Yes"
- Agent: calls `make_transfer(to_iban="...", amount=10, currency="EUR")`
- Agent: "Done — €10 sent to David. Your new balance is €2,837.50."

### 3. QR Bill Payment (Showstopper)
- Customer: "I want to pay this bill" + uploads photo
- Agent: reads SEPA EPC QR code in image
- Agent: "I can see a Vattenfall energy bill for €94.20, reference INV-2026-03-8821,
  due this month. Shall I pay it from your current account?"
- Customer: "Yes, pay it"
- Agent: calls `process_qr_payment(merchant="Vattenfall N.V.", amount=94.20, ...)`
- Agent: "Payment sent. Your reference number is PAY-2026-03-0042."

## Tools Required

| Tool | Purpose | Data Source |
|------|---------|-------------|
| `get_account_balance` | Current balance + IBAN | Firestore `accounts` |
| `get_transactions` | History by category+year | Firestore `transactions` |
| `find_contact` | IBAN lookup by name | Firestore `contacts` |
| `make_transfer` | Execute mock transfer | Firestore `transactions` |
| `process_qr_payment` | Execute mock QR payment | Firestore `transactions` |

Authentication: Firebase Admin SDK service account (Application Default Credentials
in Cloud Run; local `.env` with `FIRESTORE_PROJECT`).

## Constraints & Safety Rules

- **Always confirm** before executing transfers or payments: state merchant/recipient,
  amount, and source account; wait for explicit verbal confirmation
- **Never ask** for account number mid-conversation — context is pre-loaded in state
- **Never reveal** tool names, internal state keys, or system architecture
- **Never invent** transaction data — only return what Firestore returns
- **Refuse** if transfer amount exceeds current balance
- **Graceful fallback** if contact not found: "I don't have a saved contact for [name].
  Could you confirm their IBAN?"
- **Voice-first**: responses must be natural speech — no bullet points, no markdown,
  no long lists. Keep answers under 3 sentences where possible.

## Success Criteria

- All 3 demo flows complete in under 30 seconds each
- Agent correctly extracts payment details from SEPA EPC QR codes
- Agent never executes a transfer without verbal confirmation
- Transcription displayed in real-time (< 500ms lag)
- Audio playback with no noticeable gaps or glitches

## Edge Cases to Handle

1. **Contact not found**: Ask for IBAN instead of failing silently
2. **Insufficient balance**: Inform customer, do not execute
3. **Non-QR image**: "I can see your photo but couldn't find a payment QR code.
   Could you hold the QR code closer to the camera?"
4. **Ambiguous contact name**: "I found two contacts named David — David Jansen at ING
   or David Müller at Deutsche Bank. Which one?"
5. **No microphone permission**: Frontend shows a clear error with setup instructions
6. **Image too blurry for QR**: Server-side pyzbar decode fails gracefully;
   Gemini's vision still attempts to read the QR visually
