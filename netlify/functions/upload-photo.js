// netlify/functions/upload-photo.js
exports.handler = async (event) => {
  const CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
  };
  if (event.httpMethod === 'OPTIONS') return { statusCode:200, headers:CORS, body:'' };

  const CLOUD = process.env.CLOUDINARY_CLOUD_NAME;
  const PRESET= process.env.CLOUDINARY_UPLOAD_PRESET;
  if(!CLOUD||!PRESET) return {
    statusCode:500, headers:CORS,
    body: JSON.stringify({ok:false,error:'Cloudinary not configured'})
  };

  try {
    const {imageBase64, mediaType, parcelId, parcelName} = JSON.parse(event.body);

    // Cloudinary unsigned upload ผ่าน base64
    const body = new URLSearchParams();
    body.append('file',       `data:${mediaType||'image/jpeg'};base64,${imageBase64}`);
    body.append('upload_preset', PRESET);
    body.append('folder',     'romanee-lands');
    body.append('tags',       `romanee,${parcelId||'general'}`);

    const res = await fetch(
      `https://api.cloudinary.com/v1_1/${CLOUD}/image/upload`,
      { method:'POST', body, headers:{'Content-Type':'application/x-www-form-urlencoded'} }
    );
    const text = await res.text();
    if(!res.ok) return { statusCode:res.status, headers:CORS, body: JSON.stringify({ok:false,error:text}) };

    const data = JSON.parse(text);
    // สร้าง thumbnail URL
    const thumb = data.secure_url.replace('/upload/','/upload/w_400,h_300,c_fill,q_auto/');

    return {
      statusCode:200, headers:CORS,
      body: JSON.stringify({
        ok:true,
        url:       data.secure_url,
        thumbnail: thumb,
        publicId:  data.public_id,
        width:     data.width,
        height:    data.height,
        bytes:     data.bytes,
      })
    };
  } catch(err) {
    return { statusCode:500, headers:CORS, body: JSON.stringify({ok:false,error:err.message}) };
  }
};
