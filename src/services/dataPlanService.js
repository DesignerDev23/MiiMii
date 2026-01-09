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
          order: [['price', 'asc']]
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
      // Map field names to match Supabase schema
      const mappedData = {
        network: planData.network,
        type: planData.planType || planData.type || 'SME',
        name: planData.name || planData.dataSize || `${planData.dataSize} ${planData.network}`,
        dataSize: planData.dataSize,
        dataSizeMB: planData.dataSizeMB || this.parseDataSizeToMB(planData.dataSize),
        price: planData.sellingPrice || planData.retailPrice || planData.price,
        validityDays: planData.validityDays || this.parseValidityToDays(planData.validity),
        providerCode: planData.providerCode || planData.networkCode?.toString(),
        providerPlanId: planData.providerPlanId || planData.apiPlanId?.toString(),
        isActive: planData.isActive !== undefined ? planData.isActive : true,
        displayOrder: planData.displayOrder || 0,
        metadata: planData.metadata || (planData.description ? { description: planData.description } : {})
      };

      // Remove undefined values
      Object.keys(mappedData).forEach(key => {
        if (mappedData[key] === undefined) {
          delete mappedData[key];
        }
      });

      const plan = await databaseService.executeWithRetry(async () => {
        return await supabaseHelper.create('dataPlans', {
          id: uuidv4(),
          ...mappedData,
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
   * Parse data size string (e.g., "1GB", "500MB") to MB
   */
  parseDataSizeToMB(dataSize) {
    if (!dataSize) return 0;
    const size = dataSize.toString().toUpperCase();
    const match = size.match(/(\d+(?:\.\d+)?)\s*(GB|MB|KB)/);
    if (!match) return 0;
    const value = parseFloat(match[1]);
    const unit = match[2];
    if (unit === 'GB') return Math.round(value * 1024);
    if (unit === 'MB') return Math.round(value);
    if (unit === 'KB') return Math.round(value / 1024);
    return 0;
  }

  /**
   * Parse validity string (e.g., "30 days", "1 Month") to days
   */
  parseValidityToDays(validity) {
    if (!validity) return 30;
    const validityStr = validity.toString().toLowerCase();
    const match = validityStr.match(/(\d+)\s*(day|days|month|months|week|weeks)/);
    if (!match) return 30;
    const value = parseInt(match[1]);
    const unit = match[2];
    if (unit.includes('month')) return value * 30;
    if (unit.includes('week')) return value * 7;
    return value;
  }

  /**
   * Update a data plan
   */
  async updateDataPlan(planId, updateData) {
    try {
      // Map field names to match Supabase schema
      const mappedData = {};
      
      if (updateData.network !== undefined) mappedData.network = updateData.network;
      if (updateData.planType !== undefined || updateData.type !== undefined) {
        mappedData.type = updateData.planType || updateData.type;
      }
      if (updateData.name !== undefined) mappedData.name = updateData.name;
      if (updateData.dataSize !== undefined) mappedData.dataSize = updateData.dataSize;
      if (updateData.dataSizeMB !== undefined) mappedData.dataSizeMB = updateData.dataSizeMB;
      if (updateData.price !== undefined || updateData.sellingPrice !== undefined || updateData.retailPrice !== undefined) {
        mappedData.price = updateData.sellingPrice || updateData.retailPrice || updateData.price;
      }
      if (updateData.validityDays !== undefined) mappedData.validityDays = updateData.validityDays;
      if (updateData.validity !== undefined) {
        mappedData.validityDays = this.parseValidityToDays(updateData.validity);
      }
      if (updateData.providerCode !== undefined || updateData.networkCode !== undefined) {
        mappedData.providerCode = updateData.providerCode || updateData.networkCode?.toString();
      }
      if (updateData.providerPlanId !== undefined || updateData.apiPlanId !== undefined) {
        mappedData.providerPlanId = updateData.providerPlanId || updateData.apiPlanId?.toString();
      }
      if (updateData.isActive !== undefined) mappedData.isActive = updateData.isActive;
      if (updateData.displayOrder !== undefined) mappedData.displayOrder = updateData.displayOrder;
      if (updateData.metadata !== undefined) mappedData.metadata = updateData.metadata;
      if (updateData.description !== undefined) {
        mappedData.metadata = { ...(mappedData.metadata || {}), description: updateData.description };
      }

      await databaseService.executeWithRetry(async () => {
        const { supabase } = require('../database/connection');
        const { error, count } = await supabase
          .from('dataPlans')
          .update({
            ...mappedData,
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
        const { supabase } = require('../database/connection');
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

      const result = await databaseService.executeWithRetry(async () => {
        return await supabaseHelper.findAndCountAll('dataPlans', where, {
          order: [[orderBy, orderDirection]],
          limit: parseInt(limit),
          offset: (parseInt(page) - 1) * parseInt(limit)
        });
      });

      logger.info('Data plans query result:', { count: result.count, rowsCount: result.rows.length });

      return {
        plans: result.rows,
        total: result.count,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(result.count / parseInt(limit))
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
              const { supabase } = require('../database/connection');
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
            providerPlanId: apiPlan.id?.toString(),
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
    // Map database fields to expected format
    const price = parseFloat(plan.price || plan.sellingPrice || 0);
    const sellingPrice = plan.sellingPrice || price;
    const validity = plan.validityDays ? `${plan.validityDays} days` : plan.validity || 'N/A';
    
    return {
      id: `plan_${plan.network}_${plan.id}`,
      title: `${plan.dataSize} - ₦${sellingPrice.toLocaleString()}`,
      description: validity
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
