# Cloudflare Pages + Cloud Run + Supabase starter

A small example app matching the proposed architecture:

- **Frontend:** static HTML/CSS/JavaScript, deployed to Cloudflare Pages using Direct Upload.
- **Backend:** Node.js + Express API, deployed to Google Cloud Run.
- **Database:** Supabase PostgreSQL using the Supavisor **transaction pooler** connection string.
- **Secrets:** Store `DATABASE_URL` in Google Secret Manager and expose it to Cloud Run as an environment variable.
- **Logs:** JSON logs go to stdout/stderr and are collected by Cloud Run / Google Cloud Logging.
- **DNS/CDN:** Cloudflare Pages provides the frontend hostname and HTTPS. A custom domain is optional.

This is a starter example, not a production-hardened application. Add authentication/authorization before exposing private data.

## Project structure

```text
cloudflare-pages-cloud-run-supabase-starter/
├── frontend/
│   ├── index.html
│   ├── styles.css
│   └── app.js
└── backend/
    ├── package.json
    ├── server.js
    ├── Dockerfile
    └── .dockerignore
```

## 1. Create the database table

In the Supabase Dashboard, open **SQL Editor** and run:

```sql
create table if not exists public.tasks (
  id bigint generated always as identity primary key,
  title text not null check (char_length(title) between 1 and 200),
  completed boolean not null default false,
  created_at timestamptz not null default now()
);
```

This demo accesses the table through the backend's database connection. Do not expose your database password or service credentials in frontend JavaScript.

## 2. Get the Supabase transaction pooler connection string

In your Supabase project, find the **Connect** panel and select the **Transaction pooler** connection option (commonly port `6543`). Copy the connection URI and keep it private.

Use the connection URI for your project and replace the password placeholder with your actual database password. Do not paste credentials into source files or commit them to Git.

For transaction pooling, avoid relying on session-level features or named prepared statements. This example uses ordinary parameterized queries without named statements.

## 3. Test the backend locally (optional)

Requirements: Node.js 20 or newer and access to your Supabase project.

```bash
cd backend
npm install
```

Set the environment variables in your terminal before starting the app.

PowerShell:
```powershell
$env:DATABASE_URL="YOUR_SUPABASE_TRANSACTION_POOLER_URI"
$env:FRONTEND_ORIGIN="http://localhost:8080"
npm start
```

macOS/Linux:
```bash
DATABASE_URL='YOUR_SUPABASE_TRANSACTION_POOLER_URI' FRONTEND_ORIGIN='http://localhost:8080' npm start
```

The API listens on `http://localhost:8080`.

Health check:
```text
http://localhost:8080/api/health
```

To run the frontend locally, open a second terminal:

```powershell
cd frontend
npm start
```

Then open `http://localhost:5500`. On localhost, the frontend automatically uses
the API at `http://localhost:8080`; set `FRONTEND_ORIGIN` to
`http://localhost:5500` when starting the backend.

## 4. Deploy the backend to Cloud Run

These commands use Google Cloud CLI (`gcloud`). Choose your own project ID.

```bash
gcloud auth login
gcloud config set project YOUR_GCP_PROJECT_ID
gcloud services enable run.googleapis.com secretmanager.googleapis.com cloudbuild.googleapis.com
```

Create a Secret Manager secret. The command prompts you to paste the value; do not put the URI in source code.

```bash
gcloud secrets create supabase-database-url --replication-policy=automatic
```

Add the connection string as a secret version:
```bash
gcloud secrets versions add supabase-database-url --data-file=-
```
After running this command, paste the full connection URI, press Enter, then finish input with Ctrl+D (macOS/Linux). On Windows, use a secure file or the documented Secret Manager console workflow instead of putting the secret in shell history.

Allow the Cloud Run runtime service account to read this secret. If using the default Compute Engine service account, find its email first:
```bash
gcloud iam service-accounts list
```

Grant the `roles/secretmanager.secretAccessor` role on the secret to the runtime service account (replace the placeholders):
```bash
gcloud secrets add-iam-policy-binding supabase-database-url \
  --member="serviceAccount:YOUR_RUNTIME_SERVICE_ACCOUNT_EMAIL" \
  --role="roles/secretmanager.secretAccessor"
```

Deploy from the `backend` directory:
```bash
gcloud run deploy my-app-api \
  --source . \
  --region us-central1 \
  --allow-unauthenticated \
  --set-secrets DATABASE_URL=supabase-database-url:latest \
  --set-env-vars FRONTEND_ORIGIN=https://YOUR-PROJECT.pages.dev
```

Notes:
- `us-central1` is an example region. Prefer the region near your Supabase project (your stated Supabase region is US Central) to reduce database latency.
- `--allow-unauthenticated` makes the HTTP endpoint public. The example API is intentionally a simple demo; add authentication and authorization before using it with private or sensitive data.
- Replace `https://YOUR-PROJECT.pages.dev` with the actual Cloudflare Pages URL. If you later add a custom domain, update `FRONTEND_ORIGIN` to that exact origin and redeploy.
- Cloud Run injects the `DATABASE_URL` secret into the process environment. Application logs written to stdout/stderr are collected by Cloud Logging.
- The service uses a connection pool with a small maximum. Tune it based on your Cloud Run maximum instances and Supabase pool limits.

After deployment, copy the Cloud Run service URL, for example `https://my-app-api-xxxxx-uc.a.run.app`.

## 5. Configure the frontend to call Cloud Run

Open `frontend/app.js` and replace:

```js
const API_BASE_URL = "https://REPLACE-WITH-YOUR-CLOUD-RUN-URL";
```

with your actual Cloud Run URL, without a trailing slash. This value is public and is safe to include in frontend code.

## 6. Upload frontend to Cloudflare Pages (Direct Upload)

1. Open Cloudflare Dashboard → **Workers & Pages** → **Create application** → **Pages** → **Direct Upload** (wording can vary).
2. Name the project, for example `my-app-frontend`.
3. Upload the **contents** of the `frontend` directory (or a ZIP containing those files, depending on the current dashboard flow).
4. Deploy.
5. Copy the `*.pages.dev` URL.
6. Update the Cloud Run `FRONTEND_ORIGIN` environment variable to that URL and redeploy the backend if necessary.

The frontend is plain static HTML/CSS/JS, so there is no build command and no `dist` folder to generate.

## 7. Verify

Open the Cloudflare Pages URL:
- The API status should show `ok`.
- Add a task, mark it complete, and delete it.
- If the API fails, inspect Cloud Run logs:
  ```bash
  gcloud run services logs read my-app-api --region us-central1
  ```
- Check Supabase logs and database connectivity if requests return database errors.

## Security and production checklist

- Add user authentication and authorization before using this for real user data.
- Do not expose `DATABASE_URL` or privileged Supabase keys in frontend files.
- Restrict CORS to your exact production frontend origin.
- Consider Cloud Run maximum instances and connection-pool sizing together.
- Configure database backups and test restoring them.
- Set a Google Cloud Billing budget alert.
- Avoid logging credentials, tokens, or sensitive user data.
- Use HTTPS only in production.
