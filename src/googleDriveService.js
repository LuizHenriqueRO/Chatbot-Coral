import { google } from 'googleapis';
import Fuse from 'fuse.js';
import OpenAI from 'openai';

const GOOGLE_SERVICE_ACCOUNT_JSON = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
const GOOGLE_DRIVE_CORAL_FOLDER_ID = process.env.GOOGLE_DRIVE_CORAL_FOLDER_ID || process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID;
const GOOGLE_DRIVE_LOUVOR_FOLDER_ID = process.env.GOOGLE_DRIVE_LOUVOR;
const GOOGLE_DRIVE_HINARIO_FOLDER_ID = process.env.GOOGLE_DRIVE_HINARIO_FOLDER_ID;
const GOOGLE_DRIVE_EGW_FOLDER_ID = process.env.GOOGLE_DRIVE_EGW_FOLDER_ID;
const GOOGLE_DRIVE_LICAO_FOLDER_ID = process.env.GOOGLE_DRIVE_LICAO;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

let jwtClient;
let drive;
let openaiClient;

function initGoogleDrive() {
  if (!GOOGLE_SERVICE_ACCOUNT_JSON || (!GOOGLE_DRIVE_CORAL_FOLDER_ID && !GOOGLE_DRIVE_HINARIO_FOLDER_ID && !GOOGLE_DRIVE_EGW_FOLDER_ID && !GOOGLE_DRIVE_LICAO_FOLDER_ID && !GOOGLE_DRIVE_LOUVOR_FOLDER_ID)) {
    console.error('Google Drive environment variables not set.');
    return;
  }

  if (!openaiClient && OPENAI_API_KEY) {
    openaiClient = new OpenAI({ apiKey: OPENAI_API_KEY });
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
    if (category === 'coral' || category === 'licao') {
      let candidates = [];

      if (category === 'coral') {
        if (GOOGLE_DRIVE_CORAL_FOLDER_ID) {
          const foldersRes = await drive.files.list({
            q: `'${GOOGLE_DRIVE_CORAL_FOLDER_ID}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
            fields: 'files(id, name)',
            pageSize: 1000,
          });
          const folders = foldersRes.data.files || [];
          folders.forEach(f => candidates.push({ type: 'coral_folder', id: f.id, name: f.name }));
        }

        if (GOOGLE_DRIVE_LOUVOR_FOLDER_ID) {
          const filesRes = await drive.files.list({
            q: `'${GOOGLE_DRIVE_LOUVOR_FOLDER_ID}' in parents and mimeType != 'application/vnd.google-apps.folder' and trashed = false`,
            fields: 'files(id, name, mimeType, webContentLink)',
            pageSize: 1000,
          });
          let louvorFiles = filesRes.data.files || [];
          
          // Filter by file type
          louvorFiles = louvorFiles.filter(file => {
            if (file_type === 'txt') return file.mimeType === 'text/plain' || file.name.endsWith('.txt');
            if (file_type === 'pdf') return file.mimeType === 'application/pdf' || file.name.endsWith('.pdf');
            if (file_type === 'audio') return file.mimeType?.startsWith('audio/') || file.name.match(/\.(mp3|wav|m4a|ogg|aac|flac|wma|opus)$/i);
            return false;
          });

          // Filter by voice part (if audio and voice_part present)
          if (file_type === 'audio' && voice_part) {
            louvorFiles = louvorFiles.filter(file => file.name.toLowerCase().includes(voice_part.toLowerCase()));
          }

          louvorFiles.forEach(f => {
            const cleanName = f.name.replace(/\.[^/.]+$/, "");
            candidates.push({ type: 'louvor_file', item: f, name: cleanName });
          });
        }

        if (candidates.length === 0) {
           return { found: false, error_message: 'Nenhuma pasta/arquivo de coral/louvor encontrado ou configurado.' };
        }
      } else {
        const foldersRes = await drive.files.list({
          q: `'${GOOGLE_DRIVE_LICAO_FOLDER_ID}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
          fields: 'files(id, name)',
          pageSize: 1000,
        });
        const folders = foldersRes.data.files || [];
        folders.forEach(f => candidates.push({ type: 'licao_folder', id: f.id, name: f.name }));
      }

      // Fuzzy match folders/files against song_name
      const fuse = new Fuse(candidates, { keys: ['name'], threshold: 0.40, ignoreLocation: true, includeScore: true });
      const fuzzyResults = fuse.search(song_name);

      if (fuzzyResults.length === 0 || fuzzyResults[0].score > 0.65) { 
        let localName = category === 'coral' ? 'no Coral/Louvor' : 'na Lição da Escola Sabatina';
        return { found: false, error_message: `Não encontrei referências para '${song_name}' ${localName}.`, candidates: fuzzyResults.map(r => `${r.item.name}`) };
      }

      const bestMatch = fuzzyResults[0].item;

      if (bestMatch.type === 'louvor_file') {
        const bestFile = bestMatch.item;
        return {
          found: true,
          file_id: bestFile.id,
          file_name: bestFile.name,
          mime_type: bestFile.mimeType,
          song_folder: 'Louvor (Arquivo Direto)',
          score: (1 - fuzzyResults[0].score)
        };
      }

      const bestFolder = { id: bestMatch.id, name: bestMatch.name };
      const song_folder = bestFolder.name;

      // List files in matched folder
      const filesRes = await drive.files.list({
        q: `'${bestFolder.id}' in parents and trashed = false`,
        fields: 'files(id, name, mimeType, webContentLink)',
        pageSize: 1000,
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
      let rootId = category === 'hinario' ? GOOGLE_DRIVE_HINARIO_FOLDER_ID : GOOGLE_DRIVE_EGW_FOLDER_ID;
      if (!rootId) {
        return { found: false, error_message: `A pasta raiz para a categoria '${category}' não foi configurada nas variáveis.` };
      }

      const fileListRes = await drive.files.list({
        q: `'${rootId}' in parents and trashed = false and mimeType != 'application/vnd.google-apps.folder'`,
        fields: 'files(id, name, mimeType, webContentLink)',
        pageSize: 1000,
      });
      let rawFiles = fileListRes.data.files || [];

      if (rawFiles.length === 0) {
        return { found: false, error_message: `A pasta do ${category} está vazia ou o e-mail do Bot ainda não recebeu permissão de Leitor nela.` };
      }

      let files = rawFiles.filter(file => {
        if (category === 'hinario' && (file.mimeType === 'text/plain' || file.name.endsWith('.txt'))) return true;
        if (category === 'egw' && (file.mimeType === 'application/pdf' || file.name.endsWith('.pdf'))) return true;
        
        if (file_type === 'txt') return file.mimeType === 'text/plain' || file.name.endsWith('.txt');
        if (file_type === 'pdf') return file.mimeType === 'application/pdf' || file.name.endsWith('.pdf');
        if (file_type === 'audio') return file.mimeType?.startsWith('audio/') || file.name.match(/\.(mp3|wav|m4a|ogg|aac|flac|wma|opus)$/i);
        return true; 
      });

      if (files.length === 0) {
        files = rawFiles;
      }

      if (category === 'hinario') {
         let numToFind = null;
         if (!isNaN(song_name.trim())) {
             numToFind = parseInt(song_name.trim(), 10);
         } else {
             const prefixMatch = song_name.trim().match(/^0*(\d+)/);
             if (prefixMatch) {
               numToFind = parseInt(prefixMatch[1], 10);
             }
         }

         if (numToFind !== null) {
            const exactMatch = files.find(f => {
              const match = f.name.match(/^0*(\d+)/); 
              return match && parseInt(match[1], 10) === numToFind;
            });

            if (exactMatch) {
              return {
                found: true,
                file_id: exactMatch.id,
                file_name: exactMatch.name,
                mime_type: exactMatch.mimeType,
                song_folder: category,
                score: 1.0 
              };
            }
         }

         const strictFuse = new Fuse(files, { keys: ['name'], threshold: 0.35, ignoreLocation: true, ignoreFieldNorm: true });
         const strictResults = strictFuse.search(song_name);
         if (strictResults.length > 0) {
            const bestFile = strictResults[0].item;
            return {
               found: true,
               file_id: bestFile.id,
               file_name: bestFile.name,
               mime_type: bestFile.mimeType,
               song_folder: category,
               score: 1.0 
            };
         }

         if (openaiClient) {
           try {
             const promptContext = files.map(f => `${f.id}|${f.name}`).join('\n');
             const prompt = `Você é um indexador mestre do Hinário.
O usuário quer o arquivo para o hino: "${song_name}".
Abaixo está a lista completa de arquivos no formato ID|NOME.
Analise semanticamente qual NOME melhor corresponde ao pedido do usuário. Interprete sinônimos, pontuação ou formatações diferentes.
Sua regra suprema: Retorne APENAS e EXCLUSIVAMENTE a string do ID do arquivo correspondente. Se não houver correspondência ou a similaridade for baixa, retorne a exata palavra "null" (em minúsculo e sem aspas). Nunca retorne algo além do ID.

Arquivos na nuvem:
${promptContext}
`;
             const completion = await openaiClient.chat.completions.create({
               model: "gpt-4o-mini",
               messages: [{ role: "user", content: prompt }],
               temperature: 0.0,
             });

             const targetId = completion.choices[0].message.content.trim();
             if (targetId && targetId !== "null" && targetId !== null) {
                const bestFile = files.find(f => f.id === targetId);
                if (bestFile) {
                   return {
                     found: true,
                     file_id: bestFile.id,
                     file_name: bestFile.name,
                     mime_type: bestFile.mimeType,
                     song_folder: category,
                     score: 1.0
                   };
                }
             }
           } catch (error) {
             console.error("OpenAI Semantic Search error:", error);
           }
         }
         return { found: false, error_message: `Não encontrei referências seguras de '${song_name}' no diretório do hinario.`, candidates: [] };
      }

      const fuse = new Fuse(files, { 
         keys: ['name'], 
         threshold: 0.65, 
         ignoreLocation: true, 
         includeScore: true,
         ignoreFieldNorm: true 
      });
      const fuzzyResults = fuse.search(song_name);

      if (fuzzyResults.length === 0 || fuzzyResults[0].score > 0.65) {
        return { found: false, error_message: `Não encontrei '${song_name}' no diretório do ${category}. Verifique se o nome está exato.`, candidates: fuzzyResults.map(r => `${r.item.name}`) };
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
    console.error('Google Drive API/Busca error:', error);
    return { found: false, error_message: 'Erro ao buscar arquivos nas nuvens.' };
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

  return response.data;
}
