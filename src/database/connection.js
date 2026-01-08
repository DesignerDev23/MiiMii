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
  config: null
};

module.exports = {
  sequelize,
  databaseManager,
  supabase
};
