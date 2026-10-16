# Service Hub — O7 Digital Group

Plateforme de service SaaS en cours de validation. Frontend **Vercel** (projet `servicehub`), API et PostgreSQL **Railway**. Domaine commercial réservé : **https://servicehub.o7digitalgroup.com** ; ouverture maintenue en attente de validation complète. URL de revue : **https://servicehub-o7.vercel.app**.

Inscription, essai gratuit de sept jours, onboarding, espaces abonnés isolés, configuration des formulaires/workflows/SLA, équipes et invitations, imports CSV/Excel, catalogue tarifaire O7 et intégration Stripe exclusivement en mode test. Les prix utilisateurs, clés Stripe, SMTP et scopes Olivia multi-abonnés restent à configurer avant la mise en vente. La licence de plateforme est récurrente : **399 USD chaque année**, en plus de l'abonnement utilisateurs.

[État détaillé, tests, limites, DNS et procédure de lancement](docs/SAAS-DELIVERY.md). Travail sur `main` ; sauvegarde du code initial sur `backup`. Le backend de validation est Railway `dev`, avec sa base indépendante. Railway `production` n'est pas modifié. Les données et comptes illustratifs sont isolés dans leur propre espace ; les nouveaux comptes partent avec un espace vide.

## Accès et permissions

Accès de test privés : `.local/ACCES-DEV.md`, exclu de Git. Le superadministrateur utilise `olivier.steineur@o7digitalgroup.com`. Son mot de passe de démonstration est conservé ; aucun mot de passe n’est inclus dans les sources.

Superadministrateur, admin et gérant voient toutes les entreprises, conformément au choix du propriétaire. Les techniciens voient leurs tickets affectés. Les clients disposent du dashboard, des rapports et des tickets de leur entreprise, sans notes internes. L’administration permet de créer et suspendre les comptes selon la hiérarchie des rôles. Les sessions des comptes suspendus sont immédiatement refusées.

## Lancer localement

Node.js 22+ et une base PostgreSQL **dédiée à la démo** sont requis.

```sh
npm ci
cp .env.example .env
# Renseigner DATABASE_URL et SESSION_SECRET (32 caractères aléatoires minimum).
npm run migrate
npm run seed
npm start
```

Le seed initial crée 20 entreprises, 20 contacts, 60 tickets, 25 comptes internes illustratifs et 4 comptes clients, plus un profil client fictif dédié à la présentation. `DEMO_INTERNAL_USERS` configure le nombre initial de comptes internes (4–100). Le seed est idempotent ; il ne réinitialise ni les tickets ni les mots de passe et n’est pas exécuté au démarrage. Les accès générés sont conservés dans `.local/demo-access.json`, hors de Git.

## Intégrations

- Chat **Olivia V3.5 réel** : passerelle serveur dédiée au VPS2, scopes distincts par entreprise/client et technicien, conversations sauvegardées dans PostgreSQL. Variables serveur `OLIVIA_BASE_URL` et `OLIVIA_API_KEY`. Le chat ne publie pas de réponses et ne modifie pas les tickets.
- Brouillons de tickets : mode de démonstration distinct, clairement identifié, avec validation humaine avant publication.
- Reporting **Hugging Face** : prêt côté serveur, en attente du token et du modèle du propriétaire. Variables `HF_TOKEN` et `HF_REPORT_MODEL`. Sans configuration, les rapports de données et graphiques restent disponibles et le bouton de synthèse IA est désactivé. Pas de réponse IA fabriquée.
- Logo et lien holding : https://www.o7digitalgroup.com/. Marque Service Hub configurable via `BRAND_NAME` et `BRAND_SUBTITLE`.

[Contrats, scopes et limites opérationnelles](docs/DEV.md). Aucune pièce jointe ou messagerie externe n’est activée.

## Vérification

```sh
npm run build
npm test
# Démarrer le serveur pour les contrôles dans le navigateur.
npm run test:browser
npm run test:dashboard
npm run test:devices
```

Les tests utilisent exclusivement la base dédiée et suppriment leurs données locales temporaires. Ne pas les exécuter sur une base de production. Tests navigateur avec Google Chrome sur macOS ; `CHROME_PATH` permet un autre chemin Chromium. Pour Railway dev : `QA_BASE_URL=https://service-hub-dev-3fbf.up.railway.app` et `QA_ACCESS_PATH=.local/dev-access.json`. Captures privées dans `.local/screenshots/`.

## Déployer sur dev

Le frontend commercial est publié sur le projet Vercel `servicehub` :

```sh
vercel link --project servicehub --scope olivier-steineur --yes
vercel deploy --prod --yes
```

`vercel.json` publie uniquement `dist/` après vérification du build. Le build exclut les aperçus illustratifs. Les routes `/api/*` et `/health` sont relayées vers le backend Railway **dev**, qui conserve les comptes, sessions, intégrations et données de la version premium. Le navigateur utilise la même origine Vercel pour les cookies sécurisés et la protection CSRF. Aucune variable serveur ni base de données n'est nécessaire sur Vercel. Les chemins `/demo` et `/cliente` sont servis par Vercel. L'environnement Railway `production` reste la version stable initiale indépendante.

Pour mettre à jour le backend uniquement :

```sh
railway environment link dev
railway up --service service-hub --environment dev --detach
```

`railway.json` : Docker, migration avant déploiement, `/health` et écoute sur `PORT`. Variables serveur : `DATABASE_URL=${{Postgres.DATABASE_URL}}`, secret de session, `NODE_ENV=production` (cookies HTTPS), `APP_ENV=dev`, `DEMO_MODE=true`, `PORT=3000`. Le PostgreSQL utilise un volume persistant ; un redéploiement n’exécute que les migrations manquantes.

[Documentation dev](docs/DEV.md) · [scénario initial en espagnol](docs/DEMO-ES.md) · [réutilisation initiale](docs/REUSE.md) · [brief](docs/BRIEF.md).
