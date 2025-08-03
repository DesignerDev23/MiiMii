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
      
      // BellBank transfers
      bellBankTransfers: {
        bellBankFee: 20,
        platformFee: 5,
        totalFee: 25 // ₦25 total (₦20 BellBank + ₦5 platform fee)
      },
      
      // Maintenance fee
      maintenance: {
        monthlyFee: 100, // ₦100/month per user
        dayOfMonth: 1 // Charge on 1st of every month
      },
      
      // Data purchases
      dataPurchases: {
        additionalFee: 10 // Add ₦10 to every data purchase
      },
      
      // Other service fees
      airtime: {
        fee: 0, // Free airtime purchases
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

  // Calculate incoming transfer fee
  calculateIncomingTransferFee(amount) {
    const numAmount = parseFloat(amount);
    
    if (numAmount <= this.feeStructure.incomingTransfers.freeThreshold) {
      return {
        fee: 0,
        reason: 'Free transfer (₦0-₦500)',
        breakdown: {
          amount: numAmount,
          feePercentage: 0,
          calculatedFee: 0,
          finalFee: 0
        }
      };
    }
    
    if (numAmount >= this.feeStructure.incomingTransfers.minimumChargeable) {
      const calculatedFee = numAmount * this.feeStructure.incomingTransfers.feePercentage;
      return {
        fee: Math.ceil(calculatedFee), // Round up to nearest naira
        reason: `0.5% fee on amounts ≥₦1,000`,
        breakdown: {
          amount: numAmount,
          feePercentage: this.feeStructure.incomingTransfers.feePercentage * 100,
          calculatedFee,
          finalFee: Math.ceil(calculatedFee)
        }
      };
    }
    
    // Between ₦500 and ₦1,000 - you can decide if this should be free or have a small fee
    return {
      fee: 0,
      reason: 'Free transfer (₦500-₦1,000)',
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

  // Calculate BellBank transfer fee
  calculateBellBankTransferFee(amount) {
    return {
      fee: this.feeStructure.bellBankTransfers.totalFee,
      reason: 'Fixed BellBank transfer fee',
      breakdown: {
        amount: parseFloat(amount),
        bellBankFee: this.feeStructure.bellBankTransfers.bellBankFee,
        platformFee: this.feeStructure.bellBankTransfers.platformFee,
        totalFee: this.feeStructure.bellBankTransfers.totalFee
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
        
      case 'bellbank_transfer':
        feeCalculation = this.calculateBellBankTransferFee(amount);
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
      bellBankTransfers: {
        description: 'Bank transfers via BellBank',
        rules: ['Fixed ₦25 fee (₦20 BellBank + ₦5 platform)']
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
        rules: ['₦100 per month (charged on 1st)']
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