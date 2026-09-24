import fs from 'fs';
import path from 'path';
import https from 'https';
import { execSync } from 'child_process';
import youtubedl from 'youtube-dl-exec';
import ffmpegPath from 'ffmpeg-static';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const TEMP_DIR = path.join(__dirname, '..', 'temp');
const BIN_DIR = path.join(__dirname, '..', 'bin');

if (!fs.existsSync(TEMP_DIR)) {
  fs.mkdirSync(TEMP_DIR, { recursive: true });
}
if (!fs.existsSync(BIN_DIR)) {
  fs.mkdirSync(BIN_DIR, { recursive: true });
}

const isWin = process.platform === 'win32';
const ytDlpFileName = isWin ? 'yt-dlp.exe' : 'yt-dlp_linux';
const ytDlpBinaryPath = path.join(BIN_DIR, ytDlpFileName);

let ytDlpExec = youtubedl;

async function ensureYtDlpStandalone() {
  if (!fs.existsSync(ytDlpBinaryPath)) {
    console.log(`Baixando binário standalone do yt-dlp para ${process.platform} em ${ytDlpBinaryPath}...`);
    const downloadUrl = `https://github.com/yt-dlp/yt-dlp/releases/latest/download/${ytDlpFileName}`;
    
    await new Promise((resolve, reject) => {
      const file = fs.createWriteStream(ytDlpBinaryPath);
      
      const request = (url) => {
        https.get(url, (response) => {
          if (response.statusCode === 302 || response.statusCode === 301) {
            request(response.headers.location);
          } else {
            response.pipe(file);
            file.on('finish', () => { 
              file.close(); 
              if (!isWin) {
                fs.chmodSync(ytDlpBinaryPath, '755');
              }
              resolve(); 
            });
          }
        }).on('error', (err) => {
          fs.unlinkSync(ytDlpBinaryPath);
          reject(err);
        });
      };
      
      request(downloadUrl);
    });

    console.log('Binário do yt-dlp baixado com sucesso!');
  }
  
  ytDlpExec = youtubedl.create(ytDlpBinaryPath);
}

// Inicia verificação do binário assim que o módulo carregar
ensureYtDlpStandalone().catch(err => console.error('Erro no setup do yt-dlp:', err));

export async function updateYtDlp() {
  try {
    console.log('Atualizando yt-dlp...');
    // Como estamos usando nosso binário customizado, podemos pedir pro yt-dlp se atualizar
    if (fs.existsSync(ytDlpBinaryPath)) {
       execSync(`"${ytDlpBinaryPath}" -U`, { stdio: 'inherit' });
    }
  } catch (error) {
    console.error('Erro ao atualizar yt-dlp:', error);
  }
}

export async function downloadMedia(url, format) {
  // Garante que o binário existe antes de baixar
  await ensureYtDlpStandalone();

  const timestamp = Date.now();
  const baseFilename = `media_${timestamp}`;

  try {
    if (format === 'audio') {
      const outPath = path.join(TEMP_DIR, `${baseFilename}.%(ext)s`);
      console.log(`Iniciando download do áudio de ${url}...`);

      await Promise.race([
        ytDlpExec(url, {
          extractAudio: true,
          audioFormat: 'mp3',
          output: outPath,
          ffmpegLocation: ffmpegPath,
          extractorArgs: 'youtube:player_client=android',
          noCheckCertificates: true,
          noWarnings: true,
        }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout de download (a rede bloqueou ou o link está indisponível)')), 180000))
      ]);

      const downloadedFile = path.join(TEMP_DIR, `${baseFilename}.mp3`);
      if (fs.existsSync(downloadedFile)) {
        return { success: true, filepath: downloadedFile, mimeType: 'audio/mpeg', filename: `${baseFilename}.mp3` };
      }

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

        await Promise.race([
          ytDlpExec(url, {
            format: `bestvideo[height<=${currentHeight}][vcodec^=avc][ext=mp4]+bestaudio[ext=m4a]/best[height<=${currentHeight}][vcodec^=avc][ext=mp4]/best[height<=${currentHeight}][ext=mp4]/best[ext=mp4]/best`,
            output: attemptPath,
            ffmpegLocation: ffmpegPath,
            mergeOutputFormat: 'mp4',
            extractorArgs: 'youtube:player_client=android',
            noCheckCertificates: true,
            noWarnings: true,
          }),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout de download (a rede bloqueou ou o link está indisponível)')), 180000))
        ]);

        const files = fs.readdirSync(TEMP_DIR);
        const file = files.find(f => f.startsWith(`${baseFilename}_${currentHeight}`));
        
        if (!file) throw new Error('Arquivo de vídeo não encontrado após download.');
        filepath = path.join(TEMP_DIR, file);

        const stats = fs.statSync(filepath);
        const fileSizeInMB = stats.size / (1024 * 1024);

        if (fileSizeInMB <= 15.5) {
          return { success: true, filepath, mimeType: 'video/mp4', filename: file, sendAsDocument: false };
        } else {
          if (attempt === 1) {
             fs.unlinkSync(filepath); // Apaga arquivo muito pesado para vídeo nativo
             console.log(`Vídeo ficou com ${fileSizeInMB.toFixed(2)}MB, excede o limite nativo da API (16MB). Apagando e tentando 480p...`);
             currentHeight = 480;
          } else {
             if (fileSizeInMB <= 95) {
                 console.log(`Mesmo em 480p, vídeo tem ${fileSizeInMB.toFixed(2)}MB. Retornando para ser enviado como documento (limite 100MB).`);
                 return { success: true, filepath, mimeType: 'video/mp4', filename: file, sendAsDocument: true };
             } else {
                 fs.unlinkSync(filepath);
                 return { success: false, error: 'O vídeo é muito pesado (mais de 100MB) e não pode ser enviado pelo WhatsApp.' };
             }
          }
        }
      }
    }
  } catch (error) {
    console.error('Erro no download:', error);
    return { success: false, error: error.message };
  }
}
