const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const twilio = require('twilio');
const axios = require('axios');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

// ✅ Validate required environment variables
const requiredEnv = [
  'DATABASE_URL',
  'TWILIO_ACCOUNT_SID',
  'TWILIO_AUTH_TOKEN',
  'GOOGLE_MAPS_API_KEY',
  'SHOP_WHATSAPP_NUMBER'
];

requiredEnv.forEach((key) => {
  if (!process.env[key]) {
    console.error(`❌ Missing ${key} in .env`);
    process.exit(1);
  }
});

// ✅ PostgreSQL pool setup
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

// ✅ Twilio client setup
const twilioClient = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

// ✅ Reverse Geocode Coordinates
async function getAddressFromCoordinates(lat, lng) {
  try {
    const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${process.env.GOOGLE_MAPS_API_KEY}`;
    const res = await axios.get(url);
    return res.data?.results?.[0]?.formatted_address || 'Unknown location';
  } catch (err) {
    console.error('Geocoding error:', err);
    return 'Unknown location';
  }
}

// ✅ Emergency route
app.post('/api/emergency', async (req, res) => {
  const { name, phone, issue, vehicle, latitude, longitude } = req.body;

  if (!name || !phone || !issue || !vehicle || !latitude || !longitude) {
    return res.status(400).send('Missing fields');
  }

  try {
    await pool.query(
      'INSERT INTO emergency_requests (name, phone, issue, vehicle, latitude, longitude) VALUES ($1, $2, $3, $4, $5, $6)',
      [name.trim(), phone.trim(), issue.trim(), vehicle.trim(), latitude, longitude]
    );

    const address = await getAddressFromCoordinates(latitude, longitude);
    const mapUrl = `https://www.google.com/maps?q=${latitude},${longitude}`;
    const body = `🚨 New Emergency:
Name: ${name}
Phone: ${phone}
Issue: ${issue}
Vehicle: ${vehicle}
Address: ${address}
Map: ${mapUrl}`;

    await twilioClient.messages.create({
      from: 'whatsapp:+14155238886',
      to: process.env.SHOP_WHATSAPP_NUMBER,
      body,
    });

    res.status(200).send('Notification sent');
  } catch (err) {
    console.error('❌ Error saving request:', err);
    res.status(500).send('Server error');
  }
});

// ✅ Basic health check route
app.get('/', (req, res) => {
  res.send('🚀 Emergency Backend Running');
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Server running on http://0.0.0.0:${PORT}`);
});

