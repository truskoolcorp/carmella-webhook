// src/app/api/webhook/fanvue-message/route.ts
import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

// Env vars
const FANVUE_SIGNING_SECRET = process.env.FANVUE_WEBHOOK_SIGNING_SECRET;

if (!FANVUE_SIGNING_SECRET) {
  console.error('FANVUE_WEBHOOK_SIGNING_SECRET is not set in env');
}

export async function POST(req: NextRequest) {
  try {
    // Get raw body for signature verification
    const rawBody = await req.text();

    // Log headers for debugging (remove after confirming signature header)
    console.log('Incoming webhook headers:', Object.fromEntries(req.headers.entries()));

    const signatureHeader = req.headers.get('x-fanvue-signature'); // Try this first; may be 'x-signature' or similar

    if (!signatureHeader) {
      console.warn('Missing signature header');
      return NextResponse.json({ error: 'Missing signature' }, { status: 400 });
    }

    // Compute expected signature (HMAC-SHA256 of raw body, hex)
    const computedSignature = crypto
      .createHmac('sha256', FANVUE_SIGNING_SECRET!)
      .update(rawBody)
      .digest('hex');

    if (computedSignature !== signatureHeader) {
      console.warn('Signature mismatch', { computed: computedSignature, received: signatureHeader });
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }

    console.log('Signature verified successfully');

    // Parse payload
    let payload;
    try {
      payload = JSON.parse(rawBody);
    } catch (parseErr) {
      console.error('Invalid JSON payload', parseErr);
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }

    // Log full payload for debug
    console.log('Webhook payload:', JSON.stringify(payload, null, 2));

    // Handle relevant events
    const eventType = payload.type || payload.event; // Some use 'type', some 'event'

    if (eventType === 'message.created' || eventType === 'message.received') {
      // Extract from docs-like structure
      const messageData = payload.message || payload.data || {};
      const chatId = messageData.chatId || messageData.chat_id || payload.chatId;
      const userUuid = messageData.sender?.uuid || payload.sender?.uuid || 'unknown';
      const fanMessage = messageData.text || payload.text || '';

      if (chatId && fanMessage) {
        console.log(`Processing new message in chat ${chatId} from ${userUuid}: ${fanMessage}`);

        // Trigger async processing (don't await - respond fast)
        processCarmellaResponse(chatId, userUuid, fanMessage).catch((err) =>
          console.error('Carmella processing failed:', err)
        );

        return NextResponse.json({ received: true }, { status: 200 });
      }
    }

    // Unknown/other event - just ack
    console.log(`Unhandled event: ${eventType}`);
    return NextResponse.json({ received: true }, { status: 200 });
  } catch (error) {
    console.error('Webhook error:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

// Your core logic placeholder (expand this next)
async function processCarmellaResponse(chatId: string, userUuid: string, fanMessage: string) {
  console.log('Starting Carmella response flow...');
  // 1. OpenAI GPT call (Carmella persona + fanMessage → reply text)
  // 2. ElevenLabs TTS (reply text → MP3 file/buffer)
  // 3. Fanvue API: Upload audio → get media UUID
  // 4. Send message: POST to chat endpoint with text + mediaUuids
  // Use fetch/axios + env vars for keys/tokens
}

// Disable body parser (required)
export const config = {
  api: {
    bodyParser: false,
  },
};