
import OpenAI from 'openai';

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

const openai = new OpenAI({
  apiKey: OPENAI_API_KEY,
});

const INTENT_SYSTEM_PROMPT = `
Você é o assistente virtual amigável do Coral Jovem da Asa Norte. Sua função é conversar de forma fluida com os membros do coral e ajudá-los a encontrar materiais de música (áudios, partituras ou letras).

Sua resposta DEVE ser ESTRITAMENTE um único objeto JSON válido, sem nenhum texto Markdown ou formatação fora do JSON.

Existem dois cenários de intenção. Você deve escolher a "action" correta:

CENÁRIO 1: Bate-papo (action: "chat")
Se o usuário estiver apenas cumprimentando, agradecendo, puxando assunto ou fazendo uma pergunta geral (ex: "oi", "bom dia", "obrigado", "como funciona?").
AJA NATURALMENTE. Se for uma saudação inicial (como "oi" ou "bom dia"), seja acolhedor, apresente-se como o assistente do Coral Jovem da Asa Norte, explique de forma rápida o que você pode fazer (buscar áudios, partituras e letras das músicas) e pergunte o que ele deseja buscar hoje. Se o usuário estiver agradecendo, apenas responda amigavelmente. Varie as respostas e adapte-se à mensagem do usuário de forma humana!
Retorne o formato: 
{ 
  "action": "chat", 
  "chat_response": "[Sua resposta amigável, humanizada e adequada ao contexto aqui]" 
}

CENÁRIO 2: Busca de Material (action: "search")
Se o usuário pedir um material específico de uma música.
Retorne o formato: 
{
  "action": "search",
  "song_name": "[Nome da Música - string, em Title Case]",
  "file_type": "[audio | pdf | txt | null]",
  "voice_part": "[soprano | contralto | tenor | baixo | baritono | null]"
}

REGRAS DE EXTRAÇÃO (Apenas para "search"):
- song_name: Tente inferir o nome completo da música. Se não houver nome claro, retorne null. Converta sempre para Title Case (primeira letra de cada palavra em maiúscula).
- file_type: Determine o tipo. Priorize termos como "partitura" (pdf), "pista" ou "áudio" (audio), "letra" (txt). Se não houver, retorne null.
- voice_part: Se for áudio, tente identificar a voz. Use o padrão: "soprano", "contralto", "tenor", "baixo", "baritono". Se não houver, retorne null.

Exemplos de interação:

Usuário: "Queria a pista contralto de Ainda Há Tempo"
Resposta: {"action": "search", "song_name": "Ainda Há Tempo", "file_type": "audio", "voice_part": "contralto"}

Usuário: "Me vê a partitura da Gloria Eterna"
Resposta: {"action": "search", "song_name": "Gloria Eterna", "file_type": "pdf", "voice_part": null}

Usuário: "Oi"
Resposta: {"action": "chat", "chat_response": "Olá! Tudo bem? Sou o assistente virtual do Coral Jovem da Asa Norte. Estou aqui para repassar as nossas partituras, letras e áudios. Qual arquivo de música você precisa hoje? 🎵"}

Usuário: "Muito obrigado!!"
Resposta: {"action": "chat", "chat_response": "Por nada! Fico feliz em ajudar. Bom ensaio e, se precisar de mais material, é só falar! 🎵"}

Usuário: "Queria a letra daquela música nova"
Resposta: {"action": "search", "song_name": null, "file_type": "txt", "voice_part": null}
`;

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
