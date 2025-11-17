const express = require('express');
const jwt = require('jsonwebtoken');
const { body, query, param, validationResult } = require('express-validator');
const { Transaction, ChatMessage } = require('../models');
const bcrypt = require('bcryptjs');
const userService = require('../services/user');
const walletService = require('../services/wallet');
const bankTransferService = require('../services/bankTransfer');
const airtimeService = require('../services/airtime');
const dataService = require('../services/data');
const utilityService = require('../services/utility');
const beneficiaryService = require('../services/beneficiary');
const kycService = require('../services/kyc');
const rubiesWalletService = require('../services/rubiesWalletService');
const mobileMessageProcessor = require('../services/mobileMessageProcessor');
const mobileAuth = require('../middleware/mobileAuth');
const logger = require('../utils/logger');

const router = express.Router();

const validateRequest = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  next();
};

const ensureJwtSecret = () => {
  if (!process.env.MOBILE_JWT_SECRET) {
    throw new Error('MOBILE_JWT_SECRET is not configured');
  }
  return process.env.MOBILE_JWT_SECRET;
};

const issueMobileToken = (user, expiresIn = '24h') => {
  const secret = ensureJwtSecret();
  return jwt.sign(
    {
      userId: user.id,
      phoneNumber: user.whatsappNumber,
      kycStatus: user.kycStatus,
      canTransact: user.canPerformTransactions()
    },
    secret,
    { expiresIn }
  );
};

const formatWalletSummary = (wallet) => ({
  id: wallet.id,
  balance: parseFloat(wallet.balance || 0),
  availableBalance: parseFloat(wallet.availableBalance || 0),
  ledgerBalance: parseFloat(wallet.ledgerBalance || 0),
  pendingBalance: parseFloat(wallet.pendingBalance || 0),
  currency: wallet.currency,
  isActive: wallet.isActive,
  isFrozen: wallet.isFrozen,
  virtualAccount: {
    accountNumber: wallet.virtualAccountNumber || wallet.rubiesAccountNumber || null,
    bank: wallet.virtualAccountBank || wallet.rubiesAccountBank || null,
    accountName: wallet.virtualAccountName || null
  },
  limits: {
    dailyLimit: parseFloat(wallet.dailyLimit || 0),
    dailySpent: parseFloat(wallet.dailySpent || 0),
    monthlyLimit: parseFloat(wallet.monthlyLimit || 0),
    monthlySpent: parseFloat(wallet.monthlySpent || 0)
  }
});

const buildUserProfile = async (user) => {
  const freshUser = await userService.getUserById(user.id);
  const wallet = await walletService.getUserWallet(user.id);

  return {
    id: freshUser.id,
    phoneNumber: freshUser.whatsappNumber,
    firstName: freshUser.firstName,
    lastName: freshUser.lastName,
    email: freshUser.email,
    kycStatus: freshUser.kycStatus,
    onboardingStep: freshUser.onboardingStep,
    isActive: freshUser.isActive,
    isBanned: freshUser.isBanned,
    hasPin: !!freshUser.pin,
    pinEnabled: freshUser.pinEnabled,
    canTransact: freshUser.canPerformTransactions(),
    createdAt: freshUser.createdAt,
    updatedAt: freshUser.updatedAt,
    lastSeen: freshUser.lastSeen,
    wallet: formatWalletSummary(wallet)
  };
};

const ONBOARDING_FLOW = [
  'initial',
  'greeting',
  'name_collection',
  'address_collection',
  'profile_setup',
  'bvn_collection',
  'kyc_submission',
  'virtual_account_creation',
  'pin_setup',
  'completed'
];

const buildRequirementFlags = (user, wallet) => ({
  profile: Boolean(user.firstName && user.lastName && user.address),
  kyc: Boolean(user.bvn && user.gender && user.dateOfBirth && user.kycStatus && user.kycStatus !== 'not_required' && user.kycStatus !== 'incomplete'),
  virtualAccount: Boolean(wallet.virtualAccountNumber || wallet.rubiesAccountNumber),
  pin: Boolean(user.pin)
});

const determineNextStep = (flags) => {
  if (!flags.profile) return 'profile_setup';
  if (!flags.kyc) return 'kyc_submission';
  if (!flags.virtualAccount) return 'virtual_account_creation';
  if (!flags.pin) return 'pin_setup';
  return 'completed';
};

const setOnboardingStepIfAhead = async (user, targetStep) => {
  if (!targetStep) return user;
  const currentStep = user.onboardingStep || 'initial';
  const currentIndex = ONBOARDING_FLOW.indexOf(currentStep);
  const targetIndex = ONBOARDING_FLOW.indexOf(targetStep);

  if (targetIndex === -1) {
    return user;
  }

  if (currentIndex === -1 || targetIndex > currentIndex || (targetStep === 'completed' && currentStep !== 'completed')) {
    await user.update({ onboardingStep: targetStep });
    await user.reload();
  }

  return user;
};

const buildOnboardingStatusPayload = (user, wallet, flags, nextStep) => ({
  currentStep: user.onboardingStep,
  nextStep,
  stepsCompleted: {
    profile: flags.profile,
    kyc: flags.kyc,
    virtualAccount: flags.virtualAccount,
    pin: flags.pin
  },
  virtualAccount: flags.virtualAccount ? {
    accountNumber: wallet.virtualAccountNumber || wallet.rubiesAccountNumber,
    bank: wallet.virtualAccountBank || 'Rubies MFB',
    accountName: wallet.virtualAccountName || `${user.firstName || ''} ${user.lastName || ''}`.trim()
  } : null
});

const getOnboardingOverview = async (userId) => {
  const user = await userService.getUserById(userId);
  const wallet = await walletService.getUserWallet(userId);
  const flags = buildRequirementFlags(user, wallet);
  const nextStep = determineNextStep(flags);
  const updatedUser = await setOnboardingStepIfAhead(user, nextStep);
  const status = buildOnboardingStatusPayload(updatedUser, wallet, flags, nextStep);

  return {
    user: updatedUser,
    wallet,
    status
  };
};

const respondWithAuthPayload = async (res, user, message = 'Authentication successful') => {
  const token = issueMobileToken(user);
  const overview = await getOnboardingOverview(user.id);
  const profile = await buildUserProfile(overview.user);
  return res.json({
    success: true,
    message,
    token,
    expiresIn: '24h',
    user: profile,
    onboarding: overview.status
  });
};

// ===== Auth Routes =====
router.post('/auth/signup',
  body('email').isEmail().normalizeEmail(),
  body('password').isLength({ min: 6 }),
  body('phoneNumber').optional().isMobilePhone('any'),
  body('firstName').optional().isString().trim(),
  body('lastName').optional().isString().trim(),
  validateRequest,
  async (req, res) => {
    try {
      const { email, password, phoneNumber, firstName, lastName } = req.body;
      const normalizedEmail = email.toLowerCase();

      const existing = await userService.findByAppEmail(normalizedEmail);
      if (existing) {
        return res.status(409).json({ error: 'Email already registered' });
      }

      let user;
      if (phoneNumber) {
        user = await userService.getOrCreateUser(phoneNumber, null, { registrationSource: 'app' });
      } else {
        user = await userService.createUser({
          whatsappNumber: null,
          registrationSource: 'app'
        });
      }

      const updates = { appEmail: normalizedEmail };
      if (firstName) updates.firstName = firstName;
      if (lastName) updates.lastName = lastName;

      const passwordHash = await bcrypt.hash(password, 12);
      updates.appPasswordHash = passwordHash;

      await userService.updateUser(user.id, updates);

      const initialStep = (firstName && lastName && updates.address) ? 'kyc_submission' : 'profile_setup';
      user = await setOnboardingStepIfAhead(user, initialStep);

      return await respondWithAuthPayload(res, user, 'Signup successful');
    } catch (error) {
      logger.error('Mobile signup failed', { error: error.message, email: req.body.email });
      const status = error.message.includes('Email already registered') ? 409 : 500;
      return res.status(status).json({ error: error.message });
    }
  }
);

router.post('/auth/login',
  body('email').isEmail().normalizeEmail(),
  body('password').isString(),
  validateRequest,
  async (req, res) => {
    try {
      const { email, password } = req.body;
      const normalizedEmail = email.toLowerCase();
      const user = await userService.findByAppEmail(normalizedEmail);

      if (!user || !user.appPasswordHash) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      if (user.appLockUntil && user.appLockUntil > new Date()) {
        return res.status(403).json({ error: 'Account temporarily locked. Please try again later.' });
      }

      const matches = await bcrypt.compare(password, user.appPasswordHash);
      if (!matches) {
        await userService.incrementAppLoginAttempts(user.id);
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      await userService.resetAppLoginAttempts(user.id);
      await user.update({ appLastLoginAt: new Date() });

      return await respondWithAuthPayload(res, user, 'Login successful');
    } catch (error) {
      logger.warn('Mobile login failed', { error: error.message, email: req.body.email });
      return res.status(500).json({ error: error.message });
    }
  }
);

router.post('/auth/refresh', mobileAuth, async (req, res) => {
  try {
    return await respondWithAuthPayload(res, req.user, 'Token refreshed');
  } catch (error) {
    logger.error('Token refresh failed', { error: error.message, userId: req.user.id });
    return res.status(500).json({ error: error.message });
  }
});

// ===== Password Reset =====
router.post('/auth/forgot-password',
  body('email').isEmail().normalizeEmail(),
  validateRequest,
  async (req, res) => {
    try {
      const { email } = req.body;
      const normalizedEmail = email.toLowerCase();

      const result = await userService.generatePasswordResetToken(normalizedEmail);

      // In production, send email with reset link
      // For now, return success message (token is in response for testing)
      // TODO: Integrate with email service to send reset link
      // Example: await emailService.sendPasswordResetEmail(normalizedEmail, result.resetToken);

      return res.json({
        success: true,
        message: result.message
        // In production, remove resetToken from response
        // resetToken: result.resetToken // Only for development/testing
      });
    } catch (error) {
      logger.error('Forgot password failed', { error: error.message, email: req.body.email });
      return res.status(500).json({ error: 'Failed to process password reset request' });
    }
  }
);

router.post('/auth/verify-reset-token',
  body('token').isString().trim().notEmpty(),
  validateRequest,
  async (req, res) => {
    try {
      const { token } = req.body;
      const verification = await userService.verifyPasswordResetToken(token);

      if (!verification.valid) {
        return res.status(400).json({ error: verification.error || 'Invalid or expired token' });
      }

      return res.json({
        success: true,
        message: 'Token is valid',
        email: verification.user.appEmail // Return masked email for confirmation
      });
    } catch (error) {
      logger.error('Verify reset token failed', { error: error.message });
      return res.status(500).json({ error: 'Failed to verify token' });
    }
  }
);

router.post('/auth/reset-password',
  body('token').isString().trim().notEmpty(),
  body('newPassword').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
  validateRequest,
  async (req, res) => {
    try {
      const { token, newPassword } = req.body;

      const result = await userService.resetPasswordWithToken(token, newPassword);

      return res.json({
        success: true,
        message: result.message
      });
    } catch (error) {
      logger.error('Reset password failed', { error: error.message });
      return res.status(400).json({ error: error.message || 'Failed to reset password' });
    }
  }
);

// ===== Chat (In-App Bot) =====
router.post('/chat/send',
  mobileAuth,
  body('message').isString().trim().notEmpty(),
  validateRequest,
  async (req, res) => {
    try {
      const { message } = req.body;
      const result = await mobileMessageProcessor.sendMessage(req.user, message);

      return res.json({
        success: true,
        reply: result.botMessage.content,
        intent: result.intent,
        meta: {
          userMessageId: result.userMessage.id,
          botMessageId: result.botMessage.id
        }
      });
    } catch (error) {
      logger.error('Mobile chat send failed', { error: error.message, userId: req.user.id });
      return res.status(400).json({ error: error.message });
    }
  }
);

router.get('/chat/history',
  mobileAuth,
  query('limit').optional().isInt({ min: 1, max: 200 }),
  query('before').optional().isISO8601(),
  validateRequest,
  async (req, res) => {
    try {
      const limit = parseInt(req.query.limit, 10) || 50;
      const before = req.query.before || null;
      const messages = await mobileMessageProcessor.getHistory(req.user.id, { limit, before });

      return res.json({
        success: true,
        messages: messages.map(m => ({
          id: m.id,
          role: m.role,
          content: m.content,
          createdAt: m.createdAt,
          metadata: m.metadata
        }))
      });
    } catch (error) {
      logger.error('Mobile chat history failed', { error: error.message, userId: req.user.id });
      return res.status(500).json({ error: 'Failed to fetch chat history' });
    }
  }
);

// ===== Profile & Wallet =====
router.get('/me', mobileAuth, async (req, res) => {
  try {
    const profile = await buildUserProfile(req.user);
    return res.json({ success: true, user: profile });
  } catch (error) {
    logger.error('Failed to fetch profile', { error: error.message, userId: req.user.id });
    return res.status(500).json({ error: 'Failed to fetch profile' });
  }
});

router.put('/me',
  mobileAuth,
  body('firstName').optional().isString().trim(),
  body('lastName').optional().isString().trim(),
  body('middleName').optional().isString().trim(),
  body('email').optional().isEmail(),
  body('dateOfBirth').optional().isISO8601(),
  body('gender').optional().isIn(['male', 'female']),
  body('address').optional().isString().trim(),
  validateRequest,
  async (req, res) => {
    try {
      if (Object.keys(req.body).length === 0) {
        return res.status(400).json({ error: 'No update fields supplied' });
      }

      const updatedUser = await userService.updateUser(req.user.id, req.body);
      const profile = await buildUserProfile(updatedUser);
      return res.json({ success: true, message: 'Profile updated', user: profile });
    } catch (error) {
      logger.error('Failed to update profile', { error: error.message, userId: req.user.id });
      return res.status(500).json({ error: error.message });
    }
  }
);

router.post('/onboarding/profile',
  mobileAuth,
  body('firstName').optional().isString().trim(),
  body('lastName').optional().isString().trim(),
  body('middleName').optional().isString().trim(),
  body('address').optional().isString().trim(),
  body('email').optional().isEmail(),
  validateRequest,
  async (req, res) => {
    try {
      const { firstName, lastName, middleName, address, email } = req.body;

      if (!firstName && !lastName && !address) {
        return res.status(400).json({ error: 'Provide at least firstName, lastName, or address' });
      }

      const updates = {};
      if (firstName) updates.firstName = firstName;
      if (lastName) updates.lastName = lastName;
      if (middleName !== undefined) updates.middleName = middleName;
      if (address) updates.address = address;
      if (email) updates.email = email;

      await userService.updateUser(req.user.id, updates);

      const overview = await getOnboardingOverview(req.user.id);
      return res.json({
        success: true,
        message: 'Profile information captured',
        onboarding: overview.status
      });
    } catch (error) {
      logger.error('Failed to capture onboarding profile', { error: error.message, userId: req.user.id });
      return res.status(500).json({ error: 'Failed to capture profile information' });
    }
  }
);

router.get('/me/wallet', mobileAuth, async (req, res) => {
  try {
    const wallet = await walletService.getUserWallet(req.user.id);
    return res.json({ success: true, wallet: formatWalletSummary(wallet) });
  } catch (error) {
    logger.error('Failed to fetch wallet', { error: error.message, userId: req.user.id });
    return res.status(500).json({ error: 'Failed to fetch wallet' });
  }
});

router.get('/onboarding/status', mobileAuth, async (req, res) => {
  try {
    const overview = await getOnboardingOverview(req.user.id);
    return res.json({
      success: true,
      onboarding: overview.status
    });
  } catch (error) {
    logger.error('Failed to fetch onboarding status', { error: error.message, userId: req.user.id });
    return res.status(500).json({ error: 'Failed to fetch onboarding status' });
  }
});

router.get('/me/transactions',
  mobileAuth,
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 100 }),
  query('type').optional().isIn(['credit', 'debit']),
  query('category').optional().isString(),
  query('status').optional().isIn(['pending', 'processing', 'completed', 'failed']),
  validateRequest,
  async (req, res) => {
    try {
      const page = parseInt(req.query.page, 10) || 1;
      const limit = parseInt(req.query.limit, 10) || 20;
      const offset = (page - 1) * limit;

      const where = { userId: req.user.id };
      if (req.query.type) where.type = req.query.type;
      if (req.query.category) where.category = req.query.category;
      if (req.query.status) where.status = req.query.status;

      const { rows, count } = await Transaction.findAndCountAll({
        where,
        order: [['createdAt', 'DESC']],
        limit,
        offset
      });

      const transactions = rows.map(tx => ({
        reference: tx.reference,
        type: tx.type,
        category: tx.category,
        amount: parseFloat(tx.amount),
        fee: parseFloat(tx.fee || 0),
        totalAmount: parseFloat(tx.totalAmount || tx.amount),
        status: tx.status,
        description: tx.description,
        recipientDetails: tx.recipientDetails,
        metadata: tx.metadata,
        createdAt: tx.createdAt,
        processedAt: tx.processedAt
      }));

      return res.json({
        success: true,
        pagination: {
          page,
          limit,
          total: count,
          pages: Math.ceil(count / limit)
        },
        transactions
      });
    } catch (error) {
      logger.error('Failed to fetch transactions', { error: error.message, userId: req.user.id });
      return res.status(500).json({ error: 'Failed to fetch transactions' });
    }
  }
);

router.get('/me/transactions/:reference',
  mobileAuth,
  param('reference').notEmpty(),
  validateRequest,
  async (req, res) => {
    try {
      const transaction = await Transaction.findOne({
        where: { reference: req.params.reference, userId: req.user.id }
      });

      if (!transaction) {
        return res.status(404).json({ error: 'Transaction not found' });
      }

      return res.json({
        success: true,
        transaction: {
          reference: transaction.reference,
          type: transaction.type,
          category: transaction.category,
          amount: parseFloat(transaction.amount),
          fee: parseFloat(transaction.fee || 0),
          totalAmount: parseFloat(transaction.totalAmount || transaction.amount),
          status: transaction.status,
          description: transaction.description,
          recipientDetails: transaction.recipientDetails,
          metadata: transaction.metadata,
          createdAt: transaction.createdAt,
          processedAt: transaction.processedAt
        }
      });
    } catch (error) {
      logger.error('Failed to fetch transaction details', { error: error.message, reference: req.params.reference });
      return res.status(500).json({ error: 'Failed to fetch transaction details' });
    }
  }
);

// ===== PIN Management =====
router.post('/me/pin/change',
  mobileAuth,
  body('currentPin').isLength({ min: 4, max: 4 }).isNumeric(),
  body('newPin').isLength({ min: 4, max: 4 }).isNumeric(),
  body('confirmPin').isLength({ min: 4, max: 4 }).isNumeric(),
  validateRequest,
  async (req, res) => {
    try {
      const { currentPin, newPin, confirmPin } = req.body;
      if (newPin !== confirmPin) {
        return res.status(400).json({ error: 'New PIN and confirm PIN do not match' });
      }

      await userService.validateUserPin(req.user.id, currentPin);
      await userService.setUserPin(req.user.id, newPin);

      return res.json({ success: true, message: 'PIN updated successfully' });
    } catch (error) {
      logger.error('Failed to change PIN', { error: error.message, userId: req.user.id });
      const status = error.message?.includes('PIN') ? 400 : 500;
      return res.status(status).json({ error: error.message });
    }
  }
);

router.post('/onboarding/pin',
  mobileAuth,
  body('pin').isLength({ min: 4, max: 4 }).isNumeric(),
  body('confirmPin').isLength({ min: 4, max: 4 }).isNumeric(),
  body('currentPin').optional().isLength({ min: 4, max: 4 }).isNumeric(),
  validateRequest,
  async (req, res) => {
    try {
      const { pin, confirmPin, currentPin } = req.body;

      if (pin !== confirmPin) {
        return res.status(400).json({ error: 'PIN and confirm PIN do not match' });
      }

      const user = await userService.getUserById(req.user.id);
      if (user.pin) {
        if (!currentPin) {
          return res.status(400).json({ error: 'Current PIN is required to update existing PIN' });
        }
        await userService.validateUserPin(user.id, currentPin);
      }

      await userService.setUserPin(user.id, pin);
      await user.update({ pinEnabled: true });

      const overview = await getOnboardingOverview(req.user.id);
      return res.json({
        success: true,
        message: 'PIN set successfully',
        onboarding: overview.status
      });
    } catch (error) {
      logger.error('Failed to set onboarding PIN', { error: error.message, userId: req.user.id });
      return res.status(400).json({ error: error.message });
    }
  }
);

router.post('/onboarding/kyc',
  mobileAuth,
  body('dateOfBirth').isISO8601(),
  body('gender').isIn(['male', 'female']),
  body('address').optional().isString().trim(),
  body('bvn').isLength({ min: 11, max: 11 }).isNumeric(),
  body('firstName').optional().isString().trim(),
  body('lastName').optional().isString().trim(),
  body('middleName').optional().isString().trim(),
  validateRequest,
  async (req, res) => {
    try {
      const { dateOfBirth, gender, address, bvn, firstName, lastName, middleName } = req.body;
      const user = await userService.getUserById(req.user.id);

      const kycPayload = {
        firstName: firstName || user.firstName,
        lastName: lastName || user.lastName,
        middleName: middleName || user.middleName,
        dateOfBirth,
        gender,
        address: address || user.address,
        bvn
      };

      if (!kycPayload.firstName || !kycPayload.lastName) {
        return res.status(400).json({ error: 'First name and last name are required for KYC' });
      }

      if (!kycPayload.address) {
        return res.status(400).json({ error: 'Residential address is required for KYC' });
      }

      const reference = await kycService.startKycProcess(
        user,
        user.whatsappNumber || user.phoneNumber || user.whatsappNumber,
        kycPayload
      );

      let walletCreated = false;
      const currentWallet = await walletService.getUserWallet(user.id);
      if (!currentWallet.virtualAccountNumber && !currentWallet.rubiesAccountNumber) {
        const creation = await rubiesWalletService.createRubiesWallet(user.id);
        walletCreated = creation.success;
        if (!creation.success) {
          logger.warn('Auto virtual account creation failed after KYC', {
            userId: user.id,
            error: creation.error || creation.message
          });
        }
      } else {
        walletCreated = true;
      }

      if (walletCreated) {
        await setOnboardingStepIfAhead(user, 'pin_setup');
      }

      const overview = await getOnboardingOverview(req.user.id);

      return res.json({
        success: true,
        message: 'KYC submitted successfully',
        reference: reference.reference,
        onboarding: overview.status,
        virtualAccount: overview.status.virtualAccount
      });
    } catch (error) {
      logger.error('KYC submission failed (mobile)', { error: error.message, userId: req.user.id });
      return res.status(400).json({ error: error.message });
    }
  }
);

// ===== Banks & Transfers =====
router.get('/banks', mobileAuth, async (req, res) => {
  try {
    const banks = await bankTransferService.getSupportedBanks();
    return res.json({ success: true, banks });
  } catch (error) {
    logger.error('Failed to fetch banks', { error: error.message });
    return res.status(500).json({ error: 'Failed to fetch banks' });
  }
});

router.post('/transfers/validate-account',
  mobileAuth,
  body('accountNumber').isLength({ min: 8, max: 11 }).isNumeric(),
  body('bankCode').notEmpty(),
  validateRequest,
  async (req, res) => {
    try {
      const { accountNumber, bankCode } = req.body;
      const validation = await bankTransferService.validateBankAccount(accountNumber, bankCode);
      return res.json({ success: true, account: validation });
    } catch (error) {
      logger.error('Account validation failed', { error: error.message, userId: req.user.id });
      return res.status(400).json({ error: error.message });
    }
  }
);

router.get('/transfers/limits', mobileAuth, async (req, res) => {
  try {
    const limits = await bankTransferService.getTransferLimits(req.user.id);
    return res.json({ success: true, limits });
  } catch (error) {
    logger.error('Failed to fetch transfer limits', { error: error.message, userId: req.user.id });
    return res.status(500).json({ error: 'Failed to fetch transfer limits' });
  }
});

router.get('/transfers/recent', mobileAuth, async (req, res) => {
  try {
    const recipients = await bankTransferService.getRecentBeneficiaries(req.user.id);
    return res.json({ success: true, recipients });
  } catch (error) {
    logger.error('Failed to fetch recent beneficiaries', { error: error.message, userId: req.user.id });
    return res.status(500).json({ error: 'Failed to fetch recipients' });
  }
});

router.post('/transfers',
  mobileAuth,
  body('amount').isFloat({ min: 100 }),
  body('accountNumber').isLength({ min: 8, max: 11 }).isNumeric(),
  body('bankCode').notEmpty(),
  body('pin').isLength({ min: 4, max: 4 }).isNumeric(),
  body('narration').optional().isString().trim(),
  body('reference').optional().isString().trim(),
  validateRequest,
  async (req, res) => {
    try {
      const { pin, ...transferData } = req.body;
      const result = await bankTransferService.processBankTransfer(req.user.id, transferData, pin);

      return res.json({
        success: true,
        message: 'Transfer initiated successfully',
        transfer: result
      });
    } catch (error) {
      logger.error('Bank transfer failed (mobile)', {
        error: error.message,
        userId: req.user.id,
        accountNumber: req.body.accountNumber
      });
      return res.status(400).json({ error: error.message });
    }
  }
);

router.post('/onboarding/virtual-account',
  mobileAuth,
  async (req, res) => {
    try {
      const wallet = await walletService.getUserWallet(req.user.id);
      if (wallet.virtualAccountNumber || wallet.rubiesAccountNumber) {
        const overview = await getOnboardingOverview(req.user.id);
        return res.json({
          success: true,
          message: 'Virtual account already exists',
          virtualAccount: overview.status.virtualAccount,
          onboarding: overview.status
        });
      }

      const creation = await rubiesWalletService.createRubiesWallet(req.user.id);
      if (!creation.success) {
        throw new Error(creation.message || creation.error || 'Failed to create virtual account');
      }

      const overview = await getOnboardingOverview(req.user.id);
      return res.json({
        success: true,
        message: creation.message || 'Virtual account created successfully',
        virtualAccount: overview.status.virtualAccount,
        onboarding: overview.status
      });
    } catch (error) {
      logger.error('Virtual account creation failed (mobile)', { error: error.message, userId: req.user.id });
      return res.status(400).json({ error: error.message });
    }
  }
);

// ===== Airtime =====
router.get('/airtime/networks', mobileAuth, async (req, res) => {
  try {
    const networks = await airtimeService.getNetworks();
    const limits = await airtimeService.getAirtimeLimits();
    return res.json({ success: true, networks, limits });
  } catch (error) {
    logger.error('Failed to fetch airtime metadata', { error: error.message });
    return res.status(500).json({ error: 'Failed to fetch airtime metadata' });
  }
});

router.post('/airtime/purchase',
  mobileAuth,
  body('phoneNumber').isMobilePhone('any'),
  body('network').isIn(['mtn', 'airtel', 'glo', '9mobile', 'MTN', 'AIRTEL', 'GLO', '9MOBILE']),
  body('amount').isFloat({ min: 50 }),
  body('pin').isLength({ min: 4, max: 4 }).isNumeric(),
  validateRequest,
  async (req, res) => {
    try {
      const { phoneNumber, network, amount, pin } = req.body;
      const result = await airtimeService.purchaseAirtime(req.user.id, phoneNumber, network, amount, pin);
      return res.json({ success: true, purchase: result });
    } catch (error) {
      logger.error('Airtime purchase failed', { error: error.message, userId: req.user.id });
      return res.status(400).json({ error: error.message });
    }
  }
);

// ===== Data =====
router.get('/data/plans',
  mobileAuth,
  query('network').isIn(['mtn', 'airtel', 'glo', '9mobile', 'MTN', 'AIRTEL', 'GLO', '9MOBILE']),
  validateRequest,
  async (req, res) => {
    try {
      const network = req.query.network.toUpperCase();
      const plans = await dataService.getDataPlans(network);
      return res.json({ success: true, plans });
    } catch (error) {
      logger.error('Failed to fetch data plans', { error: error.message, userId: req.user.id });
      return res.status(400).json({ error: error.message });
    }
  }
);

router.post('/data/purchase',
  mobileAuth,
  body('phoneNumber').isMobilePhone('any'),
  body('network').isIn(['mtn', 'airtel', 'glo', '9mobile', 'MTN', 'AIRTEL', 'GLO', '9MOBILE']),
  body('planId').notEmpty(),
  body('pin').isLength({ min: 4, max: 4 }).isNumeric(),
  validateRequest,
  async (req, res) => {
    try {
      const { phoneNumber, network, planId, pin } = req.body;
      const result = await dataService.purchaseData(req.user.id, phoneNumber, network, planId, pin);
      return res.json({ success: true, purchase: result });
    } catch (error) {
      logger.error('Data purchase failed', { error: error.message, userId: req.user.id });
      return res.status(400).json({ error: error.message });
    }
  }
);

// ===== Bills / Utilities =====
router.get('/bills/categories', mobileAuth, async (req, res) => {
  try {
    const categories = await utilityService.getUtilityCategories();
    return res.json({ success: true, categories });
  } catch (error) {
    logger.error('Failed to fetch utility categories', { error: error.message });
    return res.status(500).json({ error: 'Failed to fetch utility categories' });
  }
});

router.get('/bills/providers/:category',
  mobileAuth,
  param('category').notEmpty(),
  validateRequest,
  async (req, res) => {
    try {
      const providers = await utilityService.getProviders(req.params.category);
      return res.json({ success: true, providers });
    } catch (error) {
      logger.error('Failed to fetch providers', { error: error.message, category: req.params.category });
      return res.status(400).json({ error: error.message });
    }
  }
);

router.get('/bills/cable/:provider/plans',
  mobileAuth,
  param('provider').notEmpty(),
  validateRequest,
  async (req, res) => {
    try {
      const plans = await utilityService.getCablePlans(req.params.provider);
      return res.json({ success: true, plans });
    } catch (error) {
      logger.error('Failed to fetch cable plans', { error: error.message, provider: req.params.provider });
      return res.status(400).json({ error: error.message });
    }
  }
);

router.post('/bills/validate',
  mobileAuth,
  body('category').notEmpty(),
  body('provider').notEmpty(),
  body('customerNumber').notEmpty(),
  validateRequest,
  async (req, res) => {
    try {
      const { category, provider, customerNumber } = req.body;
      const validation = await utilityService.validateCustomer(category, provider, customerNumber);
      return res.json({ success: true, customer: validation });
    } catch (error) {
      logger.error('Customer validation failed', { error: error.message, userId: req.user.id });
      return res.status(400).json({ error: error.message });
    }
  }
);

router.post('/bills/pay',
  mobileAuth,
  body('category').notEmpty(),
  body('provider').notEmpty(),
  body('customerNumber').notEmpty(),
  body('amount').isFloat({ min: 100 }),
  body('pin').isLength({ min: 4, max: 4 }).isNumeric(),
  body('planId').optional().isString(),
  validateRequest,
  async (req, res) => {
    try {
      const { category, provider, customerNumber, amount, pin, planId } = req.body;
      const payment = await utilityService.payBill(req.user.id, category, provider, customerNumber, amount, pin, planId);
      return res.json({ success: true, payment });
    } catch (error) {
      logger.error('Utility payment failed', { error: error.message, userId: req.user.id });
      return res.status(400).json({ error: error.message });
    }
  }
);

// ===== Beneficiaries =====
router.get('/beneficiaries',
  mobileAuth,
  query('limit').optional().isInt({ min: 1, max: 100 }),
  query('category').optional().isString(),
  validateRequest,
  async (req, res) => {
    try {
      const beneficiaries = await beneficiaryService.getUserBeneficiaries(req.user.id, {
        limit: parseInt(req.query.limit, 10) || 50,
        category: req.query.category || null
      });

      return res.json({ success: true, beneficiaries });
    } catch (error) {
      logger.error('Failed to fetch beneficiaries', { error: error.message, userId: req.user.id });
      return res.status(500).json({ error: 'Failed to fetch beneficiaries' });
    }
  }
);

router.post('/beneficiaries',
  mobileAuth,
  body('name').notEmpty(),
  body('accountNumber').optional().isLength({ min: 8, max: 11 }).isNumeric(),
  body('bankCode').optional().isString(),
  body('bankName').optional().isString(),
  body('phoneNumber').optional().isMobilePhone('any'),
  body('nickname').optional().isString(),
  validateRequest,
  async (req, res) => {
    try {
      const { name, accountNumber, bankCode, bankName, phoneNumber, nickname } = req.body;

      if (!accountNumber && !phoneNumber) {
        return res.status(400).json({ error: 'Provide either accountNumber or phoneNumber' });
      }

      const beneficiary = await beneficiaryService.autoSaveBeneficiary(req.user.id, {
        accountNumber,
        bankCode,
        bankName,
        recipientName: name,
        phoneNumber,
        amount: 0
      }, nickname || null);

      return res.json({ success: true, beneficiary });
    } catch (error) {
      logger.error('Failed to create beneficiary', { error: error.message, userId: req.user.id });
      return res.status(400).json({ error: error.message });
    }
  }
);

router.patch('/beneficiaries/:id',
  mobileAuth,
  param('id').isUUID(),
  body('nickname').optional().isString(),
  body('category').optional().isString(),
  body('notes').optional().isString(),
  body('isFavorite').optional().isBoolean(),
  validateRequest,
  async (req, res) => {
    try {
      const beneficiary = await beneficiaryService.updateBeneficiary(req.user.id, req.params.id, req.body);
      return res.json({ success: true, beneficiary });
    } catch (error) {
      logger.error('Failed to update beneficiary', { error: error.message, userId: req.user.id });
      return res.status(400).json({ error: error.message });
    }
  }
);

router.delete('/beneficiaries/:id',
  mobileAuth,
  param('id').isUUID(),
  validateRequest,
  async (req, res) => {
    try {
      await beneficiaryService.deleteBeneficiary(req.user.id, req.params.id);
      return res.json({ success: true, message: 'Beneficiary removed' });
    } catch (error) {
      logger.error('Failed to remove beneficiary', { error: error.message, userId: req.user.id });
      return res.status(400).json({ error: error.message });
    }
  }
);

module.exports = router;

