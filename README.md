# MiiMii.AI - WhatsApp Banking Assistant

A comprehensive WhatsApp-based banking and financial services platform that allows users to perform various financial transactions through WhatsApp messaging.

## 🚀 Features

### Core Banking Services
- **Bank Transfers**: Send money to any Nigerian bank account
- **Airtime Purchase**: Buy airtime for all major networks (MTN, Airtel, Glo, 9mobile)
- **Data Purchase**: Purchase data bundles for all networks
- **Bill Payments**: Pay electricity bills and other utilities
- **Wallet Management**: Check balance, view transaction history

### Advanced Features
- **AI-Powered Intent Recognition**: Automatically detects user intent from natural language
- **Receipt Generation**: Automatic generation of transaction receipts as images
- **Multi-Provider Integration**: Supports multiple payment providers (Bilal, BellBank)
- **Real-time Notifications**: Instant WhatsApp notifications for all transactions
- **Security**: PIN-based authentication for sensitive operations

## 🛠️ Technology Stack

- **Backend**: Node.js with Express.js
- **Database**: PostgreSQL with Sequelize ORM
- **AI/ML**: OpenAI GPT-4 for intent recognition
- **Payment Providers**: 
  - Bilal API (Airtime, Data, Electricity)
  - BellBank API (Bank Transfers)
- **WhatsApp Integration**: WhatsApp Business API
- **Image Generation**: Canvas.js for receipt generation

## 📋 Prerequisites

- Node.js 18.x or higher
- PostgreSQL 12.x or higher
- WhatsApp Business API access
- Bilal API credentials
- BellBank API credentials
- OpenAI API key

## 🚀 Installation

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
   Create a `.env` file in the root directory:
   ```env
   # Database
   DATABASE_URL=postgresql://username:password@localhost:5432/miimii_db
   
   # WhatsApp Business API
   BOT_ACCESS_TOKEN=your_whatsapp_access_token
   BOT_PHONE_NUMBER_ID=your_phone_number_id
   WEBHOOK_SECRET=your_webhook_secret
   
   # OpenAI
   OPENAI_API_KEY=your_openai_api_key
   
   # Bilal API
   BILAL_BASE_URL=https://bilalsadasub.com/api
   BILAL_USERNAME=your_bilal_username
   BILAL_PASSWORD=your_bilal_password
   
   # BellBank API
   BANK_CONSUMER_KEY=your_bellbank_consumer_key
   BANK_CONSUMER_SECRET=your_bellbank_consumer_secret
   BANK_ENVIRONMENT=production
   
   # Server
   PORT=3000
   NODE_ENV=production
   ```

4. **Set up the database**
   ```bash
   npm run db:migrate
   npm run db:seed
   ```

5. **Start the application**
   ```bash
   npm start
   ```

## 📁 Project Structure

```
MiiMii/
├── src/
│   ├── config/           # Configuration files
│   ├── models/           # Database models
│   ├── routes/           # API routes
│   ├── services/         # Business logic services
│   ├── utils/            # Utility functions
│   └── app.js           # Main application file
├── assets/
│   ├── fonts/           # Custom fonts (Outfit)
│   ├── images/          # Logo and images
│   └── templates/       # Receipt templates
├── Dockerfile           # Docker configuration
├── package.json
└── README.md
```

## 🔧 Configuration

### WhatsApp Business API Setup
1. Create a WhatsApp Business account
2. Set up a phone number
3. Configure webhook URL: `https://your-domain.com/webhook/whatsapp`
4. Add webhook verification token to environment variables

### Bilal API Setup
1. Register for Bilal API access
2. Get username and password credentials
3. Add credentials to environment variables

### BellBank API Setup
1. Register for BellBank API access
2. Get consumer key and secret
3. Add credentials to environment variables

## 📱 Usage

### User Commands

#### Bank Transfers
```
Send 1000 to 1234567890 GTBank John Doe
Transfer 500 to 9876543210 Access Bank
```

#### Airtime Purchase
```
Buy 100 airtime for 07035437910
Recharge 500 for 08123456789
```

#### Data Purchase
```
Buy 1GB data for 07035437910
Purchase 2000 worth of data
```

#### Balance & History
```
Check balance
Show transaction history
```

### Admin Commands
```
/help - Show available commands
/status - Check system status
```

## 🔒 Security Features

- **PIN Authentication**: All financial transactions require PIN verification
- **Rate Limiting**: Prevents abuse and spam
- **Input Validation**: Comprehensive validation for all inputs
- **Error Handling**: Secure error messages without exposing sensitive data
- **Logging**: Detailed logging for audit trails

## 📊 Transaction Limits

- **Minimum Transfer**: ₦100
- **Maximum Transfer**: ₦1,000,000
- **Daily Limit**: ₦5,000,000
- **Monthly Limit**: ₦50,000,000
- **Transfer Fee**: ₦25 (fixed)

## 🧾 Receipt Generation

The system automatically generates transaction receipts as images with:
- Company logo and branding
- Transaction details
- QR codes for verification
- Professional formatting
- WhatsApp-compatible format (JPEG)

## 🔄 API Endpoints

### Webhook Endpoints
- `POST /webhook/whatsapp` - WhatsApp webhook for incoming messages
- `POST /webhook/bellbank` - BellBank webhook for transfer updates

### User Endpoints
- `GET /api/user/balance` - Get user wallet balance
- `GET /api/user/transactions` - Get transaction history
- `POST /api/transfer` - Initiate bank transfer
- `POST /api/airtime` - Purchase airtime
- `POST /api/data` - Purchase data

## 🐳 Docker Deployment

1. **Build the image**
   ```bash
   docker build -t miimii-ai .
   ```

2. **Run the container**
   ```bash
   docker run -p 3000:3000 --env-file .env miimii-ai
   ```

## 🔍 Monitoring & Logging

The application includes comprehensive logging:
- Transaction logs
- Error tracking
- Performance metrics
- User activity logs

## 🛠️ Development

### Running in Development Mode
```bash
npm run dev
```

### Running Tests
```bash
npm test
```

### Database Migrations
```bash
npm run db:migrate
npm run db:rollback
```

## 📞 Support

For technical support or questions:
- **Phone**: +234 907 110 2959, +234 701 405 5875
- **Email**: contactcenter@chatmiimiiai.com
- **WhatsApp**: Send "help" to the bot

## 📄 License

This project is proprietary software. All rights reserved.

## 🔄 Changelog

### Version 2.0.0
- Added receipt generation for all transactions
- Fixed duplicate message issues
- Updated transfer fees to 25 naira
- Improved error handling
- Enhanced AI intent recognition

### Version 1.0.0
- Initial release with basic banking features
- WhatsApp integration
- Multi-provider support