// Proxies /api/* (except auth) to Hono API
interface Env {
  API_HOST: string
}

export const onRequest: PagesFunction<Env> = async (context) => {
  const url = new URL(context.request.url)
  const path = url.pathname.replace("/api", "")
  const apiHost = context.env.API_HOST
  const targetUrl = `https://${apiHost}${path}${url.search}`

  const proxyRequest = new Request(targetUrl, context.request)
  return fetch(proxyRequest)
}
