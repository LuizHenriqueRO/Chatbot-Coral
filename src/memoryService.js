import { createClient } from 'redis';

const REDIS_URL = process.env.REDIS_URL;
let redisClient = null;

// Fallback memory configuration
const fallbackMemory = new Map();
const EXPIRATION_TIME_MS = 2 * 60 * 60 * 1000; // 2 horas em milissegundos
const EXPIRATION_TIME_SECONDS = 2 * 60 * 60; // 2 horas em segundos
const MAX_HISTORY_LENGTH = 12; // Mantém as últimas 12 interações

if (REDIS_URL) {
  redisClient = createClient({ url: REDIS_URL });
  
  redisClient.on('error', (err) => console.error('Redis Client Error:', err));
  
  redisClient.connect().then(() => {
    console.log('Connected to Redis for Memory Service');
  }).catch(err => {
    console.error('Failed to connect to Redis, falling back to in-memory map:', err);
    redisClient = null; // Usa o fallback se falhar
  });
} else {
  console.log('REDIS_URL not found. Using in-memory fallback for Session Memory.');
}

/**
 * Recupera o histórico do usuário no Redis ou na Memória Local
 * @param {string} wa_id 
 * @returns {Promise<Array>}
 */
export async function getHistory(wa_id) {
  const key = `history:${wa_id}`;
  
  if (redisClient && redisClient.isOpen) {
    try {
      const data = await redisClient.get(key);
      if (data) {
        return JSON.parse(data);
      }
      return [];
    } catch (e) {
      console.error('Error fetching from Redis, returning empty history:', e);
      return [];
    }
  } else {
    // Fallback: Memória RAM
    const session = fallbackMemory.get(key);
    if (!session) return [];
    
    // Checa expiração do Fallback (2 horas)
    if (Date.now() - session.timestamp > EXPIRATION_TIME_MS) {
      fallbackMemory.delete(key);
      return [];
    }
    return session.history;
  }
}

/**
 * Adiciona uma mensagem ao histórico limitando a quantidade máxima
 * @param {string} wa_id 
 * @param {string} role 'user' | 'assistant'
 * @param {string} content 
 */
export async function addMessageToHistory(wa_id, role, content) {
  if (!content) return;
  const key = `history:${wa_id}`;
  const newMessage = { role, content };
  
  let currentHistory = await getHistory(wa_id);
  currentHistory.push(newMessage);
  
  // Limita o tamanho do array de histórico
  if (currentHistory.length > MAX_HISTORY_LENGTH) {
    currentHistory = currentHistory.slice(currentHistory.length - MAX_HISTORY_LENGTH);
  }
  
  if (redisClient && redisClient.isOpen) {
    try {
      await redisClient.set(key, JSON.stringify(currentHistory), {
        EX: EXPIRATION_TIME_SECONDS
      });
    } catch (e) {
      console.error('Error saving history to Redis:', e);
    }
  } else {
    // Fallback: Memória RAM
    fallbackMemory.set(key, {
      history: currentHistory,
      timestamp: Date.now()
    });
  }
}
