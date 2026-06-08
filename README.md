# 🎶 ChatBot Coral Jovem - Assistente Virtual Inteligente via WhatsApp

<img width="2560" height="800" alt="Cópia de coral jovem asa norte (2048 x 1152 px)" src="https://github.com/user-attachments/assets/339521b8-775f-4c4c-92c6-04cd15d98312" />

Bem-vindo ao repositório do **Bot Coral Jovem da Asa Norte**! Este é um sistema autônomo projetado para revolucionar e facilitar a forma como os membros de um coral acessam materiais de ensaio e informações importantes da igreja. Tudo isso diretamente pela tela do WhatsApp, conversando em linguagem natural!

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

<div align="center">
  <table>
    <tr>
      <td align="center"><b>Saudação</b></td>
      <td align="center"><b>Menu Inicial</b></td>
      <td align="center"><b>Pedindo um Kit de Voz</b></td>
      <td align="center"><b>Buscando um Livro</b></td>
    </tr>
    <tr>
      <td><img src="https://github.com/user-attachments/assets/02c0fef3-64f3-4810-b35f-a4a0fecc69b7" width="250" alt="Menu Inicial"></td>
      <td><img src="https://github.com/user-attachments/assets/86dc0eb1-ec83-47df-ada7-c3e10cabf95b" width="250" alt="Menu Inicial"></td>
      <td><img src="https://github.com/user-attachments/assets/d06036f5-8a67-4efe-a309-72e08ff4d3ec" width="250" alt="Kit de Voz"></td>
      <td><img src="https://github.com/user-attachments/assets/84bab1a1-09e0-4504-8263-be62243a2a54" width="250" alt="Busca de Livro"></td>
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
