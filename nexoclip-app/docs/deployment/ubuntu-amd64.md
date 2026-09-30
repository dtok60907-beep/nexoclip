# Deploy NexoClip on an Ubuntu AMD64 VPS

## 1. Buy the server

Use Ubuntu Server 24.04 LTS on **x86_64/AMD64**, not ARM/Ampere. Recommended for CPU-only AI Clip: 16 vCPU, 64 GB RAM, and 300 GB NVMe. Initial low-traffic minimum: 8 vCPU, 32 GB RAM, and 200 GB NVMe.

## 2. Install Docker Engine

Run as a sudo-capable user on the VPS:

```bash
sudo apt-get update
sudo apt-get install -y ca-certificates curl git
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | sudo tee /etc/apt/sources.list.d/docker.list >/dev/null
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo usermod -aG docker "$USER"
newgrp docker
docker version
docker compose version
uname -m   # must print x86_64
```

## 3. Configure the firewall

```bash
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
# Add when a domain is connected and Caddy enables HTTPS:
sudo ufw allow 443/tcp
sudo ufw enable
sudo ufw status
```

Do not open ports 3000, 3005, 3006, 4173, 4180, 6379, or PostgreSQL.

## 4. Prepare managed services

Use separate Neon databases:

- `nexoclip_app` for NexoClip
- `neondb` for SPITE
- `scheduler` for Social Media Scheduler

Create `scheduler` before deployment. Use pooled Neon URLs for application `DATABASE_URL_*` values and a direct URL for `DIRECT_URL_SCHEDULER`. Include `sslmode=require`.

Keep Cloudflare R2 configured for SPITE and AI Clip output. Rotate the Neon password that was previously exposed before the first production deploy.

## 5. Clone and configure

```bash
git clone https://github.com/cekataiofficial/ai-ugc.git
cd ai-ugc/nexoclip-app
cp .env.production.example .env.production
chmod 600 .env.production
nano .env.production
```

Replace every required blank and `YOUR_VPS_IP`. Generate independent secrets with:

```bash
openssl rand -hex 32
```

Never commit `.env.production`, paste it into chat/tickets, or include it in an image.

Google OAuth redirect URI for the temporary IP deployment must match the Scheduler NextAuth callback under `/scheduler`. Some OAuth providers require HTTPS/domain names; defer Google sign-in until a domain is connected if the provider rejects an HTTP IP callback.

## 6. Deploy

```bash
./scripts/deploy.sh
```

The script checks AMD64, validates configuration, builds images, starts Redis, applies NexoClip and Scheduler migrations, then starts the complete stack.

## 7. Verify

Replace `VPS_IP`:

```bash
curl -I http://VPS_IP/
curl -I http://VPS_IP/spite/login
curl -I http://VPS_IP/scheduler/login
```

Check container state and logs:

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml ps
docker compose --env-file .env.production -f docker-compose.prod.yml logs -f --tail=200
docker compose --env-file .env.production -f docker-compose.prod.yml restart spite
```

After login/database verification, run one controlled minimal-cost workflow. Do not use a billable generation as a health check.

## 8. Update

```bash
git pull --ff-only
./scripts/deploy.sh --pull
```

The script never deletes volumes or runs Docker prune.

## 9. Roll back

Find the previous known-good commit, check it out on a rollback branch, and redeploy:

```bash
git log --oneline -10
git switch -c rollback/<date> <KNOWN_GOOD_COMMIT>
./scripts/deploy.sh
```

Database migrations are forward-only. Restore Neon from its managed backup/branch if a database rollback is required.

## 10. Add a domain and HTTPS

Point the domain A record to the VPS. Change the first line of `Caddyfile` from `:80` to the domain, for example `app.example.com`, and update:

- `SCHEDULER_NEXTAUTH_URL=https://app.example.com/scheduler`
- Google OAuth authorized origin and callback URLs
- webhook callback URLs

Then run `./scripts/deploy.sh`. Caddy will provision HTTPS automatically through ports 80 and 443.
