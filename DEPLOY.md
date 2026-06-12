# Deploy Guide — Canadian Immigration Client Portal

Follow these steps in order. Each gray box is something you copy and paste exactly as-is (just replace anything in `<angle brackets>` with your own values).

---

## Step 1 — Create your MongoDB Atlas database

1. Go to https://www.mongodb.com/cloud/atlas/register and create a free account.
2. Create a free cluster (choose the **M0 Free** tier).
3. **Database Access** (left menu) → **Add New Database User**
   - Username: `portaladmin`
   - Password: click "Autogenerate Secure Password" and **save it somewhere**
4. **Network Access** (left menu) → **Add IP Address** → click **Allow Access From Anywhere** (`0.0.0.0/0`)
5. **Database** (left menu) → click **Connect** on your cluster → **Drivers** → copy the connection string. It looks like:

```
mongodb+srv://portaladmin:<password>@cluster0.xxxxx.mongodb.net/?retryWrites=true&w=majority
```

6. Replace `<password>` with your actual password, and add `immigration-portal` as the database name right after `.net/`:

```
mongodb+srv://portaladmin:YOUR_PASSWORD@cluster0.xxxxx.mongodb.net/immigration-portal?retryWrites=true&w=majority
```

Save this full string — you'll paste it into Render in Step 3.

---

## Step 2 — Push the code to GitHub

Open a terminal in the `immigration-portal` folder and run:

```bash
git init
git add .
git commit -m "Initial commit"
```

Go to https://github.com/new, create a new **empty** repository named `immigration-portal` (don't add a README/.gitignore there), then run:

```bash
git remote add origin https://github.com/<your-github-username>/immigration-portal.git
git branch -M main
git push -u origin main
```

---

## Step 3 — Deploy on Render

1. Go to https://render.com and sign up / log in (use "Sign in with GitHub" for the easiest setup).
2. Click **New +** → **Web Service**.
3. Select your `immigration-portal` repository.
4. Fill in these settings:

| Field | Value |
|---|---|
| Name | `immigration-portal` (or anything you like) |
| Root Directory | `backend` |
| Runtime | `Node` |
| Build Command | `npm install` |
| Start Command | `npm start` |
| Instance Type | `Free` |

5. Scroll to **Environment Variables** and add each of these (click "Add Environment Variable" for each row):

```
PORT=10000
NODE_ENV=production
MONGO_URI=mongodb+srv://portaladmin:YOUR_PASSWORD@cluster0.xxxxx.mongodb.net/immigration-portal?retryWrites=true&w=majority
JWT_SECRET=<paste a long random string here>
JWT_EXPIRE=15m
JWT_REFRESH_SECRET=<paste a different long random string here>
JWT_REFRESH_EXPIRE=7d
MAX_FILE_SIZE_MB=5
UPLOAD_DIR=uploads
ADMIN_EMAIL=admin@yourdomain.com
ADMIN_PASSWORD=<choose a strong admin password>
ADMIN_NAME=System Administrator
CLIENT_URL=https://immigration-portal.onrender.com
```

> To generate a random secret for `JWT_SECRET` / `JWT_REFRESH_SECRET`, run this locally and paste the output:
> ```bash
> node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
> ```

> For `CLIENT_URL`, use the URL Render shows you for this service (you'll see it at the top of the dashboard after creating the service — update this variable afterward if it differs).

6. Click **Create Web Service**. Render will build and deploy automatically. Wait for the status to show **Live**.

---

## Step 4 — Seed the admin account

1. In your Render service dashboard, click the **Shell** tab.
2. Run:

```bash
npm run seed
```

This creates your admin login using the `ADMIN_EMAIL` / `ADMIN_PASSWORD` you set in Step 3.

---

## Step 5 — Test it

1. Open the URL Render gave you, e.g. `https://immigration-portal.onrender.com`
2. You should see the landing page.
3. Register a new client account and confirm it works.
4. Go to `/admin-login.html` and log in with your `ADMIN_EMAIL` / `ADMIN_PASSWORD`.

---

## Notes

- **Free tier sleep**: Render's free tier spins down after inactivity — the first request after idle time may take ~30-60 seconds to respond.
- **File uploads on free tier**: Render's free tier uses an ephemeral filesystem — uploaded documents will be deleted on redeploy/restart. For production use with persistent file storage, either upgrade to a paid plan with a persistent disk, or switch the upload logic to a cloud storage provider (e.g. AWS S3, Cloudinary).
- **Updating the site later**: any time you push new commits to `main` on GitHub, Render automatically redeploys.
