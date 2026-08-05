
export function buildResponse(intent, driveResult, recipient_phone) {
  let message_text = '';
  let message_type = 'text';
  let api_payload = {
    messaging_product: 'whatsapp',
    to: recipient_phone,
  };

  if (intent.action === 'chat') {
    message_text = intent.chat_response || 'Olá! Como posso ajudar?';
    
    if (message_text.includes('👋 Sou o assistente do Coral Jovem da Asa Norte')) {
      api_payload.type = 'interactive';
      api_payload.interactive = {
        type: 'list',
        body: { text: message_text },
        action: {
          button: 'Ver Opções',
          sections: [
            {
              title: 'O que você deseja?',
              rows: [
                { id: 'btn_kits', title: 'Kit de Voz' },
                { id: 'btn_partituras', title: 'Partituras' },
                { id: 'btn_letras', title: 'Letras das Músicas' },
                { id: 'btn_louvor', title: 'Letras de Louvor' },
                { id: 'btn_hinos', title: 'Hinos do Hinário' },
                { id: 'btn_egw', title: 'Livros de Ellen White' },
                { id: 'btn_licao', title: 'Lição Escola Sabatina' },
                { id: 'btn_agenda', title: 'Agenda do Coral' },
                { id: 'btn_links', title: 'Link dos Kits' },
                { id: 'btn_loc', title: 'Localização da Igreja' }
              ]
            }
          ]
        }
      };
    } else {
      api_payload.type = 'text';
      api_payload.text = { body: message_text };
    }
  } else if (intent.action === 'info') {
    if (intent.info_type === 'agenda') {
      message_text = `🗓️ *Agenda do Coral (2º semestre)* 📍\n\n*AGOSTO*\n22/08 - sábado 9h - IASD Asa Norte\n23/08 - domingo 19h - IASD Asa Norte\n29/08 - sábado 15h - Encontro de Corais (Gama Oeste)\n\n*SETEMBRO*\n26/09 - sábado 9h - IASD Asa Norte\n27/09 - domingo 19h - IASD Asa Norte\n\n*OUTUBRO*\n31/10 - sábado 9h - IASD Asa Norte\n\n*NOVEMBRO*\n06 a 08/11 - Viagem a Campos Belos\n15/11 - domingo 19h - IASD Asa Norte\n\n*DEZEMBRO*\n05/12 - sábado 17h - IASD Estância 2 sede\n12/12 - sábado 19h - Musical de natal - IASD Asa Norte`;
      api_payload.type = 'text';
      api_payload.text = { body: message_text };
    } else if (intent.info_type === 'link_kits') {
      message_text = `Aqui está o link do drive com todos os kits do coral:\nhttps://drive.google.com/drive/folders/1-Rkp2gcrDw-vprjfrjBWXgd87ai4RI6o?usp=sharing`;
      api_payload.type = 'text';
      api_payload.text = { body: message_text };
    } else if (intent.info_type === 'localizacao') {
      message_text = `Aqui está a localização da Igreja Adventista da Asa Norte! 📍`;
      message_type = 'location';
      api_payload.type = 'location';
      api_payload.location = {
        latitude: -15.76178000,
        longitude: -47.87723000,
        name: "Igreja Adventista da Asa Norte",
        address: "SGAN 608 Módulo B - Brasília, DF"
      };
    } else if (intent.info_type === 'paleta') {
      message_text = `Essa é a paleta de cores do coral! 🎨`;
      api_payload.type = 'text';
      api_payload.text = { body: message_text };
    } else {
      message_text = `Não tenho essa informação no momento.`;
      api_payload.type = 'text';
      api_payload.text = { body: message_text };
    }
  } else if (intent.action === 'search') {
    if (driveResult && driveResult.found) {
      let file_label = '';
      if (intent.file_type === 'audio') {
        file_label = intent.voice_part ? `a pista de ${intent.voice_part}` : 'a pista';
        message_type = 'audio';
        api_payload.type = 'audio';
        api_payload.audio = { id: driveResult.media_id };
      } else if (intent.file_type === 'pdf') {
        file_label = intent.category === 'licao' ? 'a lição da Escola Sabatina' : 'a partitura';
        message_type = 'document';
        api_payload.type = 'document';
        let safe_pdf_name = driveResult.file_name.toLowerCase().endsWith('.pdf') ? driveResult.file_name : `${driveResult.file_name}.pdf`;
        api_payload.document = { id: driveResult.media_id, caption: `${driveResult.file_name} 🎶`, filename: safe_pdf_name };
      } else if (intent.file_type === 'txt') {
        if (driveResult.text_content) {
          file_label = 'a letra';
          message_type = 'text';
          api_payload.type = 'text';
          message_text = `Aqui está a letra de *${intent.song_name}*:\n\n${driveResult.text_content}`;
          api_payload.text = { body: message_text };
        } else {
          file_label = 'a letra';
          message_type = 'document';
          api_payload.type = 'document';
          let safe_txt_name = driveResult.file_name.toLowerCase().endsWith('.txt') ? driveResult.file_name : `${driveResult.file_name}.txt`;
          api_payload.document = { id: driveResult.media_id, caption: `${driveResult.file_name} 🎵`, filename: safe_txt_name };
        }
      }

      if (message_type !== 'text') {
        if (intent.category === 'licao') {
          message_text = `Aqui está ${file_label} de *${intent.song_name}*! 📖 Bons estudos!`;
        } else {
          message_text = `Aqui está ${file_label} de *${intent.song_name}*! 🎶 Bons ensaios!`;
        }
      }
    } else {
      if (driveResult && driveResult.candidates && driveResult.candidates.length > 0) {
        message_text = `Não encontrei '${intent.song_name}' no Drive. Você quis dizer '${driveResult.candidates[0]}'? Ou fale com o regente. 🎵`;
      } else if (driveResult && driveResult.error_message) {
        message_text = `${driveResult.error_message} Verifique o nome da música ou fale com o regente. 🎵`;
      } else {
        message_text = `Não encontrei '${intent.song_name}' no Drive. Verifique o nome da música ou fale com o regente. 🎵`;
      }
      api_payload.type = 'text';
      api_payload.text = { body: message_text };
    }
  } else {
    message_text = 'Desculpe, não consegui entender sua solicitação. Pode tentar novamente?';
    api_payload.type = 'text';
    api_payload.text = { body: message_text };
  }

  // Limite de caracteres
  if (api_payload.type === 'text') {
    if (message_text.length > 4000) {
      message_text = message_text.substring(0, 3997) + '...';
      api_payload.text.body = message_text;
    }
  } else {
    // Limite da caption
    if (message_text.length > 300) {
      message_text = message_text.substring(0, 297) + '...';
      if (api_payload.document) api_payload.document.caption = message_text;
    }
  }

  return {
    message_text,
    message_type,
    api_payload,
  };
}
