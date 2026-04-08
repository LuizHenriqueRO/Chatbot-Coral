
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const Fuse = require('fuse.js'); // Para busca difusa

export function parseIntent(message) {
  const raw_message = message;
  const normalized_message = message.toLowerCase().replace(/\s+/g, ' ').normalize("NFD").replace(/\p{Diacritic}/gu, "");

  let file_type = null;
  let voice_part = null;
  let song_name = normalized_message;

  // Classify file type
  const audioKeywords = ['pista', 'trilha', 'audio', 'voz', 'mp3', 'track'];
  const pdfKeywords = ['partitura', 'particao', 'partition', 'sheet'];
  const txtKeywords = ['letra', 'letras', 'lyric', 'lyrics', 'texto'];

  if (audioKeywords.some(keyword => normalized_message.includes(keyword))) {
    file_type = 'audio';
  } else if (pdfKeywords.some(keyword => normalized_message.includes(keyword))) {
    file_type = 'pdf';
  } else if (txtKeywords.some(keyword => normalized_message.includes(keyword))) {
    file_type = 'txt';
  } else if (['soprano', 'contralto', 'tenor', 'baixo', 'baritono', 'tiple'].some(keyword => normalized_message.includes(keyword))) {
    // Fallback: if voice part detected -> audio
    file_type = 'audio';
  } else {
    // Fallback: else -> txt
    file_type = 'txt';
  }

  // Classify voice part (if file_type is audio)
  if (file_type === 'audio') {
    const sopranoKeywords = ['soprano', 'sop', 'tiple'];
    const contraltoKeywords = ['contralto', 'contra', 'alto'];
    const tenorKeywords = ['tenor', 'ten'];
    const baixoKeywords = ['baixo', 'bass', 'basso'];
    const baritonoKeywords = ['baritono', 'baritono', 'bari'];

    if (sopranoKeywords.some(keyword => normalized_message.includes(keyword))) {
      voice_part = 'soprano';
    } else if (contraltoKeywords.some(keyword => normalized_message.includes(keyword))) {
      voice_part = 'contralto';
    } else if (tenorKeywords.some(keyword => normalized_message.includes(keyword))) {
      voice_part = 'tenor';
    } else if (baixoKeywords.some(keyword => normalized_message.includes(keyword))) {
      voice_part = 'baixo';
    } else if (baritonoKeywords.some(keyword => normalized_message.includes(keyword))) {
      voice_part = 'baritono';
    }
  }

  // Extract song name
  const allKeywords = [...audioKeywords, ...pdfKeywords, ...txtKeywords, 'da', 'de', 'do', 'a', 'o', 'me', 'manda', 'quero', 'musica', 'musica', 'pra', 'pro', 'para', 'para', 'voz', 'partitura', 'particao', 'partição', 'partition', 'sheet', 'letra', 'letras', 'lyric', 'lyrics', 'texto', 'pista', 'trilha', 'audio', 'mp3', 'track', 'soprano', 'sop', 'tiple', 'contralto', 'contra', 'alto', 'tenor', 'ten', 'baixo', 'bass', 'basso', 'baritono', 'barítono', 'bari'];
  song_name = normalized_message;
  for (const keyword of allKeywords) {
    song_name = song_name.replace(new RegExp(`\\b${keyword}\\b`, 'g'), '');
  }
  song_name = song_name.replace(/\s+/g, ' ').trim();
  song_name = song_name.split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');

  // Calculate confidence score (simplificado por enquanto)
  let confidence = 0.5;
  if (file_type) confidence += 0.4; // Se encontrou tipo de arquivo
  if (song_name.split(' ').length >= 2) confidence += 0.2; // Se nome da música tem 2 ou mais palavras
  if (song_name.length >= 4) confidence += 0.15; // Se nome da música tem 4 ou mais caracteres
  if (file_type === 'audio' && voice_part) confidence += 0.2; // Se é áudio e encontrou voz
  confidence = Math.min(confidence, 1.0);

  const ambiguous = confidence < 0.5;
  const alternatives = []; // Por enquanto não implementaremos alternativas complexas

  return {
    song_name: song_name || null,
    file_type,
    voice_part,
    confidence,
    ambiguous,
    raw_message,
    alternatives
  };
}
