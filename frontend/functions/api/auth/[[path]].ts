// Proxies /api/auth/* to Better Auth on Convex Site
export const onRequest: PagesFunction = async (context) => {
  const url = new URL(context.request.url)
  const targetUrl = `https://convex-site.academic-reader.com${url.pathname}${url.search}`

  return fetch(targetUrl, {
    method: context.request.method,
    headers: context.request.headers,
    body: context.request.body,
  })
}
