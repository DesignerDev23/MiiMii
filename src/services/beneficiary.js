const logger = require('../utils/logger');
const databaseService = require('./database');
const supabaseHelper = require('./supabaseHelper');
const { supabase } = require('../database/connection');
const { v4: uuidv4 } = require('uuid');

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
        // Update existing beneficiary usage
        const newTotalTransactions = (existingBeneficiary.totalTransactions || 0) + 1;
        const newTotalAmount = parseFloat(existingBeneficiary.totalAmount || 0) + parseFloat(transferData.amount || 0);
        const newAverageAmount = newTotalAmount / newTotalTransactions;
        
        const updateData = {
          totalTransactions: newTotalTransactions,
          totalAmount: newTotalAmount,
          averageAmount: newAverageAmount,
          lastUsedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };
        
        // Update nickname if provided and not already set
        if (nickname && !existingBeneficiary.nickname) {
          updateData.nickname = nickname;
          logger.info('Updated existing beneficiary with nickname', {
            userId,
            beneficiaryId: existingBeneficiary.id,
            nickname
          });
        }
        
        await databaseService.executeWithRetry(async () => {
          const { error } = await supabase
            .from('beneficiaries')
            .update(updateData)
            .eq('id', existingBeneficiary.id);
          
          if (error) throw error;
        });
        
        // Return updated beneficiary
        return await databaseService.executeWithRetry(async () => {
          return await supabaseHelper.findByPk('beneficiaries', existingBeneficiary.id);
        });
      }

      // Create new beneficiary
      const beneficiary = await databaseService.executeWithRetry(async () => {
        return await supabaseHelper.create('beneficiaries', {
          id: uuidv4(),
          userId,
          type,
          name: recipientName || accountNumber || phoneNumber,
          phoneNumber: phoneNumber || null,
          accountNumber: accountNumber || null,
          bankCode: bankCode || null,
          bankName: bankName || null,
          nickname: nickname || null,
          category: this.categorizeByNickname(nickname),
          isVerified: !!recipientName,
          verificationData: recipientName ? { accountName: recipientName } : null,
          totalTransactions: 1,
          totalAmount: transferData.amount || 0,
          averageAmount: transferData.amount || 0,
          lastUsedAt: new Date().toISOString(),
          isActive: true,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        });
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
      
      // Get all beneficiaries and filter in memory (Supabase doesn't support complex OR with ILIKE)
      const beneficiaries = await databaseService.executeWithRetry(async () => {
        return await supabaseHelper.findAll('beneficiaries', { 
          userId, 
          isActive: true 
        }, {
          orderBy: 'isFavorite',
          order: 'desc'
        });
      });
      
      // Filter by nickname or name
      const beneficiary = beneficiaries.find(ben => {
        const benNickname = (ben.nickname || '').toLowerCase();
        const benName = (ben.name || '').toLowerCase();
        return benNickname === normalizedNickname || benName.includes(normalizedNickname);
      });
      
      // Sort by totalTransactions and lastUsedAt
      if (beneficiaries.length > 1) {
        beneficiaries.sort((a, b) => {
          if (a.isFavorite !== b.isFavorite) return b.isFavorite - a.isFavorite;
          if ((b.totalTransactions || 0) !== (a.totalTransactions || 0)) return (b.totalTransactions || 0) - (a.totalTransactions || 0);
          const aDate = a.lastUsedAt ? new Date(a.lastUsedAt) : new Date(0);
          const bDate = b.lastUsedAt ? new Date(b.lastUsedAt) : new Date(0);
          return bDate - aDate;
        });
      }

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

      return await databaseService.executeWithRetry(async () => {
        return await supabaseHelper.findOne('beneficiaries', where);
      });
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

      const beneficiaries = await databaseService.executeWithRetry(async () => {
        return await supabaseHelper.findAll('beneficiaries', where, {
          orderBy: 'isFavorite',
          order: 'desc',
          limit,
          offset
        });
      });
      
      // Sort by totalTransactions and lastUsedAt (Supabase doesn't support multiple orderBy)
      beneficiaries.sort((a, b) => {
        if (a.isFavorite !== b.isFavorite) return b.isFavorite - a.isFavorite;
        if ((b.totalTransactions || 0) !== (a.totalTransactions || 0)) return (b.totalTransactions || 0) - (a.totalTransactions || 0);
        const aDate = a.lastUsedAt ? new Date(a.lastUsedAt) : new Date(0);
        const bDate = b.lastUsedAt ? new Date(b.lastUsedAt) : new Date(0);
        return bDate - aDate;
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
      const beneficiaries = await databaseService.executeWithRetry(async () => {
        return await supabaseHelper.findAll('beneficiaries', {
          userId,
          isActive: true
        }, {
          orderBy: 'totalTransactions',
          order: 'desc',
          limit
        });
      });
      
      // Sort by totalAmount as secondary sort
      beneficiaries.sort((a, b) => {
        if ((b.totalTransactions || 0) !== (a.totalTransactions || 0)) return (b.totalTransactions || 0) - (a.totalTransactions || 0);
        return parseFloat(b.totalAmount || 0) - parseFloat(a.totalAmount || 0);
      });
      
      return beneficiaries.slice(0, limit);
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
      const beneficiary = await databaseService.executeWithRetry(async () => {
        return await supabaseHelper.findOne('beneficiaries', { id: beneficiaryId, userId });
      });

      if (!beneficiary) {
        throw new Error('Beneficiary not found');
      }

      // Only allow certain fields to be updated
      const allowedUpdates = ['nickname', 'category', 'notes', 'isFavorite'];
      const filteredUpdates = {
        updatedAt: new Date().toISOString()
      };
      
      allowedUpdates.forEach(field => {
        if (updates[field] !== undefined) {
          filteredUpdates[field] = updates[field];
        }
      });

      await databaseService.executeWithRetry(async () => {
        const { error } = await supabase
          .from('beneficiaries')
          .update(filteredUpdates)
          .eq('id', beneficiaryId);
        
        if (error) throw error;
      });

      logger.info('Beneficiary updated', {
        userId,
        beneficiaryId,
        updates: Object.keys(filteredUpdates)
      });

      // Return updated beneficiary
      return await databaseService.executeWithRetry(async () => {
        return await supabaseHelper.findByPk('beneficiaries', beneficiaryId);
      });
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
      const beneficiary = await databaseService.executeWithRetry(async () => {
        return await supabaseHelper.findOne('beneficiaries', { id: beneficiaryId, userId });
      });

      if (!beneficiary) {
        throw new Error('Beneficiary not found');
      }

      await databaseService.executeWithRetry(async () => {
        const { error } = await supabase
          .from('beneficiaries')
          .update({ 
            isActive: false,
            updatedAt: new Date().toISOString()
          })
          .eq('id', beneficiaryId);
        
        if (error) throw error;
      });

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
      // Get all active beneficiaries and filter in memory
      const allBeneficiaries = await databaseService.executeWithRetry(async () => {
        return await supabaseHelper.findAll('beneficiaries', { 
          userId, 
          isActive: true 
        });
      });
      
      const searchLower = searchTerm.toLowerCase();
      const beneficiaries = allBeneficiaries.filter(ben => {
        const nickname = (ben.nickname || '').toLowerCase();
        const name = (ben.name || '').toLowerCase();
        const accountNumber = (ben.accountNumber || '').toLowerCase();
        const phoneNumber = (ben.phoneNumber || '').toLowerCase();
        
        return nickname.includes(searchLower) || 
               name.includes(searchLower) || 
               accountNumber.includes(searchLower) || 
               phoneNumber.includes(searchLower);
      });
      
      // Sort by isFavorite and totalTransactions
      beneficiaries.sort((a, b) => {
        if (a.isFavorite !== b.isFavorite) return b.isFavorite - a.isFavorite;
        return (b.totalTransactions || 0) - (a.totalTransactions || 0);
      });
      
      return beneficiaries.slice(0, 20);

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
      const beneficiary = await databaseService.executeWithRetry(async () => {
        return await supabaseHelper.findOne('beneficiaries', { id: beneficiaryId, userId });
      });

      if (!beneficiary) {
        throw new Error('Beneficiary not found');
      }

      const newFavoriteStatus = !beneficiary.isFavorite;
      
      await databaseService.executeWithRetry(async () => {
        const { error } = await supabase
          .from('beneficiaries')
          .update({ 
            isFavorite: newFavoriteStatus,
            updatedAt: new Date().toISOString()
          })
          .eq('id', beneficiaryId);
        
        if (error) throw error;
      });
      
      beneficiary.isFavorite = newFavoriteStatus;

      logger.info('Beneficiary favorite toggled', {
        userId,
        beneficiaryId,
        isFavorite: newFavoriteStatus
      });

      // Return updated beneficiary
      return await databaseService.executeWithRetry(async () => {
        return await supabaseHelper.findByPk('beneficiaries', beneficiaryId);
      });
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
      // Get all active beneficiaries
      const allBeneficiaries = await databaseService.executeWithRetry(async () => {
        return await supabaseHelper.findAll('beneficiaries', { userId, isActive: true });
      });
      
      const total = allBeneficiaries.length;
      const favorites = allBeneficiaries.filter(b => b.isFavorite).length;
      const family = allBeneficiaries.filter(b => b.category === 'family').length;
      const friends = allBeneficiaries.filter(b => b.category === 'friend').length;
      const business = allBeneficiaries.filter(b => b.category === 'business').length;
      
      // Get recently used
      const recentlyUsed = allBeneficiaries
        .filter(b => b.lastUsedAt)
        .sort((a, b) => new Date(b.lastUsedAt) - new Date(a.lastUsedAt))
        .slice(0, 5)
        .map(b => ({
          id: b.id,
          name: b.name,
          nickname: b.nickname,
          lastUsedAt: b.lastUsedAt
        }));

      return {
        total,
        favorites,
        byCategory: {
          family,
          friends,
          business,
          other: total - family - friends - business
        },
        recentlyUsed
      };
    } catch (error) {
      logger.error('Failed to get beneficiary stats', { error: error.message, userId });
      throw error;
    }
  }
}

module.exports = new BeneficiaryService();

