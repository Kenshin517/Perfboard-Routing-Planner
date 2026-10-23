# Deploy — static hosting di VPS

App ini **100% client-side** (`output: "export"`), jadi di-deploy sebagai file
statis — nginx tinggal nyajiin folder `out/`, **gak ada Node yang jalan** di VPS.
Ringan, muat di Oracle Cloud Always Free (AMD 1GB sekalipun).

## 1. Build `out/`

```bash
npm ci
npm run build        # menghasilkan folder out/
```

> **Oracle AMD (1GB RAM):** `next build` bisa OOM. Pilih salah satu:
> - **Build di lokal / CI**, lalu upload `out/` ke VPS (rekomendasi — lihat §4).
> - Atau tambah swap di VPS dulu:
>   ```bash
>   sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile
>   sudo mkswap /swapfile && sudo swapon /swapfile
>   echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
>   ```
> **Oracle ARM Ampere:** RAM besar, build di VPS aman.

## 2. Upload ke VPS

```bash
rsync -avz --delete out/ user@VPS_IP:/var/www/perfboard/
# atau: scp -r out/* user@VPS_IP:/var/www/perfboard/
```

## 3. nginx

`/etc/nginx/sites-available/perfboard`:

```nginx
server {
    listen 80;
    server_name perfboard.example.com;   # ganti domain / pakai IP

    root /var/www/perfboard;
    index index.html;

    # SPA-style fallback (Next static export)
    location / {
        try_files $uri $uri.html $uri/ /index.html;
    }

    # cache aset statis
    location /_next/static/ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/perfboard /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

**Firewall Oracle:** buka port 80/443 di **Security List / NSG** (dashboard Oracle)
DAN di OS:
```bash
sudo iptables -I INPUT -p tcp --dport 80 -j ACCEPT
sudo iptables -I INPUT -p tcp --dport 443 -j ACCEPT
sudo netfilter-persistent save
```

## 4. HTTPS (certbot)

```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d perfboard.example.com
```

## 5. (Opsional) ambil `out/` dari CI

Tiap push ke `main`, GitHub Actions nge-build dan nyimpen `out/` sebagai artifact
(`static-site`). Download dari tab **Actions → run → Artifacts**, extract, lalu
rsync ke VPS — gak perlu build di VPS sama sekali.
