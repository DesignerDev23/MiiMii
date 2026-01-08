const { DataPlan } = require('../models');
const logger = require('../utils/logger');

class DataPlanService {
  /**
   * Get all active data plans for a network
   */
  async getDataPlansByNetwork(network) {
    try {
      const plans = await DataPlan.findAll({
        where: {
          network: network.toUpperCase(),
          isActive: true
        },
        order: [['sellingPrice', 'ASC']]
      });

      return plans;
    } catch (error) {
      logger.error('Error fetching data plans by network', { error: error.message, network });
      throw error;
    }
  }

  /**
   * Get a specific data plan by ID
   */
  async getDataPlanById(planId) {
    try {
      const plan = await DataPlan.findByPk(planId);
      return plan;
    } catch (error) {
      logger.error('Error fetching data plan by ID', { error: error.message, planId });
      throw error;
    }
  }

  /**
   * Create a new data plan
   */
  async createDataPlan(planData) {
    try {
      const plan = await DataPlan.create(planData);
      logger.info('Data plan created successfully', { planId: plan.id, network: plan.network });
      return plan;
    } catch (error) {
      logger.error('Error creating data plan', { error: error.message, planData });
      throw error;
    }
  }

  /**
   * Update a data plan
   */
  async updateDataPlan(planId, updateData) {
    try {
      const [updatedRowsCount] = await DataPlan.update(updateData, {
        where: { id: planId }
      });

      if (updatedRowsCount === 0) {
        throw new Error('Data plan not found');
      }

      const updatedPlan = await DataPlan.findByPk(planId);
      logger.info('Data plan updated successfully', { planId, updateData });
      return updatedPlan;
    } catch (error) {
      logger.error('Error updating data plan', { error: error.message, planId, updateData });
      throw error;
    }
  }

  /**
   * Delete a data plan (soft delete by setting isActive to false)
   */
  async deleteDataPlan(planId) {
    try {
      const [updatedRowsCount] = await DataPlan.update(
        { isActive: false },
        { where: { id: planId } }
      );

      if (updatedRowsCount === 0) {
        throw new Error('Data plan not found');
      }

      logger.info('Data plan deleted successfully', { planId });
      return true;
    } catch (error) {
      logger.error('Error deleting data plan', { error: error.message, planId });
      throw error;
    }
  }

  /**
   * Get all data plans with pagination
   */
  async getAllDataPlans(options = {}) {
    try {
      const {
        page = 1,
        limit = 50,
        network = null,
        isActive = null, // Changed from true to null to get all plans by default
        orderBy = 'createdAt',
        orderDirection = 'DESC'
      } = options;

      const where = {};
      if (network) where.network = network.toUpperCase();
      if (isActive !== null) where.isActive = isActive;

      logger.info('Fetching all data plans with options:', { options, where });

      const { count, rows } = await DataPlan.findAndCountAll({
        where,
        order: [[orderBy, orderDirection]],
        limit: parseInt(limit),
        offset: (parseInt(page) - 1) * parseInt(limit)
      });

      logger.info('Data plans query result:', { count, rowsCount: rows.length });

      return {
        plans: rows,
        total: count,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(count / parseInt(limit))
      };
    } catch (error) {
      logger.error('Error fetching all data plans', { error: error.message, options });
      throw error;
    }
  }

  /**
   * Sync data plans from external API (for future use)
   */
  async syncFromAPI(apiPlans) {
    try {
      const results = {
        created: 0,
        updated: 0,
        errors: []
      };

      for (const apiPlan of apiPlans) {
        try {
          const existingPlan = await DataPlan.findOne({
            where: { apiPlanId: apiPlan.id }
          });

          if (existingPlan) {
            // Update existing plan
            await existingPlan.update({
              dataSize: apiPlan.dataSize,
              validity: apiPlan.validity,
              retailPrice: apiPlan.retailPrice,
              networkCode: apiPlan.networkCode
            });
            results.updated++;
          } else {
            // Create new plan
            await DataPlan.create({
              network: apiPlan.network,
              planType: apiPlan.planType,
              dataSize: apiPlan.dataSize,
              validity: apiPlan.validity,
              retailPrice: apiPlan.retailPrice,
              sellingPrice: apiPlan.retailPrice, // Default to retail price
              networkCode: apiPlan.networkCode,
              apiPlanId: apiPlan.id
            });
            results.created++;
          }
        } catch (error) {
          results.errors.push({
            apiPlanId: apiPlan.id,
            error: error.message
          });
        }
      }

      logger.info('Data plans sync completed', results);
      return results;
    } catch (error) {
      logger.error('Error syncing data plans from API', { error: error.message });
      throw error;
    }
  }

  /**
   * Format data plan for WhatsApp list display
   */
  formatPlanForWhatsApp(plan) {
    return {
      id: `plan_${plan.network}_${plan.id}`,
      title: `${plan.dataSize} - ₦${plan.sellingPrice.toLocaleString()}`,
      description: plan.validity
    };
  }

  /**
   * Get network code for API calls
   */
  getNetworkCode(network) {
    const networkCodes = {
      'MTN': 1,
      'AIRTEL': 2,
      'GLO': 3,
      '9MOBILE': 4
    };
    return networkCodes[network.toUpperCase()] || null;
  }
}

module.exports = new DataPlanService();
