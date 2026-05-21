// netlify/functions/upload-photo.js
// รับรูปภาพ base64 จาก frontend → upload ไป Cloudinary
// ต้องตั้ง Environment Variables:
//   CLOUDINARY_CLOUD_NAME
//   CLOUDINARY_UPLOAD_PRESET

exports.handler = async (event) => {
  const CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: CORS, body: '' };
  }

  const CLOUD_NAME     = process.env.CLOUDINARY_CLOUD_NAME;
  const UPLOAD_PRESET  = process.env.CLOUDINARY_UPLOAD_PRESET;

  if (!CLOUD_NAME || !UPLOAD_PRESET) {
    return {
      statusCode: 500,
      headers: CORS,
      body: JSON.stringify({ ok: false, error: 'Cloudinary not configured' }),
    };
  }

  try {
    const { imageBase64, mediaType, parcelName, parcelId } = JSON.parse(event.body);

    // Upload ไป Cloudinary
    const formData = new URLSearchParams();
    formData.append('file', `data:${mediaType};base64,${imageBase64}`);
    formData.append('upload_preset', UPLOAD_PRESET);
    formData.append('folder', 'romanee-lands');
    formData.append('tags', `parcel,${parcelId || 'unknown'}`);
    // ตั้งชื่อไฟล์ให้อ่านง่าย
    formData.append('public_id', `romanee-lands/${parcelId || 'parcel'}_${Date.now()}`);

    const res = await fetch(
      `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`,
      { method: 'POST', body: formData }
    );

    if (!res.ok) {
      const err = await res.text();
      return {
        statusCode: res.status,
        headers: CORS,
        body: JSON.stringify({ ok: false, error: err }),
      };
    }

    const data = await res.json();

    return {
      statusCode: 200,
      headers: CORS,
      body: JSON.stringify({
        ok: true,
        url: data.secure_url,          // URL สำหรับแสดงรูป
        thumbnail: data.secure_url.replace('/upload/', '/upload/w_400,h_300,c_fill/'), // thumbnail
        publicId: data.public_id,
        width: data.width,
        height: data.height,
        bytes: data.bytes,
      }),
    };

  } catch (err) {
    return {
      statusCode: 500,
      headers: CORS,
      body: JSON.stringify({ ok: false, error: err.message }),
    };
  }
};
