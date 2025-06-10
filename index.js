const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const twilio = require('twilio');
const axios = require('axios');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

const pool = new Pool(); // Uses .env variables for DB connection

// Twilio setup - credentials from .env
const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const client = twilio(accountSid, authToken);

// Get readable address from Google Maps Geocoding API
async function getAddressFromCoordinates(lat, lng) {
  try {
    const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${process.env.GOOGLE_MAPS_API_KEY}`;
    const res = await axios.get(url);
    if (res.data.status === 'OK' && res.data.results.length > 0) {
      return res.data.results[0].formatted_address;
    }
    return 'Unknown location';
  } catch (error) {
    console.error('Geocoding API error:', error);
    return 'Unknown location';
  }
}

// Utility function for input validation & sanitization
function validateEmergencyRequest(data) {
  const { name, phone, issue, vehicle, latitude, longitude } = data;
  return (
    typeof name === 'string' && name.trim() !== '' &&
    typeof phone === 'string' && phone.trim() !== '' &&
    typeof issue === 'string' && issue.trim() !== '' &&
    typeof vehicle === 'string' && vehicle.trim() !== '' &&
    typeof latitude === 'number' &&
    typeof longitude === 'number'
  );
}

app.post('/api/emergency', async (req, res) => {
  const { name, phone, issue, vehicle, latitude, longitude } = req.body;

  if (!validateEmergencyRequest(req.body)) {
    return res.status(400).send('Invalid or missing required fields');
  }

  try {
    await pool.query(
      'INSERT INTO emergency_requests (name, phone, issue, vehicle, latitude, longitude) VALUES ($1, $2, $3, $4, $5, $6)',
      [name.trim(), phone.trim(), issue.trim(), vehicle.trim(), latitude, longitude]
    );

    const locationUrl = `https://www.google.com/maps?q=${latitude},${longitude}`;
    const address = await getAddressFromCoordinates(latitude, longitude);

    const message = `New Emergency Request:\nName: ${name.trim()}\nPhone: ${phone.trim()}\nIssue: ${issue.trim()}\nVehicle: ${vehicle.trim()}\nAddress: ${address}\nMap: ${locationUrl}`;

    await client.messages.create({
      from: 'whatsapp:+14155238886',
      to: process.env.SHOP_WHATSAPP_NUMBER,
      body: message,
    });

    res.status(200).send('Request received and WhatsApp notification sent');
  } catch (error) {
    console.error('Error:', error);
    res.status(500).send('Internal server error');
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
