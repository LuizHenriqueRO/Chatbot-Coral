import fs from 'fs';
import path from 'path';
import https from 'https';
import { pipeline } from 'stream/promises';
import { Readable } from 'stream';
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

// Limpa arquivos temporários antigos (> 30 minutos)
function cleanOldTempFiles() {
  try {
    const now = Date.now();
    const files = fs.readdirSync(TEMP_DIR);
    for (const file of files) {
      const filePath = path.join(TEMP_DIR, file);
      const stats = fs.statSync(filePath);
      if (now - stats.mtimeMs > 30 * 60 * 1000) {
        fs.unlinkSync(filePath);
      }
    }
  } catch (_) {}
}

// Instâncias públicas verificadas e rápidas do Cobalt (sem Turnstile/Cloudflare bloqueador)
const DEFAULT_COBALT_INSTANCES = [
  'https://rue-cobalt.xenon.zone',
  'https://cobaltapi.cjs.nz'
];

async function getCobaltInstances() {
  const list = [];
  if (process.env.COBALT_API_URL) {
    list.push(process.env.COBALT_API_URL.replace(/\/+$/, ''));
  }
  list.push(...DEFAULT_COBALT_INSTANCES);
  return list;
}

// Descobre dinamicamente instâncias ativas caso as padrões falhem
async function discoverCobaltInstances() {
  try {
    console.log('[Cobalt] Buscando novas instâncias públicas em cobalt.directory...');
    const res = await fetch('https://cobalt.directory/', { signal: AbortSignal.timeout(6000) });
    if (!res.ok) return [];
    const html = await res.text();
    const ids = [...html.matchAll(/href="\/instance\/([a-z0-9]+)"/g)].map(m => m[1]);

    const discovered = [];
    for (const id of ids.slice(0, 10)) {
      try {
        const instRes = await fetch(`https://cobalt.directory/instance/${id}`, { signal: AbortSignal.timeout(3000) });
        const text = await instRes.text();
        if (text.includes('turnstile:false')) {
          const mApi = text.match(/api:"([^"]+)"/);
          if (mApi && mApi[1]) {
            discovered.push(`https://${mApi[1]}`);
          }
        }
      } catch (_) {}
    }
    return discovered;
  } catch (err) {
    console.warn('[Cobalt] Falha ao consultar cobalt.directory:', err.message);
    return [];
  }
}

// Download via serviço externo (Cobalt API)
async function downloadViaCobalt(url, format) {
  const isAudio = format === 'audio';
  const audioFormatsToTry = isAudio ? ['mp3', 'best'] : [null];

  let instances = await getCobaltInstances();
  let lastError = null;

  for (const instance of instances) {
    for (const audioFmt of audioFormatsToTry) {
      try {
        const payload = {
          url,
          alwaysProxy: true,
          ...(isAudio ? { downloadMode: 'audio', audioFormat: audioFmt } : { videoQuality: '720' })
        };

        console.log(`[Cobalt] Requisitando resolução para: ${instance} (${isAudio ? audioFmt : '720p'})...`);
        const response = await fetch(instance, {
          method: 'POST',
          headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(25000)
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const data = await response.json();

        if (data.status === 'error') {
          const errCode = data.error?.code || data.text || 'Erro desconhecido';
          throw new Error(`Cobalt error: ${errCode}`);
        }

        let downloadUrl = data.url;
        let remoteFilename = data.filename;

        if (data.status === 'picker' && Array.isArray(data.picker) && data.picker.length > 0) {
          const item = data.picker.find(p => p.type === (isAudio ? 'audio' : 'video')) || data.picker[0];
          downloadUrl = item.url;
        }

        if (!downloadUrl) {
          throw new Error('Nenhuma URL de mídia retornada pela API externa');
        }

        const timestamp = Date.now();
        let detectedExt = isAudio ? (audioFmt === 'best' ? '.m4a' : '.mp3') : '.mp4';
        if (remoteFilename && remoteFilename.includes('.')) {
          const parts = remoteFilename.split('.');
          const lastPart = '.' + parts[parts.length - 1].toLowerCase();
          if (['.m4a', '.mp3', '.ogg', '.opus', '.wav', '.mp4', '.webm'].includes(lastPart)) {
            detectedExt = lastPart;
          }
        }

        let safeFilename = (remoteFilename || `media_${timestamp}${detectedExt}`)
          .replace(/[/\\?%*:|"<>]/g, '_')
          .trim();
        if (!safeFilename.endsWith(detectedExt) && !safeFilename.includes('.')) {
          safeFilename += detectedExt;
        }

        const targetPath = path.join(TEMP_DIR, `${timestamp}_${safeFilename}`);
        console.log(`[Cobalt] Baixando arquivo para ${targetPath}...`);

        const mediaStreamRes = await fetch(downloadUrl, { signal: AbortSignal.timeout(90000) });
        if (!mediaStreamRes.ok) {
          throw new Error(`Falha no download da mídia (HTTP ${mediaStreamRes.status})`);
        }

        await pipeline(Readable.fromWeb(mediaStreamRes.body), fs.createWriteStream(targetPath));

        const stats = fs.statSync(targetPath);
        if (stats.size < 1000) {
          if (fs.existsSync(targetPath)) fs.unlinkSync(targetPath);
          throw new Error('O arquivo de mídia baixado veio vazio (0 bytes). O vídeo pode estar protegido ou indisponível.');
        }

        const fileSizeInMB = stats.size / (1024 * 1024);
        console.log(`[Cobalt] Mídia recebida com sucesso! Tamanho: ${fileSizeInMB.toFixed(2)}MB`);

        let mimeType = 'video/mp4';
        if (isAudio) {
          if (safeFilename.toLowerCase().endsWith('.m4a') || safeFilename.toLowerCase().endsWith('.mp4') || safeFilename.toLowerCase().endsWith('.aac')) {
            mimeType = 'audio/mp4';
          } else if (safeFilename.toLowerCase().endsWith('.ogg') || safeFilename.toLowerCase().endsWith('.opus')) {
            mimeType = 'audio/ogg';
          } else {
            mimeType = 'audio/mpeg';
          }
        }

        if (fileSizeInMB <= 15.5) {
          return { success: true, filepath: targetPath, mimeType, filename: safeFilename, sendAsDocument: false };
        } else if (fileSizeInMB <= 95) {
          console.log(`Arquivo tem ${fileSizeInMB.toFixed(2)}MB (> 16MB). Retornando para envio como documento...`);
          return { success: true, filepath: targetPath, mimeType, filename: safeFilename, sendAsDocument: true };
        } else {
          console.log(`Arquivo com ${fileSizeInMB.toFixed(2)}MB (> 95MB). Fazendo upload para servidor temporário externo...`);
          const externalUrl = await uploadToCatbox(targetPath, safeFilename);
          if (fs.existsSync(targetPath)) fs.unlinkSync(targetPath);
          return { success: true, externalUrl, filename: safeFilename };
        }
      } catch (err) {
        console.warn(`[Cobalt] Falha na instância ${instance} (${audioFmt || 'video'}): ${err.message}`);
        lastError = err;
      }
    }
  }

  // Tenta instâncias dinâmicas de backup
  try {
    const discovered = await discoverCobaltInstances();
    for (const newInst of discovered) {
      if (instances.includes(newInst)) continue;
      try {
        console.log(`[Cobalt] Tentando instância descoberta: ${newInst}...`);
        const response = await fetch(newInst, {
          method: 'POST',
          headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(20000)
        });
        if (!response.ok) continue;
        const data = await response.json();
        if (data.status === 'tunnel' || data.status === 'redirect') {
          const timestamp = Date.now();
          let detectedExt = isAudio ? '.m4a' : '.mp4';
          if (data.filename && data.filename.includes('.')) {
            const parts = data.filename.split('.');
            const lastPart = '.' + parts[parts.length - 1].toLowerCase();
            if (['.m4a', '.mp3', '.ogg', '.opus', '.wav', '.mp4', '.webm'].includes(lastPart)) {
              detectedExt = lastPart;
            }
          }

          const safeFilename = (data.filename || `media_${timestamp}${detectedExt}`).replace(/[/\\?%*:|"<>]/g, '_');
          const targetPath = path.join(TEMP_DIR, `${timestamp}_${safeFilename}`);
          const mediaStreamRes = await fetch(data.url, { signal: AbortSignal.timeout(90000) });
          await pipeline(Readable.fromWeb(mediaStreamRes.body), fs.createWriteStream(targetPath));
          const stats = fs.statSync(targetPath);
          if (stats.size < 1000) {
            if (fs.existsSync(targetPath)) fs.unlinkSync(targetPath);
            continue;
          }
          const fileSizeInMB = stats.size / (1024 * 1024);
          
          let mimeType = 'video/mp4';
          if (isAudio) {
            if (safeFilename.toLowerCase().endsWith('.m4a') || safeFilename.toLowerCase().endsWith('.mp4') || safeFilename.toLowerCase().endsWith('.aac')) {
              mimeType = 'audio/mp4';
            } else if (safeFilename.toLowerCase().endsWith('.ogg') || safeFilename.toLowerCase().endsWith('.opus')) {
              mimeType = 'audio/ogg';
            } else {
              mimeType = 'audio/mpeg';
            }
          }

          if (fileSizeInMB <= 15.5) {
            return { success: true, filepath: targetPath, mimeType, filename: safeFilename, sendAsDocument: false };
          } else if (fileSizeInMB <= 95) {
            return { success: true, filepath: targetPath, mimeType, filename: safeFilename, sendAsDocument: true };
          } else {
            const externalUrl = await uploadToCatbox(targetPath, safeFilename);
            if (fs.existsSync(targetPath)) fs.unlinkSync(targetPath);
            return { success: true, externalUrl, filename: safeFilename };
          }
        }
      } catch (_) {}
    }
  } catch (_) {}

  throw lastError || new Error('Todas as instâncias do downloader externo falharam');
}

// -------------------------------------------------------------
// Fallback Local via yt-dlp (caso a API externa esteja offline)
// -------------------------------------------------------------
const isWin = process.platform === 'win32';
const ytDlpFileName = isWin ? 'yt-dlp.exe' : 'yt-dlp_linux';
const ytDlpBinaryPath = path.join(BIN_DIR, ytDlpFileName);
let ytDlpExec = youtubedl;

const cookiesPath = path.join(__dirname, '..', 'cookies.txt');
if (process.env.YOUTUBE_COOKIES) {
  try {
    let rawCookies = process.env.YOUTUBE_COOKIES;
    if (!rawCookies.includes('# Netscape') && /^[a-zA-Z0-9+/=\s]+$/.test(rawCookies.trim())) {
      const cleanBase64 = rawCookies.replace(/\s+/g, '');
      const decodedCookies = Buffer.from(cleanBase64, 'base64').toString('utf-8');
      fs.writeFileSync(cookiesPath, decodedCookies, 'utf-8');
    } else {
      let formattedCookies = rawCookies
        .replace(/\\n/g, '\n')
        .replace(/(TRUE|FALSE)\s+(TRUE|FALSE)\s+(\d+)\s+([^\s]+)\s+([^\s]+)/g, "$1\t$2\t$3\t$4\t$5")
        .replace(/(^|\s)\.youtube\.com/g, "\n.youtube.com");
      formattedCookies = formattedCookies.replace(/\n+/g, '\n');
      fs.writeFileSync(cookiesPath, formattedCookies, 'utf-8');
    }
  } catch (err) {
    console.error('Falha ao gravar cookies.txt:', err);
  }
}

async function ensureYtDlpStandalone() {
  if (!fs.existsSync(ytDlpBinaryPath)) {
    console.log(`Baixando binário standalone do yt-dlp para ${process.platform}...`);
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
              if (!isWin) fs.chmodSync(ytDlpBinaryPath, '755');
              resolve();
            });
          }
        }).on('error', (err) => {
          if (fs.existsSync(ytDlpBinaryPath)) fs.unlinkSync(ytDlpBinaryPath);
          reject(err);
        });
      };
      request(downloadUrl);
    });
  }
  ytDlpExec = youtubedl.create(ytDlpBinaryPath);
}

export async function updateYtDlp() {
  try {
    if (fs.existsSync(ytDlpBinaryPath)) {
      console.log('Atualizando yt-dlp...');
      execSync(`"${ytDlpBinaryPath}" --update-to nightly`, { stdio: 'inherit' });
    }
  } catch (error) {
    console.error('Erro ao atualizar yt-dlp:', error.message);
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

async function downloadViaYtDlp(url, format) {
  await ensureYtDlpStandalone();
  const timestamp = Date.now();
  const baseFilename = `media_${timestamp}`;

  if (format === 'audio') {
    const outPath = path.join(TEMP_DIR, `${baseFilename}.%(ext)s`);
    console.log(`[yt-dlp Fallback] Baixando áudio de ${url}...`);

    const ytDlpAudioOptions = {
      extractAudio: true,
      audioFormat: 'm4a',
      output: outPath,
      ffmpegLocation: ffmpegPath,
      noCheckCertificates: true,
      noWarnings: true,
    };
    if (fs.existsSync(cookiesPath)) {
      ytDlpAudioOptions.cookies = cookiesPath;
    } else {
      ytDlpAudioOptions.extractorArgs = 'youtube:player_client=default,-android_sdkless';
    }

    await Promise.race([
      ytDlpExec(url, ytDlpAudioOptions),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout de download yt-dlp')), 180000))
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
      return { success: true, filepath, mimeType: 'audio/mp4', filename: `${baseFilename}.m4a`, sendAsDocument: true };
    } else {
      const externalUrl = await uploadToCatbox(filepath, `${baseFilename}.m4a`);
      fs.unlinkSync(filepath);
      return { success: true, externalUrl, filename: `${baseFilename}.m4a` };
    }
  } else {
    const outPath = path.join(TEMP_DIR, `${baseFilename}_720.%(ext)s`);
    console.log(`[yt-dlp Fallback] Baixando vídeo de ${url}...`);

    const ytDlpOptions = {
      format: 'bestvideo[height<=720][vcodec^=avc][ext=mp4]+bestaudio[ext=m4a]/best[height<=720][ext=mp4]/best',
      output: outPath,
      ffmpegLocation: ffmpegPath,
      mergeOutputFormat: 'mp4',
      embedMetadata: true,
      postprocessorArgs: 'ffmpeg:-movflags +faststart',
      noCheckCertificates: true,
      noWarnings: true,
    };
    if (fs.existsSync(cookiesPath)) {
      ytDlpOptions.cookies = cookiesPath;
    } else {
      ytDlpOptions.extractorArgs = 'youtube:player_client=default,-android_sdkless';
    }

    await Promise.race([
      ytDlpExec(url, ytDlpOptions),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout de download yt-dlp')), 180000))
    ]);

    const files = fs.readdirSync(TEMP_DIR);
    const file = files.find(f => f.startsWith(`${baseFilename}_720`));
    if (!file) throw new Error('Arquivo de vídeo não encontrado após download.');
    const filepath = path.join(TEMP_DIR, file);

    const stats = fs.statSync(filepath);
    const fileSizeInMB = stats.size / (1024 * 1024);

    if (fileSizeInMB <= 15.5) {
      return { success: true, filepath, mimeType: 'video/mp4', filename: file, sendAsDocument: false };
    } else if (fileSizeInMB <= 95) {
      return { success: true, filepath, mimeType: 'video/mp4', filename: file, sendAsDocument: true };
    } else {
      const externalUrl = await uploadToCatbox(filepath, file);
      fs.unlinkSync(filepath);
      return { success: true, externalUrl, filename: file };
    }
  }
}

// -------------------------------------------------------------
// Função Principal Exportada: Cobalt (primário) -> yt-dlp (fallback)
// -------------------------------------------------------------
export async function downloadMedia(url, format) {
  cleanOldTempFiles();

  // 1. Tenta baixar via Cobalt API (extremamente rápido e resolve bloqueios de IP/429)
  try {
    console.log(`[Downloader] Iniciando download via serviço externo (Cobalt) para: ${url} (formato: ${format || 'vídeo'})...`);
    const cobaltResult = await downloadViaCobalt(url, format);
    if (cobaltResult && cobaltResult.success) {
      return cobaltResult;
    }
  } catch (cobaltError) {
    console.warn(`[Downloader] Downloader externo encontrou erro: ${cobaltError.message}. Tentando fallback local com yt-dlp...`);
  }

  // 2. Fallback com yt-dlp local
  try {
    return await downloadViaYtDlp(url, format);
  } catch (ytDlpError) {
    console.error('[Downloader] Todos os métodos de download falharam:', ytDlpError);
    return { success: false, error: ytDlpError.message };
  }
}
