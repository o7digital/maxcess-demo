# Service Hub · état de livraison SaaS

Éditeur : O7 Digital Group. Domaine commercial : `https://servicehub.o7digitalgroup.com`.

## Périmètre et environnements

Travail sur `main`, conformément à l'instruction directe du propriétaire (prioritaire sur la branche `dev` citée dans le brief). `backup` conserve le commit `b8ceabd` avant la transformation. Le dépôt, Express, PostgreSQL, les sessions, tickets, rapports et l'intégration Olivia sont réutilisés.

- Frontend : nouveau projet Vercel `servicehub`. URL de revue : `https://servicehub-o7.vercel.app`.
- Backend de validation : service `service-hub`, environnement Railway `dev` du projet existant.
- Railway `production` : ni déployé ni modifié. Sa base et ses secrets sont conservés.
- Ancien frontend Vercel `maxcess-demo` : conservé. Il continue à relayer son API vers Railway dev.
- Les déploiements Git automatiques Vercel sont désactivés dans `vercel.json` afin qu'un push sur `main` ne publie pas une version non validée.

Le domaine commercial est réservé sur le nouveau projet Vercel. Une règle par nom d'hôte le maintient sur une page d'ouverture en attente, même si les DNS sont ajoutés avant la fin des validations. La règle ne s'applique pas à l'URL de revue. Ne pas la retirer avant satisfaction des critères de lancement ci-dessous.

## Audit initial

Les migrations initiales contenaient 20 entreprises clientes, 30 comptes et 60 tickets sur Railway dev. La hiérarchie de rôles fonctionnait, mais `admin` et `manager` disposaient d'un accès global sans notion d'abonné SaaS. Il n'existait ni inscription, ni configuration autonome, ni essai, ni paiement. Le seed n'est pas exécuté au démarrage.

L'ancienne passerelle Olivia accepte uniquement `global`, `client-N` et `support-N`, avec des scopes provisionnés préalablement. Ces scopes ne peuvent pas être partagés avec les futurs abonnés. Les noms de domaines techniques et les données illustratives apparaissaient dans le parcours d'entrée.

## Fonctionnalités développées

1. **Isolation SaaS** : `tenants` distingue l'abonné des entreprises clientes qu'il gère. Les données existantes restent dans l'espace illustratif `1`. Chaque inscription crée un abonné vide, un administrateur, sa propre entreprise cliente et sept jours d'essai. Les lectures et écritures sont bornées par le compte authentifié ; les clés étrangères composites empêchent les rattachements entre abonnés. Les rôles historiques sont conservés. Le privilège O7 utilise `is_platform_owner`, que l'inscription et les API d'administration abonné ne peuvent attribuer.
2. **Configuration autonome** : onboarding en cinq étapes ; identité, logo HTTPS, langue, fuseau, modèles, équipes, départements, sites, catégories, champs personnalisés typés, étapes, SLA en heures corrues, affectations et escalades. Les réglages sont validés, persistés et utilisés par les tickets. Les nouveaux champs requis sont également pris en compte par les imports. Le dashboard utilise les indicateurs sélectionnés par l'abonné et les données PostgreSQL des trente derniers jours.
3. **Utilisateurs et données** : entreprises/contacts, utilisateurs, équipes et rôles ; invitations à usage unique expirant après 72 heures ; import CSV/XLSX avec prévisualisation et correspondance des colonnes, limité à 500 lignes/1 Mo. Import transactionnel : une ligne invalide annule l'ensemble de l'import. Les contacts ont un nom et un e-mail propres à l'espace.
4. **Comptes et cycle d'essai** : confirmation d'adresse, récupération de mot de passe avec jetons hachés à usage unique pendant une heure, invalidation des sessions après réinitialisation. Fin d'essai en lecture seule ; conservation des données. Paiements en retard : trois jours de régularisation, puis lecture seule. Une suspension O7 bloque l'espace, tout en laissant accéder à la facturation. Une réactivation ne redémarre pas l'essai.
5. **Facturation** : catalogue O7 de 5/10/25/50 sièges, prix et remises configurables ; licence annuelle récurrente de 399 USD ; plan utilisateurs chaque 1/3/6/12 mois d'avance. Checkout utilise deux lignes récurrentes en facturation flexible, consentement explicite et date d'essai d'origine. Customer Portal pour cartes, factures et annulation ; changement de forfait avec contrôle des sièges et ajustements prorratés. Webhooks signés, idempotence transactionnelle et relecture de la souscription Stripe sous verrou de l'abonné. Catalogue des identifiants Stripe conservé en base. Seules les clés `sk_test_` et événements non live sont autorisés.
6. **Notifications** : file persistante pour bienvenue, validation, récupération, invitations, affectations, escalades, rappels et expiration d'essai, paiements. Worker avec verrouillage, reprise et identifiant de message stable. Aucun envoi sans SMTP configuré. La file offre une livraison au moins une fois ; un arrêt après envoi SMTP avant validation peut entraîner un doublon.
7. **Administration O7** : édition graphique des modèles, abonnés, essais, quotas, catalogue, remises, états des intégrations, suspension/réactivation ; revenu récurrent contractuel normalisé par mois et montants confirmés par Stripe. Les modèles sont éditables dans l’interface centrale et restent persistants en base. Aucun revenu n'est inventé.
8. **Interface** : identité Service Hub/O7 Digital Group, pages d'accueil, inscription, connexion, récupération, confirmation, tarification, onboarding, paramètres, abonnements et administration. Direction graphite/ivoire/citron conservée. Nouveaux parcours en espagnol/anglais ; traduction des principales vues opérationnelles héritées. Les catégories et contenus saisis par l'utilisateur gardent leurs valeurs métier. Les aperçus illustratifs ne sont pas inclus dans le build commercial Vercel.

## Validation effectuée

- Build natif et préparation des seuls fichiers frontend dans `dist/`.
- 22 tests API : historique métier, rôles, isolation entre deux abonnés, relations PostgreSQL, champs requis, SLA et affectations, transitions, imports CSV/XLSX et annulation transactionnelle, escalade sans doublon, vérification/récupération de compte, limite de sièges concurrente, invitations non réutilisables, essai expiré et lecture seule, consentement Checkout et événements Stripe signés simulés, refus du mode live.
- Chrome : accueil ES/EN, inscription, cinq étapes, configuration de champ obligatoire, ticket avec données du champ, rechargement, abonnement et absence de débordement aux largeurs 390/820/1440. Script reproductible `npm run test:saas` ; captures et accès privés dans `.local/`.
- `npm audit` : aucune vulnérabilité signalée au moment de la vérification. `uuid` d'ExcelJS est remplacé par une version corrigée via `overrides`, et l'import XLSX est testé.
- Sauvegarde réelle de Railway dev avant migration ; restauration dans une base locale temporaire : 20 entreprises, 30 comptes, 60 tickets, deux migrations initiales. Le fichier privé `.local/backups/railway-before-saas-20261015.dump` est exclu de Git. La base temporaire a été supprimée après contrôle.

Ces tests ne constituent pas une certification de sécurité ni un paiement Stripe réel. La validation d'intégration Stripe doit encore être exécutée sur le compte du propriétaire.

## Blocages de lancement

- **Stripe test** : fournir `STRIPE_SECRET_KEY=sk_test_…` et `STRIPE_WEBHOOK_SECRET=whsec_…` dans Railway dev. Créer l'endpoint de webhook `/api/billing/webhook`, configurer le Customer Portal et tester Checkout, 3D Secure, échecs, renouvellements, annulations et changements de forfait. Aucun prix live ou prélèvement réel n'a été créé.
- **Tarifs** : publier les prix mensuels des quatre paliers et les remises depuis l'administration O7. Aucun montant utilisateur n'a été choisi arbitrairement.
- **E-mails** : configurer `SMTP_URL`, `MAIL_FROM` et l'authentification du domaine expéditeur, puis valider la réception des invitations, confirmations et rappels. Les invitations stockées ne sont pas encore livrées.
- **Olivia** : provisionner des scopes indépendants pour chaque nouvel abonné et chaque identité autorisée, adapter la passerelle réelle pour les accepter, vérifier `/chat`, puis seulement activer `OLIVIA_TENANT_READY=true`. Le code calcule `tenant-<id>-user-<id>` ou `tenant-<id>-client-<id>`. Sans cela, Olivia est explicitement indisponible pour les nouveaux abonnés, sans repli vers le scope global existant. Les quotas mensuels sont déjà imposés côté serveur. L'assistance à la configuration est implémentée via le même `/chat` réel : proposition persistée, quota, portée par utilisateur/abonné, approbation explicite et refus d'une proposition devenue obsolète. Son contrat est testé avec un adaptateur simulé ; la réponse réelle pour les nouveaux abonnés reste à valider après provisionnement. Aucun endpoint upstream fictif n'est ajouté.
- **Commercial** : finaliser les coordonnées légales, conditions de conservation, politique de remboursement et traitement des taxes applicables avant mise en vente. Les pages actuelles exposent les conditions produit de base ; elles ne remplacent pas cette validation commerciale.
- **Production commerciale** : créer une base vide et un environnement distinct de validation, sans seed ni copie de comptes illustratifs. Exécuter les migrations et `scripts/bootstrap-owner.js` avec des identifiants O7 sécurisés pour créer le compte éditeur. Secrets de session indépendants, `COMMERCIAL_MODE=true`, `DEMO_MODE=false`, et `PUBLIC_APP_URL=https://servicehub.o7digitalgroup.com`. Ne pas transformer la base de validation contenant les cas fictifs en base clients.
- **Limites restantes** : la sélection Checkout dans les dernières 48 heures de l'essai doit attendre son expiration (contrainte de `trial_end` Checkout) ; le changement de périodicité d'une souscription existante demande encore un traitement O7 pour préserver l'anniversaire indépendant de la licence annuelle. Les modifications de prix ne changent pas automatiquement les contrats déjà souscrits. L'offre au-delà de 50 utilisateurs est sur devis. La liste de tickets utilise désormais une pagination de 100 lignes, un curseur et une recherche côté serveur ; l’export CSV correspond à la vue chargée. Les tests de charge restent nécessaires avant de promettre de gros volumes. La traduction des libellés opérationnels secondaires et des erreurs serveur en anglais reste à compléter.

## DNS et HTTPS

Nameservers observés : `ns01.domaincontrol.com`, `ns02.domaincontrol.com` (GoDaddy). Le 15 octobre 2026, aucun enregistrement public ne résout `servicehub.o7digitalgroup.com`. Aucun changement DNS n'a été effectué.

Vercel CLI demande précisément :

| Type | Hôte GoDaddy | Valeur        |
| ---- | ------------ | ------------- |
| A    | `servicehub` | `76.76.21.21` |

À configurer **uniquement au moment de la bascule validée**. Conserver les autres enregistrements de la holding. Ne pas changer les nameservers. Un seul fournisseur doit recevoir ce nom : frontend Vercel, backend Railway derrière les routes `/api/*`. Le certificat du nom personnalisé ne peut pas être confirmé avant résolution DNS et provisionnement Vercel. Vérifier ensuite sa chaîne, son nom et les routes `/`, `/signup`, `/login`, `/settings`, `/subscription`, ainsi que les sessions sécurisées.

## Déploiement et reprise

```sh
npm ci
npm run migrate  # seulement sur la base explicitement sélectionnée
npm run build
npm test
railway up --service service-hub --environment dev --detach
vercel link --project servicehub --scope olivier-steineur --yes
vercel deploy --target=production --yes
# Le nom personnalisé reste gardé par la page d'ouverture en attente.
# Mettre ensuite à jour l'alias de revue servicehub-o7.vercel.app si nécessaire.
```

Avant un redéploiement, sauvegarder la base ciblée. `npm run backup` utilise `DATABASE_URL` et un client `pg_dump` de version compatible, écrit un dump privé dans `.local/backups/`, sans mettre l'URL en argument de commande. Sur Railway, un dump peut être réalisé dans le service Postgres via SSH, puis téléchargé avec les commandes `railway service files`. Restaurer d'abord sur une base distincte avec `pg_restore --no-owner --no-privileges --exit-on-error` et vérifier les comptes, tickets et migrations. Ne jamais effectuer une restauration destructive sur la production pour tester une sauvegarde.

Pour un retour applicatif, redéployer l'artefact précédemment validé. Les migrations ajoutent des colonnes et tables ; aucune donnée existante n'est effacée. Ne pas revenir aux anciens scripts de seed, dont les contraintes d'unicité doivent désormais inclure l'abonné. Configurer une politique de sauvegardes automatiques et un exercice de restauration périodique avant l'ouverture payante.

## Contrôle du démarrage Railway

Le contrôle après publication a révélé que la commande de migration pré-déploiement n'était pas exécutée par la configuration effective du service. Les migrations ont été appliquées explicitement à Railway dev. Le serveur les exécute désormais aussi au démarrage sous verrou transactionnel, de manière idempotente, avant d'écouter. `/health` vérifie la dernière migration livrée et répond 503 si elle manque. Aucun seed n'est exécuté par ce mécanisme. La configuration Railway historique reste compatible, mais sa migration vers la configuration d'infrastructure prise en charge par la plateforme doit être planifiée avant sa date de retrait annoncée par la CLI.

## Chargement du logo depuis un fichier

Le champ URL a été remplacé dans l'onboarding et les paramètres par un sélecteur de fichier avec aperçu, remplacement et suppression. PNG, JPG et WebP jusqu'à 1 Mo ; les images sont décodées, réorientées et normalisées en PNG, sans agrandissement et avec un maximum de 512 × 512 pixels. L'image est conservée dans PostgreSQL, une seule par abonné, et reste disponible après redéploiement. Les administrateurs de l'espace peuvent la modifier ; un autre abonné ne peut pas lui affecter son logo. Les logos sont des images de marque publiquement consultables par identifiant opaque, sans exposition des autres données de l'espace. Le chargement et la suppression enregistrent immédiatement le logo ; les autres réglages gardent leur bouton de sauvegarde. Les anciennes URL HTTPS restent compatibles côté serveur.

Tests : décodage réel, mauvais formats, CSRF, droits, isolation, redimensionnement, remplacement, suppression ; parcours navigateur dans l'onboarding puis les paramètres, et conservation après rechargement.

## Clients internationaux et langues (15 octobre 2026)

- L'espace des clients gérés affiche **Clientes / Customers / Clients** ; les organisations abonnées restent une notion distincte.
- Migration additive `009_customer_branches.sql` : filiales appartenant à un client et à son abonné, pays ISO 3166-1 alpha-2, ville, adresse, langue de service, fuseau horaire. Les sites et tickets historiques sont conservés ; aucune filiale ni nationalité n'est inventée pour eux.
- Création/modification depuis Clients par administrateurs et responsables ; lectures limitées aux clients autorisés. Une demande peut désigner une filiale. La validation API et la clé étrangère composite empêchent tout rattachement à un autre client ou abonné. Le filtre pays des demandes utilise cette relation et conserve la portée du rôle.
- La fiche d'une demande affiche le pays et le fuseau de sa filiale, avec ses dates dans ce fuseau. Les rapports agrégés conservent le fuseau de l'organisation et l'affichent explicitement.
- Interface espagnole, anglaise et française ; choix personnel mémorisé dans `users.language`, indépendant de la langue par défaut de l'organisation et disponible aussi dans le portail client. Les libellés saisis par les utilisateurs et le contenu des demandes ne sont pas traduits automatiquement. La langue de service d'une filiale peut également être le portugais ; cela ne signifie pas que l'interface portugaise soit disponible.
- La garde du domaine commercial utilise une redirection temporaire conditionnée par l'hôte vers `launch.html`, exécutée avant la résolution des fichiers statiques. L'ancienne réécriture laissait charger l'application puis renvoyait du HTML à l'API, provoquant l'erreur de chargement visible dans la capture. L'URL de revue reste fonctionnelle ; retirer cette garde seulement après la validation commerciale prévue ci-dessus.

Validation : `npm run build`, `npm test`, parcours Chrome `npm run test:saas` puis `node scripts/international-browser-qa.js` (même `QA_BASE_URL` pour les deux). Le second crée un client et deux filiales FR/MX dans l'espace QA isolé, modifie une filiale, enregistre une demande, filtre le pays, vérifie la préférence française et le format mobile.
