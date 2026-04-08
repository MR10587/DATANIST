# Vercel Deployment Guide for DATANIST

This guide will walk you through deploying the DATANIST Flask application to Vercel.

## Prerequisites

Before deploying, ensure you have:
- A [Vercel account](https://vercel.com/signup) (free tier available)
- Git repository pushed to GitHub, GitLab, or Bitbucket
- All necessary API keys (Gemini API, RapidAPI for LinkedIn jobs)

## Pre-Deployment Checklist

### 1. Environment Variables Setup
Update the environment variables in Vercel dashboard with:
- `SECRET_KEY` - Generate a random secure key
- `GEMINI_API_KEY` - Your Gemini API key for AI features
- `RAPIDAPI_KEY` - Your RapidAPI header key for LinkedIn job search

### 2. Local Testing
Verify the app runs locally:
```bash
cd c:\Users\GUNAY\OneDrive\Рабочий стол\project\DATANIST\DATANIST\DATANIST-NEW
python -m venv venv
venv\Scripts\activate  # On Windows
pip install -r requirements.txt
python run.py
# Visit http://localhost:5000
```

### 3. Ensure All Required Files Are Present
The following files have been created/updated:
- ✅ `vercel.json` - Vercel configuration
- ✅ `index.py` - WSGI entry point
- ✅ `.env.production` - Production environment template
- ✅ `requirements.txt` - Python dependencies

## Step-by-Step Deployment

### Step 1: Push Code to Git Repository

```bash
# Navigate to project directory
cd c:\Users\GUNAY\OneDrive\Рабочий стол\project\DATANIST\DATANIST\DATANIST-NEW

# Initialize git (if not already done)
git init

# Add all files
git add .

# Commit
git commit -m "Prepare for Vercel deployment"

# Add remote (replace with your repo URL)
git remote add origin https://github.com/yourusername/DATANIST.git

# Push to main/master branch
git branch -M main
git push -u origin main
```

### Step 2: Connect to Vercel

**Option A: Using Vercel CLI**
```bash
# Install Vercel CLI globally
npm install -g vercel

# Login to Vercel
vercel login

# Deploy from project directory
vercel

# Follow the prompts:
# - Confirm project name
# - Select framework: Other
# - Root directory: ./ (current)
```

**Option B: Using Vercel Dashboard**
1. Go to [vercel.com](https://vercel.com/dashboard)
2. Click "Add New" → "Project"
3. Click "Import Git Repository"
4. Select your repository (GitHub/GitLab/Bitbucket)
5. Click "Import"
6. Configure project:
   - **Framework Preset**: Other
   - **Root Directory**: ./ (or path to project folder)
   - **Build Command**: Leave empty (Vercel will auto-detect)
   - **Output Directory**: Leave empty
7. Click "Environment Variables" and add:
   - `SECRET_KEY`
   - `GEMINI_API_KEY`
   - `RAPIDAPI_KEY`
   - `FLASK_ENV=production`
8. Click "Deploy"

### Step 3: Set Environment Variables in Vercel Dashboard

1. After deployment, go to Project Settings
2. Navigate to "Environment Variables"
3. Add each variable from `.env.production`:
   - `FLASK_APP=index.py`
   - `FLASK_ENV=production`
   - `SECRET_KEY=<your-secure-key>`
   - `GEMINI_API_KEY=<your-key>`
   - `RAPIDAPI_KEY=<your-key>`
4. Click "Save"

### Step 4: Redeploy with Environment Variables

1. Go to "Deployments" tab
2. Click the three dots on the latest deployment
3. Select "Redeploy"
4. Click "Redeploy" again

### Step 5: Verify Deployment

Wait for deployment to complete (usually 2-5 minutes).

Check logs:
1. Click on deployment
2. View "Logs" tab for any errors
3. Check function logs if using Vercel Analytics

Test the app:
- Visit your Vercel deployment URL (something like: `https://your-project.vercel.app`)
- Test key features:
  - ✓ Login page loads
  - ✓ Dashboard displays after login
  - ✓ API endpoints respond (check Network tab)
  - ✓ Static assets (CSS, JS) load correctly
  - ✓ File uploads work (if applicable)

## Important Notes for Serverless Deployment

### Data Persistence
⚠️ **IMPORTANT**: Vercel's serverless environment does NOT persist files between deployments!

Currently, the app uses JSON files (`seed_data.json`) for storage, which will NOT work reliably on Vercel:
- Any changes to student/exam/interview data will NOT persist after redeployment
- Each function invocation gets a fresh filesystem

**Solution**: For persistent data, migrate to one of:
1. **Vercel KV** (Redis-based): Fast, recommended for this app
2. **Neon** (PostgreSQL): More complex but powerful
3. **MongoDB Atlas**: Flexible document storage
4. **Firebase**: Full-featured backend

### Recommendations for Next Steps

If you need persistent data:
```bash
# Recommended: Set up Vercel KV
# Go to Vercel Dashboard > Storage > Create > KV
# Then install: pip install redis
```

### Current Limitations
- Static file uploads may not persist (uploads folder)
- JSON data modifications don't survive redeployment
- Session data may not persist across function invocations

## Troubleshooting

### Issue: "502 Bad Gateway"
- Check server logs in Vercel dashboard
- Ensure index.py is importing app correctly
- Verify Python version compatibility (3.9+ recommended)

### Issue: "Module not found" errors
- Verify all imports in `requirements.txt`
- Run: `pip freeze > requirements.txt` locally to capture all dependencies

### Issue: Static files (CSS, JS) not loading
- Check `app/static/` folder structure exists
- Verify vercel.json routes configuration
- Check browser DevTools Console for 404 errors

### Issue: Environment variables not loaded
- Double-check variable names match in code
- Ensure no extra spaces in variable values
- Try redeploying after adding variables

### Issue: "Cold start" delays
- Normal for first request (up to 30s on free tier)
- Paid plans have faster cold starts
- Consider upgrading if performance is critical

## Monitoring & Maintenance

### Enable Analytics
1. Go to Project Settings → Analytics
2. Enable Web Analytics and Speed Insights

### View Logs
- Deployments tab shows build logs
- Function logs show runtime logs
- Check for errors or performance issues

### Update Deployment
To redeploy after code changes:
```bash
git add .
git commit -m "Update feature"
git push origin main
# Vercel automatically redeploys
```

## Rollback a Deployment

If something goes wrong:
1. Go to Deployments tab
2. Click on a previous working deployment
3. Click "Promote to Production"

## Data Migration Path (When Ready)

When ready to move from JSON to persistent storage:

1. **Install Vercel KV**:
   ```bash
   pip install redis
   ```

2. **Create KV store** in Vercel dashboard

3. **Update app.py** to use KV instead of JSON:
   ```python
   import redis
   r = redis.from_url(os.getenv("KV_URL"))
   
   # Replace load_data() and save_data() functions
   ```

4. **Redeploy and migrate data** to new storage

## Support & Additional Resources

- [Vercel Python Runtime Docs](https://vercel.com/docs/functions/serverless-functions/runtimes/python)
- [Flask Deployment Guide](https://flask.palletsprojects.com/deployment/)
- [Vercel KV Documentation](https://vercel.com/docs/storage/vercel-kv)

## Questions or Issues?

If deployment fails:
1. Check Vercel deployment logs
2. Verify all files are committed to Git
3. Ensure environment variables are set
4. Test locally first: `python run.py`

---

**Deployment Status**: Ready for Vercel ✅
