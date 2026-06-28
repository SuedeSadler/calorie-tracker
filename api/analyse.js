export const config = { runtime: 'edge' };

export default async function handler(req) {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'API key not configured on server.' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid request body.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const { imageB64, imageMime } = body;
  if (!imageB64 || !imageMime) {
    return new Response(JSON.stringify({ error: 'Missing image data.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const prompt = `You are a precise nutrition analyst. Examine this food image and return ONLY a JSON object with this exact shape — no markdown, no preamble:
{
  "foods_detected": ["item1", "item2"],
  "total_calories": 450,
  "protein_g": 25,
  "carbs_g": 40,
  "fat_g": 15,
  "fiber_g": 5,
  "confidence": "medium",
  "notes": "One sentence about portion uncertainty"
}
All numeric values must be integers. confidence is "high", "medium", or "low".
If food cannot be identified return: {"error": "Could not identify food."}`;

  const openaiRes = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o',
      max_tokens: 400,
      messages: [{
        role: 'user',
        content: [
          {
            type: 'image_url',
            image_url: { url: `data:${imageMime};base64,${imageB64}`, detail: 'high' },
          },
          { type: 'text', text: prompt },
        ],
      }],
    }),
  });

  if (!openaiRes.ok) {
    const err = await openaiRes.json().catch(() => ({}));
    return new Response(JSON.stringify({ error: err.error?.message || `OpenAI error ${openaiRes.status}` }), {
      status: openaiRes.status,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const data = await openaiRes.json();
  const raw = data.choices?.[0]?.message?.content?.trim() || '';

  let parsed;
  try {
    parsed = JSON.parse(raw.replace(/```json|```/g, '').trim());
  } catch {
    return new Response(JSON.stringify({ error: 'Unexpected response format from GPT-4o.' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify(parsed), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
