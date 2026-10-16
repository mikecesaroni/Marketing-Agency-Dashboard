import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App.jsx'
import { AuthProvider } from './context/AuthContext'

// The CRM's pages load on demand (App.jsx), so a tab left open across a
// deploy can ask for a chunk the new build no longer has. Reload once onto
// the new build rather than showing a broken page.
window.addEventListener('vite:preloadError', (event) => {
  event.preventDefault()
  const key = 'wc-reloaded-for-deploy'
  if (sessionStorage.getItem(key) === window.location.href) return
  sessionStorage.setItem(key, window.location.href)
  window.location.reload()
})

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
)
