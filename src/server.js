
import express from 'express';
import { google } from 'googleapis';
import { parseIntent } from './intentParser.js';
import { searchDrive } from './googleDriveService.js';
import { buildResponse } from './responseBuilder.js';

const app = express();
const PORT = process.env.PORT || 8080;
const VERIFY_TOKEN = process.env.VERIFY_TOKEN || 'MEU_TOKEN_DE_VERIFICACAO';
const WHATSAPP_PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;
const WHATSAPP_ACCESS_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN;

app.use(express.json());

app.get('/', (req, res) => {
  res.status(200).send('Webhook server is running!');
});

// Endpoint para verificação do webhook da Meta
app.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    console.log('Webhook verified!');
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

app.post('/webhook', async (req, res) => {
  const body = req.body;

  if (body.object === 'whatsapp_business_account') {
    for (const entry of body.entry) {
      for (const change of entry.changes) {
        if (change.field === 'messages') {
          const message = change.value.messages[0];
            const sender_phone = change.value.contacts[0].wa_id; // CORRIGIDO para wa_id

            if (message && message.type === 'text') {
              // Processamento com IA para todas as mensagens
              const intent = await parseIntent(message.text.body);
              console.log('Intent parsed:', JSON.stringify(intent, null, 2));

              const driveResult = await searchDrive(intent.song_name, intent.file_type, intent.voice_part);
              console.log('Drive search result:', JSON.stringify(driveResult, null, 2));

              const response = buildResponse(intent, driveResult, sender_phone);
              console.log('Response built:', JSON.stringify(response, null, 2));

              await sendWhatsAppMessage(response.api_payload);
            }
        }
      }
    }
  }

  res.status(200).send('EVENT_RECEIVED');
});

async function sendWhatsAppMessage(payload) {
  if (!WHATSAPP_PHONE_NUMBER_ID || !WHATSAPP_ACCESS_TOKEN) {
    console.error('WhatsApp API environment variables not set.');
    return;
  }

  try {
    const response = await fetch(`https://graph.facebook.com/v19.0/${WHATSAPP_PHONE_NUMBER_ID}/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${WHATSAPP_ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const data = await response.json();
    console.log('WhatsApp API response:', JSON.stringify(data, null, 2));

    if (response.ok) {
      console.log('Message sent successfully to WhatsApp!');
    } else {
      console.error('Failed to send message to WhatsApp:', data);
    }
  } catch (error) {
    console.error('Error sending message to WhatsApp:', error);
  }
}

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Servidor rodando na porta ${PORT} e ouvindo requisições externas`);
});