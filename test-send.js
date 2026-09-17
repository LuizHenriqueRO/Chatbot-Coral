import 'dotenv/config';

const phone = process.argv[2];
const name = process.argv[3];

if (!phone || !name) {
  console.log("❌ Erro: Faltam parâmetros.");
  console.log("👉 Uso correto: node test-send.js <numero_telefone> <nome>");
  console.log("👉 Exemplo: node test-send.js 5561999999999 João");
  process.exit(1);
}

const WHATSAPP_PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;
const WHATSAPP_ACCESS_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN;

if (!WHATSAPP_PHONE_NUMBER_ID || !WHATSAPP_ACCESS_TOKEN) {
  console.log("❌ Erro: Variáveis de ambiente não encontradas no .env");
  process.exit(1);
}

async function sendTest() {
  console.log(`⏳ Tentando enviar mensagem para o número: ${phone} com o nome: ${name}...`);

  const payload = {
    messaging_product: 'whatsapp',
    to: phone,
    type: 'template',
    template: {
      name: 'mensagem_aniversario_coral',
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
              text: name
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
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const data = await response.json();
    console.log("====================================");
    console.log("✅ Resposta da API da Meta:");
    console.log(JSON.stringify(data, null, 2));
    console.log("====================================");
    
    if (data.error) {
      console.log("⚠️ ATENÇÃO: A Meta recusou a mensagem. Leia o erro acima.");
    } else {
      console.log("🚀 Mensagem Aceita! Verifique o WhatsApp do destinatário.");
    }
  } catch (error) {
    console.error("❌ Erro fatal ao tentar conectar com a Meta:", error);
  }
}

sendTest();
