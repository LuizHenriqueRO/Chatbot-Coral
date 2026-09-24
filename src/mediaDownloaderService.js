import fs from 'fs';
import path from 'path';
import youtubedl from 'youtube-dl-exec';
import ffmpegPath from 'ffmpeg-static';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const TEMP_DIR = path.join(__dirname, '..', 'temp');

if (!fs.existsSync(TEMP_DIR)) {
  fs.mkdirSync(TEMP_DIR, { recursive: true });
}

export async function updateYtDlp() {
  try {
    console.log('Atualizando yt-dlp...');
    const output = await youtubedl.exec('', { update: true });
    console.log('Resultado da atualização yt-dlp:', output.stdout);
  } catch (error) {
    console.error('Erro ao atualizar yt-dlp:', error);
  }
}

export async function downloadMedia(url, format) {
  const timestamp = Date.now();
  const baseFilename = `media_${timestamp}`;

  try {
    if (format === 'audio') {
      const outPath = path.join(TEMP_DIR, `${baseFilename}.%(ext)s`);
      console.log(`Iniciando download do áudio de ${url}...`);

      await youtubedl(url, {
        extractAudio: true,
        audioFormat: 'mp3',
        output: outPath,
        ffmpegLocation: ffmpegPath,
        noCheckCertificates: true,
        noWarnings: true,
      });

      const downloadedFile = path.join(TEMP_DIR, `${baseFilename}.mp3`);
      if (fs.existsSync(downloadedFile)) {
        return { success: true, filepath: downloadedFile, mimeType: 'audio/mpeg', filename: `${baseFilename}.mp3` };
      }

      // Se falhou em forçar mp3, busca qualquer arquivo criado
      const files = fs.readdirSync(TEMP_DIR);
      const file = files.find(f => f.startsWith(baseFilename));
      if (file) return { success: true, filepath: path.join(TEMP_DIR, file), mimeType: 'audio/mpeg', filename: file };

      return { success: false, error: 'Arquivo não encontrado após download.' };
    } else {
      let currentHeight = 720;
      let filepath = null;

      for (let attempt = 1; attempt <= 2; attempt++) {
        const attemptPath = path.join(TEMP_DIR, `${baseFilename}_${currentHeight}.%(ext)s`);
        console.log(`Iniciando download do vídeo de ${url} na qualidade ${currentHeight}p... (Tentativa ${attempt})`);

        await youtubedl(url, {
          format: `bestvideo[height<=${currentHeight}][ext=mp4]+bestaudio[ext=m4a]/best[height<=${currentHeight}][ext=mp4]/best`,
          output: attemptPath,
          ffmpegLocation: ffmpegPath,
          mergeOutputFormat: 'mp4',
          noCheckCertificates: true,
          noWarnings: true,
        });

        // Procura pelo arquivo criado
        const files = fs.readdirSync(TEMP_DIR);
        const file = files.find(f => f.startsWith(`${baseFilename}_${currentHeight}`));
        
        if (!file) throw new Error('Arquivo de vídeo não encontrado após download.');
        filepath = path.join(TEMP_DIR, file);

        const stats = fs.statSync(filepath);
        const fileSizeInMB = stats.size / (1024 * 1024);

        if (fileSizeInMB <= 60) {
          return { success: true, filepath, mimeType: 'video/mp4', filename: file };
        } else {
          fs.unlinkSync(filepath); // Apaga arquivo pesado
          console.log(`Vídeo ficou com ${fileSizeInMB.toFixed(2)}MB, o que excede o limite. Apagando e tentando qualidade menor...`);
          if (attempt === 1) {
             currentHeight = 480;
          } else {
             return { success: false, error: 'O vídeo é muito longo ou pesado e não pode ser enviado pelo WhatsApp mesmo na menor qualidade possível.' };
          }
        }
      }
    }
  } catch (error) {
    console.error('Erro no download:', error);
    return { success: false, error: error.message };
  }
}
