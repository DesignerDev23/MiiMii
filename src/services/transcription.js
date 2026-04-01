const speech = require('@google-cloud/speech');
const ffmpeg = require('fluent-ffmpeg');
const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');

class TranscriptionService {
  constructor() {
    const credentialsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
    if (!credentialsPath) {
      throw new Error('GOOGLE_APPLICATION_CREDENTIALS is not set for transcription');
    }
    if (!fs.existsSync(credentialsPath)) {
      throw new Error(`Google credentials file not found at configured path: ${credentialsPath}`);
    }

    let credentials;
    try {
      const rawCredentials = fs.readFileSync(credentialsPath, 'utf8');
      credentials = JSON.parse(rawCredentials);
    } catch (error) {
      throw new Error(`Google credentials file is not valid JSON: ${error.message}`);
    }

    if (!credentials.client_email || !credentials.private_key || !credentials.project_id) {
      throw new Error('Google credentials JSON is missing required fields (client_email/private_key/project_id)');
    }

    logger.info('Initializing transcription service', {
      credentialsPath,
      credentialsPathExists: true,
      googleProjectId: credentials.project_id,
      googleClientEmail: credentials.client_email
    });

    // Use explicit credentials to avoid ambiguous ADC resolution in containers.
    this.speechClient = new speech.SpeechClient({
      projectId: credentials.project_id,
      credentials: {
        client_email: credentials.client_email,
        private_key: credentials.private_key
      }
    });
    this.supportedFormats = ['audio/mpeg', 'audio/ogg', 'audio/wav', 'audio/m4a'];
  }

  normalizeMimeType(mimeType) {
    if (!mimeType || typeof mimeType !== 'string') {
      return '';
    }
    return mimeType.split(';')[0].trim().toLowerCase();
  }

  async transcribeAudio(audioStream, mimeType) {
    let tempFilePath = null;
    let convertedFilePath = null;

    try {
      // Save stream to temporary file
      tempFilePath = await this.saveStreamToFile(audioStream, mimeType);
      
      // Convert to suitable format for Google Speech
      convertedFilePath = await this.convertToWav(tempFilePath);
      
      // Transcribe using Google Cloud Speech
      const transcription = await this.performTranscription(convertedFilePath);
      
      // Clean up temporary files
      this.cleanupFiles([tempFilePath, convertedFilePath]);
      
      return transcription;
    } catch (error) {
      logger.error('Audio transcription failed', { error: error.message, mimeType });
      
      // Clean up temporary files
      this.cleanupFiles([tempFilePath, convertedFilePath]);
      
      // Fallback to a simple error message
      throw new Error('Could not transcribe audio message');
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
        .audioChannels(1) // Mono
        .audioFrequency(16000) // 16kHz sampling rate
        .audioBitrate('16k')
        .on('end', () => {
          logger.debug('Audio conversion completed', { inputPath, outputPath });
          resolve(outputPath);
        })
        .on('error', (error) => {
          logger.error('Audio conversion failed', { error: error.message, inputPath });
          reject(error);
        })
        .save(outputPath);
    });
  }

  async performTranscription(audioFilePath) {
    try {
      // Read audio file
      const audioBytes = fs.readFileSync(audioFilePath).toString('base64');

      const phraseHints = [
        'send money', 'transfer', 'balance', 'airtime', 'data',
        'GTBank', 'UBA', 'Zenith', 'First Bank', 'Access',
        'MTN', 'Glo', 'Airtel', '9mobile',
        'naira', 'kobo', 'PHCN', 'DStv', 'GOtv',
        'buy', 'pay', 'bill', 'recharge', 'credit',
        'abeg', 'make', 'how far', 'wetin', 'wahala',
        'owo', 'owo mi', 'e jowo', 'joor',
        'kudi', 'don Allah', 'nuna min', 'dina',
        'ego', 'biko', 'gosi', 'nyere m',
        'ranse', 'fi owo', 'siyan', 'jowo',
        'aika', 'nawa', 'taimako',
        'zipu', 'aka', 'ego m',
        'show my balance', 'check my balance'
      ];

      const languageConfigs = [
        { languageCode: 'ha-NG', alt: ['en-NG', 'en-US'] },
        { languageCode: 'yo-NG', alt: ['en-NG', 'en-US'] },
        { languageCode: 'ig-NG', alt: ['en-NG', 'en-US'] },
        { languageCode: 'en-NG', alt: ['en-US', 'en-GB'] }
      ];

      const candidates = [];
      for (const cfg of languageConfigs) {
        const request = {
          audio: { content: audioBytes },
          config: {
            encoding: 'LINEAR16',
            sampleRateHertz: 16000,
            languageCode: cfg.languageCode,
            alternativeLanguageCodes: cfg.alt,
            enableAutomaticPunctuation: true,
            enableWordTimeOffsets: false,
            speechContexts: [{ phrases: phraseHints }]
          }
        };

        try {
          const [resp] = await this.speechClient.recognize(request);
          if (!resp.results || resp.results.length === 0) {
            continue;
          }
          const transcript = resp.results
            .map(result => result.alternatives[0].transcript)
            .join(' ')
            .trim();
          const confidence = resp.results[0]?.alternatives?.[0]?.confidence || 0;
          const localTokenBoost = this.getLocalLanguageTokenBoost(transcript);
          candidates.push({
            transcript,
            confidence,
            languageCode: cfg.languageCode,
            score: confidence + localTokenBoost
          });
        } catch (err) {
          logger.warn('Speech recognition failed for language candidate', {
            languageCode: cfg.languageCode,
            error: err.message
          });
        }
      }

      if (candidates.length === 0) {
        logger.warn('No transcription results returned');
        return '';
      }

      candidates.sort((a, b) => b.score - a.score);
      const best = candidates[0];
      const transcription = best.transcript;
      const confidence = best.confidence;

      logger.info('Audio transcription completed', {
        transcription,
        confidence,
        selectedLanguage: best.languageCode,
        candidates: candidates.slice(0, 3).map(c => ({
          languageCode: c.languageCode,
          confidence: c.confidence,
          score: c.score
        })),
        audioFile: path.basename(audioFilePath)
      });

      return transcription;
    } catch (error) {
      logger.error('Google Speech transcription failed', { 
        error: error.message, 
        audioFile: audioFilePath 
      });
      throw error;
    }
  }

  getLocalLanguageTokenBoost(transcript) {
    if (!transcript) return 0;
    const lower = transcript.toLowerCase();
    const localTokens = [
      'abeg', 'wetin', 'don allah', 'nuna', 'dina', 'kudi',
      'jowo', 'owo', 'siyan', 'biko', 'ego', 'gosi', 'nyere',
      'nawa', 'nawa ne', 'balance dina'
    ];
    let hits = 0;
    for (const token of localTokens) {
      if (lower.includes(token)) hits += 1;
    }
    return hits * 0.08;
  }

  cleanupFiles(filePaths) {
    filePaths.forEach(filePath => {
      if (filePath && fs.existsSync(filePath)) {
        try {
          fs.unlinkSync(filePath);
        } catch (error) {
          logger.warn('Failed to cleanup temp file', { filePath, error: error.message });
        }
      }
    });
  }

  // Helper method to check if audio format is supported
  isSupportedFormat(mimeType) {
    const normalizedMimeType = this.normalizeMimeType(mimeType);
    return this.supportedFormats.includes(normalizedMimeType);
  }

  // Method to get audio duration (useful for rate limiting)
  async getAudioDuration(audioFilePath) {
    return new Promise((resolve, reject) => {
      ffmpeg.ffprobe(audioFilePath, (err, metadata) => {
        if (err) {
          reject(err);
        } else {
          const duration = metadata.format.duration;
          resolve(duration);
        }
      });
    });
  }

  // Method to validate audio file size and duration
  async validateAudio(audioFilePath, maxDurationSeconds = 60, maxSizeBytes = 10 * 1024 * 1024) {
    try {
      // Check file size
      const stats = fs.statSync(audioFilePath);
      if (stats.size > maxSizeBytes) {
        throw new Error(`Audio file too large: ${Math.round(stats.size / 1024 / 1024)}MB (max: ${Math.round(maxSizeBytes / 1024 / 1024)}MB)`);
      }

      // Check duration
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