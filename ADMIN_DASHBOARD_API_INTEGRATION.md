# 🎯 **Admin Dashboard Frontend Update - API Integration**

## 📋 **UPDATE YOUR EXISTING ADMIN DASHBOARD TO USE API**

Your admin dashboard is currently using hardcoded data. Here's how to update it to use the new API endpoints:

---

## 🔧 **1. UPDATE API ENDPOINTS**

### **Replace your existing API calls with these new endpoints:**

```javascript
// OLD (hardcoded data):
// const plans = HARDCODED_PLANS;

// NEW (API endpoints):
const API_ENDPOINTS = {
  // Get all data plans
  GET_PLANS: 'GET /api/data-plans',
  
  // Get single plan
  GET_PLAN: 'GET /api/data-plans/:id',
  
  // Create new plan
  CREATE_PLAN: 'POST /api/data-plans',
  
  // Update plan
  UPDATE_PLAN: 'PUT /api/data-plans/:id',
  
  // Delete plan
  DELETE_PLAN: 'DELETE /api/data-plans/:id',
  
  // Bulk update prices
  BULK_UPDATE_PRICES: 'PATCH /api/data-plans/bulk-prices'
};
```

---

## 📊 **2. UPDATE YOUR EXISTING JAVASCRIPT FUNCTIONS**

### **Replace your existing `loadDataPlans()` function:**

```javascript
// OLD: const plans = HARDCODED_PLANS;
// NEW: Use API
async function loadDataPlans() {
  try {
    const response = await fetch('/api/data-plans');
    const result = await response.json();
    
    if (result.success) {
      allPlans = result.data;
      filteredPlans = [...allPlans];
      renderPlansTable();
    } else {
      console.error('Failed to load plans:', result.message);
      alert('Failed to load data plans: ' + result.message);
    }
  } catch (error) {
    console.error('Error loading plans:', error);
    alert('Failed to load data plans: ' + error.message);
  }
}
```

### **Replace your existing `createPlan()` function:**

```javascript
// OLD: const newPlan = { ...planData, id: Date.now() };
// NEW: Use API
async function createPlan(planData) {
  try {
    const response = await fetch('/api/data-plans', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(planData)
    });
    
    const result = await response.json();
    
    if (result.success) {
      alert('Plan created successfully');
      loadDataPlans(); // Reload the table
    } else {
      alert('Failed to create plan: ' + result.message);
    }
  } catch (error) {
    console.error('Error creating plan:', error);
    alert('Failed to create plan: ' + error.message);
  }
}
```

### **Replace your existing `updatePlan()` function:**

```javascript
// OLD: const planIndex = allPlans.findIndex(p => p.id === planId);
// NEW: Use API
async function updatePlan(planId, updateData) {
  try {
    const response = await fetch(`/api/data-plans/${planId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updateData)
    });
    
    const result = await response.json();
    
    if (result.success) {
      alert('Plan updated successfully');
      loadDataPlans(); // Reload the table
    } else {
      alert('Failed to update plan: ' + result.message);
    }
  } catch (error) {
    console.error('Error updating plan:', error);
    alert('Failed to update plan: ' + error.message);
  }
}
```

### **Replace your existing `deletePlan()` function:**

```javascript
// OLD: allPlans = allPlans.filter(p => p.id !== planId);
// NEW: Use API
async function deletePlan(planId) {
  if (!confirm('Are you sure you want to delete this plan?')) return;

  try {
    const response = await fetch(`/api/data-plans/${planId}`, {
      method: 'DELETE'
    });
    
    const result = await response.json();
    
    if (result.success) {
      alert('Plan deleted successfully');
      loadDataPlans(); // Reload the table
    } else {
      alert('Failed to delete plan: ' + result.message);
    }
  } catch (error) {
    console.error('Error deleting plan:', error);
    alert('Failed to delete plan: ' + error.message);
  }
}
```

### **Replace your existing `bulkUpdatePrices()` function:**

```javascript
// OLD: selectedPlans.forEach(plan => { plan.sellingPrice *= 1.1; });
// NEW: Use API
async function bulkUpdatePrices() {
  const selectedCheckboxes = document.querySelectorAll('.plan-checkbox:checked');
  if (selectedCheckboxes.length === 0) {
    alert('Please select plans to update');
    return;
  }

  const priceIncrease = prompt('Enter price increase percentage (e.g., 10 for 10%):');
  if (!priceIncrease) return;

  const updates = Array.from(selectedCheckboxes).map(checkbox => ({
    planId: parseInt(checkbox.value),
    sellingPrice: parseFloat(priceIncrease)
  }));

  try {
    const response = await fetch('/api/data-plans/bulk-prices', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ updates })
    });
    
    const result = await response.json();
    
    if (result.success) {
      alert('Prices updated successfully');
      loadDataPlans(); // Reload the table
    } else {
      alert('Failed to update prices: ' + result.message);
    }
  } catch (error) {
    console.error('Error updating prices:', error);
    alert('Failed to update prices: ' + error.message);
  }
}
```

---

## 🎨 **3. UPDATE YOUR FORM SUBMISSION**

### **Replace your existing form submission:**

```javascript
// OLD: const newPlan = { ...formData, id: Date.now() };
// NEW: Use API
document.getElementById('planForm').addEventListener('submit', async function(e) {
  e.preventDefault();
  
  const formData = new FormData(this);
  const planData = {
    network: formData.get('network'),
    planType: formData.get('planType'),
    dataSize: formData.get('dataSize'),
    validity: formData.get('validity'),
    retailPrice: parseFloat(formData.get('retailPrice')),
    sellingPrice: parseFloat(formData.get('sellingPrice')),
    networkCode: parseInt(formData.get('networkCode')),
    apiPlanId: formData.get('apiPlanId') ? parseInt(formData.get('apiPlanId')) : null,
    description: formData.get('description')
  };
  
  await createPlan(planData);
  this.reset();
});
```

---

## 📱 **4. UPDATE YOUR TABLE RENDERING**

### **Update your existing `renderPlansTable()` function:**

```javascript
// OLD: plans.forEach(plan => { /* hardcoded display */ });
// NEW: Use API data structure
function renderPlansTable() {
  const tbody = document.getElementById('plansTableBody');
  tbody.innerHTML = '';

  filteredPlans.forEach(plan => {
    // Calculate margin
    const margin = plan.sellingPrice - plan.retailPrice;
    const marginClass = margin >= 0 ? 'margin-profit' : 'margin-loss';
    
    const row = `
      <tr>
        <td><input type="checkbox" class="plan-checkbox" value="${plan.id}"></td>
        <td><span class="network-badge ${plan.network.toLowerCase()}">${plan.network}</span></td>
        <td>${plan.dataSize}</td>
        <td>₦${plan.retailPrice.toLocaleString()}</td>
        <td>₦${plan.sellingPrice.toLocaleString()}</td>
        <td class="${marginClass}">₦${margin.toLocaleString()}</td>
        <td>${plan.validity || 'N/A'}</td>
        <td><span class="status-badge ${plan.isActive ? 'active' : 'inactive'}">${plan.isActive ? 'Active' : 'Inactive'}</span></td>
        <td>
          <button class="btn-primary" onclick="editPlan('${plan.id}')">Edit</button>
          <button class="btn-secondary" onclick="deletePlan('${plan.id}')">Delete</button>
        </td>
      </tr>
    `;
    tbody.innerHTML += row;
  });
}
```

---

## 🔧 **5. UPDATE YOUR EDIT FUNCTION**

### **Replace your existing edit function:**

```javascript
// OLD: const plan = allPlans.find(p => p.id === planId);
// NEW: Use API
async function editPlan(planId) {
  try {
    // Get current plan data
    const response = await fetch(`/api/data-plans/${planId}`);
    const result = await response.json();
    
    if (!result.success) {
      alert('Failed to load plan: ' + result.message);
      return;
    }
    
    const plan = result.data;
    
    // Show edit form with current values
    const newRetailPrice = prompt('Enter new retail price:', plan.retailPrice);
    const newSellingPrice = prompt('Enter new selling price:', plan.sellingPrice);
    
    if (newRetailPrice && newSellingPrice) {
      await updatePlan(planId, {
        retailPrice: parseFloat(newRetailPrice),
        sellingPrice: parseFloat(newSellingPrice)
      });
    }
  } catch (error) {
    console.error('Error editing plan:', error);
    alert('Failed to edit plan: ' + error.message);
  }
}
```

---

## 🎯 **6. ADD ERROR HANDLING**

### **Add this error handling to all your functions:**

```javascript
// Add this to handle API errors
function handleApiError(error, operation) {
  console.error(`Error ${operation}:`, error);
  
  if (error.response) {
    // Server responded with error status
    alert(`Failed to ${operation}: ${error.response.status} ${error.response.statusText}`);
  } else if (error.request) {
    // Request was made but no response received
    alert(`Failed to ${operation}: No response from server`);
  } else {
    // Something else happened
    alert(`Failed to ${operation}: ${error.message}`);
  }
}
```

---

## 🚀 **7. COMPLETE IMPLEMENTATION**

### **Replace your entire existing JavaScript with this:**

```javascript
// Global variables
let allPlans = [];
let filteredPlans = [];

// Load data plans from API
async function loadDataPlans() {
  try {
    const response = await fetch('/api/data-plans');
    const result = await response.json();
    
    if (result.success) {
      allPlans = result.data;
      filteredPlans = [...allPlans];
      renderPlansTable();
    } else {
      alert('Failed to load data plans: ' + result.message);
    }
  } catch (error) {
    handleApiError(error, 'load data plans');
  }
}

// Create new plan
async function createPlan(planData) {
  try {
    const response = await fetch('/api/data-plans', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(planData)
    });
    
    const result = await response.json();
    
    if (result.success) {
      alert('Plan created successfully');
      loadDataPlans();
    } else {
      alert('Failed to create plan: ' + result.message);
    }
  } catch (error) {
    handleApiError(error, 'create plan');
  }
}

// Update plan
async function updatePlan(planId, updateData) {
  try {
    const response = await fetch(`/api/data-plans/${planId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updateData)
    });
    
    const result = await response.json();
    
    if (result.success) {
      alert('Plan updated successfully');
      loadDataPlans();
    } else {
      alert('Failed to update plan: ' + result.message);
    }
  } catch (error) {
    handleApiError(error, 'update plan');
  }
}

// Delete plan
async function deletePlan(planId) {
  if (!confirm('Are you sure you want to delete this plan?')) return;

  try {
    const response = await fetch(`/api/data-plans/${planId}`, {
      method: 'DELETE'
    });
    
    const result = await response.json();
    
    if (result.success) {
      alert('Plan deleted successfully');
      loadDataPlans();
    } else {
      alert('Failed to delete plan: ' + result.message);
    }
  } catch (error) {
    handleApiError(error, 'delete plan');
  }
}

// Bulk update prices
async function bulkUpdatePrices() {
  const selectedCheckboxes = document.querySelectorAll('.plan-checkbox:checked');
  if (selectedCheckboxes.length === 0) {
    alert('Please select plans to update');
    return;
  }

  const priceIncrease = prompt('Enter price increase percentage (e.g., 10 for 10%):');
  if (!priceIncrease) return;

  const updates = Array.from(selectedCheckboxes).map(checkbox => ({
    planId: parseInt(checkbox.value),
    sellingPrice: parseFloat(priceIncrease)
  }));

  try {
    const response = await fetch('/api/data-plans/bulk-prices', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ updates })
    });
    
    const result = await response.json();
    
    if (result.success) {
      alert('Prices updated successfully');
      loadDataPlans();
    } else {
      alert('Failed to update prices: ' + result.message);
    }
  } catch (error) {
    handleApiError(error, 'update prices');
  }
}

// Error handling
function handleApiError(error, operation) {
  console.error(`Error ${operation}:`, error);
  alert(`Failed to ${operation}: ${error.message}`);
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', function() {
  loadDataPlans();
});
```

---

## 🎉 **READY TO IMPLEMENT!**

**Copy and paste the code above to replace your existing hardcoded data system with the new API integration!**

This will give you:
- ✅ **Real-time data** from the database
- ✅ **Full CRUD operations** via API
- ✅ **Error handling** for all operations
- ✅ **Bulk operations** for price updates
- ✅ **Automatic table refresh** after changes

Your admin dashboard will now be fully integrated with the database! 🚀
