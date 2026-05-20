# OTA bundles for sideloaded Capacitor APKs

## Automated (recommended)

Every push to `main` runs **GitHub Actions** (`main_iso-pro.yml`):

1. `npm run release:ota:ci` — static Capacitor `out/` → zip + `manifest.json` under `public/ota/production/`
2. `npm run build` — hosted website (standalone)
3. Deploy artifact includes `public/ota/` (manifest + zip) on **https://isopro.me**

No manual Kudu/FTP upload. Bundle id is `ci.<run_number>` (e.g. `bundle-ci.42.zip`).

Supabase should point at:

`https://isopro.me/ota/production/manifest.json`

## Local / one-off

```powershell
npm run release:ota
npm run publish:ota:public
```

Then deploy the site (or upload `public/ota/production/`).

Zip files are gitignored locally; CI always builds them fresh on deploy.
