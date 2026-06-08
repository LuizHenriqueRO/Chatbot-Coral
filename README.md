# 🎶 Bot Coral Jovem - Assistente Virtual Inteligente via WhatsApp

![Banner ou Logo do Chatbot](https://via.placeholder.com/800x200.png?text=Bot+Coral+Jovem+-+Insira+seu+Banner+Aqui)

Bem-vindo ao repositório do **Bot Coral Jovem da Asa Norte**! Este é um sistema autônomo projetado para revolucionar e facilitar a forma como os membros de um coral acessam materiais de ensaio e informações importantes da igreja. Tudo isso diretamente pela tela do WhatsApp, conversando em linguagem natural!

> **📱 Fale com o Bot agora mesmo:**  
> Salve o número **[(XX) XXXXX-XXXX]** nos seus contatos ou [clique aqui para abrir o WhatsApp](https://wa.me/55DDDNÚMERO) e mande um "Oi"!

## 🚀 O que este bot faz?

Este chatbot funciona como um bibliotecário e assistente amigável, alimentado por IA. Ele compreende intenções complexas, lembra do contexto da conversa e busca os materiais desejados em um acervo do **Google Drive**, entregando-os perfeitamente na conversa via **WhatsApp Cloud API**.

### 🎵 Recursos Principais

*   **🎙️ Kits de Voz sob Demanda:** Peça por naipes específicos (Soprano, Contralto, Tenor, Baixo). O bot permite também pedidos em lote (ex: *"Mande todas as vozes da música X"*).
*   **🎼 Partituras e Letras:** Acesso a PDFs e textos extraídos diretamente do Drive.
*   **📖 Hinário Adventista:** Busca instantânea por letras dos hinos.
*   **📚 Acervo de Ellen White:** Pesquisa de livros em PDF com identificação inteligente de volumes (ex: *Testemunhos Seletos*).
*   **📝 Escola Sabatina:** Distribuição das Lições (Jovens e Adultos) em PDF.
*   **🧠 Memória de Contexto:** Mantém o histórico da conversa vivo! Se você perguntar *"Você tem a música Alfa e Ômega?"* e em seguida disser *"Manda a pista de Tenor"*, ele entende perfeitamente.
*   **ℹ️ Informações da Igreja:** Agenda do coral, links do Google Drive, localização e mais.

---

## 📸 Demonstração do Chatbot

*(Substitua as imagens abaixo por prints reais do seu chatbot em ação no WhatsApp)*

<div align="center">
  <table>
    <tr>
      <td align="center"><b>Menu Inicial / Saudação</b></td>
      <td align="center"><b>Pedindo um Kit de Voz</b></td>
      <td align="center"><b>Buscando um Livro</b></td>
    </tr>
    <tr>
      <td><img src="https://via.placeholder.com/250x450.png?text=Print+do+Menu" width="250" alt="Menu Inicial"></td>
      <td><img src="https://via.placeholder.com/250x450.png?text=Print+Kit+de+Voz" width="250" alt="Kit de Voz"></td>
      <td><img src="https://via.placeholder.com/250x450.png?text=Print+Livros" width="250" alt="Busca de Livro"></td>
    </tr>
  </table>
</div>

---

## 🛠️ Tecnologias Utilizadas

O sistema possui uma arquitetura robusta e escalável, unindo excelentes APIs:

*   **Node.js & Express:** O coração do servidor webhook.
*   **WhatsApp Cloud API (Meta):** Recepção e envio de mensagens e mídias de forma nativa.
*   **Google Drive API (`googleapis`):** Indexação, busca avançada e download em tempo real de mídias (áudios, pdfs, txts).
*   **OpenAI API (`gpt-4o-mini`):** Análise sintática da linguagem, compreensão da intenção do usuário (*Intent Parsing*) e geração de mensagens humanizadas.
*   **Redis:** Cache rápido e gerenciamento do histórico das sessões (memória) de cada usuário.

---

## ⚙️ Entendendo o Fluxo (Como funciona?)

1.  **Webhook Recebe:** O membro do coral manda mensagem no WhatsApp, a Meta dispara um POST no servidor (Express).
2.  **Intent Parsing:** O texto é cruzado com o histórico do Redis e processado pelo **GPT-4o-mini**, que decide através de *Function Calling* dinâmico se a intenção é conversar (`chat`), buscar arquivo (`search`), ou ver uma info (`info`).
3.  **Busca na Nuvem:** Se for `search`, o `googleDriveService` busca ativamente no acervo do Drive com base na música e tipo de arquivo desejado.
4.  **Entrega Dinâmica:** O servidor faz o download do arquivo em memória e realiza o upload diretamente para a Meta, que devolve a mídia perfeitamente renderizada no celular do usuário.

---

## 🚀 Rodando o Projeto Localmente

### Pré-requisitos
Para rodar este projeto, você precisará de:
*   [Node.js](https://nodejs.org/en/) (v20 ou superior)
*   Conta de Desenvolvedor da Meta (WhatsApp Cloud API)
*   Projeto no Google Cloud Console com API do Drive habilitada e credenciais de Conta de Serviço (Service Account)
*   Chave de API da [OpenAI](https://platform.openai.com/)
*   Servidor Redis (pode ser local ou cloud)

### Instalação

1. Clone este repositório:
   ```bash
   git clone https://github.com/seu-usuario/bot-igreja.git
   cd bot-igreja
   ```

2. Instale as dependências:
   ```bash
   npm install
   ```

3. Crie e configure seu arquivo `.env` (use o `.env.example` como base):
   ```bash
   cp .env.example .env
   ```
   *Preencha com seus Tokens do WhatsApp, OpenAI, e URL do Redis.*

4. Configure as credenciais do Google:
   Coloque o arquivo JSON da sua Service Account do Google Drive na pasta `credenciais/` e ajuste o caminho no código.

5. Inicie o servidor:
   ```bash
   npm start
   ```

*Lembre-se de usar ferramentas como o **Ngrok** para expor sua porta local e configurar a URL de Webhook no painel da Meta durante o desenvolvimento.*

---

## 🤝 Contribuição

Sinta-se à vontade para realizar um *fork* deste projeto, abrir *Issues* relatando problemas ou enviar *Pull Requests* com novas funcionalidades!

## 📄 Licença

Este projeto é licenciado sob a [ISC License](https://opensource.org/licenses/ISC).
