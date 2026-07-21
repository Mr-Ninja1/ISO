declare module "next-pwa/cache" {
  const defaultCache: Array<{
    urlPattern: RegExp | ((args: { url: URL }) => boolean);
    handler: string;
    method?: string;
    options?: {
      cacheName?: string;
      [key: string]: unknown;
    };
  }>;
  export default defaultCache;
}
