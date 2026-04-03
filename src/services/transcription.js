const ffmpeg = require('fluent-ffmpeg');
const fs = require('fs');
const path = require('path');
const { Readable } = require('stream');
const logger = require('../utils/logger');

/**
 * Voice transcription via the OpenAI API only — Whisper model (`whisper-1`).
 * Google Cloud Speech-to-Text is not used anywhere in this codebase.
 *
 * Env: AI_API_KEY (or OPENAI_API_KEY), optional AI_BASE_URL.
 * Optional: WHISPER_MODEL (default whisper-1). WHISPER_FALLBACK_MODEL — second OpenAI STT model id only if you set it (e.g. another OpenAI transcribe model); leave unset for Whisper-only.
 */
class TranscriptionService {
  constructor() {
    this.apiKey = process.env.AI_API_KEY || process.env.OPENAI_API_KEY;
    this.baseUrl = (process.env.AI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '');
    this.model = (process.env.WHISPER_MODEL || 'whisper-1').trim();
    this.fallbackModel = (process.env.WHISPER_FALLBACK_MODEL || '').trim();
    /** Normalize compressed audio to 16k mono WAV before STT (often helps OGG/Opus from WhatsApp). */
    this.alwaysNormalizeWav =
      String(process.env.WHISPER_ALWAYS_WAV || 'true').toLowerCase() === 'true';

    this.supportedFormats = ['audio/mpeg', 'audio/ogg', 'audio/wav', 'audio/m4a', 'audio/mp4', 'audio/aac'];

    if (!this.apiKey) {
      logger.warn('Transcription: AI_API_KEY not set — voice notes will fail until configured');
    } else {
      logger.info('Transcription: OpenAI Whisper API only (no Google STT)', {
        model: this.model,
        fallbackModel: this.fallbackModel || '(none)',
        alwaysNormalizeWav: this.alwaysNormalizeWav,
        hasBaseUrlOverride: !!process.env.AI_BASE_URL
      });
    }
  }

  normalizeMimeType(mimeType) {
    if (!mimeType || typeof mimeType !== 'string') {
      return '';
    }
    return mimeType.split(';')[0].trim().toLowerCase();
  }

  /**
   * @returns {{ text: string, language?: string|null }}
   */
  async transcribeAudio(audioStream, mimeType = 'audio/mpeg') {
    let tempFilePath = null;
    let alternatePath = null;

    try {
      if (!this.apiKey) {
        throw new Error('AI_API_KEY is not set for transcription');
      }

      const stream = Buffer.isBuffer(audioStream) ? Readable.from(audioStream) : audioStream;
      tempFilePath = await this.saveStreamToFile(stream, mimeType);

      let fileForWhisper = tempFilePath;
      const ext = path.extname(tempFilePath).toLowerCase();

      const shouldWav =
        this.alwaysNormalizeWav ||
        ext === '.ogg' ||
        ext === '.opus' ||
        ext === '.m4a' ||
        ext === '.aac' ||
        ext === '.mp3' ||
        ext === '.mp4';

      if (shouldWav) {
        try {
          alternatePath = await this.convertToWav(tempFilePath);
          fileForWhisper = alternatePath;
        } catch (convErr) {
          logger.warn('Audio→WAV normalization failed, using original file', {
            error: convErr.message,
            ext
          });
        }
      }

      const result = await this.transcribeViaOpenAI(fileForWhisper);

      this.cleanupFiles([tempFilePath, alternatePath]);

      return result;
    } catch (error) {
      logger.error('Audio transcription failed', { error: error.message, mimeType });
      this.cleanupFiles([tempFilePath, alternatePath]);
      throw new Error('Could not transcribe audio message');
    }
  }

  buildLanguagePrompt() {
    return (
      'This is Nigerian WhatsApp banking. Transcribe faithfully in the language spoken. ' +
      'Primary languages: English, Nigerian Pidgin, Hausa, Yoruba, Igbo. Do not translate to English. ' +
      'Common terms: balance, kudi, naira, ₦, transfer, tura, aika, airtime, data, PIN, MTN, Airtel, Glo, 9mobile, ' +
      'GTBank, UBA, Opay, BVN, beneficiary. ' +
      'Hausa examples: nawa ne balance dina, don Allah nuna min, ina kwana, sannu, yaya kake, aika kudi. ' +
      'Yoruba examples: bawo ni, jowo, owo mi, se e le ran mi lowo. ' +
      'Igbo examples: biko, ego, kedu, gosi m balance.'
    );
  }

  async transcribeViaOpenAI(filePath) {
    const OpenAI = require('openai');
    const client = new OpenAI({
      apiKey: this.apiKey,
      baseURL: this.baseUrl
    });

    const prompt = this.buildLanguagePrompt();
    const tryModel = async (modelId) => {
      const readStream = fs.createReadStream(filePath);
      const useJsonOnly =
        typeof modelId === 'string' && /^gpt-4o.*transcribe/i.test(modelId);

      const params = {
        file: readStream,
        model: modelId,
        prompt
      };

      if (useJsonOnly) {
        params.response_format = 'json';
      }

      const response = await client.audio.transcriptions.create(params);

      let text = '';
      let language = null;

      if (response && typeof response.text === 'string') {
        text = response.text.trim();
      }
      if (response && typeof response.language === 'string') {
        language = response.language;
      }

      return { text, language };
    };

    try {
      const out = await tryModel(this.model);
      logger.info('Transcription completed', {
        model: this.model,
        transcriptionLength: out.text.length,
        detectedLanguage: out.language,
        audioFile: path.basename(filePath)
      });
      return out;
    } catch (primaryErr) {
      if (this.fallbackModel && this.fallbackModel !== this.model) {
        const msg = primaryErr?.message || String(primaryErr);
        logger.warn('Primary OpenAI transcription failed, trying WHISPER_FALLBACK_MODEL', {
          primary: this.model,
          fallback: this.fallbackModel,
          error: msg
        });
        const out = await tryModel(this.fallbackModel);
        logger.info('Transcription completed (fallback OpenAI model)', {
          model: this.fallbackModel,
          transcriptionLength: out.text.length,
          detectedLanguage: out.language
        });
        return out;
      }
      throw primaryErr;
    }
  }

  async saveStreamToFile(stream, mimeType) {
    const tempDir = path.join(__dirname, '../../uploads/temp');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    const extension = this.getFileExtension(mimeType);
    const tempFilePath = path.join(tempDir, `audio_${Date.now()}.${extension}`);
    const writeStream = fs.createWriteStream(tempFilePath);

    return new Promise((resolve, reject) => {
      stream.pipe(writeStream);
      writeStream.on('finish', () => resolve(tempFilePath));
      writeStream.on('error', reject);
    });
  }

  getFileExtension(mimeType) {
    const normalizedMimeType = this.normalizeMimeType(mimeType);
    const extensionMap = {
      'audio/mpeg': 'mp3',
      'audio/ogg': 'ogg',
      'audio/wav': 'wav',
      'audio/m4a': 'm4a',
      'audio/mp4': 'm4a',
      'audio/aac': 'aac'
    };

    return extensionMap[normalizedMimeType] || 'mp3';
  }

  async convertToWav(inputPath) {
    const outputPath = inputPath.replace(/\.[^/.]+$/, '.wav');

    return new Promise((resolve, reject) => {
      ffmpeg(inputPath)
        .toFormat('wav')
        .audioChannels(1)
        .audioFrequency(16000)
        .audioCodec('pcm_s16le')
        .on('end', () => resolve(outputPath))
        .on('error', (error) => reject(error))
        .save(outputPath);
    });
  }

  cleanupFiles(filePaths) {
    filePaths.forEach((filePath) => {
      if (filePath && fs.existsSync(filePath)) {
        try {
          fs.unlinkSync(filePath);
        } catch (error) {
          logger.warn('Failed to cleanup temp file', { filePath, error: error.message });
        }
      }
    });
  }

  isSupportedFormat(mimeType) {
    const normalizedMimeType = this.normalizeMimeType(mimeType);
    return this.supportedFormats.includes(normalizedMimeType);
  }

  async getAudioDuration(audioFilePath) {
    return new Promise((resolve, reject) => {
      ffmpeg.ffprobe(audioFilePath, (err, metadata) => {
        if (err) {
          reject(err);
        } else {
          resolve(metadata.format.duration);
        }
      });
    });
  }

  async validateAudio(audioFilePath, maxDurationSeconds = 60, maxSizeBytes = 10 * 1024 * 1024) {
    try {
      const stats = fs.statSync(audioFilePath);
      if (stats.size > maxSizeBytes) {
        throw new Error(
          `Audio file too large: ${Math.round(stats.size / 1024 / 1024)}MB (max: ${Math.round(maxSizeBytes / 1024 / 1024)}MB)`
        );
      }

      const duration = await this.getAudioDuration(audioFilePath);
      if (duration > maxDurationSeconds) {
        throw new Error(`Audio too long: ${Math.round(duration)}s (max: ${maxDurationSeconds}s)`);
      }

      return { valid: true, duration, size: stats.size };
    } catch (error) {
      logger.warn('Audio validation failed', { error: error.message, audioFilePath });
      throw error;
    }
  }
}

module.exports = new TranscriptionService();
