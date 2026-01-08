// Re-export from supabaseConnection for backward compatibility
// NOTE: sequelize is now null - use supabase client instead
const { supabase, databaseManager } = require('./supabaseConnection');

// Create a dummy sequelize for backward compatibility (won't actually work)
// All code should be migrated to use supabase client
const sequelize = {
  authenticate: async () => {
    throw new Error('Sequelize is disabled. Use supabase client instead. Import from database/supabaseConnection');
  },
  query: async () => {
    throw new Error('Sequelize is disabled. Use supabase client instead. Import from database/supabaseConnection');
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
  config: null
};

// Wrap databaseManager to prevent Sequelize access
const wrappedDatabaseManager = {
  ...databaseManager,
  getSequelize: () => {
    throw new Error('Sequelize is disabled. Use supabase client instead. Import supabase from database/supabaseConnection');
  }
};

module.exports = {
  sequelize,
  databaseManager: wrappedDatabaseManager,
  supabase
};
