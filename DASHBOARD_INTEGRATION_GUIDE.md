# Dashboard Integration Quick Guide

## 🚀 Quick Start

### 1. Authentication
First, get your admin token:

```javascript
const login = async () => {
  const response = await fetch('https://chatmiimii.com/api/admin/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'admin@example.com',
      password: 'your_password'
    })
  });
  
  const data = await response.json();
  localStorage.setItem('adminToken', data.token);
  return data.token;
};
```

---

## 📊 Data Plans Management

### Display Data Plans Page

```javascript
// Component: DataPlansManagement.jsx

import React, { useState, useEffect } from 'react';

const DataPlansManagement = () => {
  const [plans, setPlans] = useState({});
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  
  const token = localStorage.getItem('adminToken');

  // Fetch cached plans on load
  useEffect(() => {
    fetchPlans();
  }, []);

  const fetchPlans = async (network = null, refresh = false) => {
    setLoading(true);
    try {
      let url = 'https://chatmiimii.com/api/admin/data-plans';
      const params = new URLSearchParams();
      
      if (network) params.append('network', network);
      if (refresh) params.append('refresh', 'true');
      
      if (params.toString()) url += `?${params.toString()}`;
      
      const response = await fetch(url, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      const data = await response.json();
      setPlans(data.plans);
    } catch (error) {
      console.error('Failed to fetch plans:', error);
      alert('Failed to fetch data plans');
    } finally {
      setLoading(false);
    }
  };

  const syncPlans = async () => {
    setSyncing(true);
    try {
      const response = await fetch('https://chatmiimii.com/api/admin/data-plans/sync', {
        method: 'POST',
        headers: { 
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      
      const data = await response.json();
      alert(`✅ Synced ${data.data.totalPlans} plans from Bilal dashboard!`);
      
      // Refresh plans list
      await fetchPlans();
    } catch (error) {
      console.error('Failed to sync plans:', error);
      alert('❌ Failed to sync plans');
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="data-plans-page">
      <div className="header">
        <h1>Data Plans Management</h1>
        <div className="actions">
          <button 
            onClick={() => fetchPlans(null, true)} 
            disabled={loading}
          >
            {loading ? 'Refreshing...' : '🔄 Refresh Plans'}
          </button>
          <button 
            onClick={syncPlans} 
            disabled={syncing}
            className="primary"
          >
            {syncing ? 'Syncing...' : '⬇️ Sync from Bilal'}
          </button>
        </div>
      </div>

      <div className="network-tabs">
        {['MTN', 'AIRTEL', 'GLO', '9MOBILE'].map(network => (
          <button 
            key={network}
            onClick={() => fetchPlans(network)}
          >
            {network} ({plans[network]?.length || 0})
          </button>
        ))}
      </div>

      <div className="plans-grid">
        {Object.entries(plans).map(([network, networkPlans]) => (
          <div key={network} className="network-section">
            <h2>{network}</h2>
            <table>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Size</th>
                  <th>Price</th>
                  <th>Validity</th>
                  <th>Type</th>
                </tr>
              </thead>
              <tbody>
                {networkPlans.map(plan => (
                  <tr key={plan.id}>
                    <td>{plan.id}</td>
                    <td>{plan.size}</td>
                    <td>₦{plan.price.toLocaleString()}</td>
                    <td>{plan.validity}</td>
                    <td>
                      <span className="badge">{plan.type}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </div>
    </div>
  );
};

export default DataPlansManagement;
```

---

## 👥 Enhanced Users List

### Display Users with New Fields

```javascript
// Component: UsersManagement.jsx

import React, { useState, useEffect } from 'react';

const UsersManagement = () => {
  const [users, setUsers] = useState([]);
  const [pagination, setPagination] = useState({});
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState({
    page: 1,
    limit: 20,
    search: '',
    kycStatus: ''
  });
  
  const token = localStorage.getItem('adminToken');

  useEffect(() => {
    fetchUsers();
  }, [filters]);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      Object.entries(filters).forEach(([key, value]) => {
        if (value) params.append(key, value);
      });
      
      const response = await fetch(
        `https://chatmiimii.com/api/admin/users?${params.toString()}`,
        {
          headers: { 'Authorization': `Bearer ${token}` }
        }
      );
      
      const data = await response.json();
      setUsers(data.users);
      setPagination(data.pagination);
    } catch (error) {
      console.error('Failed to fetch users:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="users-page">
      <div className="header">
        <h1>Users Management</h1>
        <input
          type="text"
          placeholder="Search by name or phone..."
          value={filters.search}
          onChange={(e) => setFilters({...filters, search: e.target.value, page: 1})}
        />
      </div>

      <div className="filters">
        <select 
          value={filters.kycStatus}
          onChange={(e) => setFilters({...filters, kycStatus: e.target.value, page: 1})}
        >
          <option value="">All KYC Status</option>
          <option value="verified">Verified</option>
          <option value="pending">Pending</option>
          <option value="incomplete">Incomplete</option>
          <option value="not_required">Not Required</option>
        </select>
      </div>

      <table className="users-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>WhatsApp</th>
            <th>Balance</th>
            <th>Virtual Account</th>
            <th>BVN Status</th>
            <th>Onboarding</th>
            <th>Status</th>
            <th>Created</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {users.map(user => (
            <tr key={user.id}>
              <td>{user.name}</td>
              <td>{user.whatsappNumber}</td>
              <td>₦{user.balance.toLocaleString()}</td>
              <td>
                {user.virtualAccountNumber ? (
                  <div className="virtual-account">
                    <div>{user.virtualAccountNumber}</div>
                    <small>{user.virtualAccountBank}</small>
                  </div>
                ) : (
                  <span className="text-muted">No account</span>
                )}
              </td>
              <td>
                {user.bvnVerified ? (
                  <span className="badge success">
                    ✓ Verified
                  </span>
                ) : (
                  <span className="badge warning">
                    Not Verified
                  </span>
                )}
              </td>
              <td>
                <span className={`badge ${user.onboardingStep === 'completed' ? 'success' : 'info'}`}>
                  {user.onboardingStep}
                </span>
              </td>
              <td>
                {user.isActive && !user.isBanned ? (
                  <span className="badge success">Active</span>
                ) : user.isBanned ? (
                  <span className="badge danger">Banned</span>
                ) : (
                  <span className="badge warning">Inactive</span>
                )}
              </td>
              <td>{new Date(user.createdAt).toLocaleDateString()}</td>
              <td>
                <button onClick={() => viewUserDetails(user.id)}>
                  View
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="pagination">
        <button 
          disabled={pagination.page === 1}
          onClick={() => setFilters({...filters, page: pagination.page - 1})}
        >
          Previous
        </button>
        <span>
          Page {pagination.page} of {pagination.pages}
        </span>
        <button 
          disabled={pagination.page === pagination.pages}
          onClick={() => setFilters({...filters, page: pagination.page + 1})}
        >
          Next
        </button>
      </div>
    </div>
  );
};
```

---

## 🎨 CSS Styling Examples

```css
/* Data Plans Styling */
.data-plans-page {
  padding: 20px;
}

.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

.actions button {
  margin-left: 10px;
  padding: 10px 20px;
  border: none;
  border-radius: 5px;
  cursor: pointer;
}

.actions button.primary {
  background: #4CAF50;
  color: white;
}

.network-tabs {
  display: flex;
  gap: 10px;
  margin-bottom: 20px;
}

.network-tabs button {
  padding: 10px 20px;
  border: 1px solid #ddd;
  background: white;
  cursor: pointer;
  border-radius: 5px;
}

.network-tabs button:hover {
  background: #f5f5f5;
}

.plans-grid table {
  width: 100%;
  border-collapse: collapse;
  margin-bottom: 30px;
}

.plans-grid th,
.plans-grid td {
  padding: 12px;
  text-align: left;
  border-bottom: 1px solid #ddd;
}

.plans-grid th {
  background: #f5f5f5;
  font-weight: bold;
}

.badge {
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 500;
}

.badge.success {
  background: #d4edda;
  color: #155724;
}

.badge.info {
  background: #d1ecf1;
  color: #0c5460;
}

.badge.warning {
  background: #fff3cd;
  color: #856404;
}

.badge.danger {
  background: #f8d7da;
  color: #721c24;
}

/* Users Table Styling */
.users-table {
  width: 100%;
  border-collapse: collapse;
  background: white;
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
}

.users-table th {
  background: #f8f9fa;
  padding: 15px;
  text-align: left;
  font-weight: 600;
  color: #495057;
  border-bottom: 2px solid #dee2e6;
}

.users-table td {
  padding: 15px;
  border-bottom: 1px solid #dee2e6;
}

.virtual-account {
  display: flex;
  flex-direction: column;
}

.virtual-account small {
  color: #6c757d;
  font-size: 11px;
}

.pagination {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 20px;
  margin-top: 20px;
}

.pagination button {
  padding: 8px 16px;
  border: 1px solid #ddd;
  background: white;
  cursor: pointer;
  border-radius: 4px;
}

.pagination button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
```

---

## 🔔 Real-time Updates (Optional)

### Auto-refresh Plans Every Hour

```javascript
useEffect(() => {
  // Initial fetch
  fetchPlans();
  
  // Auto-refresh every hour
  const interval = setInterval(() => {
    fetchPlans(null, true);
  }, 60 * 60 * 1000); // 1 hour
  
  return () => clearInterval(interval);
}, []);
```

---

## 📱 Responsive Design Tips

```css
/* Mobile Responsive */
@media (max-width: 768px) {
  .header {
    flex-direction: column;
    gap: 10px;
  }
  
  .actions {
    width: 100%;
  }
  
  .actions button {
    width: 100%;
    margin: 5px 0;
  }
  
  .network-tabs {
    flex-wrap: wrap;
  }
  
  .users-table {
    font-size: 12px;
  }
  
  .users-table th,
  .users-table td {
    padding: 8px;
  }
}
```

---

## 🛠️ Error Handling

```javascript
const apiCall = async (url, options = {}) => {
  try {
    const response = await fetch(url, {
      ...options,
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('adminToken')}`,
        'Content-Type': 'application/json',
        ...options.headers
      }
    });
    
    if (!response.ok) {
      if (response.status === 401) {
        // Unauthorized - redirect to login
        localStorage.removeItem('adminToken');
        window.location.href = '/admin/login';
        return;
      }
      
      const error = await response.json();
      throw new Error(error.error || 'API request failed');
    }
    
    return await response.json();
  } catch (error) {
    console.error('API Error:', error);
    throw error;
  }
};
```

---

## 📊 Dashboard Cards

```javascript
const DashboardCards = () => {
  const [stats, setStats] = useState({
    totalPlans: 0,
    totalUsers: 0,
    activeUsers: 0,
    totalBalance: 0
  });

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    const [plansData, dashboardData] = await Promise.all([
      apiCall('https://chatmiimii.com/api/admin/data-plans'),
      apiCall('https://chatmiimii.com/api/admin/dashboard')
    ]);
    
    setStats({
      totalPlans: plansData.totalPlans,
      totalUsers: dashboardData.overview.totalUsers,
      activeUsers: dashboardData.overview.activeUsers,
      totalBalance: dashboardData.overview.totalVolume
    });
  };

  return (
    <div className="dashboard-cards">
      <div className="card">
        <h3>Total Plans</h3>
        <p className="value">{stats.totalPlans}</p>
      </div>
      <div className="card">
        <h3>Total Users</h3>
        <p className="value">{stats.totalUsers}</p>
      </div>
      <div className="card">
        <h3>Active Users</h3>
        <p className="value">{stats.activeUsers}</p>
      </div>
      <div className="card">
        <h3>Total Volume</h3>
        <p className="value">₦{stats.totalBalance.toLocaleString()}</p>
      </div>
    </div>
  );
};
```

---

## ✅ Testing Checklist

- [ ] Login and get admin token
- [ ] Fetch all data plans
- [ ] Sync data plans from Bilal
- [ ] Filter plans by network
- [ ] Refresh plans
- [ ] View users list
- [ ] Search users
- [ ] Filter users by KYC status
- [ ] View user details with virtual account
- [ ] Check pagination works
- [ ] Test error handling
- [ ] Test on mobile devices

---

## 🚀 Deploy

Remember to update environment variables:

```env
BILAL_BASE_URL=https://legitdataway.com/api
PROVIDER_USERNAME=your_username
PROVIDER_PASSWORD=your_password
```

---

**Ready to integrate!** 🎉

For questions, check `ADMIN_API_ENDPOINTS.md` for full API documentation.

