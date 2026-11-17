# Deploying SpotMe

Ubuntu VPS with host Nginx + Certbot already running other sites.

- App: `/opt/doston/spotme` (user `doston`)
- API: uvicorn on `127.0.0.1:8020` (systemd unit `spotme-api`)
- Web: Nginx serves `web/dist` and proxies `/api`
- Domain: `spotme.72-60-208-46.sslip.io`

**The VPS has no Node.js.** The web app is built on the Mac and copied over with rsync. The VPS only runs the Python API.

| Where | Needs |
|---|---|
| Mac | Node `^20.19` or `>=22.12`, rsync, ssh access as `doston@72.60.208.46` |
| VPS | Python 3.11+ (checked on 3.14), git |

HTTPS is required: the browser only allows the camera on a secure page.

## First-time setup

### On the VPS

```bash
# 1. Code
sudo mkdir -p /opt/doston && sudo chown doston:doston /opt/doston   # skip if /opt/doston already exists
git clone https://github.com/studiousdoston/SpotMe.git /opt/doston/spotme
cd /opt/doston/spotme

# 2. Server: venv + production dependencies
python3 -m venv server/.venv
server/.venv/bin/pip install -r server/requirements.txt

# 3. API service
sudo cp deploy/systemd/spotme-api.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now spotme-api
curl http://127.0.0.1:8020/api/health   # → {"status":"ok"}

# 4. Let update-server.sh restart the API without a password prompt (only these commands)
echo 'doston ALL=(root) NOPASSWD: /usr/bin/systemctl restart spotme-api, /usr/bin/systemctl status spotme-api --no-pager' \
  | sudo tee /etc/sudoers.d/spotme && sudo chmod 440 /etc/sudoers.d/spotme && sudo visudo -c
```

### On the Mac: first web build + upload

```bash
cd ~/Desktop/SpotMe
deploy/deploy-from-mac.sh
```

### Back on the VPS: Nginx site (HTTP), then HTTPS with Certbot

```bash
cd /opt/doston/spotme
sudo cp deploy/nginx/spotme.conf /etc/nginx/sites-available/spotme.conf
sudo ln -s /etc/nginx/sites-available/spotme.conf /etc/nginx/sites-enabled/spotme.conf
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d spotme.72-60-208-46.sslip.io
```

Open https://spotme.72-60-208-46.sslip.io.

## Updating (from the Mac)

Commit and push first, then:

```bash
deploy/deploy-from-mac.sh
```

1. On the Mac, the script checks that everything is committed and pushed. The VPS pulls the server code from git, so both halves must be the same version. Use `SKIP_GIT_CHECK=1` to skip this check.
2. It builds `web/` (`npm ci && npm run build`).
3. It copies `web/dist/` to the VPS with `rsync --delete`.
4. It runs `deploy/update-server.sh` on the VPS over ssh: `git pull --ff-only`, then `pip install -r server/requirements.txt`, a restart of `spotme-api`, and a health check with retries.

The script stops at the first error. `update-server.sh` can also be run by hand on the VPS: `bash /opt/doston/spotme/deploy/update-server.sh`.

If `deploy/nginx/spotme.conf` or the service file changed, copy it again and reload: `sudo systemctl daemon-reload` for the service, `sudo nginx -t && sudo systemctl reload nginx` for Nginx. Certbot edits the installed Nginx file, so re-copying it overwrites the HTTPS block. Run `sudo certbot --nginx -d spotme.72-60-208-46.sslip.io` again afterwards.

## Troubleshooting

```bash
sudo systemctl status spotme-api
journalctl -u spotme-api -n 100 --no-pager
sudo tail -n 50 /var/log/nginx/error.log
```
