
export function buildResponse(intent, driveResult, recipient_phone) {
  let message_text = '';
  let message_type = 'text';
  let api_payload = {
    messaging_product: 'whatsapp',
    to: recipient_phone,
    type: 'text',
    text: { body: '' },
  };

  if (driveResult.found) {
    let file_label = '';
    if (intent.file_type === 'audio') {
      file_label = intent.voice_part ? `a pista de ${intent.voice_part}` : 'a pista';
      message_type = 'audio';
      api_payload.type = 'audio';
      api_payload.audio = { link: driveResult.download_url, caption: `${driveResult.file_name} 🎶` };
    } else if (intent.file_type === 'pdf') {
      file_label = 'a partitura';
      message_type = 'document';
      api_payload.type = 'document';
      api_payload.document = { link: driveResult.download_url, caption: `${driveResult.file_name} 🎶`, filename: driveResult.file_name };
    } else if (intent.file_type === 'txt') {
      file_label = 'a letra';
      message_type = 'document'; // Meta API usa 'document' para txt e pdf
      api_payload.type = 'document';
      api_payload.document = { link: driveResult.download_url, caption: `${driveResult.file_name} 🎵`, filename: driveResult.file_name };
    }

    message_text = `Aqui está ${file_label} de *${intent.song_name}*! 🎶 Bons ensaios!`;
  } else {
    // File not found
    if (driveResult.candidates && driveResult.candidates.length > 0) {
      message_text = `Não encontrei '${intent.song_name}' no Drive. Você quis dizer '${driveResult.candidates[0]}'? Ou fale com o regente. 🎵`;
    } else if (driveResult.error_message) {
      message_text = `${driveResult.error_message} Verifique o nome da música ou fale com o regente. 🎵`;
    } else {
      message_text = `Não encontrei '${intent.song_name}' no Drive. Verifique o nome da música ou fale com o regente. 🎵`;
    }
    api_payload.text.body = message_text;
  }

  // Enforce 300 character limit (simplificado)
  if (message_text.length > 300) {
    message_text = message_text.substring(0, 297) + '...';
    if (api_payload.text) api_payload.text.body = message_text;
    if (api_payload.audio) api_payload.audio.caption = message_text;
    if (api_payload.document) api_payload.document.caption = message_text;
  }

  return {
    message_text,
    message_type,
    api_payload,
  };
}
