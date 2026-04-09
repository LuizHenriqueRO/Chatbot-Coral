
import OpenAI from 'openai';

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

const openai = new OpenAI({
  apiKey: OPENAI_API_KEY,
});

const INTENT_SYSTEM_PROMPT = `
Você é um assistente de chatbot para um coral de igreja. Sua função é interpretar as solicitações dos membros do coral e extrair informações chave. O usuário irá pedir por materiais de música, como áudios, partituras ou letras. Sua resposta DEVE ser um objeto JSON no seguinte formato:

{
  "song_name": "[Nome da Música - string, use o título mais provável, em Title Case]",
  "file_type": "[audio | pdf | txt | null]",
  "voice_part": "[soprano | contralto | tenor | baixo | baritono | null]"
}

Regras:
- song_name: Tente inferir o nome completo da música. Se não houver nome claro, retorne null. Converta para Title Case (primeira letra de cada palavra em maiúscula).
- file_type: Determine o tipo de arquivo mais provável. Priorize termos específicos como "partitura" (pdf), "pista" ou "áudio" (audio), "letra" (txt). Se não houver indicação clara, retorne null.
- voice_part: Se o file_type for "audio", tente identificar a parte da voz. Use os termos padrão: "soprano", "contralto", "tenor", "baixo", "baritono". Se não houver indicação clara ou se o file_type não for áudio, retorne null.
- Se você não conseguir inferir qualquer um dos campos, retorne null para aquele campo.
- Sua resposta DEVE ser APENAS o objeto JSON, sem texto adicional.

Exemplos de interação:
Usuário: "Queria a pista contralto de Ainda Há Tempo"
Resposta: {"song_name": "Ainda Há Tempo", "file_type": "audio", "voice_part": "contralto"}

Usuário: "Me vê a partitura da Gloria Eterna"
Resposta: {"song_name": "Gloria Eterna", "file_type": "pdf", "voice_part": null}

Usuário: "A letra daquela música nova"
Resposta: {"song_name": null, "file_type": "txt", "voice_part": null}

Usuário: "Olá, pode me ajudar?"
Resposta: {"song_name": null, "file_type": null, "voice_part": null}

Usuário: "Queria o audio da música X"
Resposta: {"song_name": "Música X", "file_type": "audio", "voice_part": null}

`

export async function parseIntent(message) {
  if (!OPENAI_API_KEY) {
    console.error('OPENAI_API_KEY is not set.');
    return { song_name: null, file_type: null, voice_part: null, raw_message: message, error: 'OPENAI_API_KEY not set' };
  }

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-3.5-turbo-0125", // Ou outro modelo, como gpt-4-turbo-preview
      messages: [
        { role: "system", content: INTENT_SYSTEM_PROMPT },
        { role: "user", content: message }
      ],
      response_format: { type: "json_object" },
      temperature: 0.1, // Manter baixo para respostas mais focadas
    });

    const rawResponse = completion.choices[0].message.content;
    const intent = JSON.parse(rawResponse);

    return {
      ...intent,
      raw_message: message,
      confidence: intent.song_name || intent.file_type || intent.voice_part ? 0.9 : 0.1,
      ambiguous: !(intent.song_name || intent.file_type || intent.voice_part),
      alternatives: []
    };
  } catch (error) {
    console.error('Error calling OpenAI API:', error);
    return { song_name: null, file_type: null, voice_part: null, raw_message: message, error: error.message };
  }
}
