# Suivi des demandes

Application de suivi pour un centre d'appels de 4 agents. Aucune connaissance en code requise pour la mise en ligne : suivre les étapes ci-dessous dans l'ordre.

## 1. Supabase (base de données + connexion)

1. Créer un compte sur [supabase.com](https://supabase.com) → **New project** (plan gratuit).
2. Une fois le projet créé, aller dans **SQL Editor** → **New query**.
3. Copier tout le contenu du fichier `supabase/schema.sql`, le coller, cliquer **Run**.
4. Aller dans **Database → Replication**, activer le Realtime pour la table `demandes`.
5. Aller dans **Authentication → Users → Add user**, créer un compte par agent (email + mot de passe). Répéter 4 fois.
6. Pour chaque agent créé, cliquer dessus → modifier **User Metadata** → ajouter :
   ```json
   { "name": "Prénom Nom" }
   ```
   C'est ce nom qui apparaîtra dans l'application.
7. Aller dans **Project Settings → API**. Noter deux valeurs :
   - **Project URL**
   - **anon public key**

## 2. GitHub (dépôt du code)

1. Créer un compte sur [github.com](https://github.com) si besoin.
2. Créer un nouveau dépôt (**New repository**), le laisser vide, sans README.
3. Sur la page du dépôt vide, utiliser **uploading an existing file** et glisser-déposer tout le contenu de ce dossier (sauf `node_modules` s'il existe).

## 3. Cloudflare Pages (mise en ligne)

1. Créer un compte sur [pages.cloudflare.com](https://pages.cloudflare.com).
2. **Create a project → Connect to Git**, choisir le dépôt GitHub créé à l'étape 2.
3. Configuration du build :
   - Framework preset : **Vite**
   - Build command : `npm run build`
   - Build output directory : `dist`
4. Avant de déployer, ajouter les variables d'environnement (section **Environment variables**) :
   - `VITE_SUPABASE_URL` = Project URL notée à l'étape 1.7
   - `VITE_SUPABASE_ANON_KEY` = anon public key notée à l'étape 1.7
5. Cliquer **Save and Deploy**.
6. Une URL en `.pages.dev` est générée : c'est l'application, accessible aux 4 agents.

## Utilisation quotidienne

- **+ Nouvelle demande** : client, objet, qui doit agir ensuite. 3 champs, quelques secondes.
- **Suivi** : liste des demandes ouvertes, les plus anciennes sans mise à jour remontent en premier avec l'indicateur "Oubliée ?".
- **Tableau de bord** : vision du responsable (charge par agent, par département, délai moyen).
- Clic sur une ligne → mise à jour de la situation, changement de "qui doit agir", ou **Marquer traité**.

## Modifier l'application plus tard

Pour ajouter ou ajuster une fonctionnalité, fournir ce dépôt (ou son contenu) à Claude avec la demande de modification. Aucune ligne de code à écrire manuellement.
