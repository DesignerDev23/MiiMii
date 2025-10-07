const express = require('express');
const router = express.Router();
const dataPlanService = require('../services/dataPlanService');
const logger = require('../utils/logger');

// Get all data plans with pagination
router.get('/', async (req, res) => {
  try {
    const {
      page = 1,
      limit = 50,
      network = null,
      isActive = true,
      orderBy = 'createdAt',
      orderDirection = 'DESC'
    } = req.query;

    const result = await dataPlanService.getAllDataPlans({
      page: parseInt(page),
      limit: parseInt(limit),
      network,
      isActive: isActive === 'true',
      orderBy,
      orderDirection
    });

    res.json({
      success: true,
      data: result.plans,
      pagination: {
        page: result.page,
        limit: result.limit,
        total: result.total,
        totalPages: result.totalPages
      }
    });
  } catch (error) {
    logger.error('Error fetching data plans', { error: error.message });
    res.status(500).json({
      success: false,
      message: 'Failed to fetch data plans',
      error: error.message
    });
  }
});

// Get data plans by network
router.get('/network/:network', async (req, res) => {
  try {
    const { network } = req.params;
    const plans = await dataPlanService.getDataPlansByNetwork(network);

    res.json({
      success: true,
      data: plans
    });
  } catch (error) {
    logger.error('Error fetching data plans by network', { error: error.message, network: req.params.network });
    res.status(500).json({
      success: false,
      message: 'Failed to fetch data plans',
      error: error.message
    });
  }
});

// Get specific data plan
router.get('/:planId', async (req, res) => {
  try {
    const { planId } = req.params;
    const plan = await dataPlanService.getDataPlanById(planId);

    if (!plan) {
      return res.status(404).json({
        success: false,
        message: 'Data plan not found'
      });
    }

    res.json({
      success: true,
      data: plan
    });
  } catch (error) {
    logger.error('Error fetching data plan', { error: error.message, planId: req.params.planId });
    res.status(500).json({
      success: false,
      message: 'Failed to fetch data plan',
      error: error.message
    });
  }
});

// Create new data plan
router.post('/', async (req, res) => {
  try {
    const {
      network,
      planType,
      dataSize,
      validity,
      retailPrice,
      sellingPrice,
      networkCode,
      apiPlanId,
      description
    } = req.body;

    // Validate required fields
    if (!network || !planType || !dataSize || !validity || !retailPrice || !sellingPrice || !networkCode) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: network, planType, dataSize, validity, retailPrice, sellingPrice, networkCode'
      });
    }

    const planData = {
      network: network.toUpperCase(),
      planType,
      dataSize,
      validity,
      retailPrice: parseFloat(retailPrice),
      sellingPrice: parseFloat(sellingPrice),
      networkCode: parseInt(networkCode),
      apiPlanId: apiPlanId ? parseInt(apiPlanId) : null,
      description
    };

    const plan = await dataPlanService.createDataPlan(planData);

    res.status(201).json({
      success: true,
      message: 'Data plan created successfully',
      data: plan
    });
  } catch (error) {
    logger.error('Error creating data plan', { error: error.message, body: req.body });
    res.status(500).json({
      success: false,
      message: 'Failed to create data plan',
      error: error.message
    });
  }
});

// Update data plan
router.put('/:planId', async (req, res) => {
  try {
    const { planId } = req.params;
    const updateData = req.body;

    // Convert numeric fields
    if (updateData.retailPrice) updateData.retailPrice = parseFloat(updateData.retailPrice);
    if (updateData.sellingPrice) updateData.sellingPrice = parseFloat(updateData.sellingPrice);
    if (updateData.networkCode) updateData.networkCode = parseInt(updateData.networkCode);
    if (updateData.apiPlanId) updateData.apiPlanId = parseInt(updateData.apiPlanId);

    const plan = await dataPlanService.updateDataPlan(planId, updateData);

    res.json({
      success: true,
      message: 'Data plan updated successfully',
      data: plan
    });
  } catch (error) {
    logger.error('Error updating data plan', { error: error.message, planId: req.params.planId, body: req.body });
    res.status(500).json({
      success: false,
      message: 'Failed to update data plan',
      error: error.message
    });
  }
});

// Delete data plan (soft delete)
router.delete('/:planId', async (req, res) => {
  try {
    const { planId } = req.params;
    await dataPlanService.deleteDataPlan(planId);

    res.json({
      success: true,
      message: 'Data plan deleted successfully'
    });
  } catch (error) {
    logger.error('Error deleting data plan', { error: error.message, planId: req.params.planId });
    res.status(500).json({
      success: false,
      message: 'Failed to delete data plan',
      error: error.message
    });
  }
});

// Bulk update selling prices
router.patch('/bulk-prices', async (req, res) => {
  try {
    const { updates } = req.body; // Array of { planId, sellingPrice }

    if (!Array.isArray(updates)) {
      return res.status(400).json({
        success: false,
        message: 'Updates must be an array of { planId, sellingPrice } objects'
      });
    }

    const results = [];
    for (const update of updates) {
      try {
        const plan = await dataPlanService.updateDataPlan(update.planId, {
          sellingPrice: parseFloat(update.sellingPrice)
        });
        results.push({ planId: update.planId, success: true, data: plan });
      } catch (error) {
        results.push({ planId: update.planId, success: false, error: error.message });
      }
    }

    res.json({
      success: true,
      message: 'Bulk price update completed',
      results
    });
  } catch (error) {
    logger.error('Error in bulk price update', { error: error.message, body: req.body });
    res.status(500).json({
      success: false,
      message: 'Failed to update prices',
      error: error.message
    });
  }
});

module.exports = router;
