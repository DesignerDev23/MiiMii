# Quick Reference Card

## 🚀 New Endpoints (Copy & Paste Ready)

### Sync Data Plans
```bash
curl -X POST https://chatmiimii.com/api/admin/data-plans/sync \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -H "Content-Type: application/json"
```

### Get All Plans (Cached)
```bash
curl https://chatmiimii.com/api/admin/data-plans \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN"
```

### Get MTN Plans Only
```bash
curl "https://chatmiimii.com/api/admin/data-plans?network=MTN" \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN"
```

### Refresh All Plans (Force)
```bash
curl "https://chatmiimii.com/api/admin/data-plans?refresh=true" \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN"
```

### Get Users with Enhanced Fields
```bash
curl "https://chatmiimii.com/api/admin/users?page=1&limit=20" \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN"
```

---

## 📊 Data Plans Count

| Network | Plans | Price Range |
|---------|-------|-------------|
| MTN | 11 | ₦350 - ₦8,300 |
| AIRTEL | 5 | ₦493 - ₦4,000 |
| GLO | 6 | ₦110 - ₦3,030 |
| 9MOBILE | 3 | ₦400 - ₦880 |
| **TOTAL** | **29** | |

---

## 🔑 New User Fields

```javascript
{
  // Existing fields
  id, name, whatsappNumber, email, balance, kycStatus,
  isActive, isBanned, lastSeen, createdAt,
  
  // NEW FIELDS ⬇️
  bvnVerified: boolean,
  bvnVerificationDate: date | null,
  onboardingStep: string,
  virtualAccountNumber: string | null,
  virtualAccountBank: string | null
}
```

---

## 📁 Files to Reference

| Need | File |
|------|------|
| Complete API docs | `ADMIN_API_ENDPOINTS.md` |
| React examples | `DASHBOARD_INTEGRATION_GUIDE.md` |
| Postman testing | `NEW_ENDPOINTS_POSTMAN.json` |
| Plans details | `DATA_PLANS_UPDATE.md` |
| Complete summary | `COMPLETE_UPDATE_SUMMARY.md` |

---

## ⚡ Quick JavaScript Examples

### Sync Plans
```javascript
const syncPlans = async () => {
  const res = await fetch('https://chatmiimii.com/api/admin/data-plans/sync', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}` }
  });
  const data = await res.json();
  console.log(`Synced ${data.data.totalPlans} plans!`);
};
```

### Get Plans
```javascript
const getPlans = async (network = null) => {
  const url = network 
    ? `https://chatmiimii.com/api/admin/data-plans?network=${network}`
    : 'https://chatmiimii.com/api/admin/data-plans';
  const res = await fetch(url, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  return await res.json();
};
```

### Get Users
```javascript
const getUsers = async (page = 1) => {
  const res = await fetch(
    `https://chatmiimii.com/api/admin/users?page=${page}&limit=20`,
    { headers: { 'Authorization': `Bearer ${token}` } }
  );
  return await res.json();
};
```

---

## 🎯 Top 5 MTN Plans (Most Popular)

1. **500MB SME** - ₦350 (30 days)
2. **1GB SME** - ₦550 (30 days)
3. **2GB SME** - ₦1,100 (Monthly)
4. **3GB SME** - ₦1,650 (30 days)
5. **5GB SME** - ₦2,750 (30 days)

---

## 🛠️ Environment Variables

```env
BILAL_BASE_URL=https://legitdataway.com/api
PROVIDER_USERNAME=your_username
PROVIDER_PASSWORD=your_password
```

---

## ✅ Implementation Checklist

**Backend (Done ✅):**
- [x] Update Bilal URL
- [x] Add data plans sync
- [x] Add caching system
- [x] Add admin endpoints
- [x] Enhance user fields
- [x] Create documentation

**Frontend (Todo):**
- [ ] Data plans management page
- [ ] Sync button
- [ ] Filter by network
- [ ] Refresh plans button
- [ ] Update users table
- [ ] Show virtual accounts
- [ ] Show BVN status
- [ ] Test all features

---

## 🔄 Cache Info

- **Duration:** 1 hour
- **Storage:** KVStore table
- **Key:** `bilal_data_plans_cache`
- **Force Refresh:** `?refresh=true`

---

## 📱 Base URLs

**Production:** `https://chatmiimii.com`
**Admin API:** `https://chatmiimii.com/api/admin`

---

## 🎨 Status Badge Colors

```css
.badge.success { background: #d4edda; color: #155724; }
.badge.warning { background: #fff3cd; color: #856404; }
.badge.danger { background: #f8d7da; color: #721c24; }
.badge.info { background: #d1ecf1; color: #0c5460; }
```

---

## 📞 Quick Help

**Issue?** Check `COMPLETE_UPDATE_SUMMARY.md` → Troubleshooting

**Need API details?** → `ADMIN_API_ENDPOINTS.md`

**Need code examples?** → `DASHBOARD_INTEGRATION_GUIDE.md`

**Need to test?** → Import `NEW_ENDPOINTS_POSTMAN.json`

---

**Ready to go! 🚀**

