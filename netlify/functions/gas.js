// netlify/functions/gas.js
// Proxy ส่งต่อ request ไปยัง Google Apps Script
// GAS_URL ตั้งไว้ใน Netlify Environment Variables

exports.handler = async (event) => {
  const CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: CORS, body: '' };
  }

  const GAS_URL = process.env.GAS_URL;
  if (!GAS_URL) {
    return {
      statusCode: 500,
      headers: CORS,
      body: JSON.stringify({ ok: false, error: 'GAS_URL not configured' }),
    };
  }

  try {
    let response;

    if (event.httpMethod === 'GET') {
      response = await fetch(GAS_URL);
    } else if (event.httpMethod === 'POST') {
      response = await fetch(GAS_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: event.body,
        redirect: 'follow',
      });
    }

    const data = await response.json();
    return {
      statusCode: 200,
      headers: CORS,
      body: JSON.stringify(data),
    };

  } catch (err) {
    return {
      statusCode: 500,
      headers: CORS,
      body: JSON.stringify({ ok: false, error: err.message }),
    };
  }
};
