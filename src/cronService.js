import fs from 'fs';
import path from 'path';
import cron from 'node-cron';

export function startCronJobs(sendTemplateMessageFn) {
  cron.schedule('*/2 * * * *', async () => {
    console.log('[CRON] Iniciando verificação diária de aniversariantes (teste a cada 2 min)...');

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

      const aniversariantes = members.filter(member => member.birthday === todayString);

      if (aniversariantes.length > 0) {
        console.log(`[CRON] Encontrado(s) ${aniversariantes.length} aniversariante(s) hoje!`);

        for (const aniversariante of aniversariantes) {
          console.log(`[CRON] Enviando mensagem de parabéns para ${aniversariante.name} (${aniversariante.phone})`);
          // Espera o envio terminar antes de passar para o próximo da lista (evita bloqueios da Meta por envios simultâneos)
          await sendTemplateMessageFn(aniversariante.phone, 'mensagem_aniversario_coral', aniversariante.name);
        }
      } else {
        console.log('[CRON] Nenhum aniversariante encontrado para hoje.');
      }
    } catch (error) {
      console.error('[CRON] Erro ao verificar aniversariantes:', error);
    }
  }, {
    timezone: "America/Sao_Paulo"
  });

  console.log('⏰ Serviço de verificação de aniversários (Cron) agendado para rodar a cada 2 minutos (teste).');
}
