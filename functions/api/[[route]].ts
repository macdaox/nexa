import app from '../../src/server/app'

export const onRequest: PagesFunction = (context) => app.fetch(context.request, context.env)
