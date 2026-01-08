// Re-export from supabaseConnection for backward compatibility
// NOTE: sequelize is now null - use supabase client instead
const { supabase, databaseManager } = require('./supabaseConnection');
const { DataTypes, Sequelize } = require('sequelize');

// Create a mock model class for backward compatibility
class MockModel {
  static hasOne() { return MockModel; }
  static hasMany() { return MockModel; }
  static belongsTo() { return MockModel; }
  static findByPk() { throw new Error('Sequelize models are disabled. Use supabase client instead.'); }
  static findOne() { throw new Error('Sequelize models are disabled. Use supabase client instead.'); }
  static findAll() { throw new Error('Sequelize models are disabled. Use supabase client instead.'); }
  static findAndCountAll() { throw new Error('Sequelize models are disabled. Use supabase client instead.'); }
  static count() { throw new Error('Sequelize models are disabled. Use supabase client instead.'); }
  static create() { throw new Error('Sequelize models are disabled. Use supabase client instead.'); }
  static update() { throw new Error('Sequelize models are disabled. Use supabase client instead.'); }
  static destroy() { throw new Error('Sequelize models are disabled. Use supabase client instead.'); }
  async save() { throw new Error('Sequelize models are disabled. Use supabase client instead.'); }
}

// Create a dummy sequelize for backward compatibility (won't actually work)
// All code should be migrated to use supabase client
const sequelize = {
  define: (modelName, attributes, options) => {
    // Return a mock model so the app can start without crashing
    // NOTE: This model won't actually work - all operations will throw errors
    console.warn(`⚠️  Model "${modelName}" is using disabled Sequelize. Migrate to Supabase client.`);
    return MockModel;
  },
  authenticate: async () => {
    throw new Error('Sequelize is disabled. Use supabase client instead. Import from database/supabaseConnection');
  },
  query: async (sql, options) => {
    // For self-healing scripts that need raw SQL, we'll need to use Supabase RPC or direct client
    // For now, log a warning and return appropriate mock data to prevent crashes
    console.warn('⚠️  sequelize.query() called - this needs to be migrated to Supabase client');
    console.warn('⚠️  SQL:', sql?.substring(0, 100));
    
    // Handle SELECT EXISTS queries - return false (column doesn't exist) to prevent errors
    if (sql && sql.includes('SELECT EXISTS')) {
      return [[{ exists: false }], {}];
    }
    
    // Handle SELECT column_name queries - return empty array (column doesn't exist)
    if (sql && sql.includes('SELECT column_name')) {
      return [[], {}];
    }
    
    // Handle SELECT table_name queries - return empty array (table doesn't exist)
    if (sql && sql.includes('SELECT table_name')) {
      return [[], {}];
    }
    
    // Handle SELECT t.typname (enum type queries) - return empty array
    if (sql && sql.includes('SELECT t.typname')) {
      return [[], {}];
    }
    
    // Default: return empty result array to match Sequelize format [results, metadata]
    return [[], {}];
  },
  getQueryInterface: () => {
    // Return a mock query interface for self-healing scripts
    return {
      showAllTables: async () => {
        console.warn('⚠️  getQueryInterface().showAllTables() called - needs Supabase migration');
        return [];
      },
      describeTable: async () => {
        console.warn('⚠️  getQueryInterface().describeTable() called - needs Supabase migration');
        return {};
      },
      addColumn: async () => {
        console.warn('⚠️  getQueryInterface().addColumn() called - needs Supabase migration');
        // Silently succeed to prevent crashes
      },
      createTable: async () => {
        console.warn('⚠️  getQueryInterface().createTable() called - needs Supabase migration');
        // Silently succeed to prevent crashes
      },
      addIndex: async () => {
        console.warn('⚠️  getQueryInterface().addIndex() called - needs Supabase migration');
        // Silently succeed to prevent crashes
      }
    };
  },
  sync: async () => {
    throw new Error('Sequelize is disabled. Use supabase client instead. Import from database/supabaseConnection');
  },
  transaction: async () => {
    throw new Error('Sequelize is disabled. Use supabase client instead. Import from database/supabaseConnection');
  },
  getSequelize: () => {
    throw new Error('Sequelize is disabled. Use supabase client instead. Import from database/supabaseConnection');
  },
  Sequelize, // Add Sequelize for scripts that use sequelize.Sequelize.STRING
  QueryTypes: Sequelize.QueryTypes, // For sequelize.QueryTypes.SELECT
  config: null
};
          
// Export databaseManager directly - it already has all needed methods
// Just add getSequelize if it doesn't exist (for backward compatibility)
if (!databaseManager.getSequelize) {
  databaseManager.getSequelize = () => {
    throw new Error('Sequelize is disabled. Use supabase client instead. Import supabase from database/supabaseConnection');
  };
}

module.exports = { 
  sequelize,
  databaseManager,
  supabase,
  DataTypes // Export DataTypes for model definitions
};
