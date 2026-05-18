// netlify/functions/analyze-image.js
// ──────────────────────────────────────────────────────────────
// Proxy สำหรับ Claude AI วิเคราะห์ภาพแปลงที่ดิน
// browser เรียก Anthropic API โดยตรงไม่ได้เพราะ CORS + API key ต้องซ่อน
// Function นี้รับภาพจาก frontend แล้วส่งต่อให้ Claude
//
// ต้องตั้ง Environment Variable ใน Netlify Dashboard:
//   ANTHROPIC_API_KEY = sk-ant-...
// ──────────────────────────────────────────────────────────────

exports.handler = async (event) => {

  // CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
      body: '',
    };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const { imageBase64, lat, lng, size } = JSON.parse(event.body);

    if (!imageBase64 || !lat || !lng) {
      return {
        statusCode: 400,
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ error: 'Missing imageBase64, lat, or lng' }),
      };
    }

    const sizeNum = parseFloat(size) || 80;
    const sizeM2  = Math.round(sizeNum * 1600);

    const prompt =
`คุณเป็น AI ผู้เชี่ยวชาญด้านแผนที่ที่ดินไทย
ภาพนี้คือ screenshot รูปแปลงที่ดินจาก LandsMaps / กรมที่ดิน

ข้อมูลอ้างอิง:
- พิกัดภายในแปลง: lat=${lat}, lng=${lng}
- ขนาดประมาณ: ${sizeNum} ไร่ ≈ ${sizeM2} ตร.ม.
- 1° lat ≈ 111,000 ม., 1° lng ≈ 101,000 ม. ที่ละติจูดนี้

วิธีคำนวณ:
1. ใช้ lat=${lat} lng=${lng} เป็นจุดกึ่งกลางแปลง
2. ดูสัดส่วนความกว้าง:ยาว และรูปร่างแปลงจากภาพ
3. คำนวณระยะ offset ของแต่ละมุมจากจุดกลาง
   ตัวอย่าง: พื้นที่ 80 ไร่ สี่เหลี่ยม → ด้านละ ~357 ม. → offset ~0.0016° lat, ~0.00177° lng
4. สร้างพิกัดมุมที่สอดคล้องกับรูปร่างในภาพ อย่างน้อย 4 มุม

ตอบเป็น JSON เท่านั้น ไม่มีคำอธิบาย ไม่มี markdown:
{
  "parcel_name": "ชื่อแปลงจากภาพ หรือ ที่ดินแปลง 1",
  "area_rai": ${sizeNum},
  "corners": [
    {"lat": 0.0, "lng": 0.0},
    {"lat": 0.0, "lng": 0.0},
    {"lat": 0.0, "lng": 0.0},
    {"lat": 0.0, "lng": 0.0}
  ],
  "shape_description": "รูปร่างแปลง เช่น สี่เหลี่ยมผืนผ้า",
  "confidence": "medium",
  "note": "ข้อมูลที่อ่านได้จากภาพ เช่น เลขโฉนด เนื้อที่"
}`;

    // ตรวจสอบ media type จาก base64 header
    let mediaType = 'image/jpeg';
    if (imageBase64.startsWith('/9j/'))      mediaType = 'image/jpeg';
    else if (imageBase64.startsWith('iVBOR')) mediaType = 'image/png';
    else if (imageBase64.startsWith('R0lGO')) mediaType = 'image/gif';
    else if (imageBase64.startsWith('UklGR')) mediaType = 'image/webp';

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1000,
        messages: [{
          role: 'user',
          content: [
            {
              type: 'image',
              source: { type: 'base64', media_type: mediaType, data: imageBase64 },
            },
            { type: 'text', text: prompt },
          ],
        }],
      }),
      signal: AbortSignal.timeout(30000),
    });

    if (!response.ok) {
      const errText = await response.text();
      return {
        statusCode: response.status,
        headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: `Anthropic API error ${response.status}`, detail: errText }),
      };
    }

    const data    = await response.json();
    const rawText = data.content?.[0]?.text || '';

    // strip markdown fences ถ้ามี
    const clean   = rawText.replace(/```json[\s\S]*?```|```[\s\S]*?```/g, s =>
      s.replace(/```json\n?|```\n?/g, '')
    ).trim();

    // parse JSON
    let result;
    try {
      result = JSON.parse(clean);
    } catch (parseErr) {
      // fallback: สร้าง polygon สี่เหลี่ยมอัตโนมัติจากพิกัดกลาง
      const d = Math.sqrt(sizeM2) / 2;
      const dlat = d / 111000;
      const dlng = d / 101000;
      result = {
        parcel_name: 'ที่ดินแปลง 1',
        area_rai: sizeNum,
        corners: [
          { lat: lat + dlat, lng: lng - dlng },
          { lat: lat + dlat, lng: lng + dlng },
          { lat: lat - dlat, lng: lng + dlng },
          { lat: lat - dlat, lng: lng - dlng },
        ],
        shape_description: 'สี่เหลี่ยม (fallback)',
        confidence: 'low',
        note: 'AI ไม่สามารถอ่านรูปร่างได้ชัดเจน — ใช้รูปสี่เหลี่ยมแทน กรุณาตีเส้นใหม่',
      };
    }

    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(result),
    };

  } catch (err) {
    console.error('analyze-image error:', err);
    return {
      statusCode: 500,
      headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: err.message }),
    };
  }
};
