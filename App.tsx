import React, { useState, useEffect } from "react";
import { HashRouter, Routes, Route, NavLink, useLocation, Navigate } from "react-router-dom";
import Dashboard from "./pages/Dashboard";
import POS from "./pages/POS";
import Products from "./pages/Products";
import Customers from "./pages/Customers";
import Settings from "./pages/Settings";
import Reports from "./pages/Reports";
import Suppliers from "./pages/Suppliers";
import Procurement from "./pages/Procurement";
import DebtBook from "./pages/DebtBook"; // Baru
import Login from "./pages/Login";
import { PinGuard } from "./components/Security";
import { db } from "./services/db";
import { auth } from "./services/firebase";
import { onAuthStateChanged, signOut, User } from "firebase/auth";
import { OfflineIndicator, Badge } from "./components/UI";
import { UserProfile } from "./types";

const NAV_ITEMS = [
  { path: "/", label: "Dashboard", icon: "fa-gauge-high", roles: ["owner", "staff"] },
  { path: "/pos", label: "Kasir (POS)", icon: "fa-cash-register", roles: ["owner", "staff"] },
  { path: "/debt-book", label: "Buku Hutang", icon: "fa-book", roles: ["owner", "staff"] }, // Baru
  { path: "/procurement", label: "Stok Masuk", icon: "fa-truck-loading", roles: ["owner"] },
  { path: "/products", label: "Produk", icon: "fa-box", roles: ["owner"] },
  { path: "/suppliers", label: "Supplier", icon: "fa-building-user", roles: ["owner"] },
  { path: "/customers", label: "Pelanggan", icon: "fa-users", roles: ["owner"] },
  { path: "/reports", label: "Laporan", icon: "fa-chart-pie", roles: ["owner"] },
  { path: "/settings", label: "Pengaturan", icon: "fa-gear", roles: ["owner"] },
];

const SidebarItem = ({ path, label, icon, isCollapsed }: any) => (
  <NavLink
    to={path}
    className={({ isActive }) => `flex items-center gap-3 px-3 py-3 rounded-lg transition-colors mb-1 ${isActive ? "bg-blue-600 text-white shadow-lg shadow-blue-500/30" : "text-slate-400 hover:bg-slate-800 hover:text-white"}`}
  >
    <div className="w-6 text-center">
      <i className={`fa-solid ${icon}`}></i>
    </div>
    {!isCollapsed && <span className="font-medium text-sm">{label}</span>}
  </NavLink>
);

const App: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-900">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-white font-medium animate-pulse">Memuat Warung POS Pro...</p>
        </div>
      </div>
    );
  }

  return (
    <HashRouter>
      {!user ? (
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="*" element={<Navigate to="/login" />} />
        </Routes>
      ) : (
        <Layout user={user} />
      )}
    </HashRouter>
  );
};

const Layout: React.FC<{ user: User }> = ({ user }) => {
  const [isSidebarOpen, setSidebarOpen] = useState(true);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 1024);
  const [appSettings, setAppSettings] = useState(db.getSettings());
  const [profile, setProfile] = useState<UserProfile | null>(db.getUserProfile());
  const location = useLocation();

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 1024);
    const handleSettingsUpdate = () => setAppSettings(db.getSettings());
    const handleProfileUpdate = () => setProfile(db.getUserProfile());

    window.addEventListener("resize", handleResize);
    window.addEventListener("settings-updated", handleSettingsUpdate);
    window.addEventListener("profile-updated", handleProfileUpdate);

    return () => {
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("settings-updated", handleSettingsUpdate);
      window.removeEventListener("profile-updated", handleProfileUpdate);
    };
  }, []);

  useEffect(() => {
    if (isMobile) setSidebarOpen(false);
  }, [location, isMobile]);

  const handleLogout = () => {
    if (confirm("Keluar dari aplikasi?")) {
      signOut(auth);
    }
  };

  const allowedNav = NAV_ITEMS.filter((item) => item.roles.includes(profile?.role || "staff"));

  return (
    <div className="flex h-screen bg-slate-100 overflow-hidden">
      <OfflineIndicator />

      {isMobile && isSidebarOpen && <div className="fixed inset-0 bg-black/50 z-20" onClick={() => setSidebarOpen(false)} />}

      <aside className={`fixed lg:static inset-y-0 left-0 z-30 bg-slate-900 text-white transition-all duration-300 ease-in-out flex flex-col ${isSidebarOpen ? "w-64 translate-x-0" : isMobile ? "-translate-x-full w-64" : "w-20"}`}>
        <div className="h-16 flex items-center justify-between px-4 border-b border-slate-800 shrink-0">
          <div className={`flex items-center gap-3 overflow-hidden ${!isSidebarOpen && !isMobile ? "hidden" : ""}`}>
            <div className="w-9 h-9 bg-white rounded-xl flex items-center justify-center p-1.5 shadow-sm shrink-0">
              {appSettings.logoUrl ? <img src={appSettings.logoUrl} alt="Logo" className="w-full h-full object-contain" /> : <i className="fa-solid fa-cash-register text-blue-600 text-lg"></i>}
            </div>
            <div className="flex flex-col">
              <span className="font-bold text-sm tracking-tight truncate">{appSettings.storeName || "Warung POS"}</span>
              <span className="text-[10px] text-blue-400 font-bold uppercase tracking-tighter">{profile?.role || "Staff"}</span>
            </div>
          </div>
          {!isMobile && (
            <button onClick={() => setSidebarOpen(!isSidebarOpen)} className="text-slate-400 hover:text-white p-1 ml-auto">
              <i className={`fa-solid ${isSidebarOpen ? "fa-chevron-left" : "fa-bars"}`}></i>
            </button>
          )}
        </div>

        <nav className="flex-1 p-3 overflow-y-auto">
          {allowedNav.map((item) => (
            <SidebarItem key={item.path} {...item} isCollapsed={!isSidebarOpen && !isMobile} />
          ))}
        </nav>

        <div className="p-4 border-t border-slate-800 space-y-2">
          <div className={`flex items-center gap-3 ${!isSidebarOpen && !isMobile ? "justify-center" : ""}`}>
            <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-blue-500 to-emerald-500 flex items-center justify-center text-[10px] font-bold">{user.email?.charAt(0).toUpperCase()}</div>
            {(isSidebarOpen || isMobile) && (
              <div className="flex-1 overflow-hidden">
                <p className="text-sm font-medium truncate">{profile?.displayName || user.displayName || "User"}</p>
                <p className="text-[10px] text-slate-500 truncate">{user.email}</p>
              </div>
            )}
          </div>
          {(isSidebarOpen || isMobile) && (
            <button onClick={handleLogout} className="w-full flex items-center gap-2 px-3 py-2 text-xs text-red-400 hover:bg-red-500/10 hover:text-red-300 rounded-lg transition-colors">
              <i className="fa-solid fa-right-from-bracket"></i>
              <span>Logout</span>
            </button>
          )}
        </div>
      </aside>

      <main className="flex-1 flex flex-col h-full overflow-hidden relative">
        <header className="lg:hidden h-16 bg-white border-b border-gray-200 flex items-center px-4 justify-between shrink-0">
          <div className="flex items-center gap-3">
            <button onClick={() => setSidebarOpen(true)} className="p-2 -ml-2 text-gray-600">
              <i className="fa-solid fa-bars text-xl"></i>
            </button>
            <h1 className="font-bold text-gray-800 truncate max-w-[200px]">{appSettings.storeName || "Warung POS"}</h1>
          </div>
          <Badge color={profile?.role === "owner" ? "blue" : "green"}>{profile?.role?.toUpperCase()}</Badge>
        </header>

        <div className="flex-1 overflow-auto p-4 lg:p-6 relative">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route
              path="/pos"
              element={
                <PinGuard>
                  <POS />
                </PinGuard>
              }
            />
            <Route
              path="/debt-book"
              element={
                <PinGuard>
                  <DebtBook />
                </PinGuard>
              }
            />

            {/* Owner Protected Routes */}
            {profile?.role === "owner" && (
              <>
                <Route path="/procurement" element={<Procurement />} />
                <Route path="/products" element={<Products />} />
                <Route path="/suppliers" element={<Suppliers />} />
                <Route path="/customers" element={<Customers />} />
                <Route
                  path="/reports"
                  element={
                    <PinGuard>
                      <Reports />
                    </PinGuard>
                  }
                />
                <Route
                  path="/settings"
                  element={
                    <PinGuard>
                      <Settings />
                    </PinGuard>
                  }
                />
              </>
            )}

            <Route path="*" element={<Navigate to="/" />} />
          </Routes>
        </div>
      </main>
    </div>
  );
};

export default App;
