# FinAI For Banks

Enter a company name, get live-sourced financial analysis: summary, key figures, insights, risks, a Strong / Moderate / Weak / Distressed category, and a PDF report.

Files: `index.html` (the app), `api/analyze.js` (serverless function: Firecrawl web search + Claude analysis), `vercel.json`, `package.json`.

## Deploy with GitHub + Vercel (no terminal)
1. Create a GitHub repository and upload ALL files from this folder to the repository root (index.html and the api folder must be at the top level, not inside a sub-folder).
2. At vercel.com/new, import that repository. Framework Preset: **Other**. Leave Root Directory, Build Command and Output Directory empty.
3. Before clicking Deploy, open **Environment Variables** and add:
   - `ACCESS_CODE` (required: the password users type on the page; the app refuses to run without it)
   - `ANTHROPIC_API_KEY` (required, from console.anthropic.com)
   - `FIRECRAWL_API_KEY` (recommended, from firecrawl.dev; without it the app uses AI knowledge only and says so)
   - `ANTHROPIC_MODEL` (optional, default claude-sonnet-5-5)
4. Click Deploy. Your link looks like `https://<project>.vercel.app`.
5. Share the link and the access code only with people you trust, because every analysis spends API credits. (Vercel's own Password Protection is a paid Pro feature and not needed; the access code works on the free Hobby plan.)

If you add variables after deploying, redeploy once so they take effect.

## Notes
- One analysis = 4 Firecrawl searches + 1 Claude call (up to about 60 seconds; set in vercel.json).
- Banks use a bank rubric (ROE, CET1, credit loss ratio, NPL, cost-to-income, LCR, earnings growth). Other companies use the corporate rubric.
- Decision-support only; not a credit rating or credit advice.
