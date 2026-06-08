export async function uploadMediaToWhatsApp(buffer, mimeType, filename) {
  const WHATSAPP_PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const WHATSAPP_ACCESS_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN;

  if (!WHATSAPP_PHONE_NUMBER_ID || !WHATSAPP_ACCESS_TOKEN) {
    throw new Error('WhatsApp API credentials missing');
  }

  const endpoint = `https://graph.facebook.com/v19.0/${WHATSAPP_PHONE_NUMBER_ID}/media`;

  const blob = new Blob([buffer], { type: mimeType });
  const formData = new FormData();
  formData.append('messaging_product', 'whatsapp');
  formData.append('file', blob, filename);

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${WHATSAPP_ACCESS_TOKEN}`,
    },
    body: formData,
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(`Failed to upload media to WhatsApp: ${JSON.stringify(data)}`);
  }

  return data.id;
}
