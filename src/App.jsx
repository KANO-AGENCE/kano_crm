import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { ClientModalProvider } from './contexts/ClientModalContext'
import { NotificationProvider } from './contexts/NotificationContext'
import { UsersProvider } from './contexts/UsersContext'
import Layout from './components/Layout'
import Dashboard from './pages/Dashboard'
import Clients from './pages/Clients'
import Financier from './pages/Financier'
import Taches from './pages/Taches'
import Pipeline from './pages/Pipeline'
import Login from './pages/Login'

function ProtectedRoute({ children }) {
  const { session, loading } = useAuth()

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-pulse text-kano-blue text-xl">Chargement...</div>
      </div>
    )
  }

  if (!session) {
    return <Navigate to="/login" replace />
  }

  return children
}

function App() {
  return (
    <AuthProvider>
      <Router>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <NotificationProvider>
                  <UsersProvider>
                    <ClientModalProvider>
                      <Layout />
                    </ClientModalProvider>
                  </UsersProvider>
                </NotificationProvider>
              </ProtectedRoute>
            }
          >
            <Route index element={<Dashboard />} />
            <Route path="clients" element={<Clients />} />
            <Route path="financier" element={<Financier />} />
            <Route path="taches" element={<Taches />} />
            <Route path="pipeline" element={<Pipeline />} />
          </Route>
        </Routes>
      </Router>
    </AuthProvider>
  )
}

export default App