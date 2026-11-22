import { GoogleGenAI, ThinkingLevel } from '@google/genai';

let cachedClient: GoogleGenAI | null = null;
let cachedApiKey = '';

function getGeminiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY?.trim() ?? '';
  if (!apiKey) return null;
  if (!cachedClient || cachedApiKey !== apiKey) {
    cachedApiKey = apiKey;
    cachedClient = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  }
  return cachedClient;
}

export interface VoiceTranscriptionResult {
  transcript: string;
  summary: string | null;
}

export async function downloadTelegramVoiceBuffer(
  botToken: string,
  filePath: string,
  maxBytes = 20 * 1024 * 1024
): Promise<Buffer> {
  if (!filePath || filePath.includes('..') || filePath.startsWith('/')) {
    throw new Error('Ruta de archivo de Telegram inválida.');
  }
  const url = `https://api.telegram.org/file/bot${encodeURIComponent(botToken)}/${filePath}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 25_000);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) {
      throw new Error(`No se pudo descargar la nota de voz (HTTP ${res.status}).`);
    }
    const contentLength = Number(res.headers.get('content-length') ?? '0');
    if (contentLength > maxBytes) {
      throw new Error('La nota de voz excede el tamaño máximo permitido (20 MB).');
    }
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.byteLength === 0 || buf.byteLength > maxBytes) {
      throw new Error('Tamaño de nota de voz inválido o superior a 20 MB.');
    }
    return buf;
  } finally {
    clearTimeout(timer);
  }
}

export async function transcribeTelegramVoice(
  audioBuffer: Buffer,
  mimeType: string,
  durationSec: number,
  summaryThresholdSec: number
): Promise<VoiceTranscriptionResult | null> {
  const ai = getGeminiClient();
  if (!ai) {
    throw new Error('GEMINI_API_KEY no está configurada en el servidor.');
  }

  const safeMime = mimeType && mimeType.startsWith('audio/') ? mimeType : 'audio/ogg';
  const audioPart = {
    inlineData: {
      mimeType: safeMime,
      data: audioBuffer.toString('base64'),
    },
  };

  const transcriptionResponse = await ai.models.generateContent({
    model: 'gemini-3.5-transcribe',
    contents: {
      parts: [
        audioPart,
        {
          text: 'Transcribe literalmente esta nota de voz en su idioma original con puntuación natural y clara. Devuelve únicamente el texto transcrito, sin encabezados ni comentarios adicionales.',
        },
      ],
    },
  });

  const transcript = (transcriptionResponse.text ?? '').trim();
  if (!transcript) {
    return null;
  }

  let summary: string | null = null;
  if (durationSec >= summaryThresholdSec || transcript.length >= 280) {
    try {
      const summaryResponse = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: `Resume en español en 1 o 2 frases muy concisas la idea principal de esta nota de voz transcrita:\n\n${transcript}`,
        config: {
          systemInstruction:
            'Eres un asistente de lectura rápida para un grupo privado de Telegram. Devuelve únicamente un resumen fiel de 1 o 2 frases en español, sin viñetas ni prefijos.',
          thinkingConfig: {
            thinkingLevel: ThinkingLevel.LOW,
          },
        },
      });
      const candidate = (summaryResponse.text ?? '').trim();
      if (candidate) {
        summary = candidate;
      }
    } catch {
      // Si falla el resumen breve, conservamos igualmente la transcripción literal.
      summary = null;
    }
  }

  return { transcript, summary };
}
