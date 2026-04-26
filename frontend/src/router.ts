import { createRouter, createRoute, createRootRoute, Outlet } from '@tanstack/react-router'
import { IndexPage } from './routes/index'

// Root layout — Outlet renders the matched child route directly
const rootRoute = createRootRoute({
  component: Outlet,
})

// Single index route with typed search params
export const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  validateSearch: (search: Record<string, unknown>) => ({
    logs: typeof search['logs'] === 'string' ? search['logs'] : undefined,
  }),
  component: IndexPage,
})

const routeTree = rootRoute.addChildren([indexRoute])

export const router = createRouter({
  routeTree,
  defaultPreload: 'intent',
})

// Register router type globally for useNavigate / useSearch type inference
declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}
