const { supabase } = require('../database/connection');
const databaseService = require('./database');
const logger = require('../utils/logger');
const { v4: uuidv4 } = require('uuid');

/**
 * Supabase Helper Service
 * Provides common database operations using Supabase client
 */
class SupabaseHelper {
  /**
   * Find one record by conditions
   */
  async findOne(table, conditions = {}) {
    try {
      let query = supabase.from(table).select('*');
      
      // Apply conditions
      Object.entries(conditions).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          query = query.eq(key, value);
        }
      });
      
      const { data, error } = await query.maybeSingle();
      
      if (error) throw error;
      return data;
    } catch (error) {
      logger.error(`Supabase findOne failed for ${table}`, { error: error.message, conditions });
      throw error;
    }
  }

  /**
   * Find all records by conditions
   */
  async findAll(table, conditions = {}, options = {}) {
    try {
      let query = supabase.from(table).select('*');
      
      // Apply conditions
      Object.entries(conditions).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          if (Array.isArray(value)) {
            query = query.in(key, value);
          } else {
            query = query.eq(key, value);
          }
        }
      });
      
      // Apply ordering
      if (options.order && Array.isArray(options.order) && options.order.length > 0) {
        const [column, direction] = options.order[0] || [];
        if (column) {
          // Supabase uses camelCase column names as-is
          query = query.order(column, { ascending: direction ? direction.toLowerCase() !== 'desc' : true });
        }
      }
      
      // Apply limit
      if (options.limit) {
        query = query.limit(options.limit);
      }
      
      // Apply offset
      if (options.offset) {
        query = query.range(options.offset, options.offset + (options.limit || 1000) - 1);
      }
      
      const { data, error } = await query;
      
      if (error) throw error;
      return data || [];
    } catch (error) {
      logger.error(`Supabase findAll failed for ${table}`, { error: error.message, conditions });
      throw error;
    }
  }

  /**
   * Find by primary key
   */
  async findByPk(table, id) {
    try {
      const { data, error } = await supabase
        .from(table)
        .select('*')
        .eq('id', id)
        .maybeSingle();
      
      if (error) throw error;
      return data;
    } catch (error) {
      logger.error(`Supabase findByPk failed for ${table}`, { error: error.message, id });
      throw error;
    }
  }

  /**
   * Create a record
   */
  async create(table, data) {
    try {
      // Add timestamps if not provided
      const now = new Date().toISOString();
      const record = {
        ...data,
        id: data.id || uuidv4(),
        createdAt: data.createdAt || now,
        updatedAt: data.updatedAt || now
      };
      
      const { data: created, error } = await supabase
        .from(table)
        .insert(record)
        .select()
        .single();
      
      if (error) throw error;
      return created;
    } catch (error) {
      logger.error(`Supabase create failed for ${table}`, { error: error.message, data });
      throw error;
    }
  }

  /**
   * Update records
   */
  async update(table, data, conditions = {}) {
    try {
      // Ensure updatedAt is set
      const updateData = { ...data };
      if (!updateData.updatedAt) {
        updateData.updatedAt = new Date().toISOString();
      }
      
      let query = supabase.from(table).update(updateData);
      
      // Apply conditions
      Object.entries(conditions).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          query = query.eq(key, value);
        }
      });
      
      const { data: updated, error } = await query.select().maybeSingle();
      
      if (error) throw error;
      return updated;
    } catch (error) {
      logger.error(`Supabase update failed for ${table}`, { error: error.message, conditions });
      throw error;
    }
  }

  /**
   * Delete records
   */
  async delete(table, conditions = {}) {
    try {
      let query = supabase.from(table).delete();
      
      // Apply conditions
      Object.entries(conditions).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          query = query.eq(key, value);
        }
      });
      
      const { error } = await query;
      
      if (error) throw error;
      return true;
    } catch (error) {
      logger.error(`Supabase delete failed for ${table}`, { error: error.message, conditions });
      throw error;
    }
  }

  /**
   * Count records
   */
  async count(table, conditions = {}) {
    try {
      let query = supabase.from(table).select('*', { count: 'exact', head: true });
      
      // Apply conditions
      Object.entries(conditions).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          query = query.eq(key, value);
        }
      });
      
      const { count, error } = await query;
      
      if (error) throw error;
      return count || 0;
    } catch (error) {
      logger.error(`Supabase count failed for ${table}`, { error: error.message, conditions });
      throw error;
    }
  }

  /**
   * Find and count all (for pagination)
   */
  async findAndCountAll(table, conditions = {}, options = {}) {
    try {
      const data = await this.findAll(table, conditions, options);
      const count = await this.count(table, conditions);
      
      return {
        rows: data,
        count: count
      };
    } catch (error) {
      logger.error(`Supabase findAndCountAll failed for ${table}`, { error: error.message });
      throw error;
    }
  }
}

module.exports = new SupabaseHelper();

