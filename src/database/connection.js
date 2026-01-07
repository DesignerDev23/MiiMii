// Re-export from supabaseConnection for backward compatibility
// All imports should eventually use supabaseConnection directly
const { sequelize, databaseManager } = require('./supabaseConnection');

module.exports = {
  sequelize,
  databaseManager
};
