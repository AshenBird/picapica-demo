// --@ts-check
const fs = require('fs');
const path = require('path');
const c2k = require('koa-connect');
const http = require("http")
const Koa = require("koa")
const isTest = process.env.NODE_ENV === 'test' || !!process.env.VITE_TEST_BUILD
const chalk = require("chalk")
async function createServer(
  root = process.cwd(),
  isProd = process.env.NODE_ENV === 'production'
) {
  const resolve = (p) => path.resolve(__dirname, p)

  const indexProd = isProd
    ? fs.readFileSync(resolve('dist/client/index.html'), 'utf-8')
    : ''

  const manifest = isProd
    ? // @ts-ignore
    require('./dist/client/ssr-manifest.json')
    : {}

  const app = new Koa();

  const useExpressfy = (middleware) => {
    return app.use(c2k(middleware))
  }
  /**
   * @type {import('vite').ViteDevServer}
   */
  let vite
  if (!isProd) {
    vite = await require('vite').createServer({
      root,
      logLevel: isTest ? 'error' : 'info',
      server: {
        middlewareMode: true
      }
    })
    // use vite's connect instance as middleware
    useExpressfy(vite.middlewares)
  } else {
    useExpressfy(require('compression')())
    useExpressfy(
      require('serve-static')(resolve('dist/client'), {
        index: false
      })
    )
  }

  app.use(async (ctx) => {
    const { request, response } = ctx
    try {
      const url = request.originalUrl
      let template, render
      if (!isProd) {
        // always read fresh template in dev
        template = fs.readFileSync(resolve('index.html'), 'utf-8')
        template = await vite.transformIndexHtml(url, template)
        render = (await vite.ssrLoadModule('/src/entry-server.ts')).render
      } else {
        template = indexProd
        // @ts-ignore
        render = require('./dist/server/entry-server.js').render
      }

      const [appHtml, preloadLinks] = await render(url, manifest)

      const html = template
        .replace(`<!--preload-links-->`, preloadLinks)
        .replace(`<!--app-html-->`, appHtml)

      response.status = 200
      response.set({ 'Content-Type': 'text/html' })
      response.body = html;
    } catch (e) {
      vite && vite.ssrFixStacktrace(e)
      console.log(e.stack)
      response.status = 500
      response.body = e.stack;
    }
  })

  return { app, vite }
}


if (!isTest) {
  console.log(chalk.green("Launching.."))
  createServer().then(({ app }) =>{
      console.log(chalk.green("init.."))
      app.listen(3000, () => console.log('http://localhost:3000'))
    }
  )
}

// for test use
exports.createServer = createServer
