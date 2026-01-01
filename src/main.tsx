import React from 'react'
import ReactDOM from 'react-dom/client'
import { App } from './App'
import { AdminApp } from './admin'

const rootElement = document.getElementById('root')

if (!rootElement) {
  throw new Error('Root container missing')
}

const isAdminRoute = window.location.pathname.includes('admin')

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    {isAdminRoute ? <AdminApp /> : <App />}
  </React.StrictMode>,
)
