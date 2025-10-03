const { Beneficiary, User } = require('../models');
const logger = require('../utils/logger');
const { Op } = require('sequelize');

class BeneficiaryService {
  /**
   * Auto-save beneficiary from transfer with nickname extraction
   * Example: "send 10k to my mom 9072874728 opay"
   * Extracts: nickname="mom", phone="9072874728", bank="opay"
   */
  async autoSaveBeneficiary(userId, transferData, nickname = null) {
    try {
      const { accountNumber, bankCode, bankName, recipientName, phoneNumber } = transferData;

      // Determine beneficiary type
      let type = 'bank_account';
      if (phoneNumber && !accountNumber) {
        type = 'phone_number';
      } else if (accountNumber && bankName && bankName.toLowerCase().includes('miimii')) {
        type = 'miimii_user';
      }

      // Check if beneficiary already exists
      const existingBeneficiary = await this.findBeneficiary(userId, {
        accountNumber,
        bankCode,
        phoneNumber
      });

      if (existingBeneficiary) {
        // Update existing beneficiary
        await existingBeneficiary.updateUsage(transferData.amount || 0);
        
        // Update nickname if provided and not already set
        if (nickname && !existingBeneficiary.nickname) {
          existingBeneficiary.nickname = nickname;
          await existingBeneficiary.save();
          
          logger.info('Updated existing beneficiary with nickname', {
            userId,
            beneficiaryId: existingBeneficiary.id,
            nickname
          });
        }
        
        return existingBeneficiary;
      }

      // Create new beneficiary
      const beneficiary = await Beneficiary.create({
        userId,
        type,
        name: recipientName || accountNumber || phoneNumber,
        phoneNumber: phoneNumber || null,
        accountNumber: accountNumber || null,
        bankCode: bankCode || null,
        bankName: bankName || null,
        nickname: nickname || null,
        category: this.categorizeByNickname(nickname),
        isVerified: !!recipientName, // Verified if we have recipient name from name enquiry
        verificationData: recipientName ? { accountName: recipientName } : null,
        totalTransactions: 1,
        totalAmount: transferData.amount || 0,
        averageAmount: transferData.amount || 0,
        lastUsedAt: new Date()
      });

      logger.info('Auto-saved new beneficiary', {
        userId,
        beneficiaryId: beneficiary.id,
        nickname: nickname || 'none',
        type,
        name: beneficiary.name
      });

      return beneficiary;
    } catch (error) {
      logger.error('Failed to auto-save beneficiary', { 
        error: error.message, 
        userId,
        transferData
      });
      // Don't throw - beneficiary save shouldn't break transfer
      return null;
    }
  }

  /**
   * Find beneficiary by nickname or account details
   */
  async findBeneficiaryByNickname(userId, nickname) {
    try {
      const normalizedNickname = nickname.toLowerCase().trim();
      
      const beneficiary = await Beneficiary.findOne({
        where: {
          userId,
          isActive: true,
          [Op.or]: [
            { nickname: { [Op.iLike]: normalizedNickname } },
            { name: { [Op.iLike]: `%${normalizedNickname}%` } }
          ]
        },
        order: [
          ['isFavorite', 'DESC'],
          ['totalTransactions', 'DESC'],
          ['lastUsedAt', 'DESC']
        ]
      });

      if (beneficiary) {
        logger.info('Found beneficiary by nickname', {
          userId,
          nickname,
          beneficiaryId: beneficiary.id,
          beneficiaryName: beneficiary.name
        });
      }

      return beneficiary;
    } catch (error) {
      logger.error('Failed to find beneficiary by nickname', { error: error.message, userId, nickname });
      return null;
    }
  }

  /**
   * Find beneficiary by account details
   */
  async findBeneficiary(userId, criteria) {
    try {
      const where = {
        userId,
        isActive: true
      };

      if (criteria.accountNumber && criteria.bankCode) {
        where.accountNumber = criteria.accountNumber;
        where.bankCode = criteria.bankCode;
      } else if (criteria.phoneNumber) {
        where.phoneNumber = criteria.phoneNumber;
      } else {
        return null;
      }

      return await Beneficiary.findOne({ where });
    } catch (error) {
      logger.error('Failed to find beneficiary', { error: error.message, userId });
      return null;
    }
  }

  /**
   * Get all beneficiaries for a user
   */
  async getUserBeneficiaries(userId, options = {}) {
    try {
      const { 
        category = null, 
        type = null, 
        isFavorite = null,
        limit = 50,
        offset = 0
      } = options;

      const where = {
        userId,
        isActive: true
      };

      if (category) where.category = category;
      if (type) where.type = type;
      if (isFavorite !== null) where.isFavorite = isFavorite;

      const beneficiaries = await Beneficiary.findAll({
        where,
        order: [
          ['isFavorite', 'DESC'],
          ['totalTransactions', 'DESC'],
          ['lastUsedAt', 'DESC']
        ],
        limit,
        offset
      });

      return beneficiaries;
    } catch (error) {
      logger.error('Failed to get user beneficiaries', { error: error.message, userId });
      throw error;
    }
  }

  /**
   * Get frequent beneficiaries (top 10 most used)
   */
  async getFrequentBeneficiaries(userId, limit = 10) {
    try {
      return await Beneficiary.findAll({
        where: {
          userId,
          isActive: true
        },
        order: [
          ['totalTransactions', 'DESC'],
          ['totalAmount', 'DESC']
        ],
        limit
      });
    } catch (error) {
      logger.error('Failed to get frequent beneficiaries', { error: error.message, userId });
      return [];
    }
  }

  /**
   * Update beneficiary
   */
  async updateBeneficiary(userId, beneficiaryId, updates) {
    try {
      const beneficiary = await Beneficiary.findOne({
        where: { id: beneficiaryId, userId }
      });

      if (!beneficiary) {
        throw new Error('Beneficiary not found');
      }

      // Only allow certain fields to be updated
      const allowedUpdates = ['nickname', 'category', 'notes', 'isFavorite'];
      const filteredUpdates = {};
      
      allowedUpdates.forEach(field => {
        if (updates[field] !== undefined) {
          filteredUpdates[field] = updates[field];
        }
      });

      await beneficiary.update(filteredUpdates);

      logger.info('Beneficiary updated', {
        userId,
        beneficiaryId,
        updates: Object.keys(filteredUpdates)
      });

      return beneficiary;
    } catch (error) {
      logger.error('Failed to update beneficiary', { error: error.message, userId, beneficiaryId });
      throw error;
    }
  }

  /**
   * Delete/deactivate beneficiary
   */
  async deleteBeneficiary(userId, beneficiaryId) {
    try {
      const beneficiary = await Beneficiary.findOne({
        where: { id: beneficiaryId, userId }
      });

      if (!beneficiary) {
        throw new Error('Beneficiary not found');
      }

      await beneficiary.update({ isActive: false });

      logger.info('Beneficiary deactivated', {
        userId,
        beneficiaryId
      });

      return { success: true, message: 'Beneficiary removed successfully' };
    } catch (error) {
      logger.error('Failed to delete beneficiary', { error: error.message, userId, beneficiaryId });
      throw error;
    }
  }

  /**
   * Categorize beneficiary based on nickname
   */
  categorizeByNickname(nickname) {
    if (!nickname) return 'other';

    const normalized = nickname.toLowerCase();

    // Family keywords
    const familyKeywords = ['mom', 'dad', 'mother', 'father', 'brother', 'sister', 'son', 'daughter', 
                            'wife', 'husband', 'uncle', 'aunt', 'cousin', 'grandma', 'grandpa',
                            'family', 'bro', 'sis'];
    
    // Friend keywords
    const friendKeywords = ['friend', 'buddy', 'mate', 'pal', 'bestie', 'bff'];
    
    // Business keywords
    const businessKeywords = ['boss', 'client', 'customer', 'vendor', 'supplier', 'shop', 'store',
                              'business', 'office', 'work', 'company'];

    if (familyKeywords.some(keyword => normalized.includes(keyword))) {
      return 'family';
    }
    
    if (friendKeywords.some(keyword => normalized.includes(keyword))) {
      return 'friend';
    }
    
    if (businessKeywords.some(keyword => normalized.includes(keyword))) {
      return 'business';
    }

    return 'other';
  }

  /**
   * Search beneficiaries by name, nickname, or account
   */
  async searchBeneficiaries(userId, searchTerm) {
    try {
      const beneficiaries = await Beneficiary.findAll({
        where: {
          userId,
          isActive: true,
          [Op.or]: [
            { nickname: { [Op.iLike]: `%${searchTerm}%` } },
            { name: { [Op.iLike]: `%${searchTerm}%` } },
            { accountNumber: { [Op.like]: `%${searchTerm}%` } },
            { phoneNumber: { [Op.like]: `%${searchTerm}%` } }
          ]
        },
        order: [
          ['isFavorite', 'DESC'],
          ['totalTransactions', 'DESC']
        ],
        limit: 20
      });

      return beneficiaries;
    } catch (error) {
      logger.error('Failed to search beneficiaries', { error: error.message, userId, searchTerm });
      return [];
    }
  }

  /**
   * Toggle favorite status
   */
  async toggleFavorite(userId, beneficiaryId) {
    try {
      const beneficiary = await Beneficiary.findOne({
        where: { id: beneficiaryId, userId }
      });

      if (!beneficiary) {
        throw new Error('Beneficiary not found');
      }

      await beneficiary.toggleFavorite();

      logger.info('Beneficiary favorite toggled', {
        userId,
        beneficiaryId,
        isFavorite: beneficiary.isFavorite
      });

      return beneficiary;
    } catch (error) {
      logger.error('Failed to toggle favorite', { error: error.message, userId, beneficiaryId });
      throw error;
    }
  }

  /**
   * Get beneficiary suggestions based on user message
   * Returns matching beneficiaries if nickname is mentioned
   */
  async getBeneficiarySuggestions(userId, message) {
    try {
      const messageLower = message.toLowerCase();
      
      // Get all user beneficiaries
      const beneficiaries = await this.getUserBeneficiaries(userId, { limit: 100 });
      
      // Find matches by nickname or name
      const matches = beneficiaries.filter(ben => {
        if (ben.nickname && messageLower.includes(ben.nickname.toLowerCase())) {
          return true;
        }
        if (ben.name && messageLower.includes(ben.name.toLowerCase())) {
          return true;
        }
        return false;
      });

      return matches;
    } catch (error) {
      logger.error('Failed to get beneficiary suggestions', { error: error.message, userId });
      return [];
    }
  }

  /**
   * Get beneficiary stats for user
   */
  async getBeneficiaryStats(userId) {
    try {
      const [total, favorites, family, friends, business, recentlyUsed] = await Promise.all([
        Beneficiary.count({ where: { userId, isActive: true } }),
        Beneficiary.count({ where: { userId, isActive: true, isFavorite: true } }),
        Beneficiary.count({ where: { userId, isActive: true, category: 'family' } }),
        Beneficiary.count({ where: { userId, isActive: true, category: 'friend' } }),
        Beneficiary.count({ where: { userId, isActive: true, category: 'business' } }),
        Beneficiary.findAll({
          where: { userId, isActive: true, lastUsedAt: { [Op.not]: null } },
          order: [['lastUsedAt', 'DESC']],
          limit: 5
        })
      ]);

      return {
        total,
        favorites,
        byCategory: {
          family,
          friends,
          business,
          other: total - family - friends - business
        },
        recentlyUsed: recentlyUsed.map(b => b.getDisplayInfo())
      };
    } catch (error) {
      logger.error('Failed to get beneficiary stats', { error: error.message, userId });
      throw error;
    }
  }
}

module.exports = new BeneficiaryService();

