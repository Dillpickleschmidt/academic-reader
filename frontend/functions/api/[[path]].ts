// Proxies /api/* (except auth) to Hono API
interface Env {
  API_HOST: string
}

export const onRequest: PagesFunction<Env> = async (context) => {
  const url = new URL(context.request.url)
  const path = url.pathname.replace("/api", "")
  const apiHost = context.env.API_HOST
  const targetUrl = `https://${apiHost}${path}${url.search}`

  const headers = new Headers(context.request.headers)
  headers.set("Host", apiHost)

  return fetch(targetUrl, {
    method: context.request.method,
    headers,
    body: context.request.body,
  })
}
