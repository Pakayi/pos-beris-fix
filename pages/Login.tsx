import React, { useState } from "react";
import { auth, db_fs } from "../services/firebase";
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, updateProfile } from "firebase/auth";
import { doc, setDoc, getDoc } from "firebase/firestore";
import { Button, Input, Card } from "../components/UI";
import { UserProfile, Warung } from "../types";

const Login: React.FC = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [storeName, setStoreName] = useState("");
  const [joinWarungId, setJoinWarungId] = useState(""); // New: For Cashiers
  const [isRegistering, setIsRegistering] = useState(false);
  const [isJoining, setIsJoining] = useState(false); // New: Toggle mode
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      if (isRegistering) {
        // 1. Validasi Input
        if (isJoining && !joinWarungId) throw new Error("Warung ID wajib diisi untuk bergabung.");
        if (!isJoining && !storeName) throw new Error("Nama Warung wajib diisi untuk buat baru.");

        // 2. Create Auth Account
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;

        let finalWarungId = "";
        let role: "owner" | "cashier" = "owner";

        if (isJoining) {
          // Join Mode: Cek apakah Warung ID valid
          const warungRef = doc(db_fs, "warungs", joinWarungId.trim().toUpperCase());
          const warungSnap = await getDoc(warungRef);
          // FIX: Changed 'warSnap' to 'warungSnap' to match the variable declared above.
          if (!warungSnap.exists()) {
            throw new Error("Warung ID tidak ditemukan. Periksa kembali kodenya.");
          }
          finalWarungId = joinWarungId.trim().toUpperCase();
          role = "cashier";
        } else {
          // New Mode: Create Warung Data
          finalWarungId = `WRG-${Math.random().toString(36).substr(2, 6).toUpperCase()}`;
          const warungData: Warung = {
            id: finalWarungId,
            name: storeName,
            ownerUid: user.uid,
            status: "active",
            plan: "free",
            createdAt: Date.now(),
          };
          await setDoc(doc(db_fs, "warungs", finalWarungId), warungData);

          // Set Default Settings for new Warung
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

        // 3. Create User Profile
        const userProfile: UserProfile = {
          uid: user.uid,
          email: user.email!,
          displayName: displayName || (role === "owner" ? "Owner" : "Kasir"),
          warungId: finalWarungId,
          role: role,
          active: true,
        };
        await setDoc(doc(db_fs, "users", user.uid), userProfile);

        await updateProfile(user, { displayName: displayName });
      } else {
        await signInWithEmailAndPassword(auth, email, password);
      }
    } catch (err: any) {
      console.error("Auth Error:", err);
      setError(err.message || "Terjadi kesalahan sistem.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-900 p-4 relative overflow-hidden">
      <div className="absolute top-0 -left-20 w-72 h-72 bg-blue-600 rounded-full mix-blend-multiply filter blur-3xl opacity-20"></div>
      <div className="absolute bottom-0 -right-20 w-72 h-72 bg-purple-600 rounded-full mix-blend-multiply filter blur-3xl opacity-20"></div>

      <Card className="w-full max-w-md p-8 shadow-2xl relative z-10 border-slate-800">
        <div className="text-center mb-8">
          <div className="w-20 h-20 bg-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg shadow-blue-500/50">
            <i className="fa-solid fa-cash-register text-3xl text-white"></i>
          </div>
          <h1 className="text-3xl font-bold text-slate-900">Warung POS Pro</h1>
          <p className="text-slate-500 mt-2">{isRegistering ? (isJoining ? "Bergabung ke Warung" : "Daftar Warung Baru") : "Masuk untuk Mengelola Toko"}</p>
        </div>

        <form onSubmit={handleAuth} className="space-y-5">
          {error && (
            <div className="p-3 bg-red-50 border border-red-100 text-red-600 text-xs rounded-lg flex items-center gap-2">
              <i className="fa-solid fa-circle-exclamation"></i>
              {error}
            </div>
          )}

          {isRegistering && (
            <>
              <div className="flex bg-slate-100 p-1 rounded-lg mb-4">
                <button type="button" onClick={() => setIsJoining(false)} className={`flex-1 py-2 text-xs font-bold rounded-md transition-all ${!isJoining ? "bg-white shadow text-blue-600" : "text-slate-500"}`}>
                  Buat Warung
                </button>
                <button type="button" onClick={() => setIsJoining(true)} className={`flex-1 py-2 text-xs font-bold rounded-md transition-all ${isJoining ? "bg-white shadow text-blue-600" : "text-slate-500"}`}>
                  Gabung Warung
                </button>
              </div>

              <Input label="Nama Lengkap" type="text" placeholder="Nama Anda" value={displayName} onChange={(e) => setDisplayName(e.target.value)} required />

              {isJoining ? (
                <Input label="Warung ID" type="text" placeholder="Contoh: WRG-XXXXXX" value={joinWarungId} onChange={(e) => setJoinWarungId(e.target.value)} required />
              ) : (
                <Input label="Nama Warung / Toko" type="text" placeholder="Contoh: Warung Berkah" value={storeName} onChange={(e) => setStoreName(e.target.value)} required />
              )}
            </>
          )}

          <Input label="Email" type="email" placeholder="email@toko.com" value={email} onChange={(e) => setEmail(e.target.value)} required />

          <Input label="Password" type="password" placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} required />

          <Button type="submit" className="w-full py-3 text-lg font-bold" disabled={loading}>
            {loading ? <i className="fa-solid fa-circle-notch fa-spin mr-2"></i> : null}
            {isRegistering ? (isJoining ? "Gabung Sekarang" : "Buat Warung & Akun") : "Masuk Sekarang"}
          </Button>

          <div className="text-center mt-4">
            <button
              type="button"
              onClick={() => {
                setIsRegistering(!isRegistering);
                setIsJoining(false);
              }}
              className="text-sm text-blue-600 hover:underline font-medium"
            >
              {isRegistering ? "Sudah punya akun? Masuk di sini" : "Belum punya akun? Daftar di sini"}
            </button>
          </div>
        </form>
      </Card>
    </div>
  );
};

export default Login;
