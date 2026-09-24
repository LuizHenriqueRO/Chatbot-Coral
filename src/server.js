import fs from 'fs';
import 'dotenv/config';
import express from 'express';
import { google } from 'googleapis';
import { parseIntent } from './intentParser.js';
import { searchDrive, downloadFileBuffer, getPaletteImagesFromDrive } from './googleDriveService.js';
import { buildResponse } from './responseBuilder.js';
import { uploadMediaToWhatsApp } from './whatsappMediaService.js';
import { getHistory, addMessageToHistory } from './memoryService.js';
import { startCronJobs } from './cronService.js';
import { downloadMedia } from './mediaDownloaderService.js';

const app = express();
const PORT = process.env.PORT || 8080;
const VERIFY_TOKEN = process.env.VERIFY_TOKEN || 'MEU_TOKEN_DE_VERIFICACAO';
const WHATSAPP_PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;
const WHATSAPP_ACCESS_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN;

app.use(express.json());

app.get('/', (req, res) => {
  res.status(200).send('Webhook server is running!');
});

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
  res.status(200).send('EVENT_RECEIVED'); // Evita timeout da Meta
  
  const body = req.body;

  if (body.object === 'whatsapp_business_account') {
    for (const entry of body.entry) {
      for (const change of entry.changes) {
        if (change.field === 'messages') {
          if (change.value.messages && change.value.messages.length > 0) {
            const message = change.value.messages[0];
            const sender_phone = change.value.contacts[0].wa_id;

            let sender_name = 'Membro do Coral';
            if (change.value.contacts && change.value.contacts[0].profile && change.value.contacts[0].profile.name) {
              sender_name = change.value.contacts[0].profile.name;
            }

            if (message && (message.type === 'text' || message.type === 'interactive')) {
              try {
                let userText = '';
                if (message.type === 'text') {
                  userText = message.text.body;
                } else if (message.type === 'interactive') {
                  if (message.interactive.type === 'button_reply') {
                    userText = message.interactive.button_reply.title;
                  } else if (message.interactive.type === 'list_reply') {
                    userText = message.interactive.list_reply.title;
                  }
                }

                if (!userText) continue;

                const history = await getHistory(sender_phone);
                const intents = await parseIntent(userText, history, sender_name);
                console.log('Intents parsed:', JSON.stringify(intents, null, 2));

                // Checa se é pedido em lote
                const isAudioBatch = intents.length > 1 && intents.every(i => i.action === 'search' && i.category === 'coral' && i.file_type === 'audio' && i.song_name === intents[0].song_name);
                let batchFails = 0;

                await addMessageToHistory(sender_phone, 'user', userText);

                for (const intent of intents) {
                  let driveResult = null;
                  let mediaResult = null;
                  
                  if (intent.action === 'download_media') {
                    if (!intent.format) {
                      const responseMsg = 'Você quer baixar o vídeo ou apenas o áudio (mp3)?';
                      await addMessageToHistory(sender_phone, 'assistant', responseMsg);
                      await sendWhatsAppMessage({
                        messaging_product: 'whatsapp',
                        to: sender_phone,
                        type: 'text',
                        text: { body: responseMsg }
                      });
                      continue;
                    }

                    if (!intent.url) {
                      const responseMsg = 'Por favor, envie o link do vídeo que você quer baixar.';
                      await addMessageToHistory(sender_phone, 'assistant', responseMsg);
                      await sendWhatsAppMessage({
                        messaging_product: 'whatsapp',
                        to: sender_phone,
                        type: 'text',
                        text: { body: responseMsg }
                      });
                      continue;
                    }

                    await sendWhatsAppMessage({
                      messaging_product: 'whatsapp',
                      to: sender_phone,
                      type: 'text',
                      text: { body: 'Iniciando o download... Isso pode levar um tempinho! ⏳' }
                    });

                    mediaResult = await downloadMedia(intent.url, intent.format);
                    if (mediaResult.success) {
                      try {
                        const buffer = fs.readFileSync(mediaResult.filepath);
                        const typeParam = mediaResult.sendAsDocument ? 'document' : null;
                        const media_id = await uploadMediaToWhatsApp(buffer, mediaResult.mimeType, mediaResult.filename, typeParam);
                        mediaResult.media_id = media_id;
                        fs.unlinkSync(mediaResult.filepath); // Apaga do storage local depois de upar
                      } catch (err) {
                        console.error('Erro ao subir para o whatsapp:', err);
                        mediaResult.success = false;
                        mediaResult.error = 'Ocorreu um erro ao tentar preparar o arquivo para o WhatsApp.';
                        if (fs.existsSync(mediaResult.filepath)) {
                           fs.unlinkSync(mediaResult.filepath);
                        }
                      }
                    }
                  } else if (intent.action === 'search') {
                    driveResult = await searchDrive(intent.song_name, intent.file_type, intent.voice_part, intent.category);
                    console.log('Drive search result:', JSON.stringify(driveResult, null, 2));

                    if (driveResult.found) {
                      try {
                        console.log('Baixando arquivo do Drive...');
                        const buffer = await downloadFileBuffer(driveResult.file_id);
                        console.log('Enviando para a Meta...');

                        let safe_filename = driveResult.file_name;
                        if (intent.file_type === 'pdf' && !safe_filename.toLowerCase().endsWith('.pdf')) safe_filename += '.pdf';
                        if (intent.file_type === 'txt' && !safe_filename.toLowerCase().endsWith('.txt')) safe_filename += '.txt';

                        if (intent.file_type === 'txt') {
                          console.log('Transcrevendo txt...');
                          driveResult.text_content = Buffer.from(buffer).toString('utf-8');
                        } else {
                          const media_id = await uploadMediaToWhatsApp(buffer, driveResult.mime_type, safe_filename);
                          console.log('Media enviada, id:', media_id);
                          driveResult.media_id = media_id;
                        }
                      } catch (uploadError) {
                        console.error('Error migrating media to Meta Servers:', uploadError);
                        driveResult.found = false;
                        driveResult.error_message = 'Encontrei o arquivo, mas ocorreu um erro de conexão ao tentar prepará-lo para envio no WhatsApp.';
                      }
                    }
                  }

                  // Ignora falhas individuais em lotes
                  if (intent.action === 'search' && driveResult && !driveResult.found && isAudioBatch) {
                    batchFails++;
                    if (batchFails < intents.length) {
                      console.log(`Missing part ${intent.voice_part} in batch request. Skipping error message.`);
                      continue;
                    }
                  }

                  const response = buildResponse(intent, driveResult, mediaResult, sender_phone);
                  console.log('Response built:', JSON.stringify(response, null, 2));
                  
                  await addMessageToHistory(sender_phone, 'assistant', response.message_text);

                  await sendWhatsAppMessage(response.api_payload);

                  if (intent.action === 'info' && intent.info_type === 'paleta') {
                    try {
                      console.log('Buscando imagens da paleta...');
                      const paletteImages = await getPaletteImagesFromDrive();
                      for (const img of paletteImages) {
                        const buffer = await downloadFileBuffer(img.id);
                        const media_id = await uploadMediaToWhatsApp(buffer, img.mimeType, img.name);
                        await sendWhatsAppMessage({
                          messaging_product: 'whatsapp',
                          to: sender_phone,
                          type: 'image',
                          image: { id: media_id }
                        });
                      }
                    } catch (err) {
                      console.error('Erro ao buscar e enviar imagens da paleta:', err);
                    }
                  }
                }
              } catch (error) {
                console.error("Erro ao processar a mensagem:", error);
              }
            }
          }
          else if (change.value.statuses) {
            const statusObj = change.value.statuses[0];
            console.log('Status recebido (entregue/lido):', statusObj.status);
            
            if (statusObj.errors) {
              console.error('🚨 ERRO DE ENTREGA DA META:', JSON.stringify(statusObj.errors, null, 2));
            }
          }
        }
      }
    }
  }
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

async function sendWhatsAppTemplateMessage(recipient_phone, templateName, nameParam) {
  if (!WHATSAPP_PHONE_NUMBER_ID || !WHATSAPP_ACCESS_TOKEN) {
    console.error('WhatsApp API environment variables not set.');
    return;
  }

  const payload = {
    messaging_product: 'whatsapp',
    to: recipient_phone,
    type: 'template',
    template: {
      name: templateName,
      language: {
        code: 'pt_BR'
      },
      components: [
        {
          type: 'header',
          parameters: [
            {
              type: 'image',
              image: {
                link: 'https://www.anaclaudiapersonalizados.com.br/wp-content/uploads/2025/01/mensagens-curtas-de-parabens.png'
              }
            }
          ]
        },
        {
          type: 'body',
          parameters: [
            {
              type: 'text',
              parameter_name: 'nome_aniversariante',
              text: nameParam
            }
          ]
        }
      ]
    }
  };

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
    console.log('WhatsApp Template API response:', JSON.stringify(data, null, 2));

    if (response.ok) {
      console.log('Template Message sent successfully to WhatsApp!');
    } else {
      console.error('Failed to send template message to WhatsApp:', data);
    }
  } catch (error) {
    console.error('Error sending template message to WhatsApp:', error);
  }
}

// Inicia os agendamentos automáticos (ex: aniversários diários)
startCronJobs(sendWhatsAppTemplateMessage);

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Servidor rodando na porta ${PORT} e ouvindo requisições externas`);
});