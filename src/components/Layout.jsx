import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom'
import { LayoutDashboard, Users, Euro, CheckSquare, Kanban, Menu, X, LogOut, Bell } from 'lucide-react'
import { useState, useEffect, useRef } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useNotification } from '../contexts/NotificationContext'
import GreetingOverlay, { greetingShouldShow } from './GreetingOverlay'

export default function Layout() {
  const location = useLocation()
  const navigate = useNavigate()
  const { userEmail, signOut } = useAuth()
  const { historique, clearHistorique } = useNotification()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [showNotifPanel, setShowNotifPanel] = useState(false)
  const [showGreeting, setShowGreeting] = useState(() => greetingShouldShow())
  const notifPanelRef = useRef(null)
  const notifBtnRef = useRef(null)

  useEffect(() => {
    function handleClickOutside(e) {
      if (showNotifPanel && notifPanelRef.current && !notifPanelRef.current.contains(e.target) && !notifBtnRef.current?.contains(e.target)) {
        setShowNotifPanel(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [showNotifPanel])

  useEffect(() => {
    setMobileMenuOpen(false)
  }, [location.pathname])

  async function handleLogout() {
    await signOut()
    navigate('/login')
  }

  const navigation = [
    { name: 'Dashboard', path: '/', icon: LayoutDashboard },
    { name: 'Base clients', path: '/clients', icon: Users },
    { name: 'Financier', path: '/financier', icon: Euro },
    { name: 'Pipeline', path: '/pipeline', icon: Kanban },
    { name: 'Tâches', path: '/taches', icon: CheckSquare },
  ]

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar */}
      <aside className={`
        fixed lg:static inset-y-0 left-0 z-50
        w-[240px] flex flex-col
        sidebar-gradient
        text-white
        transform transition-transform duration-300
        ${mobileMenuOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
      `}>
        <div className="px-6 pt-7 pb-5 flex justify-between items-center">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-white">KANO</h1>
            <p className="text-[10px] uppercase tracking-[0.2em] text-white/35 font-medium mt-0.5">CRM</p>
          </div>
          <button
            onClick={() => setMobileMenuOpen(false)}
            className="lg:hidden text-white/50 hover:text-white transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        <div className="mx-5 h-px bg-white/8 mb-3" />

        <nav className="flex-1 px-3 space-y-0.5">
          {navigation.map((item) => {
            const Icon = item.icon
            const isActive = location.pathname === item.path

            return (
              <Link
                key={item.path}
                to={item.path}
                className={`flex items-center gap-3 px-4 py-2.5 rounded-lg transition-all duration-200 ${
                  isActive
                    ? 'bg-white/10 text-white'
                    : 'text-white/45 hover:bg-white/5 hover:text-white/75'
                }`}
              >
                <Icon size={16} strokeWidth={isActive ? 2 : 1.5} />
                <span className={`text-[13px] ${isActive ? 'font-medium' : 'font-normal'}`}>{item.name}</span>
              </Link>
            )
          })}
        </nav>

        <div className="p-3 mx-3 mb-4 rounded-lg bg-white/5">
          <div className="text-[10px] text-white/30 uppercase tracking-wider mb-1">Connecté</div>
          <div className="text-[12px] text-white/70 mb-2.5 truncate">{userEmail}</div>
          <button
            onClick={handleLogout}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-white/5 hover:bg-white/10 rounded-lg transition-colors text-[12px] text-white/50 hover:text-white/70"
          >
            <LogOut size={13} />
            Déconnexion
          </button>
        </div>
      </aside>

      {/* Mobile overlay */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 bg-black/30 backdrop-blur-sm z-40 lg:hidden"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* Greeting overlay */}
      {showGreeting && (
        <GreetingOverlay onDone={() => setShowGreeting(false)} />
      )}

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <header className="bg-white border-b border-gray-100 px-4 py-3 flex items-center gap-4 flex-shrink-0">
          <button
            onClick={() => setMobileMenuOpen(true)}
            className="lg:hidden text-gray-400 hover:text-gray-600 transition-colors"
          >
            <Menu size={20} />
          </button>
          <h1 className="lg:hidden text-sm font-semibold text-gray-700">KANO CRM</h1>
          <div className="flex-1" />
          <div className="relative">
            <button
              ref={notifBtnRef}
              onClick={() => setShowNotifPanel(prev => !prev)}
              className="relative p-2 text-gray-400 hover:text-gray-600 transition-colors rounded-lg hover:bg-gray-50"
            >
              <Bell size={18} />
              {historique.length > 0 && (
                <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-kano-gold rounded-full" />
              )}
            </button>

            {showNotifPanel && (
              <div
                ref={notifPanelRef}
                className="absolute right-0 top-full mt-2 w-80 sm:w-96 bg-white rounded-xl border border-gray-200 shadow-xl z-[100] overflow-hidden"
              >
                <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
                  <span className="text-sm font-medium text-gray-700">Notifications</span>
                  {historique.length > 0 && (
                    <button
                      onClick={clearHistorique}
                      className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
                    >
                      Tout effacer
                    </button>
                  )}
                </div>
                <div className="max-h-80 overflow-y-auto scrollbar-thin">
                  {historique.length === 0 ? (
                    <p className="text-sm text-gray-400 text-center py-8">Aucune notification</p>
                  ) : (
                    historique.map((n) => (
                      <div key={n.id} className="px-4 py-3 border-b border-gray-50 last:border-0 hover:bg-gray-50/50 transition-colors">
                        <div className="flex items-start gap-2.5">
                          <div className={`w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0 ${n.type === 'error' ? 'bg-red-400' : 'bg-emerald-400'}`} />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-gray-700">{n.message}</p>
                            <p className="text-[11px] text-gray-300 mt-0.5">
                              {n.timestamp.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                            </p>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
        </header>

        <main className="flex-1 overflow-y-auto scrollbar-thin">
          <div className="p-5 sm:p-7 lg:p-10 h-full flex flex-col">
            <Outlet context={{ greetingActive: showGreeting }} />
          </div>
        </main>
      </div>
    </div>
  )
}
