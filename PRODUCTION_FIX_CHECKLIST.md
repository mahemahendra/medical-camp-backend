# Production ERR_BLOCKED_BY_ORB Fix - Deployment Checklist

## Issue
Uploaded images during camp creation were not displaying in production, throwing `ERR_BLOCKED_BY_ORB` (Opaque Response Blocking) error.

## Root Cause
Cross-origin requests for uploaded images were blocked due to:
1. Missing or incorrect CORS headers on `/uploads` route
2. Missing `BACKEND_URL` environment variable
3. Missing `FRONTEND_URL` environment variable
4. Insufficient CORS configuration for static file serving

## Fix Applied
✅ Enhanced CORS configuration with proper origin validation
✅ Added explicit CORS headers for `/uploads` route
✅ Added `Cross-Origin-Resource-Policy: cross-origin` header
✅ Added `Cross-Origin-Embedder-Policy: unsafe-none` header
✅ Added proper MIME type handling
✅ Added caching headers for better performance
✅ Added logging for CORS debugging in production

## Deployment Steps

### 1. Verify Environment Variables on Render
Go to your Render backend service → Environment tab and ensure these are set:

```bash
# Required for image URL generation
BACKEND_URL=https://your-backend-app.onrender.com

# Required for CORS configuration
FRONTEND_URL=https://your-frontend-app.onrender.com

# Other required variables
DATABASE_URL=<from Render PostgreSQL>
JWT_SECRET=<your secure secret>
NODE_ENV=production
PORT=10000
```

**CRITICAL**: Replace `your-backend-app` and `your-frontend-app` with your actual Render app names.

### 2. Deploy the Changes
Push the changes to your GitHub repository:
```bash
git add .
git commit -m "fix: resolve ERR_BLOCKED_BY_ORB for uploaded images with enhanced CORS"
git push origin main
```

Render will automatically deploy the changes.

### 3. Verify Deployment
Once deployed, check:

1. **Health Check**: Visit `https://your-backend-app.onrender.com/api/health`
   - Should return JSON with status "OK"

2. **CORS Logs**: Check Render logs for:
   ```
   Allowed CORS origins: [array of URLs]
   ```
   - Verify your frontend URL is in the list

3. **Test Image Upload**: 
   - Create a new camp with logo/background images
   - Check browser DevTools → Network tab
   - The image requests should show:
     - Status: 200 OK
     - Response Headers include:
       - `Access-Control-Allow-Origin: <your-frontend-url>`
       - `Cross-Origin-Resource-Policy: cross-origin`
       - `Cross-Origin-Embedder-Policy: unsafe-none`

### 4. Troubleshooting

#### If images still don't load:

**Check 1: BACKEND_URL is correct**
```bash
# In Render backend logs, you should see camp creation logs showing:
logoUrl: https://your-backend-app.onrender.com/uploads/...
```

If the URL is wrong (e.g., `http://localhost:3000/uploads/...`), the `BACKEND_URL` env var is not set.

**Check 2: CORS origin mismatch**
```bash
# In Render backend logs, look for:
CORS blocked origin: <some-url>
```

If you see this, add that URL to the `allowedOrigins` array in `src/index.ts` or set it as `FRONTEND_URL`.

**Check 3: Browser console errors**
```javascript
// Open browser DevTools → Console
// Look for:
Access to fetch at 'https://...' from origin 'https://...' has been blocked by CORS policy
```

This means the CORS headers are not being sent correctly. Verify the deployment succeeded.

**Check 4: Network tab inspection**
```
1. Open DevTools → Network tab
2. Try to load an image
3. Click on the failed request
4. Check Response Headers:
   - Missing Access-Control-Allow-Origin? → CORS headers not applied
   - Missing Cross-Origin-Resource-Policy? → Fix not deployed
```

### 5. Quick Fixes

**If still blocked after deployment:**

1. **Force redeploy**: In Render dashboard → Manual Deploy → Deploy latest commit

2. **Clear cache**: 
   ```bash
   # In Render backend service
   Settings → Clear build cache & deploy
   ```

3. **Verify environment variables are saved**:
   ```bash
   # In Render logs, add temporary logging:
   console.log('BACKEND_URL:', process.env.BACKEND_URL);
   console.log('FRONTEND_URL:', process.env.FRONTEND_URL);
   ```

4. **Restart the service**: 
   ```bash
   # In Render dashboard
   Manual Deploy → Restart
   ```

## Testing in Production

### Test 1: Create New Camp
1. Login as admin
2. Create a new camp with logo and background images
3. Images should upload successfully
4. URLs in response should start with `BACKEND_URL`

### Test 2: Edit Existing Camp
1. Navigate to camp edit page
2. Current logo/background should display
3. No ERR_BLOCKED_BY_ORB in console

### Test 3: Public Registration Page
1. Visit camp registration page: `https://your-frontend.onrender.com/#/<camp-slug>`
2. Logo and background should display
3. No CORS errors in console

## Success Indicators

✅ Images load without errors
✅ Browser console shows no CORS errors
✅ Network tab shows 200 OK for image requests
✅ Response headers include `Access-Control-Allow-Origin`
✅ No ERR_BLOCKED_BY_ORB errors

## Rollback Plan

If issues persist:

1. Revert to previous commit:
   ```bash
   git revert HEAD
   git push origin main
   ```

2. Use external image hosting (temporary workaround):
   - Upload images to Cloudinary/ImgBB
   - Use those URLs instead of local uploads

## Additional Resources

- [MDN: CORS](https://developer.mozilla.org/en-US/docs/Web/HTTP/CORS)
- [Opaque Response Blocking](https://developer.chrome.com/blog/opaque-response-blocking/)
- [Render Environment Variables](https://render.com/docs/environment-variables)

## Support

If issues persist after following this checklist:
1. Check Render logs for specific error messages
2. Verify environment variables are correctly set
3. Test with different browsers (Chrome, Firefox, Safari)
4. Check if issue is specific to camp edit or also affects new camps
