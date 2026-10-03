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

// Trata os cookies do YouTube vindos da variável de ambiente para não expor no GitHub
const cookiesPath = path.join(__dirname, '..', 'cookies.txt');
if (process.env.YOUTUBE_COOKIES) {
  try {
    let rawCookies = process.env.YOUTUBE_COOKIES;
    
    // Se o usuário usou Base64 para evitar corrupção, os dados já estão perfeitos
    if (!rawCookies.includes('# Netscape') && /^[a-zA-Z0-9+/=\s]+$/.test(rawCookies.trim())) {
      const cleanBase64 = rawCookies.replace(/\s+/g, '');
      const decodedCookies = Buffer.from(cleanBase64, 'base64').toString('utf-8');
      fs.writeFileSync(cookiesPath, decodedCookies, 'utf-8');
      console.log('Arquivo de cookies do YouTube gerado via Base64 com sucesso!');
    } else {
      // Tenta corrigir quebras de linha caso o painel de hospedagem tenha achatado tudo em texto puro
      let formattedCookies = rawCookies
        .replace(/\\n/g, '\n')
        .replace(/(TRUE|FALSE)\s+(TRUE|FALSE)\s+(\d+)\s+([^\s]+)\s+([^\s]+)/g, "$1\t$2\t$3\t$4\t$5")
        .replace(/(^|\s)\.youtube\.com/g, "\n.youtube.com"); // Previne quebrar #HttpOnly_.youtube.com
        
      // Limpa linhas em branco duplas
      formattedCookies = formattedCookies.replace(/\n+/g, '\n');

      fs.writeFileSync(cookiesPath, formattedCookies, 'utf-8');
      console.log('Arquivo de cookies do YouTube gerado via texto puro com sucesso!');
    }
  } catch (err) {
    console.error('Falha ao gravar cookies.txt a partir da variável de ambiente:', err);
  }
}
async function ensureYtDlpStandalone() {
  if (!fs.existsSync(ytDlpBinaryPath)) {
    console.log(`Baixando binário standalone do yt-dlp (nightly) para ${process.platform} em ${ytDlpBinaryPath}...`);
    const downloadUrl = `https://github.com/yt-dlp/yt-dlp-nightly-builds/releases/latest/download/${ytDlpFileName}`;
    
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
    console.log('Atualizando yt-dlp para a versão nightly...');
    // Como estamos usando nosso binário customizado, podemos pedir pro yt-dlp se atualizar
    if (fs.existsSync(ytDlpBinaryPath)) {
       execSync(`"${ytDlpBinaryPath}" --update-to nightly`, { stdio: 'inherit' });
    }
  } catch (error) {
    console.error('Erro ao atualizar yt-dlp:', error);
  }
}

async function uploadToCatbox(filepath, filename) {
  const buffer = fs.readFileSync(filepath);
  const blob = new Blob([buffer]);
  const formData = new FormData();
  formData.append('reqtype', 'fileupload');
  formData.append('fileToUpload', blob, filename);

  const res = await fetch('https://catbox.moe/user/api.php', {
    method: 'POST',
    body: formData
  });
  const text = await res.text();
  if (text && text.startsWith('https://')) {
    return text;
  }
  throw new Error('Falha ao fazer upload temporário no servidor externo.');
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

      const ytDlpAudioOptions = {
        extractAudio: true,
        audioFormat: 'm4a',
        output: outPath,
        ffmpegLocation: ffmpegPath,
        noCheckCertificates: true,
        noWarnings: true,
      };
      const cookiesPath = path.join(__dirname, '..', 'cookies.txt');
      if (fs.existsSync(cookiesPath)) {
        ytDlpAudioOptions.cookies = cookiesPath;
      } else {
        ytDlpAudioOptions.extractorArgs = 'youtube:player_client=default,-android_sdkless';
      }

      await Promise.race([
        ytDlpExec(url, ytDlpAudioOptions),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout de download (a rede bloqueou ou o link está indisponível)')), 180000))
      ]);

      const downloadedFile = path.join(TEMP_DIR, `${baseFilename}.m4a`);
      let filepath = downloadedFile;
      if (!fs.existsSync(downloadedFile)) {
        const files = fs.readdirSync(TEMP_DIR);
        const file = files.find(f => f.startsWith(baseFilename));
        if (!file) return { success: false, error: 'Arquivo não encontrado após download.' };
        filepath = path.join(TEMP_DIR, file);
      }

      const stats = fs.statSync(filepath);
      const fileSizeInMB = stats.size / (1024 * 1024);

      if (fileSizeInMB <= 15.5) {
         return { success: true, filepath, mimeType: 'audio/mp4', filename: `${baseFilename}.m4a`, sendAsDocument: false };
      } else if (fileSizeInMB <= 95) {
         console.log(`Áudio tem ${fileSizeInMB.toFixed(2)}MB. Retornando para envio como documento...`);
         return { success: true, filepath, mimeType: 'audio/mp4', filename: `${baseFilename}.m4a`, sendAsDocument: true };
      } else {
         console.log(`Áudio tem ${fileSizeInMB.toFixed(2)}MB. Fazendo upload para servidor externo...`);
         const externalUrl = await uploadToCatbox(filepath, `${baseFilename}.m4a`);
         fs.unlinkSync(filepath);
         return { success: true, externalUrl, filename: `${baseFilename}.m4a` };
      }
    } else {
      let currentHeight = 720;
      let filepath = null;

      for (let attempt = 1; attempt <= 2; attempt++) {
        const attemptPath = path.join(TEMP_DIR, `${baseFilename}_${currentHeight}.%(ext)s`);
        console.log(`Iniciando download do vídeo de ${url} na qualidade ${currentHeight}p... (Tentativa ${attempt})`);

        const ytDlpOptions = {
          format: `bestvideo[height<=${currentHeight}][vcodec^=avc][ext=mp4]+bestaudio[ext=m4a]/best[height<=${currentHeight}][vcodec^=avc][ext=mp4]/best[height<=${currentHeight}][ext=mp4]/best[ext=mp4]/best`,
          output: attemptPath,
          ffmpegLocation: ffmpegPath,
          mergeOutputFormat: 'mp4',
          embedMetadata: true,
          postprocessorArgs: 'ffmpeg:-movflags +faststart',
          noCheckCertificates: true,
          noWarnings: true,
        };
        const cookiesPath = path.join(__dirname, '..', 'cookies.txt');
        if (fs.existsSync(cookiesPath)) {
          ytDlpOptions.cookies = cookiesPath;
        } else {
          ytDlpOptions.extractorArgs = 'youtube:player_client=default,-android_sdkless';
        }

        await Promise.race([
          ytDlpExec(url, ytDlpOptions),
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
             fs.unlinkSync(filepath); // Apaga arquivo 720p pois passou de 16mb
             console.log(`Vídeo 720p ficou com ${fileSizeInMB.toFixed(2)}MB, excede o limite nativo da API (16MB). Apagando e tentando 1080p para documento/link...`);
             currentHeight = 1080;
          } else {
             if (fileSizeInMB <= 95) {
                 console.log(`Vídeo 1080p tem ${fileSizeInMB.toFixed(2)}MB. Retornando para envio como documento...`);
                 return { success: true, filepath, mimeType: 'video/mp4', filename: file, sendAsDocument: true };
             } else {
                 console.log(`Vídeo gigante com ${fileSizeInMB.toFixed(2)}MB. Fazendo upload para servidor externo...`);
                 try {
                   const externalUrl = await uploadToCatbox(filepath, file);
                   fs.unlinkSync(filepath);
                   return { success: true, externalUrl, filename: file };
                 } catch (err) {
                   fs.unlinkSync(filepath);
                   return { success: false, error: 'O vídeo é muito pesado e o servidor temporário recusou o upload.' };
                 }
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
