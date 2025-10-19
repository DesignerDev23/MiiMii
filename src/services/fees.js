const logger = require('../utils/logger');

class FeesService {
  constructor() {
    // Fee structure as specified by the user
    this.feeStructure = {
      // Incoming transfers to MiiMii wallet
      incomingTransfers: {
        freeThreshold: 500, // ₦0-₦500: free
        feePercentage: 0.005, // Above ₦1,000: 0.5% of amount
        minimumChargeable: 1000 // Below ₦1,000 but above ₦500 might have special handling
      },
      
      // MiiMii → MiiMii transfers: free
      internalTransfers: {
        fee: 0
      },
      
      // Bank transfers - Tiered fee structure
      bankTransfers: {
        tier1: { min: 0, max: 10000, fee: 15 },      // 0 - 10k = ₦15
        tier2: { min: 10000, max: 50000, fee: 25 },  // 10k - 50k = ₦25
        tier3: { min: 50000, max: Infinity, fee: 50 } // 50k+ = ₦50
      },
      
      // Maintenance fee
      maintenance: {
        monthlyFee: 50, // ₦50/month per user
        dayOfMonth: 1 // Charge on 1st of every month
      },
      
      // Data purchases
      dataPurchases: {
        additionalFee: 10 // Add ₦10 to every data purchase
      },
      
      // Other service fees
      airtime: {
        additionalFee: 10, // Add ₦10 markup on every airtime purchase
        percentage: 0
      },
      
      utilityBills: {
        electricity: {
          percentage: 0.015, // 1.5%
          minimum: 25,
          maximum: 500
        },
        cable: {
          percentage: 0.02, // 2%
          minimum: 25,
          maximum: 500
        },
        water: {
          percentage: 0.02, // 2%
          minimum: 25,
          maximum: 500
        },
        internet: {
          percentage: 0.02, // 2%
          minimum: 25,
          maximum: 500
        }
      },
      
      virtualCards: {
        creation: 1000,
        maintenance: 100,
        transaction: 0.015, // 1.5%
        maxTransactionFee: 1000
      }
    };
  }

  // Calculate incoming transfer fee - NO FEES for incoming transfers
  calculateIncomingTransferFee(amount) {
    const numAmount = parseFloat(amount);
    
    // All incoming transfers are free - users receive the full amount
    return {
      fee: 0,
      reason: 'Free incoming transfer - no fees charged',
      breakdown: {
        amount: numAmount,
        feePercentage: 0,
        calculatedFee: 0,
        finalFee: 0
      }
    };
  }

  // Calculate internal transfer fee (MiiMii to MiiMii)
  calculateInternalTransferFee(amount) {
    return {
      fee: 0,
      reason: 'Free MiiMii to MiiMii transfer',
      breakdown: {
        amount: parseFloat(amount),
        feePercentage: 0,
        calculatedFee: 0,
        finalFee: 0
      }
    };
  }

  // Calculate bank transfer fee (tiered)
  calculateBankTransferFee(amount) {
    const numAmount = parseFloat(amount);
    
    // Determine fee based on amount tiers
    let fee = 15; // Default to tier 1
    let tier = 'tier1';
    
    if (numAmount >= this.feeStructure.bankTransfers.tier3.min) {
      fee = this.feeStructure.bankTransfers.tier3.fee; // 50k+ = ₦50
      tier = 'tier3';
    } else if (numAmount >= this.feeStructure.bankTransfers.tier2.min) {
      fee = this.feeStructure.bankTransfers.tier2.fee; // 10k-50k = ₦25
      tier = 'tier2';
    } else {
      fee = this.feeStructure.bankTransfers.tier1.fee; // 0-10k = ₦15
      tier = 'tier1';
    }
    
    return {
      fee: fee,
      reason: `Tiered bank transfer fee (${tier})`,
      breakdown: {
        amount: numAmount,
        tier: tier,
        fee: fee,
        totalFee: fee
      }
    };
  }

  // Calculate airtime purchase fee
  calculateAirtimePurchaseFee(amount) {
    const baseAmount = parseFloat(amount);
    const additionalFee = this.feeStructure.airtime.additionalFee;
    
    return {
      fee: additionalFee,
      reason: 'Fixed markup on airtime purchases',
      breakdown: {
        amount: baseAmount,
        additionalFee,
        totalCost: baseAmount + additionalFee
      }
    };
  }

  // Calculate data purchase fee
  calculateDataPurchaseFee(amount) {
    const baseAmount = parseFloat(amount);
    const additionalFee = this.feeStructure.dataPurchases.additionalFee;
    
    return {
      fee: additionalFee,
      reason: 'Data purchase service fee',
      breakdown: {
        baseAmount,
        additionalFee,
        totalAmount: baseAmount + additionalFee
      }
    };
  }

  // Calculate airtime purchase fee
  calculateAirtimePurchaseFee(amount) {
    return {
      fee: this.feeStructure.airtime.fee,
      reason: 'Free airtime purchase',
      breakdown: {
        amount: parseFloat(amount),
        feePercentage: this.feeStructure.airtime.percentage,
        calculatedFee: 0,
        finalFee: 0
      }
    };
  }

  // Calculate utility bill payment fee
  calculateUtilityBillFee(amount, billType = 'electricity') {
    const numAmount = parseFloat(amount);
    const config = this.feeStructure.utilityBills[billType] || this.feeStructure.utilityBills.electricity;
    
    const calculatedFee = numAmount * config.percentage;
    const finalFee = Math.max(config.minimum, Math.min(calculatedFee, config.maximum));
    
    return {
      fee: finalFee,
      reason: `${billType} bill payment fee (${config.percentage * 100}%)`,
      breakdown: {
        amount: numAmount,
        feePercentage: config.percentage * 100,
        calculatedFee,
        minimumFee: config.minimum,
        maximumFee: config.maximum,
        finalFee
      }
    };
  }

  // Calculate virtual card transaction fee
  calculateVirtualCardFee(amount, feeType = 'transaction') {
    const numAmount = parseFloat(amount);
    
    switch (feeType) {
      case 'creation':
        return {
          fee: this.feeStructure.virtualCards.creation,
          reason: 'Virtual card creation fee',
          breakdown: {
            creationFee: this.feeStructure.virtualCards.creation
          }
        };
        
      case 'maintenance':
        return {
          fee: this.feeStructure.virtualCards.maintenance,
          reason: 'Virtual card monthly maintenance fee',
          breakdown: {
            maintenanceFee: this.feeStructure.virtualCards.maintenance
          }
        };
        
      case 'transaction':
        const calculatedFee = numAmount * this.feeStructure.virtualCards.transaction;
        const finalFee = Math.min(calculatedFee, this.feeStructure.virtualCards.maxTransactionFee);
        
        return {
          fee: finalFee,
          reason: 'Virtual card transaction fee (1.5%)',
          breakdown: {
            amount: numAmount,
            feePercentage: this.feeStructure.virtualCards.transaction * 100,
            calculatedFee,
            maxFee: this.feeStructure.virtualCards.maxTransactionFee,
            finalFee
          }
        };
        
      default:
        return { fee: 0, reason: 'Unknown fee type', breakdown: {} };
    }
  }

  // Get monthly maintenance fee
  getMonthlyMaintenanceFee() {
    return {
      fee: this.feeStructure.maintenance.monthlyFee,
      reason: 'Monthly account maintenance fee',
      breakdown: {
        monthlyFee: this.feeStructure.maintenance.monthlyFee,
        dayOfMonth: this.feeStructure.maintenance.dayOfMonth
      }
    };
  }

  // Calculate total transaction cost (amount + fees)
  calculateTotalTransactionCost(amount, serviceType, subType = null) {
    let feeCalculation;
    
    switch (serviceType) {
      case 'incoming_transfer':
        feeCalculation = this.calculateIncomingTransferFee(amount);
        break;
        
      case 'internal_transfer':
        feeCalculation = this.calculateInternalTransferFee(amount);
        break;
        
      case 'bank_transfer':
        feeCalculation = this.calculateBankTransferFee(amount);
        break;
        
      case 'data_purchase':
        feeCalculation = this.calculateDataPurchaseFee(amount);
        break;
        
      case 'airtime_purchase':
        feeCalculation = this.calculateAirtimePurchaseFee(amount);
        break;
        
      case 'utility_bill':
        feeCalculation = this.calculateUtilityBillFee(amount, subType);
        break;
        
      case 'virtual_card':
        feeCalculation = this.calculateVirtualCardFee(amount, subType);
        break;
        
      default:
        feeCalculation = { fee: 0, reason: 'Unknown service type', breakdown: {} };
    }
    
    return {
      baseAmount: parseFloat(amount),
      fee: feeCalculation.fee,
      totalAmount: parseFloat(amount) + feeCalculation.fee,
      feeDetails: feeCalculation
    };
  }

  // Get all fee structures for admin/user information
  getAllFeeStructures() {
    return {
      incomingTransfers: {
        description: 'Fees for incoming transfers to MiiMii wallet',
        rules: [
          '₦0 - ₦500: Free',
          '₦500 - ₦1,000: Free',
          'Above ₦1,000: 0.5% of amount'
        ]
      },
      internalTransfers: {
        description: 'MiiMii to MiiMii transfers',
        rules: ['Always free']
      },
      bankTransfers: {
        description: 'Bank transfers (tiered pricing)',
        rules: [
          '₦0 - ₦10,000: ₦15 fee',
          '₦10,000 - ₦50,000: ₦25 fee',
          '₦50,000+: ₦50 fee'
        ]
      },
      dataPurchases: {
        description: 'Data bundle purchases',
        rules: ['Additional ₦10 service fee']
      },
      airtimePurchases: {
        description: 'Airtime purchases',
        rules: ['Free service']
      },
      utilityBills: {
        description: 'Utility bill payments',
        rules: [
          'Electricity: 1.5% (min ₦25, max ₦500)',
          'Cable TV: 2% (min ₦25, max ₦500)',
          'Water: 2% (min ₦25, max ₦500)',
          'Internet: 2% (min ₦25, max ₦500)'
        ]
      },
      virtualCards: {
        description: 'Virtual card services',
        rules: [
          'Creation: ₦1,000',
          'Monthly maintenance: ₦100',
          'Transactions: 1.5% (max ₦1,000)'
        ]
      },
      maintenance: {
        description: 'Account maintenance',
        rules: ['₦50 per month (charged on 1st)']
      }
    };
  }

  // Validate fee calculation
  validateFeeCalculation(amount, serviceType, subType = null) {
    try {
      const calculation = this.calculateTotalTransactionCost(amount, serviceType, subType);
      return {
        valid: true,
        calculation
      };
    } catch (error) {
      logger.error('Fee calculation validation failed', { error: error.message, amount, serviceType, subType });
      return {
        valid: false,
        error: error.message
      };
    }
  }
}

module.exports = new FeesService();