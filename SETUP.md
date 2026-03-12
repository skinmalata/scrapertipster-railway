# WinFulltime Setup Guide 🏆

Welcome! This guide will help you set up your own football predictions website. Let's do this together, step by step!

## What Do You Need? 📋

Before we start, you'll need these free accounts:

1. **Supabase** - This is like a magic box that stores all your website's data (users, predictions, payments)
2. **PayPal** - This handles the money when people buy VIP membership
3. **Google Account** - For the AI analysis feature (optional)

Don't worry, I'll show you how to get each one!

---

## Step 1: Get Supabase (Your Database) 🗄️

Supabase is free and stores everything your website needs.

### 1.1 Create Supabase Account
1. Go to [supabase.com](https://supabase.com)
2. Click **"Start your project"**
3. Enter your email and create a password
4. Click **"Create new project"**

### 1.2 Fill In The Details
- **Organization name**: Your name or company name
- **Name**: `winfulltime` 
- **Database password**: Create a strong password (write it down!)
- **Region**: Choose the one closest to you

### 1.3 Wait for Setup
- Wait about 2 minutes for Supabase to create your project
- You'll see a green checkmark when ready

### 1.4 Get Your Keys
1. Click **"Project Settings"** (the gear icon ⚙️)
2. Click **"API"** on the left
3. Look for **"Project URL"** - copy it
4. Look for **"service_role"** under "Project API keys" - copy it (click the eye icon to see it)

**🎉 Great! You got your Supabase keys!**

---

## Step 2: Set Up The Database Tables 🗃️

Your database needs to know what kind of information to store.

### 2.1 Go to Table Editor
1. In Supabase, click **"Table Editor"** in the left menu
2. Click **"Create a new table"**

### 2.2 Create First Table: "profiles"
Create this table 5 times with these exact names:

| Table Name | Columns |
|------------|---------|
| profiles | id (uuid), email (text), full_name (text), vip_status (text), vip_expires_at (timestamp), created_at (timestamp), updated_at (timestamp) |
| subscriptions | id (uuid), user_id (uuid), plan_type (text), payment_status (text), amount (number), starts_at (timestamp), expires_at (timestamp), created_at (timestamp) |
| payments | id (uuid), user_id (uuid), amount (number), currency (text), payment_id (text), status (text), plan_type (text), created_at (timestamp) |

**For each table:**
1. Table name: type the name
2. Columns: click **"Add column"** and add each column
3. Click **"Save"**

### 2.3 Important: Make profiles public!
1. Click **"Authentication"** in Supabase left menu
2. Click **"Policies"**
3. Click **"profiles"** table
4. Click **"New policy"**
5. Name it "Enable read access for everyone"
6. Select **"Allow"** for **"SELECT"** action
7. Click **"Save"**

---

## Step 3: Get PayPal (For Payments) 💰

### 3.1 Create PayPal Account
1. Go to [paypal.com](https://paypal.com)
2. Click **"Sign Up"** and create a business account

### 3.2 Get Your PayPal Keys
1. Go to [developer.paypal.com](https://developer.paypal.com)
2. Click **"Dashboard"**
3. Click **"Sandbox"** → **"Accounts"**
4. If you don't have an account, click **"Create account"**
5. Go to **"My Apps & Credentials"**
6. Click **"Create app"**
7. Name it `winfulltime`
8. Copy **"Client ID"**
9. For **"Secret"**, click **"Show"** and copy it

**🎉 You got your PayPal keys!**

---

## Step 4: Configure Your Website ⚙️

### 4.1 Open Your Project Files
1. Open the folder where you downloaded the code
2. Find the file named `.env` (or create it)
3. Open it with Notepad (right-click → Open with → Notepad)

### 4.2 Copy This Template
Copy and paste this into your .env file:

```
# Supabase - Your Database
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=your-service-role-key-here

# PayPal - Get money from VIP members
PAYPAL_CLIENT_ID=your-paypal-client-id
PAYPAL_CLIENT_SECRET=your-paypal-secret
PAYPAL_MODE=sandbox

# AI Analysis (Optional - for smart predictions)
GEMINI_API_KEY=your-gemini-api-key

# Your Website
BASE_URL=http://localhost:3002
ADMIN_EMAIL=your-email@gmail.com
PORT=3002
```

### 4.3 Replace The Placeholders
Replace each `your-...` with your actual keys:

| Replace This | With This |
|--------------|-----------|
| `https://your-project.supabase.co` | Your Supabase URL |
| `your-service-role-key-here` | Your Supabase service_role key |
| `your-paypal-client-id` | Your PayPal Client ID |
| `your-paypal-secret` | Your PayPal Secret |
| `your-email@gmail.com` | Your email |

---

## Step 5: Run Your Website 🚀

### 5.1 Install Node.js (If You Don't Have It)
1. Go to [nodejs.org](https://nodejs.org)
2. Download the **LTS version** (the one on the left)
3. Install it (click Next Next Next...)

### 5.2 Open Your Terminal
1. Open **Command Prompt** (search for "cmd" or "terminal")
2. Go to your project folder:
   ```
   cd C:\Users\Toks\Documents\Apps\winfulltime
   ```
   (or wherever you saved the files)

### 5.3 Start The Website
Type this and press Enter:
```
npm start
```

### 5.4 Open Your Website! 🎉
1. Open your browser (Chrome, Edge, etc.)
2. Go to: `http://localhost:3002`
3. **CONGRATULATIONS!** Your website is live!

---

## Step 6: Make Yourself Admin 👑

### 6.1 Create Your Admin Account
1. Go to your website: `http://localhost:3002/login`
2. Sign up with your email and a password
3. (This creates your user account)

### 6.2 Make Yourself Admin
1. Go to this URL (replace with your info):
```
http://localhost:3002/api/admin/setup?email=YOUR_EMAIL&secret=adminsecret123
```
2. If it says `{"success":true,"message":"User is now admin: your@email.com"}` - YOU'RE AN ADMIN!

### 6.3 Access Admin Dashboard
1. Go to: `http://localhost:3002/admin`
2. Log in with your account
3. **Welcome to your Admin Dashboard!**

---

## Step 7: Go Live! (Put Your Website On The Internet) 🌐

### Option A: Railway (Easiest - Free Tier)

1. Go to [railway.app](https://railway.app)
2. Sign up with GitHub
3. Click **"New Project"** → **"Deploy from GitHub repo"**
4. Connect your GitHub and select your project
5. In the **"Variables"** tab, add all your .env variables
6. Click **"Deploy"**

### Option B: Render (Also Free)

1. Go to [render.com](https://render.com)
2. Sign up with GitHub
3. Click **"New"** → **"Web Service"**
4. Connect your GitHub and select your project
5. Add all your environment variables
6. Click **"Deploy"**

---

## Common Problems & Solutions 🔧

### "Cannot find module 'dotenv'"
Run this in your terminal:
```
npm install
```

### "Supabase connection error"
Check your .env file has the correct SUPABASE_URL and SUPABASE_SERVICE_KEY

### "PayPal not working"
Make sure you're in **sandbox** mode for testing, or **live** mode for real payments

### Website not loading
Make sure you're running `npm start` and looking at port 3002

---

## What's Next? 📈

Your website can now:
- ✅ Show football predictions
- ✅ Let users sign up and login
- ✅ Track visitors (you just added this!)
- ✅ Sell VIP memberships (with PayPal)
- ✅ Send AI-powered match analysis

**You're all set! Good luck with your football predictions website!** ⚽🏆

---

## Need Help?

If you get stuck, check:
1. Your .env file is correct
2. Your Supabase tables are created
3. Your PayPal keys are correct
4. Node.js is installed

You can do it! 💪
