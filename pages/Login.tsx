import React, { useState } from "react";
import { auth } from "../services/firebase";
import { db } from "../services/db";
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, signInWithPopup, GoogleAuthProvider, updateProfile } from "firebase/auth";
import { Button, Input, Card } from "../components/UI";
import { UserProfile } from "../types";

const Login: React.FC = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [isRegistering, setIsRegistering] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      if (isRegistering) {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        await updateProfile(userCredential.user, { displayName });

        // Inisialisasi Profil sebagai Owner saat pendaftaran pertama
        const profile: UserProfile = {
          uid: userCredential.user.uid,
          email: email,
          displayName: displayName,
          role: "owner",
          storeId: userCredential.user.uid,
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

      // Jika profil belum ada (pengguna baru via Google), buatkan sebagai Owner
      const existingProfile = db.getUserProfile();
      if (!existingProfile) {
        const profile: UserProfile = {
          uid: result.user.uid,
          email: result.user.email || "",
          displayName: result.user.displayName || "Owner",
          role: "owner",
          storeId: result.user.uid,
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
        <div className="text-center mb-8">
          <div className="w-20 h-20 bg-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg shadow-blue-500/50">
            <i className="fa-solid fa-cash-register text-3xl text-white"></i>
          </div>
          <h1 className="text-3xl font-bold text-slate-900">Warung POS Pro</h1>
          <p className="text-slate-500 mt-2">{isRegistering ? "Daftar akun pemilik toko baru" : "Silakan masuk untuk mengelola toko"}</p>
        </div>

        <form onSubmit={handleAuth} className="space-y-5">
          {error && (
            <div className="p-3 bg-red-50 border border-red-100 text-red-600 text-xs rounded-lg flex items-center gap-2">
              <i className="fa-solid fa-circle-exclamation"></i>
              {error}
            </div>
          )}

          {isRegistering && <Input label="Nama Pemilik / Toko" type="text" placeholder="Masukkan nama Anda" value={displayName} onChange={(e) => setDisplayName(e.target.value)} required />}

          <Input label="Email" type="email" placeholder="admin@warung.com" value={email} onChange={(e) => setEmail(e.target.value)} required />

          <Input label="Password" type="password" placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} required />

          <Button type="submit" className="w-full py-3 text-lg font-bold" disabled={loading}>
            {loading ? <i className="fa-solid fa-circle-notch fa-spin mr-2"></i> : null}
            {isRegistering ? "Daftar Sekarang" : "Masuk Sekarang"}
          </Button>

          <div className="text-center mt-4">
            <button type="button" onClick={() => setIsRegistering(!isRegistering)} className="text-sm text-blue-600 hover:underline font-medium">
              {isRegistering ? "Sudah punya akun? Login di sini" : "Belum punya akun? Daftar di sini"}
            </button>
          </div>

          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t border-slate-200"></span>
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-white px-2 text-slate-400">Atau</span>
            </div>
          </div>

          <button type="button" onClick={handleGoogleLogin} className="w-full flex items-center justify-center gap-3 py-3 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors text-slate-700 font-medium">
            <img src="https://www.gstatic.com/favicon.ico" alt="G" className="w-4 h-4" />
            Akun Google
          </button>
        </form>
      </Card>
    </div>
  );
};

export default Login;
