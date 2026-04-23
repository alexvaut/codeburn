import React from 'react'
import ReactDOM from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { App } from './App'
import { FiltersProvider } from './filters-context'
import { CostModeProvider } from './cost-mode'
import './index.css'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      staleTime: 30_000,
    },
  },
})

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <FiltersProvider>
        <CostModeProvider>
          <App />
        </CostModeProvider>
      </FiltersProvider>
    </QueryClientProvider>
  </React.StrictMode>,
)
