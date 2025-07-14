const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const twilio = require('twilio');
const axios = require('axios');
require('dotenv').config();

const app = express();

// ✅ Apply Middleware
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST'],
}));
app.use(express.json());

// ✅ Check for required environment variables
const requiredEnv = [
  'DATABASE_URL',
  'TWILIO_ACCOUNT_SID',
  'TWILIO_AUTH_TOKEN',
  'GOOGLE_MAPS_API_KEY',
  'SHOP_WHATSAPP_NUMBER',
];

requiredEnv.forEach((key) => {
  if (!process.env[key]) {
    console.error(`❌ Missing env var: ${key}`);
    process.exit(1);
  }
});

// ✅ PostgreSQL connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    require: true,
    rejectUnauthorized: false,
  },
});

// ✅ Twilio client
const twilioClient = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

// ✅ Get address from coordinates
async function getAddressFromCoordinates(lat, lng) {
  try {
    const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${process.env.GOOGLE_MAPS_API_KEY}`;
    const res = await axios.get(url);
    return res.data?.results?.[0]?.formatted_address || 'Unknown location';
  } catch (err) {
    console.error('❌ Geocoding error:', err.message, err.stack);
    return 'Unknown location';
  }
}

// ✅ Emergency POST route
app.post('/api/emergency', async (req, res) => {
  const { name, phone, issue, vehicle, latitude, longitude } = req.body;

  console.log('📥 New Emergency Request:', req.body);

  if (!name || !phone || !issue || !vehicle || !latitude || !longitude) {
    console.warn('⚠️ Missing fields:', req.body);
    return res.status(400).send('Missing fields');
  }

  try {
    // Step 1: Insert into DB
    console.log('📦 Inserting into database...');
    await pool.query(
      'INSERT INTO emergency_requests (name, phone, issue, vehicle, latitude, longitude) VALUES ($1, $2, $3, $4, $5, $6)',
      [name.trim(), phone.trim(), issue.trim(), vehicle.trim(), latitude, longitude]
    );

    // Step 2: Get Address
    console.log('🗺️ Getting location address...');
    const address = await getAddressFromCoordinates(latitude, longitude);
    const mapUrl = `https://www.google.com/maps?q=${latitude},${longitude}`;

    // Step 3: Send WhatsApp Message
    const message = `🚨 New Emergency:
Name: ${name}
Phone: ${phone}
Issue: ${issue}
Vehicle: ${vehicle}
Address: ${address}
Map: ${mapUrl}`;

    console.log('📤 Sending WhatsApp message...');
    await twilioClient.messages.create({
      from: 'whatsapp:+14155238886',
      to: process.env.SHOP_WHATSAPP_NUMBER,
      body: message,
    });

    console.log('✅ Notification sent successfully.');
    res.status(200).send('Notification sent');
  } catch (err) {
    console.error('❌ Error handling emergency request:', err.message, err.stack);
    res.status(500).send('Server error');
  }
});

// ✅ Health Routes
app.get('/', (req, res) => {
  res.send('🚀 Emergency Backend Running');
});

app.get('/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.status(200).json({ status: 'ok', db: 'connected' });
  } catch (err) {
    console.error('❌ DB health check failed:', err.message);
    res.status(500).json({ status: 'fail', db: 'disconnected' });
  }
});

// ✅ Start server
const PORT = process.env.PORT || 5000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Server running on http://0.0.0.0:${PORT}`);
});
