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
