# OTA bundles for sideloaded Capacitor APKs

After `npm run package:ota`, run:

```powershell
npm run publish:ota:public
```

This copies `ota-dist/production/` into `public/ota/production/` so a normal site deploy serves:

- `https://isopro.me/ota/production/manifest.json`
- `https://isopro.me/ota/production/bundle-*.zip`

Set that manifest URL in **Developer console → Live update controls**.

Zip files are gitignored (large). Commit `manifest.json` if you want it tracked; upload zips via deploy artifact or manual copy.
