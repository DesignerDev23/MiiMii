# Bilal Service Update - Data Plans Sync

## Summary of Changes

### 1. **Updated Bilal Service Base URL**
- **Old URL**: `https://bilalsadasub.com/api`
- **New URL**: `https://legitdataway.com/api`
- Environment variable: `BILAL_BASE_URL`

### 2. **Dynamic Data Plans from User Dashboard**

The system now fetches data plans directly from your Bilal dashboard, showing only the plans available to you.

#### Key Features:
- ✅ **Real-time sync**: Fetches plans from Bilal API endpoint `/dataplans?network={networkId}`
- ✅ **Automatic caching**: Plans cached for 1 hour to reduce API calls
- ✅ **Fallback support**: Falls back to static plans if API fails
- ✅ **Dashboard filtering**: Only shows plans with `status: 'available'` or `available: true`
- ✅ **Admin control**: Admins can manually sync plans anytime

---

## New Admin API Endpoints

### 1. Sync Data Plans from Bilal Dashboard

**Endpoint**: `POST /api/admin/data-plans/sync`

**Description**: Manually sync all data plans from Bilal dashboard for all networks.

**Headers**:
```json
{
  "Authorization": "Bearer <ADMIN_TOKEN>",
  "Content-Type": "application/json"
}
```

**Response**:
```json
{
  "success": true,
  "message": "Data plans synced successfully from Bilal dashboard",
  "data": {
    "networks": ["MTN", "AIRTEL", "GLO", "9MOBILE"],
    "totalPlans": 150,
    "plansByNetwork": {
      "MTN": 56,
      "AIRTEL": 32,
      "GLO": 34,
      "9MOBILE": 28
    }
  }
}
```

---

### 2. Get Current Data Plans

**Endpoint**: `GET /api/admin/data-plans`

**Description**: Get cached data plans or fetch fresh ones.

**Query Parameters**:
- `network` (optional): Filter by specific network (MTN, AIRTEL, GLO, 9MOBILE)
- `refresh` (optional): Set to `true` to force fetch fresh plans

**Examples**:

**Get all cached plans**:
```
GET /api/admin/data-plans
```

**Get MTN plans only**:
```
GET /api/admin/data-plans?network=MTN
```

**Force refresh all plans**:
```
GET /api/admin/data-plans?refresh=true
```

**Response**:
```json
{
  "success": true,
  "plans": {
    "MTN": [
      {
        "id": 1,
        "title": "500MB",
        "size": "500MB",
        "price": 400,
        "validity": "30 days",
        "type": "SME",
        "network": "MTN"
      },
      {
        "id": 2,
        "title": "1GB",
        "size": "1GB",
        "price": 600,
        "validity": "30 days",
        "type": "SME",
        "network": "MTN"
      }
    ],
    "AIRTEL": [...],
    "GLO": [...],
    "9MOBILE": [...]
  },
  "networks": ["MTN", "AIRTEL", "GLO", "9MOBILE"],
  "totalPlans": 150
}
```

---

## How It Works

### Automatic Flow:

1. **User requests data plans** → System checks cache (1 hour TTL)
2. **Cache valid** → Returns cached plans
3. **Cache expired/missing** → Fetches fresh plans from Bilal API
4. **API call fails** → Falls back to static plans in `flowEndpoint.js`

### Manual Sync Flow:

1. Admin calls `POST /api/admin/data-plans/sync`
2. System fetches plans for all networks from Bilal
3. Plans stored in KVStore with timestamp
4. Users immediately see updated plans

---

## Bilal API Integration

### Authentication:
```javascript
// Basic Auth header required
Authorization: Basic base64(username:password)
```

### Endpoint:
```
GET https://legitdataway.com/api/dataplans?network={networkId}
```

**Network IDs**:
- MTN: `1`
- AIRTEL: `2`
- GLO: `3`
- 9MOBILE: `4`

### Expected Response:
```json
{
  "status": "success",
  "plans": [
    {
      "plan_id": 1,
      "plan_name": "500MB SME",
      "size": "500MB",
      "amount": 400,
      "validity": "30 days",
      "plan_type": "SME",
      "status": "available"
    }
  ]
}
```

---

## Benefits

1. **Always Up-to-Date**: Plans automatically reflect what's on your Bilal dashboard
2. **No Manual Updates**: No need to manually update `DATA_PLANS` in code
3. **Better Performance**: 1-hour caching reduces API calls
4. **Reliability**: Fallback to static plans ensures service continuity
5. **Admin Control**: Force refresh anytime to update plans immediately

---

## Testing

### Test Sync:
```bash
curl -X POST https://chatmiimii.com/api/admin/data-plans/sync \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN"
```

### Verify Plans:
```bash
curl https://chatmiimii.com/api/admin/data-plans?network=MTN \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN"
```

---

## Environment Variables

Make sure these are set in your `.env` or Digital Ocean App Platform:

```env
BILAL_BASE_URL=https://legitdataway.com/api
PROVIDER_USERNAME=your_username
PROVIDER_PASSWORD=your_password
```

---

## Maintenance

**Recommended**: Set up a cron job or scheduled task to sync plans daily:

```javascript
// In your maintenance worker or cron service
const bilalService = require('./services/bilal');

// Run daily at 2 AM
cron.schedule('0 2 * * *', async () => {
  await bilalService.syncDataPlansFromDashboard();
});
```

---

## Notes

- Plans are cached in the `kvstore` table with key `bilal_data_plans_cache`
- Cache TTL is 1 hour (3600000 ms)
- Admin can force refresh by passing `?refresh=true`
- If Bilal API is down, system automatically uses fallback static plans
- All plans include: `id`, `title`, `size`, `price`, `validity`, `type`, `network`

