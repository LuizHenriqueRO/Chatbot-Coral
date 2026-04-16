
import { google } from 'googleapis';
import Fuse from 'fuse.js';

const GOOGLE_SERVICE_ACCOUNT_JSON = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
const GOOGLE_DRIVE_CORAL_FOLDER_ID = process.env.GOOGLE_DRIVE_CORAL_FOLDER_ID || process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID;
const GOOGLE_DRIVE_HINARIO_FOLDER_ID = process.env.GOOGLE_DRIVE_HINARIO_FOLDER_ID;
const GOOGLE_DRIVE_EGW_FOLDER_ID = process.env.GOOGLE_DRIVE_EGW_FOLDER_ID;

let jwtClient;
let drive;

function initGoogleDrive() {
  if (!GOOGLE_SERVICE_ACCOUNT_JSON || (!GOOGLE_DRIVE_CORAL_FOLDER_ID && !GOOGLE_DRIVE_HINARIO_FOLDER_ID && !GOOGLE_DRIVE_EGW_FOLDER_ID)) {
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

export async function searchDrive(song_name, file_type, voice_part, category = 'coral') {
  if (!drive) {
    initGoogleDrive();
    if (!drive) {
      return { found: false, error_message: 'Google Drive service not initialized.' };
    }
  }

  try {
    if (category === 'coral') {
      // List all song folders in root
      const foldersRes = await drive.files.list({
        q: `'${GOOGLE_DRIVE_CORAL_FOLDER_ID}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
        fields: 'files(id, name)',
      });
      const folders = foldersRes.data.files || [];

      // Fuzzy match folders against song_name
      const fuse = new Fuse(folders, { keys: ['name'], threshold: 0.40, ignoreLocation: true, includeScore: true });
      const fuzzyResults = fuse.search(song_name);

      if (fuzzyResults.length === 0 || fuzzyResults[0].score > 0.65) { 
        return { found: false, error_message: `Não encontrei a pasta sonora para '${song_name}' no Coral.`, candidates: fuzzyResults.map(r => `${r.item.name}`) };
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
        if (file_type === 'audio') return file.mimeType?.startsWith('audio/') || file.name.match(/\.(mp3|wav|m4a|ogg|aac|flac|wma|opus)$/i);
        return false;
      });

      // Filter by voice part (if audio and voice_part present)
      if (file_type === 'audio' && voice_part) {
        const filteredByVoice = files.filter(file => file.name.toLowerCase().includes(voice_part.toLowerCase()));
        if (filteredByVoice.length > 0) {
          files = filteredByVoice;
        } else {
          return { found: false, error_message: `Voz '${voice_part}' não encontrada para '${song_name}'.`, song_folder };
        }
      }

      if (files.length === 0) {
        return { found: false, error_message: `Nenhum arquivo do tipo '${file_type}' encontrado na pasta de '${song_name}'.`, song_folder };
      }

      const bestFile = files[0];
      return {
        found: true,
        file_id: bestFile.id,
        file_name: bestFile.name,
        mime_type: bestFile.mimeType,
        song_folder,
        score: (1 - fuzzyResults[0].score)
      };

    } else {
      // Logic for EGW and HINARIO: Direct files inside root without song subfolders
      let rootId = category === 'hinario' ? GOOGLE_DRIVE_HINARIO_FOLDER_ID : GOOGLE_DRIVE_EGW_FOLDER_ID;
      if (!rootId) {
        return { found: false, error_message: `A pasta raiz para a categoria '${category}' não foi configurada nas variáveis.` };
      }

      const filesRes = await drive.files.list({
        q: `'${rootId}' in parents and trashed = false and mimeType != 'application/vnd.google-apps.folder'`,
        fields: 'files(id, name, mimeType, webContentLink)',
      });
      let files = filesRes.data.files || [];

      // Accept only specific formats depending on the AI determination if provided
      files = files.filter(file => {
        if (file_type === 'txt') return file.mimeType === 'text/plain' || file.name.endsWith('.txt');
        if (file_type === 'pdf') return file.mimeType === 'application/pdf' || file.name.endsWith('.pdf');
        if (file_type === 'audio') return file.mimeType?.startsWith('audio/') || file.name.match(/\.(mp3|wav|m4a|ogg|aac|flac|wma|opus)$/i);
        return true; 
      });

      const fuse = new Fuse(files, { keys: ['name'], threshold: 0.40, ignoreLocation: true, includeScore: true });
      const fuzzyResults = fuse.search(song_name);

      if (fuzzyResults.length === 0 || fuzzyResults[0].score > 0.65) {
        return { found: false, error_message: `Não encontrei '${song_name}' no diretório do ${category}.`, candidates: fuzzyResults.map(r => `${r.item.name}`) };
      }

      const bestFile = fuzzyResults[0].item;
      return {
        found: true,
        file_id: bestFile.id,
        file_name: bestFile.name,
        mime_type: bestFile.mimeType,
        song_folder: category,
        score: (1 - fuzzyResults[0].score)
      };
    }

  } catch (error) {
    console.error('Google Drive API error:', error);
    return { found: false, error_message: 'Erro ao buscar no Google Drive.' };
  }
}

export async function downloadFileBuffer(fileId) {
  if (!drive) {
    initGoogleDrive();
    if (!drive) {
      throw new Error('Google Drive service not initialized.');
    }
  }

  const response = await drive.files.get(
    { fileId: fileId, alt: 'media' },
    { responseType: 'arraybuffer' }
  );

  // Return the ArrayBuffer natively given by axios/googleapis
  return response.data;
}

