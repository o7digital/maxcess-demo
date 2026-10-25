# Rapports Hugging Face

L'application conserve les tableaux, graphiques et exports PostgreSQL. Le bouton de synthèse ajoute un rapport rédigé à partir des indicateurs autorisés pour le rôle connecté. La langue suit le choix anglais, espagnol, français, allemand, italien, portugais, japonais, russe ou danois de l'utilisateur, puis la langue de son organisation. Les noms des clients sont remplacés par des références anonymes avant envoi ; aucun texte de ticket, mot de passe ni secret n'est envoyé. La génération consomme le quota IA de l'abonné et est limitée à 1 600 tokens de sortie.

## Configuration de production OVH — Service Hub

1. `HF_TOKEN` : token Hugging Face à droits fins, avec **Make calls to Inference Providers**. Le créer depuis https://huggingface.co/settings/tokens et l’enregistrer dans /opt/o7/apps/maxcess/app.env sur VPS1. Ne pas le mettre dans Git, Vercel, le frontend ou une capture publique.
2. `HF_REPORT_MODEL` : identifiant exact d'un modèle de chat disponible auprès d'Inference Providers (avec le suffixe fournisseur si nécessaire). Vérifier sa disponibilité et les éventuelles conditions d'accès dans le Playground du compte.
3. Crédit/facturation Hugging Face disponible et budget d'utilisation convenu. Le quota de requêtes de Service Hub limite l'usage par abonné ; ce quota n’est pas un plafond monétaire. Suivre les dépenses dans le compte Hugging Face et choisir le modèle en fonction du budget.

L'intégration utilise `https://router.huggingface.co/v1/chat/completions`. Après configuration : recréer uniquement le service API Maxcess sur OVH, vérifier l'état de l'intégration, puis générer une synthèse depuis Informes avec des données QA. Sans token et modèle configurés, le bouton reste désactivé et les rapports de données fonctionnent.

Sources : [jetons et accès Inference Providers](https://huggingface.co/docs/inference-providers/index), [facturation](https://huggingface.co/docs/inference-providers/pricing), [chat completions](https://huggingface.co/docs/inference-providers/tasks/chat-completion).


Le 24 octobre 2026, le token existant de l’infrastructure O7 a été retrouvé et testé sans afficher sa valeur. Le modèle de reporting validé est `meta-llama/Llama-3.3-70B-Instruct:cheapest` via le routeur HF. La configuration du CRM et les autres services ne sont pas modifiés. Une synthèse effective doit être testée via Service Hub après déploiement ; la simple présence des variables ne valide pas les permissions ou les crédits futurs.

Les rapports v4 ajoutent la période précédente de même durée, les demandes actuellement ouvertes de toutes dates, leur ancienneté, les demandes sans responsable et les résultats par agent. Le premier délai de réponse utilise la première réponse publique d’un utilisateur interne ; les notes et réponses clients sont exclues. Les dates de résolution manquantes ne comptent pas comme un SLA réussi ni comme une durée nulle. Le relevé provient d’un instantané PostgreSQL cohérent. Les noms des agents, des clients et les catégories personnalisées sont anonymisés avant HF ; aucun texte de demande ni pièce jointe n’est envoyé. Les exports CSV/PDF et rapports enregistrés restent disponibles sans HF.

## Eight business reports

`public/report-types.js` is the shared, validated catalogue. The UI selects a type
and sends `filters.report_type` when saving; `GET /api/analytics?report_type=...`
previews it. The JSON snapshot stores the type, its metrics, tables and caveats,
so saved reports and PDF exports preserve the selected purpose. Missing types in
older snapshots default to `executive`. Unknown types return HTTP 400.

- `executive`: direction-level service review and previous-period comparison.
- `support`: incoming requests, all scoped closures in the period (including older
  requests), first responses, p90 and daily flow.
- `sla`: dated-resolution compliance plus current breaches, unassigned breaches,
  critical open requests and commitments due within 24 hours.
- `capacity`: current queues, assigned agents, unassigned work and concentration;
  this does not measure attendance, FTE availability or staff utilization.
- `engineering`: customer/site/category breakdown, durations, attachments and
  documented resolutions; equipment reliability, repair hours and costs are not
  available from the current schema.
- `recurring`: repeated customer/site/category groups as investigation leads,
  without claiming a verified root cause.
- `quality`: documentation coverage, missing resolution dates, public staff
  replies and knowledge-capture opportunities, without fabricated FCR or CSAT.
- `customer`: service review within the user's authorized customer scope.

HF receives a specific analysis brief for the selected type and its numeric
aggregates. Table text values are anonymized; at most 25 evidence rows per table
are transmitted, with full row counts and truncation flags. The model is told not
to extrapolate omitted rows. Full tables remain available in authorized CSV/PDF
exports. All types use the same workspace/company/assignment/department scope
and the same read-only repeatable PostgreSQL snapshot. No schema migration or
client data conversion is required.

## Printing, PDF and Excel

Current and saved reports expose Preview, Print, PDF, Excel (.xlsx) and CSV.
Printing uses an isolated same-origin sandboxed preview frame (no scripts), with
its own report-only document and print stylesheet. Print/PDF open the browser and
OS dialog, where the user chooses a printer or Save as PDF. The site does not
enumerate local printers or silently select a PDF destination. The print control
waits for document/fonts to be ready. Physical printer operation requires the
user's device and is not exercised by automated tests.

`public/report-chart-data.js` is the shared numerical chart model for SVG and
Excel; charting uses the report's own metrics/tables, preserves zeros versus
missing measurements and aggregates long time series without dropping totals.
The full tables remain available even when a chart shows only the top ten groups.

Excel export is an actual XLSX workbook, not a renamed CSV. Seven localized
sheets contain overview, indicators, full details, native editable charts, chart
source data, methodology and the saved HF analysis when present. ExcelJS creates
the workbook, then native OOXML chart and drawing relationships are added; no
raster screenshot is used. The generated packages are independently read with
openpyxl in QA, in addition to the Node tests.

`GET /api/reports/export.xlsx` exports fresh data for the current filters.
`GET /api/reports/:reportId/export.xlsx` exports the stored snapshot, including its
saved HF text. Saved exports require the same user, tenant, current access scope
and, for customer accounts, company. Exports are read-only, not cached and
rate/concurrency bounded; more than 200,000 cells requires narrower filters.
No new runtime dependency, PDF server or printer service is installed.

## Chart presentation choices

Each current report chart offers horizontal bars, vertical columns and lines.
Disjoint distributions additionally offer pie and doughnut charts, including a
series selector where several measures are available. Overlapping SLA/quality
indicators and duration/percentage measures are not offered as pie shares.
Status distribution defaults to a doughnut chart. Zero-only distributions show an
explicit empty-share message; unknown durations remain gaps. More than ten pie
categories are represented as the first nine plus an aggregated Other groups
slice, preserving the complete total.

Choices are validated in `filters.chart_styles` and stored with saved snapshots.
The current Excel URL JSON-encodes the same options; native XLSX pie, doughnut,
column, bar and line parts preserve them. Saved/printed reports use their stored
presentation and do not expose editable controls. No database migration is
needed: the options live in the existing filters/snapshot JSON.
