# Career Conquest - Deployment Guide

This guide covers deploying the Career Conquest battle map to production with Vercel and Supabase.

## Architecture Overview

```
career repo (Obsidian vault)
  |
  | git push (Applications/** or MASTER_APP_LIST.md)
  v
GitHub Action
  |
  | parses notes, commits applications.json
  v
career-conquest repo (this repo)
  |
  | auto-deploy on push
  v
Vercel (hosts the Next.js site)
  |
  | real-time visitor interaction
  v
Supabase (messages + presence)
```

## Step 1: Deploy to Vercel

1. Go to [vercel.com/new](https://vercel.com/new)
2. Import the `BOYSABIO/career-conquest` repository
3. Framework preset: **Next.js** (auto-detected)
4. No build settings changes needed — `npm run build` already runs the parser
5. Click **Deploy**

The site will auto-redeploy whenever the GitHub Action pushes an updated `applications.json`.

## Step 2: Set Up Supabase (for visitor interaction)

Supabase powers the real-time guestbook (encouragement/roast messages) and live spectator count. The battle map works without it, but visitor interaction will be disabled.

### Create a Supabase project

1. Go to [supabase.com](https://supabase.com) and create a new project
2. Run the schema in `supabase-schema.sql` in the SQL Editor to create the messages table
3. Copy your project URL and anon key from Settings > API

### Add environment variables on Vercel

Go to your Vercel project > Settings > Environment Variables and add:

```
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here
```

Redeploy after adding the variables.

## Step 3: Custom Domain (optional)

1. In Vercel project settings, go to Domains
2. Add your custom domain
3. Follow the DNS instructions Vercel provides

## Local Development

```bash
# Clone the repo
git clone https://github.com/BOYSABIO/career-conquest.git
cd career-conquest

# Install dependencies
npm install

# Run the parser (point to your Obsidian vault)
$env:VAULT_PATH = "C:\Users\SABIO\Documents\GitHub\career"  # PowerShell
# export VAULT_PATH="/path/to/career"                        # bash/zsh

npx tsx scripts/parse-applications.ts

# Start dev server
npm run dev
```

The site runs at `http://localhost:3000`.

## Environment Variables Reference

| Variable | Where | Purpose |
|---|---|---|
| `VAULT_PATH` | GitHub Action / local dev | Path to the Obsidian vault for parsing |
| `NEXT_PUBLIC_SUPABASE_URL` | Vercel / `.env.local` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Vercel / `.env.local` | Supabase anonymous key |
| `CONQUEST_PAT` | `career` repo secret | PAT for GitHub Action to push to this repo |
