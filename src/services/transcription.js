const speech = require('@google-cloud/speech');
const ffmpeg = require('fluent-ffmpeg');
const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');

class TranscriptionService {
  constructor() {
    this.speechClient = new speech.SpeechClient();
    this.supportedFormats = ['audio/mpeg', 'audio/ogg', 'audio/wav', 'audio/m4a'];
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
    const extensionMap = {
      'audio/mpeg': 'mp3',
      'audio/ogg': 'ogg',
      'audio/wav': 'wav',
      'audio/m4a': 'm4a',
      'audio/mp4': 'm4a',
      'audio/aac': 'aac'
    };
    
    return extensionMap[mimeType] || 'mp3';
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

      // Configure the request
      const request = {
        audio: {
          content: audioBytes,
        },
        config: {
          encoding: 'LINEAR16',
          sampleRateHertz: 16000,
          languageCode: 'en-NG', // Nigerian English
          alternativeLanguageCodes: ['en-US', 'en-GB'], // Fallback languages
          enableAutomaticPunctuation: true,
          enableWordTimeOffsets: false,
          model: 'latest_long', // Best model for longer audio
          useEnhanced: true,
          // Nigerian-specific vocabulary hints
          speechContexts: [{
            phrases: [
              'send money', 'transfer', 'balance', 'airtime', 'data',
              'GTBank', 'UBA', 'Zenith', 'First Bank', 'Access',
              'MTN', 'Glo', 'Airtel', '9mobile',
              'naira', 'kobo', 'PHCN', 'DStv', 'GOtv',
              'buy', 'pay', 'bill', 'recharge', 'credit'
            ]
          }]
        },
      };

      // Perform the speech recognition request
      const [response] = await this.speechClient.recognize(request);
      
      if (!response.results || response.results.length === 0) {
        logger.warn('No transcription results returned');
        return '';
      }

      // Get the best transcription
      const transcription = response.results
        .map(result => result.alternatives[0].transcript)
        .join(' ')
        .trim();

      // Get confidence score
      const confidence = response.results.length > 0 
        ? response.results[0].alternatives[0].confidence 
        : 0;

      logger.info('Audio transcription completed', {
        transcription,
        confidence,
        audioFile: path.basename(audioFilePath)
      });

      return transcription;
    } catch (error) {
      logger.error('Google Speech transcription failed', { 
        error: error.message, 
        audioFile: audioFilePath 
      });
      
      // Try offline fallback if available
      return await this.offlineTranscriptionFallback(audioFilePath);
    }
  }

  async offlineTranscriptionFallback(audioFilePath) {
    // For now, return a generic message
    // In production, you could implement offline speech recognition
    // or use alternative services like OpenAI Whisper
    logger.info('Using offline transcription fallback');
    
    try {
      // You could implement OpenAI Whisper here as fallback
      // const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
      // const transcription = await openai.audio.transcriptions.create({
      //   file: fs.createReadStream(audioFilePath),
      //   model: "whisper-1",
      // });
      // return transcription.text;
      
      return ''; // Return empty string for now
    } catch (error) {
      logger.error('Offline transcription fallback failed', { error: error.message });
      return '';
    }
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
    return this.supportedFormats.includes(mimeType);
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