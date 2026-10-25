# Service Hub user guide

The Help / User guide menu is available in both the staff workspace and customer portal. `/help?lang=fr#help=customers` also opens an article without signing in or calling the API. Content is static, versioned and served by OVH and the Vercel fallback. Reading it does not require an AI provider. Documentation role filters affect article discovery only; authorization remains enforced by the existing API.

Twenty workflows cover getting started, access and recovery, customer companies and users, tickets, staff assignment, replies and notes, attachments, search, eight business report types, interpretation, chart styles, printing and exports, AI, roles, workspace settings, integrations, import, billing, backup and troubleshooting. Each article contains instructions, an example and limitations. GLPI is documented as an integration project on request; personal reports are not described as published company reports; workspace ZIP export is distinguished from server failover.

## Maintenance

Edit `public/user-guide/en.json` and update all eight matching locale files. Preserve article identifiers, role identifiers and schema. Content is rendered as escaped text. The language selector in the guide changes its documentation language independently of a signed-in account's preferences. Article links use the public `/help` route with a language parameter and stable article identifier.

`tests/user-guide.test.js` checks completeness, translation structure, roles, accent-insensitive search and both public route spellings. Run `npm test` and `npm run build`. Browser verification must cover search, role filtering, deep links, all languages, mobile overflow and opening/closing the guide from the staff and customer menus. Publishing requires the API image update on OVH because the public route is explicitly registered in Express, plus the configured Vercel deployment and fallback alias update.
