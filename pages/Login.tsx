import React, { useState, useEffect } from "react";
import { auth, db_fs } from "../services/firebase";
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, updateProfile, GoogleAuthProvider, signInWithPopup, onAuthStateChanged } from "firebase/auth";
import { doc, setDoc, getDoc } from "firebase/firestore";
import { Button, Input, Card } from "../components/UI";
import { UserProfile } from "../types";

const Login: React.FC = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [storeName, setStoreName] = useState("");
  const [joinWarungId, setJoinWarungId] = useState("");
  const [isRegistering, setIsRegistering] = useState(false);
  const [isJoining, setIsJoining] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [googleUserPending, setGoogleUserPending] = useState<any>(null);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      if (isRegistering) {
        await processRegistration(email, password, displayName);
      } else {
        await signInWithEmailAndPassword(auth, email, password);
      }
    } catch (err: any) {
      handleAuthError(err);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setLoading(true);
    setError("");
    const provider = new GoogleAuthProvider();

    try {
      const result = await signInWithPopup(auth, provider);
      const user = result.user;

      // Di Vercel, kita butuh jeda lebih lama agar state auth sinkron dengan Firestore
      await new Promise((resolve) => setTimeout(resolve, 1000));

      const userSnap = await getDoc(doc(db_fs, "users", user.uid));
      if (!userSnap.exists()) {
        setGoogleUserPending(user);
        setIsRegistering(true);
        setDisplayName(user.displayName || "");
        setStoreName("");
      }
    } catch (err: any) {
      handleAuthError(err);
    } finally {
      setLoading(false);
    }
  };

  const processRegistration = async (emailStr: string, passStr: string, nameStr: string) => {
    if (isJoining && !joinWarungId) throw new Error("Warung ID wajib diisi.");
    if (!isJoining && !storeName) throw new Error("Nama Warung wajib diisi.");

    let user = auth.currentUser || googleUserPending;

    if (!user && !isJoining) {
      const userCredential = await createUserWithEmailAndPassword(auth, emailStr, passStr);
      user = userCredential.user;
    }

    if (!user) throw new Error("Sesi login belum siap. Silakan klik tombol sekali lagi.");

    let finalWarungId = "";
    let role: "owner" | "cashier" = "owner";

    if (isJoining) {
      const warungRef = doc(db_fs, "warungs", joinWarungId.trim().toUpperCase());
      const warungSnap = await getDoc(warungRef);
      if (!warungSnap.exists()) throw new Error("Warung ID tidak ditemukan.");
      finalWarungId = joinWarungId.trim().toUpperCase();
      role = "cashier";
    } else {
      finalWarungId = `WRG-${Math.random().toString(36).substr(2, 6).toUpperCase()}`;

      // Simpan data warung
      await setDoc(doc(db_fs, "warungs", finalWarungId), {
        id: finalWarungId,
        name: storeName,
        ownerUid: user.uid,
        status: "active",
        plan: "free",
        createdAt: Date.now(),
      });

      // Simpan konfigurasi awal
      await setDoc(doc(db_fs, `warungs/${finalWarungId}/config`, "settings"), {
        storeName: storeName,
        storeAddress: "Alamat belum diatur",
        storePhone: "-",
        enableTax: false,
        taxRate: 11,
        footerMessage: "Terima kasih!",
        showLogo: true,
        tierDiscounts: { bronze: 0, silver: 2, gold: 5 },
      });
    }

    const userProfile: UserProfile = {
      uid: user.uid,
      email: user.email!,
      displayName: nameStr,
      warungId: finalWarungId,
      role: role,
      active: true,
    };

    await setDoc(doc(db_fs, "users", user.uid), userProfile);

    if (user.displayName !== nameStr) {
      await updateProfile(user, { displayName: nameStr });
    }
  };

  const handleAuthError = (err: any) => {
    console.error("Firebase Error:", err);
    let msg = err.message || "";
    if (msg.includes("permission-denied")) {
      msg = "Akses Ditolak! Pastikan domain ini sudah terdaftar di Authorized Domains Firebase Console Bapak.";
    } else if (msg.includes("auth/network-request-failed")) {
      msg = "Koneksi internet bermasalah atau Firebase diblokir.";
    }
    setError(msg || "Terjadi kesalahan sistem.");
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-900 p-4 relative overflow-hidden">
      <div className="absolute top-0 -left-20 w-72 h-72 bg-blue-600 rounded-full mix-blend-multiply filter blur-3xl opacity-20"></div>
      <div className="absolute bottom-0 -right-20 w-72 h-72 bg-purple-600 rounded-full mix-blend-multiply filter blur-3xl opacity-20"></div>

      <Card className="w-full max-w-md p-8 shadow-2xl relative z-10 border-slate-800">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg shadow-blue-500/50">
            <i className="fa-solid fa-cash-register text-2xl text-white"></i>
          </div>
          <h1 className="text-2xl font-bold text-slate-900">Warung POS Pro</h1>
          <p className="text-slate-500 text-sm mt-1">{isRegistering ? "Selesaikan Profil Warung" : "Masuk ke Dashboard Toko"}</p>
        </div>

        <form onSubmit={handleAuth} className="space-y-4">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-[10px] rounded-lg flex items-start gap-2">
              <i className="fa-solid fa-circle-exclamation mt-1"></i>
              <span>{error}</span>
            </div>
          )}

          {isRegistering && (
            <>
              {!googleUserPending && (
                <div className="flex bg-slate-100 p-1 rounded-xl mb-2">
                  <button type="button" onClick={() => setIsJoining(false)} className={`flex-1 py-1 text-[10px] font-bold rounded-lg ${!isJoining ? "bg-white shadow text-blue-600" : "text-slate-500"}`}>
                    Buat Warung
                  </button>
                  <button type="button" onClick={() => setIsJoining(true)} className={`flex-1 py-1 text-[10px] font-bold rounded-lg ${isJoining ? "bg-white shadow text-blue-600" : "text-slate-500"}`}>
                    Gabung Warung
                  </button>
                </div>
              )}
              <Input label="Nama Lengkap" value={displayName} onChange={(e) => setDisplayName(e.target.value)} required />
              {isJoining ? (
                <Input label="Warung ID" value={joinWarungId} onChange={(e) => setJoinWarungId(e.target.value.toUpperCase())} required />
              ) : (
                <Input label="Nama Warung" value={storeName} onChange={(e) => setStoreName(e.target.value)} required />
              )}
            </>
          )}

          {!googleUserPending && (
            <>
              <Input label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
              <Input label="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            </>
          )}

          <Button type="submit" className="w-full py-3 font-bold" disabled={loading}>
            {loading ? <i className="fa-solid fa-circle-notch fa-spin mr-2"></i> : isRegistering ? "Konfirmasi & Simpan" : "Masuk"}
          </Button>

          {!isRegistering && (
            <button type="button" onClick={handleGoogleLogin} className="w-full flex items-center justify-center gap-3 py-2.5 bg-white border rounded-xl hover:bg-slate-50 font-bold text-sm">
              <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" className="w-5 h-5" alt="G" />
              Masuk dengan Google
            </button>
          )}

          <div className="text-center mt-4">
            <button
              type="button"
              onClick={() => {
                setIsRegistering(!isRegistering);
                setIsJoining(false);
                setGoogleUserPending(null);
                setError("");
              }}
              className="text-xs text-blue-600 font-bold"
            >
              {isRegistering ? "Sudah punya akun? Masuk" : "Belum punya akun? Daftar"}
            </button>
          </div>
        </form>
      </Card>
    </div>
  );
};

export default Login;
