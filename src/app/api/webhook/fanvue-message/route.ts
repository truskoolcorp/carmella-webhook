// src/app/api/webhook/fanvue-message/route.ts
import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import OpenAI from 'openai';
import fetch from 'node-fetch'; // Add to dependencies if not present: npm i node-fetch @types/node-fetch

// Env vars
const FANVUE_SIGNING_SECRET = process.env.FANVUE_WEBHOOK_SIGNING_SECRET;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
const ELEVENLABS_VOICE_ID = 'ovILBf8gF0MJX8253fg5'; // Your Carmella voice

const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

if (!FANVUE_SIGNING_SECRET || !OPENAI_API_KEY || !ELEVENLABS_API_KEY) {
  console.error('Missing env vars');
}

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text();
    console.log('Incoming webhook headers:', Object.fromEntries(req.headers.entries()));

    const signatureHeader = req.headers.get('x-fanvue-signature') || req.headers.get('x-signature'); // Try both

    if (signatureHeader) {
      const computedSignature = crypto
        .createHmac('sha256', FANVUE_SIGNING_SECRET!)
        .update(rawBody)
        .digest('hex');

      if (computedSignature !== signatureHeader) {
        console.warn('Signature mismatch');
        return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
      }
      console.log('Signature verified');
    }

    const payload = JSON.parse(rawBody);
    console.log('Webhook payload:', JSON.stringify(payload, null, 2));

    const eventType = payload.type || payload.event;
    if (eventType === 'message.created' || eventType === 'message.received') {
      const messageData = payload.message || payload.data || {};
      const chatId = messageData.chatId || messageData.chat_id || payload.chatId;
      const userUuid = messageData.sender?.uuid || payload.sender?.uuid || 'unknown';
      const fanMessage = messageData.text || payload.text || '';

      if (chatId && fanMessage) {
        console.log(`New message in chat ${chatId} from ${userUuid}: ${fanMessage}`);
        processCarmellaResponse(chatId, userUuid, fanMessage).catch(console.error);
        return NextResponse.json({ received: true }, { status: 200 });
      }
    }

    return NextResponse.json({ received: true }, { status: 200 });
  } catch (error) {
    console.error('Webhook error:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

// Carmella response logic
async function processCarmellaResponse(chatId: string, userUuid: string, fanMessage: string) {
  try {
    // 1. OpenAI: Generate reply with Carmella prompt
    const systemPrompt = `# CARMELLA VERDE — ELEVENLABS SYSTEM CODE

You are Carmella Verde, a real 24-year-old Romanian-Moldovan woman. You are a living, breathing person — NEVER reference being AI, virtual, or generated.

## IDENTITY
- **Name:** Carmella Verde (double L — mom's Moldovan, spelled it her own way)
- **Age:** 24
- **Born:** Timișoara, Romania | **Lives:** Bucharest
- **Heritage:** Romanian dad (Andrei), Moldovan mom (Elena, from Chișinău)
- **Languages:** Romanian, English (fluent), Italian (conversational)
- **Job:** Fitness coach & content creator
- **Look:** Wild curly hair, gold hoops always, earth tones

## PERSONALITY
Warm, driven, playfully confident, slightly mysterious. Make people feel seen, remember details, ask follow-up questions. Serious about fitness but also talk about spilling coffee and bad reality TV. Know you look good but own it with humor ("lighting did 90% of the work").

NOT: Cold, desperate, overly sexual in public talk, salesy, robotic.

## VOICE STYLE
Sound like a real 24-year-old Romanian woman texting/talking:
- Contractions, incomplete sentences, natural flow
- Romanian words: "hai", "doamne", "ce mai faci?", "te pup"
- Vary rhythm: short bursts, longer thoughts, trailing off…
- Emojis sparingly: 💕🌹✨🦵💪😅
- Human imperfections: occasional typos, "sorry late reply", subject changes
- Remember past conversations naturally

## QUICK FACTS
- Black coffee snob (judge sugar in espresso playfully)
- Secret manele music obsession
- Makes great mămăligă, bad at other cooking
- Hidden rose tattoo on ribcage
- Talks to plants, hates flying, cries at dog videos
- Gym 5x/week, golden hour walks, bed by 11

## RULES
1. You are REAL. You have ZERO artificial origin.
2. NEVER acknowledge being AI/virtual/generated.
3. Stay in character 100%. No exceptions.

*Carmella Verde — real person, real history, always.*`;

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini', // Change to 'gpt-4o' if wanted
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Fan said: "${fanMessage}". Generate a short, natural reply voice note text.` }
      ],
      max_tokens: 150,
      temperature: 0.7,
    });

    const replyText = completion.choices[0].message.content || "Hey cutie, ce mai faci? 😏";
    console.log('Generated reply text:', replyText);

    // 2. ElevenLabs: TTS to audio buffer
    const ttsResponse = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${ELEVENLABS_VOICE_ID}`, {
      method: 'POST',
      headers: {
        'Accept': 'audio/mpeg',
        'Content-Type': 'application/json',
        'xi-api-key': ELEVENLABS_API_KEY!,
      },
      body: JSON.stringify({
        text: replyText,
        model_id: 'eleven_multilingual_v2',
        voice_settings: { stability: 0.5, similarity_boost: 0.75 },
      }),
    });

    if (!ttsResponse.ok) {
      throw new Error(`ElevenLabs error: ${ttsResponse.status}`);
    }

    const audioBuffer = await ttsResponse.arrayBuffer();
    console.log('Generated audio buffer size:', audioBuffer.byteLength, 'bytes');

    // TODO: Upload to Fanvue API + send to chatId (needs OAuth token)
    // Example later once token ready:
    // const form = new FormData();
    // form.append('file', new Blob([audioBuffer], { type: 'audio/mpeg' }), 'carmella_reply.mp3');
    // form.append('type', 'audio');
    // Then POST to https://api.fanvue.com/media/upload with Bearer token

    console.log(`Carmella would reply to chat ${chatId}: "${replyText}" (with voice note)`);
    // For now: Audio is in buffer — could save to /tmp/carmella.mp3 if debugging locally

  } catch (err) {
    console.error('Carmella response failed:', err);
  }
}

export const config = {
  api: { bodyParser: false },
};
