
import { google } from 'googleapis';
import Fuse from 'fuse.js';

const GOOGLE_SERVICE_ACCOUNT_JSON = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
const GOOGLE_DRIVE_ROOT_FOLDER_ID = process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID;

let jwtClient;
let drive;

function initGoogleDrive() {
  if (!GOOGLE_SERVICE_ACCOUNT_JSON || !GOOGLE_DRIVE_ROOT_FOLDER_ID) {
    console.error('Google Drive environment variables not set.');
    return;
  }

  const credentials = JSON.parse(GOOGLE_SERVICE_ACCOUNT_JSON);

  jwtClient = new google.auth.JWT(
    credentials.client_email,
    null,
    credentials.private_key,
    ['https://www.googleapis.com/auth/drive.readonly'],
  );

  drive = google.drive({
    version: 'v3',
    auth: jwtClient,
  });
}

export async function searchDrive(song_name, file_type, voice_part) {
  if (!drive) {
    initGoogleDrive();
    if (!drive) {
      return { found: false, error_message: 'Google Drive service not initialized.' };
    }
  }

  try {
    // List all song folders in root
    const foldersRes = await drive.files.list({
      q: `'${GOOGLE_DRIVE_ROOT_FOLDER_ID}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
      fields: 'files(id, name)',
    });
    const folders = foldersRes.data.files || [];

    // Fuzzy match folders against song_name
    const fuse = new Fuse(folders, { keys: ['name'], threshold: 0.35, ignoreLocation: true, includeScore: true });
    const fuzzyResults = fuse.search(song_name);

    if (fuzzyResults.length === 0 || fuzzyResults[0].score > 0.65) { // Ajuste o threshold de score conforme necessário
      return { found: false, error_message: `Não encontrei '${song_name}' no Drive.`, candidates: fuzzyResults.map(r => `${r.item.name} (score: ${r.score.toFixed(2)})`) };
    }

    const bestFolder = fuzzyResults[0].item;
    const song_folder = bestFolder.name;

    // List files in matched folder
    const filesRes = await drive.files.list({
      q: `'${bestFolder.id}' in parents and trashed = false`,
      fields: 'files(id, name, mimeType, webContentLink)',
    });
    let files = filesRes.data.files || [];

    // Filter by file type
    files = files.filter(file => {
      if (file_type === 'txt') return file.mimeType === 'text/plain' || file.name.endsWith('.txt');
      if (file_type === 'pdf') return file.mimeType === 'application/pdf' || file.name.endsWith('.pdf');
      if (file_type === 'audio') return file.mimeType?.startsWith('audio/') || file.name.match(/\.(mp3|wav|m4a)$/i);
      return false;
    });

    // Filter by voice part (if audio and voice_part present)
    if (file_type === 'audio' && voice_part) {
      const filteredByVoice = files.filter(file => file.name.toLowerCase().includes(voice_part.toLowerCase()));
      if (filteredByVoice.length > 0) {
        files = filteredByVoice;
      } else {
        return { found: false, error_message: `Voz '${voice_part}' não encontrada para '${song_name}'. Vozes disponíveis: ${[...new Set(files.map(f => f.name.match(/-(soprano|contralto|tenor|baixo|baritono)\./i)?.[1].toLowerCase()).filter(Boolean))].join(', ')}.`, song_folder };
      }
    }

    if (files.length === 0) {
      return { found: false, error_message: `Nenhum arquivo do tipo '${file_type}' encontrado para '${song_name}'.`, song_folder };
    }

    // Select best file (simplificado: pega o primeiro)
    const bestFile = files[0];
    const download_url = `https://drive.google.com/uc?export=download&id=${bestFile.id}`;

    return {
      found: true,
      file_id: bestFile.id,
      file_name: bestFile.name,
      mime_type: bestFile.mimeType,
      download_url,
      song_folder,
      score: (1 - fuzzyResults[0].score) // Converter Fuse score para 0-1 (1 = perfeito)
    };

  } catch (error) {
    console.error('Google Drive API error:', error);
    return { found: false, error_message: 'Erro ao buscar no Google Drive.' };
  }
}
