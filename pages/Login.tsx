import React, { useState } from "react";
import { auth, db_fs } from "../services/firebase";
import { db } from "../services/db";
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, signInWithPopup, GoogleAuthProvider, updateProfile } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { Button, Input, Card } from "../components/UI";
import { UserProfile, UserRole } from "../types";

const Login: React.FC = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [warungIdInput, setWarungIdInput] = useState("");
  const [role, setRole] = useState<UserRole>("owner");
  const [isRegistering, setIsRegistering] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      if (isRegistering) {
        // Validasi Warung ID jika mendaftar sebagai Staff
        if (role === "staff") {
          if (!warungIdInput.trim()) {
            setError("Silakan masukkan Warung ID dari Pemilik.");
            setLoading(false);
            return;
          }
          const warungDoc = await getDoc(doc(db_fs, "warungs", warungIdInput.trim()));
          if (!warungDoc.exists()) {
            setError("Warung ID tidak ditemukan. Periksa kembali kodenya.");
            setLoading(false);
            return;
          }
        }

        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        await updateProfile(userCredential.user, { displayName });

        // Inisialisasi Profil
        const profile: UserProfile = {
          uid: userCredential.user.uid,
          email: email,
          displayName: displayName,
          role: role,
          warungId: role === "owner" ? userCredential.user.uid : warungIdInput.trim(),
        };
        await db.saveUserProfile(profile);
      } else {
        await signInWithEmailAndPassword(auth, email, password);
      }
    } catch (err: any) {
      console.error("Auth Error:", err.code, err.message);
      switch (err.code) {
        case "auth/invalid-credential":
          setError("Email atau password salah. Pastikan Anda sudah terdaftar.");
          break;
        case "auth/email-already-in-use":
          setError("Email sudah terdaftar. Silakan masuk saja.");
          break;
        case "auth/weak-password":
          setError("Password terlalu lemah (min. 6 karakter).");
          break;
        default:
          setError("Terjadi kesalahan. Silakan coba lagi nanti.");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    const provider = new GoogleAuthProvider();
    setError("");
    try {
      const result = await signInWithPopup(auth, provider);
      const existingProfile = db.getUserProfile();
      if (!existingProfile) {
        // Default Google Login sebagai owner jika belum ada profil
        const profile: UserProfile = {
          uid: result.user.uid,
          email: result.user.email || "",
          displayName: result.user.displayName || "User",
          role: "owner",
          warungId: result.user.uid,
        };
        await db.saveUserProfile(profile);
      }
    } catch (err: any) {
      if (err.code !== "auth/popup-closed-by-user") {
        setError("Gagal login dengan Google.");
      }
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-900 p-4 relative overflow-hidden">
      <div className="absolute top-0 -left-20 w-72 h-72 bg-blue-600 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-blob"></div>
      <div className="absolute bottom-0 -right-20 w-72 h-72 bg-purple-600 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-blob animation-delay-2000"></div>

      <Card className="w-full max-w-md p-8 shadow-2xl relative z-10 border-slate-800">
        <div className="text-center mb-6">
          <div className="w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg shadow-blue-500/50">
            <i className="fa-solid fa-cash-register text-2xl text-white"></i>
          </div>
          <h1 className="text-2xl font-bold text-slate-900">Warung POS Pro</h1>
          <p className="text-slate-500 mt-1 text-sm">{isRegistering ? "Buat akun pengelola toko" : "Masuk untuk kelola warung Anda"}</p>
        </div>

        <form onSubmit={handleAuth} className="space-y-4">
          {error && (
            <div className="p-3 bg-red-50 border border-red-100 text-red-600 text-[11px] rounded-lg flex items-center gap-2">
              <i className="fa-solid fa-circle-exclamation"></i>
              {error}
            </div>
          )}

          {isRegistering && (
            <>
              <div className="flex bg-slate-100 p-1 rounded-lg mb-4">
                <button type="button" onClick={() => setRole("owner")} className={`flex-1 py-2 text-xs font-bold rounded-md transition-all ${role === "owner" ? "bg-white text-blue-600 shadow-sm" : "text-slate-500"}`}>
                  PEMILIK
                </button>
                <button type="button" onClick={() => setRole("staff")} className={`flex-1 py-2 text-xs font-bold rounded-md transition-all ${role === "staff" ? "bg-white text-blue-600 shadow-sm" : "text-slate-500"}`}>
                  KASIR
                </button>
              </div>

              <Input label="Nama Lengkap" placeholder="Nama Anda" value={displayName} onChange={(e) => setDisplayName(e.target.value)} required />

              {role === "staff" && (
                <div className="bg-amber-50 p-3 rounded-lg border border-amber-100 mb-2">
                  <Input label="Warung ID (Dari Pemilik)" placeholder="Masukkan Kode Warung" value={warungIdInput} onChange={(e) => setWarungIdInput(e.target.value)} required />
                  <p className="text-[10px] text-amber-700 mt-1">Minta Pemilik untuk memberikan Warung ID dari menu Pengaturan.</p>
                </div>
              )}
            </>
          )}

          <Input label="Email" type="email" placeholder="admin@warung.com" value={email} onChange={(e) => setEmail(e.target.value)} required />

          <Input label="Password" type="password" placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} required />

          <Button type="submit" className="w-full py-2.5 font-bold" disabled={loading}>
            {loading ? <i className="fa-solid fa-circle-notch fa-spin mr-2"></i> : null}
            {isRegistering ? "Daftar" : "Masuk"}
          </Button>

          <div className="text-center mt-4">
            <button type="button" onClick={() => setIsRegistering(!isRegistering)} className="text-xs text-blue-600 hover:underline font-medium">
              {isRegistering ? "Sudah punya akun? Login" : "Belum punya akun? Daftar"}
            </button>
          </div>

          {!isRegistering && (
            <>
              <div className="relative my-4">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t border-slate-200"></span>
                </div>
                <div className="relative flex justify-center text-[10px] uppercase">
                  <span className="bg-white px-2 text-slate-400">Atau</span>
                </div>
              </div>

              <button
                type="button"
                onClick={handleGoogleLogin}
                className="w-full flex items-center justify-center gap-3 py-2.5 border border-slate-200 rounded-lg hover:bg-slate-50 transition-all text-slate-700 text-sm font-medium active:scale-[0.98]"
              >
                <img src="https://www.gstatic.com/images/branding/product/1x/gsa_512dp.png" alt="Google Logo" className="w-5 h-5 object-contain" />
                Masuk dengan Google
              </button>
            </>
          )}
        </form>
      </Card>
    </div>
  );
};

export default Login;
