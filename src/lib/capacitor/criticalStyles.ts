/** Inlined in Capacitor WebView so loading shells stay styled before /_next/static/css loads. */
export const CAPACITOR_CRITICAL_CSS = `
:root {
  --hse-cream: #f5efe6;
  --hse-cream-deep: #ebe3d6;
  --hse-teal: #003d33;
  --hse-teal-mid: #0d5c52;
  --hse-sky: #d1e9f6;
  --hse-charcoal: #1c2b2a;
  --background: #f5efe6;
  --foreground: #1c2b2a;
}
html, body {
  margin: 0;
  min-height: 100%;
  font-family: Inter, "Segoe UI", Arial, sans-serif;
  background: var(--background);
  color: var(--foreground);
}
@keyframes iso-spin {
  to { transform: rotate(360deg); }
}
.iso-loading-root {
  min-height: 100dvh;
  display: flex;
  flex-direction: column;
  background: linear-gradient(165deg, rgba(209,233,246,0.55) 0%, rgba(245,239,230,0.98) 42%, rgba(232,244,241,0.65) 100%);
}
.iso-loading-accent {
  height: 4px;
  background: repeating-linear-gradient(-45deg, #fbbf24 0, #fbbf24 10px, #1c1917 10px, #1c1917 20px);
}
.iso-loading-header {
  border-bottom: 1px solid rgba(0, 61, 51, 0.12);
  padding: 1rem;
  background: rgba(255, 255, 255, 0.95);
}
.iso-loading-body {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1rem;
  padding: 2rem 1rem;
  text-align: center;
}
.iso-loading-icon {
  width: 3.5rem;
  height: 3.5rem;
  border-radius: 1rem;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #003d33, #0d5c52);
  color: #fff;
  box-shadow: 0 8px 24px rgba(0, 61, 51, 0.2);
}
.iso-loading-spinner {
  width: 1.75rem;
  height: 1.75rem;
  border: 2px solid rgba(255, 255, 255, 0.35);
  border-top-color: #fff;
  border-radius: 50%;
  animation: iso-spin 0.8s linear infinite;
}
.iso-loading-title {
  margin: 0;
  font-size: 1rem;
  font-weight: 600;
  color: #1c2b2a;
}
.iso-loading-subtitle {
  margin: 0.35rem 0 0;
  max-width: 20rem;
  font-size: 0.875rem;
  line-height: 1.45;
  color: #0d5c52;
}
`;
