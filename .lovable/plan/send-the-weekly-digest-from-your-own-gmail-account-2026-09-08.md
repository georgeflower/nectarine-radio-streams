# Send the weekly digest from your own Gmail account

Lovable's built-in email sending always needs a domain you own — there is no shared "from Lovable" sender. So the report will go out from your Gmail account instead, using Lovable's Gmail connection. It lands in the same inbox it is sent from: **goran.liljeberg@gmail.com**.

## What happens

1. **Connect Gmail** — a connect card appears in chat; you sign in with your Google account and allow "send email". Only the send permission is needed, nothing is read.
2. **Store the recipient** — goran.liljeberg@gmail.com is saved as the report address (kept out of the code).
3. **Send through Gmail** — the already-built weekly report function stops looking for the Lovable email template and instead composes an HTML email (plays with week-over-week change, unique songs, loves, Last.fm sign-ins, busiest day, top five songs, four-week trend) and sends it via Gmail.
4. **Test it** — the "Send digest now" button in Diagnostics is used to send one real email to your inbox right away; the Monday 07:00 schedule and the one-per-hour test limit stay as they are.

## Technical details

- Link the `google_mail` connector to the project (scope `gmail.send`); read `LOVABLE_API_KEY` and the linked `GOOGLE_MAIL_API_KEY` in the edge function.
- Set `DIGEST_RECIPIENT_EMAIL=goran.liljeberg@gmail.com` as a project secret.
- `supabase/functions/weekly-digest/index.ts`: replace the `send-transactional-email` invoke with a POST to `https://connector-gateway.lovable.dev/google_mail/gmail/v1/users/me/messages/send` carrying a base64url-encoded RFC 2822 message (UTF-8 safe subject, `text/html` body, inline styles). Non-OK gateway responses are logged and surfaced, and `digest_runs` is only written after a successful send.
- Add a small `renderDigestHtml(templateData)` helper next to the function plus a unit test for it and for `weekStart`/`delta`.
- Redeploy `weekly-digest`, then trigger a test send and confirm the email arrives.
- No changes to the counters, stats function, cron job, or the app UI.
