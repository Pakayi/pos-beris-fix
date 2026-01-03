import React, { useState, useEffect } from "react";
import { HashRouter, Routes, Route, NavLink, useLocation, Navigate } from "react-router-dom";
import Dashboard from "./pages/Dashboard";
import POS from "./pages/POS";
import Products from "./pages/Products";
import Customers from "./pages/Customers";
import Settings from "./pages/Settings";
import Reports from "./pages/Reports";
import Inventory from "./pages/Inventory";
import Login from "./pages/Login";
import { PinGuard } from "./components/Security";
import { db } from "./services/db";
import { auth } from "./services/firebase";
import { onAuthStateChanged, signOut, User } from "firebase/auth";
import { OfflineIndicator } from "./components/UI";
import { UserProfile } from "./types";

const NAV_ITEMS = [
  { path: "/", label: "Dashboard", icon: "fa-gauge-high", roles: ["owner", "cashier"] },
  { path: "/pos", label: "Kasir (POS)", icon: "fa-cash-register", roles: ["owner", "cashier"] },
  { path: "/products", label: "Produk", icon: "fa-box", roles: ["owner", "cashier"] },
  { path: "/inventory", label: "Log Stok", icon: "fa-boxes-stacked", roles: ["owner", "cashier"] },
  { path: "/customers", label: "Pelanggan", icon: "fa-users", roles: ["owner", "cashier"] },
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
    {!isCollapsed && <span className="font-medium">{label}</span>}
  </NavLink>
);

const App: React.FC = () => {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setAuthUser(user);
      if (user) {
        const fetchedProfile = await db.getUserProfile(user.uid);
        if (fetchedProfile) {
          if (!fetchedProfile.active) {
            alert("Akses Anda telah dinonaktifkan oleh Pemilik Warung.");
            signOut(auth);
            setProfile(null);
            setLoading(false);
            return;
          }
          db.setWarungId(fetchedProfile.warungId);
          setProfile(fetchedProfile);
        } else {
          // PENTING: Jika auth ada tapi profil firestore tidak ada,
          // jangan signOut! Biarkan Login.tsx menangani "Repair Profile"
          setProfile(null);
        }
      } else {
        setProfile(null);
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-900">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-white font-medium animate-pulse">Menghubungkan ke Toko...</p>
        </div>
      </div>
    );
  }

  // Jika belum login Auth ATAU sudah login tapi profil Firestore belum dibuat
  if (!authUser || !profile) {
    return (
      <HashRouter>
        <Routes>
          <Route path="*" element={<Login />} />
        </Routes>
      </HashRouter>
    );
  }

  return (
    <HashRouter>
      <Layout profile={profile} />
    </HashRouter>
  );
};

const Layout: React.FC<{ profile: UserProfile }> = ({ profile }) => {
  const [isSidebarOpen, setSidebarOpen] = useState(true);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 1024);
  const [appSettings, setAppSettings] = useState(db.getSettings());
  const location = useLocation();

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 1024);
    window.addEventListener("resize", handleResize);
    const handleSettingsUpdate = () => setAppSettings(db.getSettings());
    window.addEventListener("settings-updated", handleSettingsUpdate);
    return () => {
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("settings-updated", handleSettingsUpdate);
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

  const allowedNavItems = NAV_ITEMS.filter((item) => item.roles.includes(profile.role));

  return (
    <div className="flex h-screen bg-slate-100 overflow-hidden">
      <OfflineIndicator />

      {isMobile && isSidebarOpen && <div className="fixed inset-0 bg-black/50 z-20" onClick={() => setSidebarOpen(false)} />}

      <aside className={`fixed lg:static inset-y-0 left-0 z-30 bg-slate-900 text-white transition-all duration-300 ease-in-out flex flex-col ${isSidebarOpen ? "w-64 translate-x-0" : isMobile ? "-translate-x-full w-64" : "w-20"}`}>
        <div className="h-16 flex items-center justify-between px-4 border-b border-slate-800">
          <div className={`flex items-center gap-2 overflow-hidden ${!isSidebarOpen && !isMobile ? "hidden" : ""}`}>
            <div className="w-8 h-8 bg-blue-500 rounded-lg flex items-center justify-center font-bold text-lg text-white">{appSettings.storeName ? appSettings.storeName.charAt(0).toUpperCase() : "W"}</div>
            <span className="font-bold text-lg tracking-tight truncate">{appSettings.storeName || "Warung POS"}</span>
          </div>
          {!isMobile && (
            <button onClick={() => setSidebarOpen(!isSidebarOpen)} className="text-slate-400 hover:text-white p-1">
              <i className={`fa-solid ${isSidebarOpen ? "fa-chevron-left" : "fa-bars"}`}></i>
            </button>
          )}
        </div>

        <nav className="flex-1 p-3 overflow-y-auto">
          {allowedNavItems.map((item) => (
            <SidebarItem key={item.path} {...item} isCollapsed={!isSidebarOpen && !isMobile} />
          ))}
        </nav>

        <div className="p-4 border-t border-slate-800 space-y-2">
          <div className={`flex items-center gap-3 ${!isSidebarOpen && !isMobile ? "justify-center" : ""}`}>
            <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-blue-500 to-emerald-500 flex items-center justify-center text-[10px] font-bold">{profile.role === "owner" ? "OW" : "KS"}</div>
            {(isSidebarOpen || isMobile) && (
              <div className="flex-1 overflow-hidden">
                <p className="text-sm font-medium truncate">{profile.displayName}</p>
                <p className="text-[10px] text-slate-500 truncate">ID: {profile.warungId}</p>
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
            <h1 className="font-bold text-gray-800 truncate max-w-[200px]">{appSettings.storeName}</h1>
          </div>
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
            <Route path="/products" element={<Products role={profile.role} />} />
            <Route path="/inventory" element={<Inventory />} />
            <Route path="/customers" element={<Customers />} />
            {profile.role === "owner" && (
              <>
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
