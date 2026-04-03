const ffmpeg = require('fluent-ffmpeg');
const fs = require('fs');
const path = require('path');
const { Readable } = require('stream');
const logger = require('../utils/logger');

/**
 * Voice transcription via OpenAI Whisper (better multilingual accuracy than Google STT for Pidgin/Hausa/Yoruba/Igbo).
 * Uses AI_API_KEY and optional AI_BASE_URL (same as aiAssistant).
 */
class TranscriptionService {
  constructor() {
    this.apiKey = process.env.AI_API_KEY || process.env.OPENAI_API_KEY;
    this.baseUrl = (process.env.AI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '');
    this.model = process.env.WHISPER_MODEL || 'whisper-1';

    this.supportedFormats = ['audio/mpeg', 'audio/ogg', 'audio/wav', 'audio/m4a', 'audio/mp4', 'audio/aac'];

    if (!this.apiKey) {
      logger.warn('Transcription: AI_API_KEY not set — voice notes will fail until configured');
    } else {
      logger.info('Transcription service initialized (OpenAI Whisper)', {
        model: this.model,
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

  async transcribeAudio(audioStream, mimeType = 'audio/mpeg') {
    let tempFilePath = null;
    let alternatePath = null;

    try {
      if (!this.apiKey) {
        throw new Error('AI_API_KEY is not set for Whisper transcription');
      }

      const stream = Buffer.isBuffer(audioStream) ? Readable.from(audioStream) : audioStream;
      tempFilePath = await this.saveStreamToFile(stream, mimeType);

      let fileForWhisper = tempFilePath;
      const ext = path.extname(tempFilePath).toLowerCase();
      // Some providers are picky about opus-in-ogg; normalize to WAV for reliability.
      if (ext === '.ogg' || ext === '.opus') {
        try {
          alternatePath = await this.convertToWav(tempFilePath);
          fileForWhisper = alternatePath;
        } catch (convErr) {
          logger.warn('OGG→WAV conversion failed, trying original file with Whisper', {
            error: convErr.message
          });
        }
      }

      const text = await this.transcribeWithWhisper(fileForWhisper);

      this.cleanupFiles([tempFilePath, alternatePath]);

      return text;
    } catch (error) {
      logger.error('Audio transcription failed', { error: error.message, mimeType });
      this.cleanupFiles([tempFilePath, alternatePath]);
      throw new Error('Could not transcribe audio message');
    }
  }

  async transcribeWithWhisper(filePath) {
    const OpenAI = require('openai');
    const client = new OpenAI({
      apiKey: this.apiKey,
      baseURL: this.baseUrl
    });

    const readStream = fs.createReadStream(filePath);
    const prompt =
      'Nigerian banking and mobile money: balance, transfer, airtime, data, naira, PIN, ' +
      'MTN Airtel Glo 9mobile, GTBank UBA Opay. ' +
      'Languages may include English, Nigerian Pidgin, Hausa, Yoruba, or Igbo.';

    const response = await client.audio.transcriptions.create({
      file: readStream,
      model: this.model,
      prompt
    });

    const transcription = (response && typeof response.text === 'string' ? response.text : '')
      .trim();

    logger.info('Audio transcription completed (Whisper)', {
      transcriptionLength: transcription.length,
      audioFile: path.basename(filePath),
      model: this.model
    });

    return transcription;
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
        .audioBitrate('16k')
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
