const express = require('express');
const router = express.Router();
const imageProcessingService = require('../services/imageProcessing');
const logger = require('../utils/logger');

// Test image processing endpoint
router.post('/test-image-processing', async (req, res) => {
  try {
    const { mediaId } = req.body;
    
    if (!mediaId) {
      return res.status(400).json({ error: 'mediaId is required' });
    }

    logger.info('Testing image processing', { mediaId });

    const result = await imageProcessingService.processBankDetailsImage(mediaId);
    
    res.json({
      success: true,
      result
    });
  } catch (error) {
    logger.error('Image processing test failed', { error: error.message });
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Test OCR only
router.post('/test-ocr', async (req, res) => {
  try {
    const { mediaId } = req.body;
    
    if (!mediaId) {
      return res.status(400).json({ error: 'mediaId is required' });
    }

    logger.info('Testing OCR only', { mediaId });

    const imageBuffer = await imageProcessingService.downloadImage(mediaId);
    const ocrResult = await imageProcessingService.extractTextFromImage(imageBuffer);
    
    res.json({
      success: true,
      result: ocrResult
    });
  } catch (error) {
    logger.error('OCR test failed', { error: error.message });
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;
