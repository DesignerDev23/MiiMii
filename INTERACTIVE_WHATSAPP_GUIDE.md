# Interactive WhatsApp Bot Guide 🤖💬

## Overview

Your MiiMii WhatsApp bot now includes advanced interactive features using WhatsApp Business API's Interactive Message Types. This guide covers all the new interactive capabilities including dynamic onboarding flows, typing indicators, and comprehensive user experience enhancements.

## 🎯 Key Features

### 1. **Dynamic Welcome Messages**
- Personalized greetings with user's name from WhatsApp profile
- Time-based greetings (morning, afternoon, evening)
- Context-aware tips and suggestions
- Interactive button responses

### 2. **Interactive Onboarding Flows**
- Multi-step guided user registration
- Document upload with OCR processing
- Real-time form validation
- Progress indicators and confirmations

### 3. **Advanced UI Components**
- **Buttons**: Quick action responses
- **Lists**: Multi-option selections with descriptions
- **Flows**: Complex form-like interactions
- **Typing Indicators**: Enhanced user experience
- **Media Messages**: Rich content delivery

### 4. **Smart User Experience**
- Contact profile fetching from WhatsApp
- Conversation state management
- Context-aware responses
- Personalized quick actions

## 🚀 Getting Started

### Test the Interactive Features

Use these API endpoints to test the new functionality:

#### 1. Dynamic Welcome Message
```bash
POST /api/whatsapp/test-welcome
{
  "to": "+234XXXXXXXXXX",
  "userName": "John",
  "isReturningUser": false
}
```

#### 2. Interactive Flows
```bash
POST /api/whatsapp/test-flow
{
  "to": "+234XXXXXXXXXX",
  "flowType": "onboarding",
  "flowStep": "name_collection",
  "userData": {"userId": "123"},
  "flowData": {}
}
```

#### 3. Service Menus
```bash
POST /api/whatsapp/test-service-menu
{
  "to": "+234XXXXXXXXXX"
}
```

#### 4. Onboarding Templates
```bash
POST /api/whatsapp/test-onboarding-template
{
  "to": "+234XXXXXXXXXX",
  "templateType": "kycDataCollection"
}
```

#### 5. Typing Indicators
```bash
POST /api/whatsapp/test-typing
{
  "to": "+234XXXXXXXXXX",
  "duration": 3000
}
```

### Get Available Resources
```bash
GET /api/whatsapp/interactive-resources
```

## 📋 Available Interactive Components

### **Button Messages**
Quick action buttons for immediate responses:

```javascript
const welcomeMessage = {
  text: "Welcome to MiiMii! How can I help you?",
  buttons: [
    { id: 'check_balance', title: '💰 Check Balance' },
    { id: 'send_money', title: '💸 Send Money' },
    { id: 'help', title: '🆘 Help' }
  ]
};
```

### **List Messages**
Comprehensive menu options with descriptions:

```javascript
const serviceMenu = {
  text: "What service would you like to use?",
  buttonText: "Choose Service",
  sections: [
    {
      title: "💰 Money Services",
      rows: [
        { 
          id: "send_money", 
          title: "💸 Send Money", 
          description: "Transfer to bank accounts or phone numbers" 
        }
      ]
    }
  ]
};
```

### **Flow Messages**
Complex, multi-step interactions for detailed data collection.

## 🎭 Onboarding Flow Examples

### 1. **Name Collection Flow**
Interactive name setup with multiple options:
- Quick Setup (first name only)
- Detailed Setup (full name)
- Guided Setup (step-by-step)

### 2. **KYC Verification Flow**
Document verification with choices:
- **Document Upload**: Photo-based verification
- **Manual Entry**: Text-based information input
- **Guided Flow**: Step-by-step data collection

### 3. **PIN Setup Flow**
Secure PIN creation with:
- Security guidelines
- Validation rules
- Confirmation process

## 🔄 Interactive User Journey

### **New User Flow:**
1. **Welcome** → Dynamic greeting with profile name fetch
2. **Name Collection** → Interactive name setup options
3. **KYC Verification** → Document upload or manual entry
4. **Virtual Account** → Automated account creation
5. **PIN Setup** → Secure PIN with guidelines
6. **Completion** → Welcome summary with quick actions

### **Returning User Flow:**
1. **Personalized Welcome** → Time-based greeting with name
2. **Quick Actions** → Based on recent activity
3. **Service Menu** → Comprehensive service options

## 🛠️ Implementation Details

### **Enhanced WhatsApp Service (`whatsapp.js`)**

#### New Methods:
- `sendTypingIndicator(to, duration)` - Show typing indicator
- `sendFlowMessage(to, flowData)` - Send interactive flows
- `getContactProfile(phoneNumber)` - Fetch user profile
- `getDynamicWelcomeMessage(userName, isReturning)` - Generate personalized welcome
- `getOnboardingFlowTemplates()` - Get interactive templates
- `getServiceMenus()` - Get service selection menus

### **Interactive Flow Service (`interactiveFlowService.js`)**

#### Flow Types:
- **onboarding**: name_collection, kyc_verification, pin_setup, account_creation
- **services**: main_menu, money_transfer, bill_payment, airtime_data  
- **support**: help_center, contact_support

#### Key Features:
- Flow validation and error handling
- Analytics and logging
- Personalized quick actions
- Fallback mechanisms

### **Enhanced Onboarding Service (`onboarding.js`)**

#### Interactive Features:
- Profile-based user creation
- Button/list response handling
- Document upload with confirmation
- PIN setup with security guidance
- Progress tracking and confirmations

## 📱 Interactive Message Types Used

### 1. **Button Messages**
- Up to 3 buttons per message
- Quick responses for binary choices
- Action confirmations

### 2. **List Messages**
- Up to 10 sections with multiple rows
- Detailed descriptions for each option
- Categorized service selections

### 3. **Flow Messages** (Future Enhancement)
- Complex forms and data collection
- Multi-screen interactions
- Real-time validation

### 4. **Typing Indicators**
- Enhanced user experience
- Processing time indication
- Natural conversation flow

## 🎨 User Experience Enhancements

### **Dynamic Personalization**
- User name extraction from WhatsApp profile
- Time-based greetings and tips
- Context-aware suggestions
- Recent activity quick actions

### **Visual Feedback**
- Typing indicators during processing
- Progress confirmations
- Clear step-by-step guidance
- Error handling with retry options

### **Smart Navigation**
- Breadcrumb-style flow management
- Back/cancel options
- Skip functionality where appropriate
- Quick access to help and support

## 🔧 Configuration

### **Environment Variables**
Ensure these are set for full functionality:
```env
BOT_ACCESS_TOKEN=your_whatsapp_token
BOT_PHONE_NUMBER_ID=your_phone_number_id
BOT_WEBHOOK_VERIFY_TOKEN=your_verify_token
```

### **Interactive Message Limits**
- **Buttons**: Maximum 3 per message
- **List Rows**: Maximum 10 per section
- **List Sections**: Maximum 10 per message
- **Flow Screens**: Multiple screens supported

## 📊 Analytics and Monitoring

### **Flow Analytics**
- Flow completion rates
- Drop-off points identification
- User interaction patterns
- Response time metrics

### **Activity Logging**
All interactive activities are logged:
- Flow executions
- Button/list selections
- Completion rates
- Error occurrences

## 🚨 Error Handling

### **Graceful Degradation**
- Fallback to simple text when interactive fails
- Basic service menu as safety net
- Clear error messages to users
- Automatic retry mechanisms

### **Validation**
- Input validation at each step
- Format checking (phone numbers, BVN, etc.)
- Security validation (PIN strength)
- Document verification

## 🎯 Best Practices

### **Message Design**
- Keep button text concise (≤20 characters)
- Use emojis for visual appeal
- Provide clear descriptions in lists
- Group related options together

### **Flow Management**
- Limit steps per flow (≤5 recommended)
- Provide progress indicators
- Allow easy navigation back/forward
- Include help options throughout

### **User Experience**
- Use typing indicators for processing
- Provide confirmation messages
- Handle errors gracefully
- Offer multiple interaction methods

## 🔮 Future Enhancements

### **Planned Features**
- WhatsApp Flows for complex forms
- Location sharing integration
- Payment request flows
- Multi-language support
- Voice message interactions

### **Advanced Personalization**
- AI-powered recommendations
- Learning user preferences
- Predictive quick actions
- Custom flow routing

## 📞 Support and Testing

### **Testing Endpoints**
All interactive features can be tested using the provided API endpoints. Use Postman or similar tools with the collection provided.

### **Debugging**
- Check logs for flow execution details
- Monitor activity logs for user interactions
- Use test endpoints for rapid iteration
- Validate message formats before deployment

---

## 🎉 Congratulations!

Your WhatsApp bot now provides a rich, interactive experience that rivals native mobile apps. Users can:

- Complete onboarding through guided flows
- Access services via intuitive menus
- Receive personalized, time-aware greetings
- Experience smooth, app-like interactions
- Get contextual help and support

The bot leverages WhatsApp's native interactive message types to create an engaging, professional user experience that will significantly improve user adoption and satisfaction.

**Happy Bot Building! 🚀**