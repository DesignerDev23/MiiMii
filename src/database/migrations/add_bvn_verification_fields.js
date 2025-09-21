const { DataTypes } = require('sequelize');

module.exports = {
  up: async (queryInterface) => {
    // Add BVN verification fields to User table
    await queryInterface.addColumn('Users', 'bvnVerified', {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      allowNull: false,
      comment: 'Whether BVN has been verified with Rubies API'
    });

    await queryInterface.addColumn('Users', 'bvnVerificationDate', {
      type: DataTypes.DATE,
      allowNull: true,
      comment: 'Date when BVN was successfully verified'
    });

    await queryInterface.addColumn('Users', 'alternatePhone', {
      type: DataTypes.STRING,
      allowNull: true,
      comment: 'Alternate phone number from BVN data'
    });

    await queryInterface.addColumn('Users', 'bvnData', {
      type: DataTypes.JSONB,
      allowNull: true,
      comment: 'Additional data returned from BVN verification'
    });

    console.log('✅ Added BVN verification fields to Users table');
  },

  down: async (queryInterface) => {
    // Remove BVN verification fields
    await queryInterface.removeColumn('Users', 'bvnVerified');
    await queryInterface.removeColumn('Users', 'bvnVerificationDate');
    await queryInterface.removeColumn('Users', 'alternatePhone');
    await queryInterface.removeColumn('Users', 'bvnData');

    console.log('✅ Removed BVN verification fields from Users table');
  }
};
