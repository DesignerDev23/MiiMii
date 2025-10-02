# Data Plans Update - Retail Prices

## Summary

Updated the system to use your specified retail prices for all major data plans. These are now the default plans that users will see. Admins can later add selling prices through the admin dashboard to add profit margins.

---

## Updated Plans (29 Plans Total)

### **MTN - 11 Plans**

#### SME Plans (6 plans)
| ID | Size | Price | Validity | Type |
|----|------|-------|----------|------|
| 1  | 500MB | ₦350 | 30days to 7days | SME |
| 2  | 1GB | ₦550 | 30 days | SME |
| 3  | 2GB | ₦1,100 | Monthly | SME |
| 4  | 3GB | ₦1,650 | 30days | SME |
| 5  | 5GB | ₦2,750 | 30days | SME |
| 6  | 10GB | ₦5,500 | 30days | SME |

#### Corporate Gifting Plans (5 plans)
| ID | Size | Price | Validity | Type |
|----|------|-------|----------|------|
| 19 | 500MB | ₦420 | 30 days | COOPERATE GIFTING |
| 20 | 1GB | ₦820 | 30days | COOPERATE GIFTING |
| 21 | 2GB | ₦1,660 | 30days | COOPERATE GIFTING |
| 23 | 5GB | ₦4,150 | 30days | COOPERATE GIFTING |
| 24 | 10GB | ₦8,300 | 30days | COOPERATE GIFTING |

---

### **AIRTEL - 5 Plans**

#### SME Plans (5 plans)
| ID | Size | Price | Validity | Type |
|----|------|-------|----------|------|
| 7  | 500MB | ₦493 | 7days | SME |
| 8  | 1GB | ₦784 | 7days | SME |
| 9  | 2GB | ₦1,500 | 30days | SME |
| 10 | 4GB | ₦2,525 | 30days | SME |
| 26 | 10GB | ₦4,000 | 30days | SME |

---

### **GLO - 6 Plans**

#### Gifting Plans (5 plans)
| ID | Size | Price | Validity | Type |
|----|------|-------|----------|------|
| 11 | 1.5GB | ₦460 | 30days | GIFTING |
| 12 | 2.9GB | ₦940 | 30days | GIFTING |
| 13 | 4.1GB | ₦1,290 | 30days | GIFTING |
| 14 | 5.8GB | ₦1,850 | 30days | GIFTING |
| 15 | 10GB | ₦3,030 | 30days | GIFTING |

#### Corporate Gifting Plans (1 plan)
| ID | Size | Price | Validity | Type |
|----|------|-------|----------|------|
| 29 | 200MB | ₦110 | 30days | COOPERATE GIFTING |

---

### **9MOBILE - 3 Plans**

#### SME Plans (1 plan)
| ID | Size | Price | Validity | Type |
|----|------|-------|----------|------|
| 25 | 1.1GB | ₦400 | 30days | SME |

#### Gifting Plans (2 plans)
| ID | Size | Price | Validity | Type |
|----|------|-------|----------|------|
| 27 | 1.5GB | ₦880 | 30days | GIFTING |
| 28 | 500MB | ₦450 | 30 days | GIFTING |

---

## Files Updated

1. **`src/services/bilal.js`**
   - Updated `baseURL` to `https://legitdataway.com/api`
   - Updated `getDefaultDataPlans()` with retail prices (lines 451-490)

2. **`src/routes/flowEndpoint.js`**
   - Updated `DATA_PLANS` constant with retail prices (lines 1713-1750)
   - Removed 100+ old plans, keeping only the 29 major plans

3. **`src/services/data.js`**
   - Updated to fetch from Bilal cache first, then fallback to static plans

4. **`src/routes/admin.js`**
   - Added new endpoints for syncing and viewing data plans

---

## How Admin Can Add Selling Prices

### Option 1: Via Admin Pricing Override API
```bash
POST /api/admin/data-pricing/update
Content-Type: application/json
Authorization: Bearer ADMIN_TOKEN

{
  "network": "MTN",
  "planId": 1,
  "sellingPrice": 400  // Add ₦50 profit on 500MB
}
```

### Option 2: Sync from Bilal Dashboard
```bash
POST /api/admin/data-plans/sync
Authorization: Bearer ADMIN_TOKEN
```

This will fetch plans from your Bilal dashboard with your set selling prices.

---

## Price Differences (Retail vs Previous)

### MTN SME Changes:
- 500MB: ₦400 → **₦350** (-₦50)
- 1GB: ₦600 → **₦550** (-₦50)
- 2GB: ₦1,200 → **₦1,100** (-₦100)
- 3GB: ₦1,800 → **₦1,650** (-₦150)
- 5GB: ₦3,000 → **₦2,750** (-₦250)
- 6GB: ₦6,000 → **₦5,500** (-₦500)

### AIRTEL Changes:
- All prices remain similar to previous retail prices

### GLO Changes:
- All prices remain as retail GIFTING prices

### 9MOBILE Changes:
- All prices remain as retail prices

---

## System Flow

```
User Requests Data Plans
        ↓
Check Bilal Cache (1 hour TTL)
        ↓
[Cache Available?]
    Yes ↓              No ↓
Use Cached Plans    Use These Retail Plans (Default)
        ↓
Admin Can Override Individual Prices
        ↓
Or Sync from Bilal Dashboard with Selling Prices
```

---

## Benefits of This Setup

1. ✅ **Clean Starting Point**: Only 29 major plans users need
2. ✅ **Retail Prices**: All prices are at retail/cost price
3. ✅ **Flexible Pricing**: Admin can add selling prices later
4. ✅ **Auto-Sync Ready**: Can sync from Bilal dashboard anytime
5. ✅ **Fallback Support**: Always has default plans if API fails
6. ✅ **Less Confusion**: Removed 100+ redundant plans

---

## Next Steps for Admin

1. **Test Current Plans**: Users can now purchase from these 29 plans
2. **Add Profit Margins**: Use admin panel to set selling prices
3. **Sync from Dashboard**: If you have more plans on Bilal, sync them
4. **Monitor Performance**: Check which plans sell most

---

## Example: Adding Selling Price

**Current**: 500MB MTN SME costs ₦350 (retail)

**Admin wants to sell at ₦400**:
```bash
POST /api/admin/data-pricing/update
{
  "network": "MTN",
  "planId": 1,
  "sellingPrice": 400
}
```

**Result**: 
- Retail cost: ₦350
- User sees: ₦400
- Profit: ₦50 per sale

---

## Questions?

- **Q: Can I add more plans?**
  - A: Yes, sync from Bilal dashboard or manually add via admin panel

- **Q: Are these prices final?**
  - A: These are retail/cost prices. You can set higher selling prices

- **Q: What if Bilal changes prices?**
  - A: Sync from dashboard to update automatically

- **Q: Can I remove plans?**
  - A: Yes, through admin panel or by not syncing them

---

All changes complete! ✅

