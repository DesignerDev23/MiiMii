const logger = require('../utils/logger');
const databaseService = require('./database');
const supabaseHelper = require('./supabaseHelper');
const { v4: uuidv4 } = require('uuid');

class DataPlanService {
  /**
   * Get all active data plans for a network
   */
  async getDataPlansByNetwork(network) {
    try {
      const plans = await databaseService.executeWithRetry(async () => {
        return await supabaseHelper.findAll('dataPlans', {
          network: network.toUpperCase(),
          isActive: true
        }, {
          orderBy: 'price',
          order: 'asc'
        });
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
      const plan = await databaseService.executeWithRetry(async () => {
        return await supabaseHelper.findByPk('dataPlans', planId);
      });
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
      const plan = await databaseService.executeWithRetry(async () => {
        return await supabaseHelper.create('dataPlans', {
          id: uuidv4(),
          ...planData,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        });
      });
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
      await databaseService.executeWithRetry(async () => {
        const { error, count } = await supabase
          .from('dataPlans')
          .update({
            ...updateData,
            updatedAt: new Date().toISOString()
          })
          .eq('id', planId);
        
        if (error) throw error;
        if (!count || count === 0) throw new Error('Data plan not found');
      });

      const updatedPlan = await databaseService.executeWithRetry(async () => {
        return await supabaseHelper.findByPk('dataPlans', planId);
      });
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
      await databaseService.executeWithRetry(async () => {
        const { error, count } = await supabase
          .from('dataPlans')
          .update({
            isActive: false,
            updatedAt: new Date().toISOString()
          })
          .eq('id', planId);
        
        if (error) throw error;
        if (!count || count === 0) throw new Error('Data plan not found');
      });

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
          const existingPlan = await databaseService.executeWithRetry(async () => {
            return await supabaseHelper.findOne('dataPlans', { 
              providerPlanId: apiPlan.id?.toString() 
            });
          });

          if (existingPlan) {
            // Update existing plan
            await databaseService.executeWithRetry(async () => {
              const { error } = await supabase
                .from('dataPlans')
                .update({
                  dataSize: apiPlan.dataSize,
                  validityDays: apiPlan.validity,
                  price: apiPlan.retailPrice,
                  providerCode: apiPlan.networkCode?.toString(),
                  updatedAt: new Date().toISOString()
                })
                .eq('id', existingPlan.id);
              
              if (error) throw error;
            });
            results.updated++;
          } else {
            // Create new plan
            await databaseService.executeWithRetry(async () => {
              return await supabaseHelper.create('dataPlans', {
                id: uuidv4(),
                network: apiPlan.network,
                type: apiPlan.planType || 'data',
                name: `${apiPlan.dataSize} ${apiPlan.network}`,
                dataSize: apiPlan.dataSize,
                validityDays: apiPlan.validity,
                price: apiPlan.retailPrice,
                providerCode: apiPlan.networkCode?.toString(),
                providerPlanId: apiPlan.id?.toString(),
                isActive: true,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
              });
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
