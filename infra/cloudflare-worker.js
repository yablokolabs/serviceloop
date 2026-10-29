// serviceloop-proxy: attaches serviceloop.yablokolabs.com to the Modal
// origin. Modal custom domains are Team/Enterprise-only, so this free
// Worker owns the hostname, forwards the real visitor IP, and proves
// itself to the origin with a shared secret.
//
// Why the secret: the .modal.run origin is public, and the app's per-IP
// rate limits key on the x-client-ip header below. Without proof, anyone
// could call the origin directly with a fresh x-client-ip per request
// and the limits would never trigger. The front server trusts the header
// only when x-proxy-secret matches its SL_PROXY_SECRET, and refuses other
// /api/* callers outright.
//
// Deploy: paste into the Cloudflare Worker `serviceloop-proxy`
// (route serviceloop.yablokolabs.com/*), then set the Worker's secret
// binding SL_PROXY_SECRET to the same value as the Modal secret
// SL_PROXY_SECRET. See docs/HOSTING.md.
const ORIGIN = 'https://yablokolabs--serviceloop-serve.us-east.modal.run';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const headers = new Headers(request.headers);
    const ip = request.headers.get('cf-connecting-ip');
    if (ip) headers.set('x-client-ip', ip);
    // The binding is named SL_PROXY_SECRET, the same name the origin uses;
    // a missing binding must be loud, because the origin then refuses all
    // API traffic through this Worker.
    const proxySecret = env.SL_PROXY_SECRET ?? env.PROXY_SECRET;
    if (!proxySecret) {
      return new Response('proxy-misconfigured: SL_PROXY_SECRET binding missing', { status: 500 });
    }
    headers.set('x-proxy-secret', proxySecret);
    return fetch(new URL(url.pathname + url.search, ORIGIN), {
      method: request.method,
      headers,
      body: request.body,
      redirect: 'manual',
    });
  },
};
