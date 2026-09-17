import fs from 'fs';
import path from 'path';
import cron from 'node-cron';

export function startCronJobs(sendTemplateMessageFn) {
  cron.schedule('0 9 * * *', () => {
    console.log('[CRON] Iniciando verificação diária de aniversariantes...');

    try {
      // Lê o arquivo JSON com os membros
      const filePath = path.resolve('members.json');
      if (!fs.existsSync(filePath)) {
        console.log('[CRON] Arquivo members.json não encontrado. Cancelando verificação.');
        return;
      }

      const rawData = fs.readFileSync(filePath, 'utf-8');
      const members = JSON.parse(rawData);

      // Pega a data de hoje no fuso horário do Brasil
      const hojeBrasil = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
      const day = String(hojeBrasil.getDate()).padStart(2, '0');
      const month = String(hojeBrasil.getMonth() + 1).padStart(2, '0');
      const todayString = `${day}/${month}`;

      console.log(`[CRON] Data de hoje: ${todayString}`);

      const currentYear = hojeBrasil.getFullYear();
      let hasChanges = false;

      // Filtra quem faz aniversário hoje E que AINDA NÃO recebeu mensagem este ano
      const aniversariantes = members.filter(member => {
        return member.birthday === todayString && member.last_notified_year !== currentYear;
      });

      if (aniversariantes.length > 0) {
        console.log(`[CRON] Encontrado(s) ${aniversariantes.length} aniversariante(s) hoje que ainda não receberam mensagem!`);

        aniversariantes.forEach(aniversariante => {
          console.log(`[CRON] Enviando mensagem de parabéns para ${aniversariante.name} (${aniversariante.phone})`);
          // Chama a função de envio passando o telefone e o nome
          sendTemplateMessageFn(aniversariante.phone, 'mensagem_aniversario_coral', aniversariante.name);
          
          // Registra que a mensagem já foi enviada para essa pessoa neste ano
          aniversariante.last_notified_year = currentYear;
          hasChanges = true;
        });

        // Se enviou para alguém, salva a alteração no arquivo members.json
        if (hasChanges) {
          fs.writeFileSync(filePath, JSON.stringify(members, null, 2), 'utf-8');
          console.log('[CRON] Arquivo members.json atualizado para evitar reenvios neste ano.');
        }
      } else {
        console.log('[CRON] Nenhum aniversariante pendente de notificação para hoje.');
      }
    } catch (error) {
      console.error('[CRON] Erro ao verificar aniversariantes:', error);
    }
  }, {
    timezone: "America/Sao_Paulo"
  });

  console.log('⏰ Serviço de verificação de aniversários (Cron) agendado para rodar todos os dias às 09:00 (fuso de Brasília).');
}
