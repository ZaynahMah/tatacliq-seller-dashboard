# Deployment Guide — GitHub → VS Code → Vercel

Complete steps to get your dashboard live in 15 minutes.

---

## Part 1: Open in VS Code (2 min)

```bash
unzip tatacliq-seller-dashboard.zip
cd tatacliq-seller-dashboard
code .
```

If `code` isn't in your PATH:
1. Open VS Code
2. Press `Cmd/Ctrl + Shift + P` → "Shell Command: Install 'code' command in PATH"
3. Re-run `code .`

---

## Part 2: Test locally (3 min)

In VS Code's integrated terminal (`Cmd/Ctrl + ` ` `):

```bash
cd apps/web
npm install
npm run dev
```

Open **http://localhost:3000**.

Try the demo flows:
- `/upload` → drop `sample-catalog-with-images.zip` from project root
- `/studio` → drop any product image, pick "Pure White" background
- `/usage` → see live cost tracking

Stop the server with `Ctrl+C` when done.

---

## Part 3: Push to GitHub (5 min)

### 3a. Create a GitHub repo

1. Go to https://github.com/new
2. Repository name: `tatacliq-seller-dashboard`
3. **Don't** check "Add a README" (you already have one)
4. Click **Create repository**

### 3b. Push from VS Code terminal

```bash
cd tatacliq-seller-dashboard   # project root (one level above apps/)

git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/<your-username>/tatacliq-seller-dashboard.git
git push -u origin main
```

Replace `<your-username>` with your actual GitHub username.

**First-time push?** GitHub will prompt for auth:
- **Easiest**: use GitHub CLI — `brew install gh` then `gh auth login`
- **Or**: create a Personal Access Token at https://github.com/settings/tokens (classic, `repo` scope), use it as your password when prompted

### 3c. Verify

Refresh your GitHub repo page — you should see all the files.

---

## Part 4: Deploy to Vercel (5 min)

### 4a. Sign up / sign in

Go to https://vercel.com → **Sign Up with GitHub** (or sign in)

### 4b. Import the project

1. Click **Add New → Project**
2. Find your `tatacliq-seller-dashboard` repo → click **Import**

### 4c. Configure (this is the only tricky part)

Vercel will auto-detect Next.js, but you're using a monorepo so set:

| Setting | Value |
|---------|-------|
| **Root Directory** | `apps/web` (click "Edit" next to Root Directory) |
| **Framework Preset** | Next.js (auto-detected) |
| **Build Command** | `npm run build` (default) |
| **Output Directory** | `.next` (default) |
| **Install Command** | `npm install` (default) |
| **Node.js Version** | 20.x (set under Settings → General → Node.js Version after deploy) |

### 4d. Add environment variable (optional but recommended)

Under **Environment Variables**:

| Name | Value |
|------|-------|
| `GEMINI_API_KEY` | Your key from https://aistudio.google.com |

Without this, the dashboard still works with the deterministic fallback. With it, you get real Gemini AI.

### 4e. Deploy

Click **Deploy**. First build takes ~2 minutes. You'll get a live URL like `tatacliq-seller-dashboard-xxx.vercel.app`.

---

## Part 5: Make changes & redeploy (the daily loop)

Once set up, the workflow is:

```bash
# 1. Edit files in VS Code
# 2. Commit and push
git add .
git commit -m "Add: feature description"
git push

# 3. Vercel auto-deploys on every push — no extra action needed
```

Vercel will rebuild and replace the live site in ~60 seconds. Preview deployments are made for every branch.

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| **Vercel build fails: "Cannot find module 'sharp'"** | Sharp needs Node 20. Settings → General → Node.js Version → set to 20.x → Redeploy |
| **`fetch failed` in API routes** | Vercel free tier API routes have a 10s timeout. The `maxDuration = 60` in our routes only works on Pro. For free tier, set it to 10 in `apps/web/app/api/enhance-image/route.ts` and `enrich-batch/route.ts` |
| **Image enhance returns 413 Payload Too Large** | Vercel free tier limits request body to 4.5MB. For larger images, upgrade or use direct-to-storage uploads |
| **GitHub push fails with `support for password authentication was removed`** | Use a Personal Access Token (see Part 3b) or set up `gh auth login` |
| **Wrong port locally** | If 3000 is taken: `PORT=3001 npm run dev` |
| **Tailwind classes not working** | From `apps/web/`, run `npm install` again — Tailwind config needs node_modules |

---

## Updating Vercel environment variables later

1. Go to your Vercel project → **Settings** → **Environment Variables**
2. Add or edit values
3. **Important**: Redeploy by going to Deployments → latest → ⋯ → **Redeploy** (env changes don't auto-redeploy)

---

## What lives where after deployment

| Place | What it stores |
|-------|----------------|
| **GitHub** | All source code, version history, anyone with repo access can read it |
| **Vercel** | The deployed app + your environment variables (`GEMINI_API_KEY`) |
| **VS Code** | Your local working copy. Edits here flow: VS Code → `git push` → GitHub → Vercel auto-deploys |
| **.env.local** | Local dev secrets only. NOT pushed to GitHub (gitignored). NOT used by Vercel. |

Your API key has three separate copies:
- One local (`apps/web/.env.local`) — for dev
- One on Vercel (Settings → Environment Variables) — for production
- One in your password manager — for recovery

Never paste an API key into a `git commit`. The `.gitignore` already blocks `.env.local`, but always double-check before pushing.
