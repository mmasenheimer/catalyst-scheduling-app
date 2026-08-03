# Deploying CATalyst Scheduling to Jetstream2

Written to be followed at a terminal, top to bottom. Commands marked **(local)**
run on your laptop; everything else runs on the instance over SSH.

The shape of the finished thing: **nginx** faces the internet on 443, serves the
built frontend as static files, and forwards anything under `/api` to the
**Node backend** on port 3001, which is not reachable from outside. The database
stays on **MongoDB Atlas** — nothing runs on the instance for it.

```
browser ──443──> nginx ──┬──> dist/          (static files)
                         └──> localhost:3001 (Express)  ──> MongoDB Atlas
```

---

## 0. Before you start

- Push your latest work: **(local)** `git push`. The server pulls from
  `github.com/mmasenheimer/catalyst-scheduling-app`.
- Have your Atlas connection string to hand (Atlas → Connect → Drivers).
- Know the instance's public hostname — Exosphere shows it in the instance
  details. Referred to below as `YOUR_HOST`.

---

## 1. Create the instance

In Exosphere:

| Setting | Value |
|---|---|
| Image | Ubuntu 22.04 or 24.04 LTS (featured) |
| Flavor | **m3.small** — the build needs more headroom than the app does |
| SSH key | Pick your existing one; don't make a new one |
| Public IP | Attach at creation if offered |

Then open **22, 80, 443** in the security group. A missing 443 rule looks
exactly like a broken nginx config, and you will lose an hour to it.

Connect:

```bash
ssh exouser@YOUR_HOST
```

Exosphere instances use `exouser`, not `ubuntu` — the Credentials card in the
web console lists it beneath the hostname. If the key you picked at creation
isn't your default, point at it: `ssh -i ~/.ssh/your_key exouser@YOUR_HOST`.

Check you have administrator rights before going any further:

```bash
sudo -v      # silence means yes; a password prompt or an error means no
```

Nearly every step below needs it. If SSH itself won't connect, the **Web Shell**
button in the console is a way in that doesn't depend on your local key setup.

---

## 2. System packages

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y nginx git curl

# Node 20 LTS — Ubuntu's default node is too old for this project
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

node -v    # expect v20.x
```

---

## 3. Get the code

```bash
sudo mkdir -p /srv && sudo chown exouser:exouser /srv
cd /srv
git clone https://github.com/mmasenheimer/catalyst-scheduling-app.git catalyst
cd catalyst/scheduling-app
```

---

## 4. Configure

### Backend

```bash
cd /srv/catalyst/scheduling-app/src/backend
cp .env.example .env

# Generate a signing key and paste it into JWT_SECRET below
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"

nano .env
```

The file needs these set — everything else can stay commented out:

```ini
MONGODB_URI=mongodb+srv://<user>:<password>@catalyst.pfivkwq.mongodb.net/catalyst
JWT_SECRET=<the string you just generated>
PORT=3001
NODE_ENV=production
CORS_ORIGIN=https://YOUR_HOST
TRUST_PROXY=1
```

`TRUST_PROXY=1` matters: without it every request looks like it came from nginx,
so the login rate limiter treats the whole studio as one client and one person's
failed attempts throttle everybody.

```bash
npm ci --omit=dev
```

### Frontend

```bash
cd /srv/catalyst/scheduling-app
cp .env.production.example .env.production   # already set to VITE_API_URL=/api
npm ci
npm run build                                 # writes dist/
```

`/api` is a relative path on purpose. nginx serves both the frontend and the API
from the same host, so the bundle doesn't need to know its own hostname — which
means moving to a `library.arizona.edu` name later needs no rebuild.

---

## 5. Let the database accept connections

In **Atlas → Network Access → Add IP Address**, add the instance's public IP.

Skip this and the backend starts perfectly, then every request hangs on a
connection it can't make and never explains why.

---

## 6. Run the backend as a service

```bash
sudo nano /etc/systemd/system/catalyst-api.service
```

```ini
[Unit]
Description=CATalyst Scheduling API
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=exouser
WorkingDirectory=/srv/catalyst/scheduling-app/src/backend
ExecStart=/usr/bin/node server.js
Restart=always
RestartSec=5
Environment=NODE_ENV=production

# Keep logs in the journal rather than growing a file nobody rotates
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now catalyst-api
sudo systemctl status catalyst-api      # expect: active (running)
curl -i localhost:3001/api/staff        # expect: 401, which means it is up
```

A 401 there is success — the API is running and refusing an unauthenticated
request, exactly as it should.

---

## 7. nginx

```bash
sudo nano /etc/nginx/sites-available/catalyst
```

```nginx
server {
    listen 80;
    server_name YOUR_HOST;

    root /srv/catalyst/scheduling-app/dist;
    index index.html;

    # The app is a single-page app: every route is served by index.html and
    # resolved client-side. Without this, refreshing on /weekly returns a 404.
    location / {
        try_files $uri $uri/ /index.html;
    }

    location /api/ {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;

        # These are what TRUST_PROXY reads to recover the real client address.
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/catalyst /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t          # must say "syntax is ok" before reloading
sudo systemctl reload nginx
```

Visit `http://YOUR_HOST`. The login page should load. Don't sign in yet — the
password would cross the network in the clear. That's the next step.

---

## 8. HTTPS

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d YOUR_HOST
```

Choose the redirect option when asked, so plain HTTP forwards to HTTPS. Certbot
rewrites the nginx config and installs a renewal timer; check it took with
`sudo systemctl list-timers | grep certbot`.

Then confirm `CORS_ORIGIN` in the backend `.env` says `https://`, not `http://`,
and restart: `sudo systemctl restart catalyst-api`.

---

## 9. Real accounts

The seeded `manager / catalyst123` account is a development fixture and must not
survive contact with real staff.

```bash
cd /srv/catalyst/scheduling-app/src/backend
node -e "
require('dotenv').config(); const db=require('./db');
(async()=>{ await db.connect();
  const User=require('./models/User');
  console.log(await User.find({}, 'username role staffId').lean());
  process.exit(0); })();
"
```

Create the real manager account through the app once you have one, then delete
the seeded one. Employees get accounts through **Manage Staff → Add Employee**,
which issues a one-time temporary password each person replaces at first login.

**Do not run `npm run seed` here.** It wipes staff and accounts, and it refuses
outright when `NODE_ENV=production` — which is one reason that variable is set.

---

## 10. Check it works

- [ ] `https://YOUR_HOST` loads with a padlock
- [ ] The dev-credentials box is **absent** from the login page
- [ ] You can sign in as a manager
- [ ] The Daily Schedule shows real staff and shifts
- [ ] Editing a shift persists across a page refresh
- [ ] An employee account sees only their own schedule
- [ ] Submitting availability reaches the manager's notifications
- [ ] `sudo journalctl -u catalyst-api -n 50` shows no repeating errors

The refresh check is the important one — it is the difference between the UI
looking right and the write actually reaching Atlas.

---

## Deploying a change later

```bash
cd /srv/catalyst && git pull
cd scheduling-app && npm ci && npm run build      # only if the frontend changed
cd src/backend && npm ci --omit=dev               # only if backend deps changed
sudo systemctl restart catalyst-api
```

Static files are served straight from `dist/`, so a frontend-only change needs
no restart — just the rebuild.

---

## When something is wrong

**Page loads, every API call fails.** Check the browser console for a CORS
error. `CORS_ORIGIN` must match the address in the URL bar exactly, scheme
included, with no trailing slash.

**502 Bad Gateway.** nginx is up, the backend isn't.
`sudo systemctl status catalyst-api` and `sudo journalctl -u catalyst-api -n 50`.

**Requests hang, then time out.** Almost always the Atlas allowlist (step 5).

**Refusing to start, complaining about JWT_SECRET.** Working as designed —
`NODE_ENV=production` with no secret set. Fill it in.

**Everyone gets rate-limited at once.** `TRUST_PROXY=1` is missing, so every
login looks like it came from nginx's address.

**A route 404s on refresh but works when clicked.** The `try_files` line in the
nginx config is missing or wrong.

---

## Worth knowing

**The API URL is compiled in.** `VITE_API_URL` is substituted at build time, not
read at runtime. Editing `.env.production` on a server that already has a
`dist/` changes nothing until you rebuild.

**Tokens live in localStorage**, which means an XSS bug would expose them.
Moving to an httpOnly cookie is the next hardening step; it wasn't worth
blocking the deployment on.

**There are no backups configured.** Atlas's free tier has no automated backup —
worth checking what your cluster tier actually provides before this holds a
semester of real scheduling.
