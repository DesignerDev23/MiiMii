# MiiMii.AI Development Guide

This guide is for developers working on the MiiMii.AI platform. It covers development setup, coding standards, and contribution guidelines.

## 🛠️ Development Setup

### Prerequisites
- Node.js 18.x or higher
- PostgreSQL 12.x or higher
- Git
- VS Code (recommended) or your preferred editor

### Local Development Setup

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd MiiMii
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   ```bash
   cp .env.example .env.development
   ```
   
   Configure your `.env.development` file:
   ```env
   # Database
   DATABASE_URL=postgresql://username:password@localhost:5432/miimii_dev
   
   # WhatsApp Business API (use test credentials)
   BOT_ACCESS_TOKEN=your_test_whatsapp_token
   BOT_PHONE_NUMBER_ID=your_test_phone_id
   WEBHOOK_SECRET=your_test_webhook_secret
   
   # OpenAI
   OPENAI_API_KEY=your_openai_api_key
   
   # Bilal API (use test environment)
   BILAL_BASE_URL=https://bilalsadasub.com/api
   BILAL_USERNAME=your_test_username
   BILAL_PASSWORD=your_test_password
   
   # BellBank API (use test environment)
   BANK_CONSUMER_KEY=your_test_consumer_key
   BANK_CONSUMER_SECRET=your_test_consumer_secret
   BANK_ENVIRONMENT=test
   
   # Server
   PORT=3000
   NODE_ENV=development
   ```

4. **Set up database**
   ```bash
   # Create development database
   createdb miimii_dev
   
   # Run migrations
   npm run db:migrate
   
   # Seed test data
   npm run db:seed
   ```

5. **Start development server**
   ```bash
   npm run dev
   ```

## 📁 Project Structure

```
src/
├── config/           # Configuration files
│   ├── database.js   # Database configuration
│   └── index.js      # Main config
├── models/           # Database models
│   ├── User.js       # User model
│   ├── Wallet.js     # Wallet model
│   ├── Transaction.js # Transaction model
│   └── ActivityLog.js # Activity logging
├── routes/           # API routes
│   ├── webhook.js    # Webhook endpoints
│   ├── user.js       # User endpoints
│   └── admin.js      # Admin endpoints
├── services/         # Business logic
│   ├── bilal.js      # Bilal API integration
│   ├── bellbank.js   # BellBank API integration
│   ├── whatsapp.js   # WhatsApp API integration
│   ├── receipt.js    # Receipt generation
│   └── aiAssistant.js # AI intent recognition
├── utils/            # Utility functions
│   ├── logger.js     # Logging configuration
│   ├── httpsAgent.js # HTTP client configuration
│   └── retryHelper.js # Retry logic
└── app.js           # Main application file
```

## 🏗️ Architecture Overview

### Service Layer Pattern
The application follows a service-oriented architecture:

```
Routes → Services → External APIs
   ↓         ↓           ↓
Models ← Database ← External Services
```

### Key Components

1. **Message Processor**: Handles incoming WhatsApp messages
2. **AI Assistant**: Processes natural language and extracts intent
3. **Service Layer**: Manages business logic and external API calls
4. **Model Layer**: Database operations and data validation

## 📝 Coding Standards

### JavaScript/Node.js Standards

1. **ES6+ Features**
   ```javascript
   // Use const/let instead of var
   const user = await getUser(id);
   let balance = 0;
   
   // Use arrow functions
   const processMessage = async (message) => {
     // implementation
   };
   
   // Use destructuring
   const { id, name, email } = user;
   ```

2. **Async/Await Pattern**
   ```javascript
   // Good
   async function processTransaction(data) {
     try {
       const result = await externalAPI.call(data);
       return result;
     } catch (error) {
       logger.error('Transaction failed', { error: error.message });
       throw error;
     }
   }
   
   // Avoid
   function processTransaction(data) {
     return externalAPI.call(data)
       .then(result => result)
       .catch(error => {
         logger.error('Transaction failed', { error: error.message });
         throw error;
       });
   }
   ```

3. **Error Handling**
   ```javascript
   // Always use try-catch for async operations
   try {
     const result = await riskyOperation();
     return result;
   } catch (error) {
     logger.error('Operation failed', { 
       error: error.message, 
       stack: error.stack,
       context: { userId, operation } 
     });
     throw new Error('User-friendly error message');
   }
   ```

### Database Standards

1. **Model Definitions**
   ```javascript
   const User = sequelize.define('User', {
     id: {
       type: DataTypes.UUID,
       defaultValue: DataTypes.UUIDV4,
       primaryKey: true
     },
     whatsappNumber: {
       type: DataTypes.STRING,
       allowNull: false,
       unique: true,
       validate: {
         is: /^\+234\d{10}$/
       }
     }
   }, {
     timestamps: true,
     paranoid: true // Soft deletes
   });
   ```

2. **Migrations**
   ```javascript
   module.exports = {
     up: async (queryInterface, Sequelize) => {
       await queryInterface.createTable('Users', {
         id: {
           type: Sequelize.UUID,
           defaultValue: Sequelize.UUIDV4,
           primaryKey: true
         },
         // ... other fields
         createdAt: {
           type: Sequelize.DATE,
           allowNull: false
         },
         updatedAt: {
           type: Sequelize.DATE,
           allowNull: false
         }
       });
     },
     down: async (queryInterface, Sequelize) => {
       await queryInterface.dropTable('Users');
     }
   };
   ```

### API Standards

1. **Response Format**
   ```javascript
   // Success response
   res.json({
     success: true,
     data: result,
     message: 'Operation completed successfully'
   });
   
   // Error response
   res.status(400).json({
     success: false,
     error: 'Validation failed',
     details: validationErrors
   });
   ```

2. **Input Validation**
   ```javascript
   const { body, validationResult } = require('express-validator');
   
   router.post('/transfer', [
     body('amount').isFloat({ min: 100, max: 1000000 }),
     body('accountNumber').isLength({ min: 10, max: 10 }),
     body('bankCode').isLength({ min: 3, max: 6 })
   ], async (req, res) => {
     const errors = validationResult(req);
     if (!errors.isEmpty()) {
       return res.status(400).json({ 
         success: false, 
         errors: errors.array() 
       });
     }
     // Process request
   });
   ```

## 🧪 Testing

### Running Tests
```bash
# Run all tests
npm test

# Run tests with coverage
npm run test:coverage

# Run specific test file
npm test -- --grep "User Service"

# Run tests in watch mode
npm run test:watch
```

### Writing Tests
```javascript
const { expect } = require('chai');
const sinon = require('sinon');
const userService = require('../services/user');

describe('User Service', () => {
  describe('createUser', () => {
    it('should create a new user successfully', async () => {
      // Arrange
      const userData = {
        whatsappNumber: '+2348012345678',
        firstName: 'John',
        lastName: 'Doe'
      };
      
      // Act
      const result = await userService.createUser(userData);
      
      // Assert
      expect(result).to.have.property('id');
      expect(result.whatsappNumber).to.equal(userData.whatsappNumber);
    });
    
    it('should throw error for invalid phone number', async () => {
      // Arrange
      const userData = {
        whatsappNumber: 'invalid',
        firstName: 'John',
        lastName: 'Doe'
      };
      
      // Act & Assert
      try {
        await userService.createUser(userData);
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error.message).to.include('Invalid phone number');
      }
    });
  });
});
```

## 🔧 Development Tools

### VS Code Extensions
- **ESLint**: JavaScript linting
- **Prettier**: Code formatting
- **Node.js Extension Pack**: Node.js development
- **PostgreSQL**: Database management
- **Thunder Client**: API testing

### VS Code Settings
```json
{
  "editor.formatOnSave": true,
  "editor.codeActionsOnSave": {
    "source.fixAll.eslint": true
  },
  "eslint.validate": ["javascript"],
  "prettier.singleQuote": true,
  "prettier.trailingComma": "es5"
}
```

### Git Hooks
```bash
# Install husky for git hooks
npm install --save-dev husky

# Add pre-commit hook
npx husky add .husky/pre-commit "npm run lint && npm test"
```

## 🚀 Development Workflow

### Feature Development

1. **Create feature branch**
   ```bash
   git checkout -b feature/new-feature
   ```

2. **Make changes**
   - Write code following coding standards
   - Add tests for new functionality
   - Update documentation if needed

3. **Test your changes**
   ```bash
   npm run lint
   npm test
   npm run test:coverage
   ```

4. **Commit changes**
   ```bash
   git add .
   git commit -m "feat: add new feature description"
   ```

5. **Push and create PR**
   ```bash
   git push origin feature/new-feature
   # Create pull request on GitHub
   ```

### Commit Message Convention
```
type(scope): description

feat: new feature
fix: bug fix
docs: documentation changes
style: formatting changes
refactor: code refactoring
test: adding tests
chore: maintenance tasks
```

### Code Review Process

1. **Self-review**
   - Check for typos and formatting
   - Ensure all tests pass
   - Verify functionality works as expected

2. **Peer review**
   - Request review from team members
   - Address feedback and suggestions
   - Update code as needed

3. **Merge**
   - Squash commits if needed
   - Merge to main branch
   - Delete feature branch

## 🐛 Debugging

### Local Debugging
```javascript
// Use debugger statement
debugger;

// Use console.log for quick debugging
console.log('Debug info:', { variable, context });

// Use logger for production debugging
logger.debug('Debug info', { variable, context });
```

### VS Code Debugging
Create `.vscode/launch.json`:
```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Debug MiiMii",
      "type": "node",
      "request": "launch",
      "program": "${workspaceFolder}/src/app.js",
      "envFile": "${workspaceFolder}/.env.development",
      "console": "integratedTerminal",
      "restart": true,
      "protocol": "inspector"
    }
  ]
}
```

### Database Debugging
```sql
-- Enable query logging
SET log_statement = 'all';

-- Check slow queries
SELECT query, mean_time, calls 
FROM pg_stat_statements 
ORDER BY mean_time DESC 
LIMIT 10;
```

## 📊 Performance Optimization

### Database Optimization
```javascript
// Use eager loading to avoid N+1 queries
const users = await User.findAll({
  include: [{
    model: Wallet,
    attributes: ['balance']
  }]
});

// Use transactions for multiple operations
const transaction = await sequelize.transaction();
try {
  await walletService.debitWallet(userId, amount, transaction);
  await transactionService.createTransaction(data, transaction);
  await transaction.commit();
} catch (error) {
  await transaction.rollback();
  throw error;
}
```

### Caching
```javascript
// Use Redis for caching
const cacheKey = `user:${userId}:balance`;
let balance = await redis.get(cacheKey);

if (!balance) {
  balance = await walletService.getBalance(userId);
  await redis.setex(cacheKey, 300, balance); // Cache for 5 minutes
}
```

### Memory Management
```javascript
// Use streams for large data processing
const fs = require('fs');
const csv = require('csv-parser');

fs.createReadStream('large-file.csv')
  .pipe(csv())
  .on('data', (row) => {
    // Process each row
  })
  .on('end', () => {
    console.log('CSV file processed');
  });
```

## 🔒 Security Best Practices

### Input Validation
```javascript
// Always validate and sanitize inputs
const { body, validationResult } = require('express-validator');

const validateTransfer = [
  body('amount').isFloat({ min: 100 }).withMessage('Invalid amount'),
  body('accountNumber').matches(/^\d{10}$/).withMessage('Invalid account number'),
  body('bankCode').isLength({ min: 3, max: 6 }).withMessage('Invalid bank code')
];
```

### Authentication & Authorization
```javascript
// Verify user permissions
const requireAuth = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
      return res.status(401).json({ error: 'No token provided' });
    }
    
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = await User.findByPk(decoded.userId);
    next();
  } catch (error) {
    res.status(401).json({ error: 'Invalid token' });
  }
};
```

### SQL Injection Prevention
```javascript
// Use parameterized queries
const user = await User.findOne({
  where: {
    whatsappNumber: phoneNumber // Sequelize handles escaping
  }
});

// Avoid raw queries unless necessary
const result = await sequelize.query(
  'SELECT * FROM users WHERE whatsapp_number = :phone',
  {
    replacements: { phone: phoneNumber },
    type: QueryTypes.SELECT
  }
);
```

## 📚 Documentation

### Code Documentation
```javascript
/**
 * Process a bank transfer request
 * @param {string} userId - The user ID making the transfer
 * @param {Object} transferData - Transfer details
 * @param {number} transferData.amount - Transfer amount
 * @param {string} transferData.accountNumber - Recipient account number
 * @param {string} transferData.bankCode - Recipient bank code
 * @param {string} pin - User's PIN for verification
 * @returns {Promise<Object>} Transfer result
 * @throws {Error} When transfer fails
 */
async function processBankTransfer(userId, transferData, pin) {
  // Implementation
}
```

### API Documentation
Use JSDoc or Swagger for API documentation:
```javascript
/**
 * @swagger
 * /api/transfer:
 *   post:
 *     summary: Process a bank transfer
 *     tags: [Transfer]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               amount:
 *                 type: number
 *                 minimum: 100
 *               accountNumber:
 *                 type: string
 *                 pattern: '^[0-9]{10}$'
 *     responses:
 *       200:
 *         description: Transfer successful
 *       400:
 *         description: Validation error
 */
```

## 🤝 Contributing

### Before Contributing
1. Read the coding standards
2. Set up development environment
3. Understand the architecture
4. Check existing issues and PRs

### Pull Request Guidelines
1. **Title**: Clear and descriptive
2. **Description**: Explain what and why, not how
3. **Tests**: Include tests for new features
4. **Documentation**: Update docs if needed
5. **Screenshots**: For UI changes

### Code Review Checklist
- [ ] Code follows style guidelines
- [ ] Tests are included and passing
- [ ] Documentation is updated
- [ ] No security vulnerabilities
- [ ] Performance impact considered
- [ ] Error handling is proper

## 📞 Getting Help

- **Documentation**: Check README.md and this guide
- **Issues**: Create GitHub issues for bugs
- **Discussions**: Use GitHub Discussions for questions
- **Team Chat**: Use team communication platform

## 🔄 Continuous Integration

The project uses GitHub Actions for CI/CD:

```yaml
name: CI
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - uses: actions/setup-node@v2
        with:
          node-version: '18'
      - run: npm ci
      - run: npm test
      - run: npm run lint
```

This ensures code quality and prevents broken builds from being merged.


