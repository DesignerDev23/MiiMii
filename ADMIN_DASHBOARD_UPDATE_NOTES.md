# 📊 Admin Dashboard Update Notes

## 🎯 **New Data Plans Management System**

### **What's New:**
✅ **Database-driven data plans** (no more hardcoded plans)  
✅ **Retail vs Selling price control** (set custom profit margins)  
✅ **Complete CRUD operations** for plan management  
✅ **Bulk price updates** for efficiency  
✅ **Network filtering** and plan organization  

---

## 🔧 **New API Endpoints**

### **Base URL:** `/api/data-plans`

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/data-plans` | Get all plans with pagination |
| `GET` | `/api/data-plans/network/:network` | Get plans by network |
| `GET` | `/api/data-plans/:planId` | Get specific plan |
| `POST` | `/api/data-plans` | Create new plan |
| `PUT` | `/api/data-plans/:planId` | Update plan |
| `DELETE` | `/api/data-plans/:planId` | Delete plan (soft delete) |
| `PATCH` | `/api/data-plans/bulk-prices` | Bulk update selling prices |

---

## 📱 **Admin Dashboard Features to Add**

### **1. Data Plans Management Page**

#### **URL:** `/admin/data-plans`

#### **Features:**
- **📋 Plans List** - Paginated table with all data plans
- **🔍 Search & Filter** - By network, plan type, status
- **✏️ Edit Prices** - Click to edit selling prices inline
- **➕ Add New Plan** - Create custom data plans
- **🗑️ Delete Plans** - Soft delete with confirmation
- **📊 Bulk Actions** - Select multiple plans for bulk operations

#### **Table Columns:**
```
Network | Plan Type | Data Size | Validity | Retail Price | Selling Price | Margin | Status | Actions
```

#### **Actions:**
- **Edit** - Modify plan details
- **Delete** - Soft delete plan
- **Duplicate** - Create copy of plan
- **Toggle Status** - Activate/deactivate

---

### **2. Price Management**

#### **Bulk Price Update:**
```javascript
// API Call
PATCH /api/data-plans/bulk-prices
{
  "updates": [
    { "planId": "uuid1", "sellingPrice": 600.00 },
    { "planId": "uuid2", "sellingPrice": 800.00 }
  ]
}
```

#### **Individual Price Edit:**
```javascript
// API Call
PUT /api/data-plans/:planId
{
  "sellingPrice": 550.00
}
```

---

### **3. Plan Creation Form**

#### **Fields:**
```javascript
{
  "network": "MTN",                    // Dropdown: MTN, AIRTEL, GLO, 9MOBILE
  "planType": "SME",                   // Dropdown: SME, COOPERATE GIFTING, GIFTING
  "dataSize": "1GB",                   // Text input
  "validity": "30 days",               // Text input
  "retailPrice": 490.00,               // Number input
  "sellingPrice": 550.00,              // Number input
  "networkCode": 1,                    // Number input (auto-filled based on network)
  "apiPlanId": 37,                     // Number input (optional)
  "description": "1GB data plan"       // Textarea (optional)
}
```

---

## 🎨 **UI Components to Build**

### **1. Data Plans Table Component**
```jsx
<DataPlansTable
  plans={plans}
  onEdit={handleEdit}
  onDelete={handleDelete}
  onBulkUpdate={handleBulkUpdate}
  filters={{
    network: 'MTN',
    planType: 'SME',
    isActive: true
  }}
/>
```

### **2. Price Editor Component**
```jsx
<PriceEditor
  plan={selectedPlan}
  onSave={handlePriceUpdate}
  onCancel={handleCancel}
/>
```

### **3. Plan Form Component**
```jsx
<PlanForm
  plan={editingPlan}
  onSubmit={handleSubmit}
  onCancel={handleCancel}
  networks={['MTN', 'AIRTEL', 'GLO', '9MOBILE']}
  planTypes={['SME', 'COOPERATE GIFTING', 'GIFTING']}
/>
```

### **4. Bulk Actions Component**
```jsx
<BulkActions
  selectedPlans={selectedPlans}
  onBulkPriceUpdate={handleBulkPriceUpdate}
  onBulkDelete={handleBulkDelete}
  onBulkStatusChange={handleBulkStatusChange}
/>
```

---

## 📊 **Dashboard Statistics**

### **Add to Admin Dashboard Home:**

#### **Data Plans Overview:**
```javascript
// API Endpoints to create
GET /api/data-plans/stats
// Returns:
{
  "totalPlans": 25,
  "activePlans": 23,
  "inactivePlans": 2,
  "plansByNetwork": {
    "MTN": 11,
    "AIRTEL": 7,
    "GLO": 5,
    "9MOBILE": 2
  },
  "totalRevenue": 125000,
  "averageMargin": 15.5
}
```

#### **Cards to Display:**
- **📊 Total Plans** - Total number of data plans
- **✅ Active Plans** - Currently active plans
- **💰 Total Revenue** - Revenue from data sales
- **📈 Average Margin** - Average profit margin
- **📱 Plans by Network** - Breakdown by network

---

## 🔄 **Migration Notes**

### **What Changed:**
1. **Data Source** - From hardcoded to database
2. **Pricing** - Now supports retail vs selling prices
3. **Management** - Full CRUD operations available
4. **Caching** - Plans are now database-driven

### **Backward Compatibility:**
- ✅ **Existing API calls** still work
- ✅ **WhatsApp flow** unchanged
- ✅ **User experience** improved (no more "undefined")

---

## 🚀 **Implementation Steps**

### **Phase 1: Basic Management**
1. ✅ Create data plans table (already done)
2. ✅ Seed initial plans (already done)
3. 🔄 Build plans list page
4. 🔄 Add edit functionality
5. 🔄 Add delete functionality

### **Phase 2: Advanced Features**
1. 🔄 Bulk price updates
2. 🔄 Plan creation form
3. 🔄 Network filtering
4. 🔄 Search functionality
5. 🔄 Export/Import plans

### **Phase 3: Analytics**
1. 🔄 Revenue tracking
2. 🔄 Margin analysis
3. 🔄 Popular plans
4. 🔄 Performance metrics

---

## 📝 **Sample API Calls**

### **Get All Plans:**
```bash
GET /api/data-plans?page=1&limit=50&network=MTN&isActive=true
```

### **Create New Plan:**
```bash
POST /api/data-plans
{
  "network": "MTN",
  "planType": "SME",
  "dataSize": "1GB",
  "validity": "30 days",
  "retailPrice": 490.00,
  "sellingPrice": 550.00,
  "networkCode": 1,
  "apiPlanId": 37
}
```

### **Update Plan Price:**
```bash
PUT /api/data-plans/:planId
{
  "sellingPrice": 600.00
}
```

### **Bulk Price Update:**
```bash
PATCH /api/data-plans/bulk-prices
{
  "updates": [
    { "planId": "uuid1", "sellingPrice": 600.00 },
    { "planId": "uuid2", "sellingPrice": 800.00 }
  ]
}
```

---

## ✅ **Ready for Implementation**

The backend is **100% complete** with:
- ✅ Database schema
- ✅ API endpoints
- ✅ Service layer
- ✅ Initial data seeding
- ✅ Self-healing table creation

**Next:** Build the admin dashboard frontend using these API endpoints! 🚀
