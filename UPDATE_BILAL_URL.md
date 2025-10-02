# Update Bilal Service URL - Action Required

## ⚠️ CRITICAL: Environment Variable Update Needed

The system is still using the old Bilal URL because the environment variable hasn't been updated in production.

---

## 🔧 What Needs to Be Done

### Digital Ocean App Platform - Update Environment Variable

1. **Go to Digital Ocean Dashboard**
   - Navigate to your MiiMii app
   - Go to **Settings** → **App-Level Environment Variables**

2. **Update this variable:**
   ```
   Variable Name: BILAL_BASE_URL
   Old Value: https://bilalsadasub.com/api
   New Value: https://legitdataway.com/api
   ```

3. **Save and Redeploy**
   - Click "Save"
   - Digital Ocean will automatically redeploy your app
   - Wait for deployment to complete (~2-3 minutes)

---

## 📋 Verification Steps

After redeployment, check the logs:

### Before (Current - WRONG):
```
"baseURL":"https://bilalsadasub.com/api"
```

### After (Expected - CORRECT):
```
"baseURL":"https://legitdataway.com/api"
```

---

## 🔍 How to Verify

1. **Check Application Logs:**
   ```bash
   # Look for this line when airtime/data purchase happens:
   About to generate token for airtime purchase
   ```
   
   It should show:
   ```json
   {
     "hasUsername": true,
     "hasPassword": true,
     "baseURL": "https://legitdataway.com/api"  ← Should be the NEW URL
   }
   ```

2. **Test Airtime Purchase:**
   - Send: "Buy 100 naira airtime for 08012345678 MTN"
   - Check logs for `baseURL` value

3. **Test Data Purchase:**
   - Send: "I want to buy data"
   - Check logs when selecting network/plan

---

## 📊 Current Status

### Code Status: ✅ UPDATED
- `src/services/bilal.js` line 14: Already changed to new URL
- Fallback URL set correctly

### Environment Variable: ❌ NOT UPDATED
- Production still using old URL
- Needs manual update in Digital Ocean dashboard

---

## 🚨 Why This is Important

1. **Old API may stop working** without notice
2. **Data plans won't sync** from new dashboard
3. **Purchases may fail** if old API is deprecated
4. **New features** only available on new API

---

## 📸 Screenshots Guide

### Step 1: Access Environment Variables
```
Digital Ocean Dashboard
  └─ Apps
      └─ miimii-api (your app name)
          └─ Settings tab
              └─ App-Level Environment Variables
```

### Step 2: Edit Variable
- Find: `BILAL_BASE_URL`
- Click "Edit" (pencil icon)
- Change value to: `https://legitdataway.com/api`
- Click "Save"

### Step 3: Redeploy
- Click "Actions" → "Force Rebuild and Deploy"
- Or wait for auto-deploy after saving

---

## ⏱️ Expected Downtime

**None** - Digital Ocean does rolling deployment:
- New instance starts with new URL
- Old instance shuts down after new one is healthy
- Total transition: ~2 minutes
- Service continues during deployment

---

## 🧪 After Update - Test Checklist

- [ ] Airtime purchase shows new URL in logs
- [ ] Data purchase shows new URL in logs
- [ ] Data plans sync successfully
- [ ] Plan titles show correctly (not "undefined")
- [ ] Purchases complete successfully

---

## 🔄 Rollback Plan (If Needed)

If new URL doesn't work:

1. Go back to environment variables
2. Change back to: `https://bilalsadasub.com/api`
3. Save and wait for redeploy
4. Report issue to Bilal support

---

## 📞 Support

**If update fails:**
- Check Digital Ocean deployment logs
- Verify environment variable saved correctly
- Contact Bilal support to confirm new API is active

**Bilal Support:**
- Confirm `https://legitdataway.com/api` is live
- Verify your credentials work with new URL
- Check API endpoint structure hasn't changed

---

## ✅ Completion Checklist

- [ ] Updated `BILAL_BASE_URL` in Digital Ocean
- [ ] Saved changes
- [ ] Waited for successful deployment
- [ ] Verified new URL in logs
- [ ] Tested airtime purchase
- [ ] Tested data purchase
- [ ] Confirmed plan titles show correctly

---

**Status:** ⏳ PENDING - Awaiting environment variable update

**Last Code Update:** October 2, 2025
**Required Action:** Update environment variable in Digital Ocean

