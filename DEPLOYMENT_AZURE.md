# Azure Deployment Guide

This app is ready to deploy as a Dockerized Next.js production build.

## Recommended Azure target

- Azure App Service for Containers
- Azure Container Apps

## Build path

1. Build the image from the `web` folder.
2. Push the image to Azure Container Registry or Docker Hub.
3. Deploy the container to Azure.
4. Set the runtime environment variables listed below.

## Required environment variables

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_URL` or `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY` or `SUPABASE_SERVICE_KEY`
- `DATABASE_URL`
- `SUPABASE_STORAGE_BUCKET_PHOTO_EVIDENCE` if you want a custom evidence bucket name

## Runtime notes

- The app uses `next-pwa`, so the service worker and manifest are already wired.
- Closed corrective actions stay in the archive view instead of being deleted.
- The build output is configured as `standalone`, which keeps the container image simpler for Azure.

## Smoke test checklist

- Log in successfully.
- Open the workspace and confirm cards, settings, and actions load.
- Open the PWA in a browser and verify installability.
- Test offline behavior on a standard route and the offline page.
- Create a corrective action, mark it in progress, then archive it.