# AIRE Business Brokerage — Production Intake Launch

## What this adds

- `POST /api/intake` validates public form submissions, rate-limits requests, and ignores honeypot spam.
- The endpoint creates a lead in Lofty, assigns it to the configured AIRE owner, applies source/type tags, triggers Lofty's new-lead alert, and pins the full inquiry as a note.
- `intake.js` upgrades the website forms only on production hosting. GitHub Pages remains a review-only preview and retains the current mailto fallback.

## Production configuration

Set these only in the host's encrypted environment-variable panel:

| Variable | Value |
| --- | --- |
| `LOFTY_API_KEY` | Existing Lofty API key — secret |
| `LOFTY_ASSIGNED_USER_ID` | Sean's Lofty user ID |
| `AIRE_ALLOWED_ORIGINS` | `https://airebusinessbrokerage.com,https://www.airebusinessbrokerage.com` |

Never place the Lofty key in HTML, JavaScript served to visitors, GitHub, or chat.

## Launch order

1. Deploy this repo on Vercel as a production project.
2. Add the three environment variables above.
3. Use Vercel's temporary URL to submit one real controlled test inquiry and confirm it appears in Lofty with the note and tags.
4. Connect `airebusinessbrokerage.com` and `www.airebusinessbrokerage.com` in Vercel.
5. Add the exact DNS records Vercel provides at the domain registrar; Vercel then issues SSL automatically.
6. Change `AIRE_ALLOWED_ORIGINS` to the final domain pair, redeploy, and test each of the five forms.

## Operational rule

Do not turn on a Lofty Smart Plan or auto-text sequence for these leads until the intake fields, source, consent wording, and one live test have been reviewed in Lofty.
