import React, { useState } from "react";
import { auth, db_fs } from "../services/firebase";
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, updateProfile, deleteUser } from "firebase/auth";
import { doc, setDoc, getDoc } from "firebase/firestore";
import { Button, Input, Card } from "../components/UI";
import { UserProfile, Warung } from "../types";

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

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    let createdUser: any = null;

    try {
      if (isRegistering) {
        if (isJoining && !joinWarungId) throw new Error("Warung ID wajib diisi untuk bergabung.");
        if (!isJoining && !storeName) throw new Error("Nama Warung wajib diisi untuk buat baru.");
        if (!displayName) throw new Error("Nama Lengkap wajib diisi.");

        // 1. Create Auth Account
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        createdUser = userCredential.user;

        let finalWarungId = "";
        let role: "owner" | "cashier" = "owner";

        if (isJoining) {
          // Join Mode: Cek validitas Warung ID di Firestore
          const warungRef = doc(db_fs, "warungs", joinWarungId.trim().toUpperCase());
          const warungSnap = await getDoc(warungRef);

          if (!warungSnap.exists()) {
            // Jika gagal di Firestore, kita harus batalkan user Auth agar tidak 'nanggung'
            await deleteUser(createdUser);
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
            ownerUid: createdUser.uid,
            status: "active",
            plan: "free",
            createdAt: Date.now(),
          };

          // Proses ini sering gagal jika Firestore Rules belum di-set
          try {
            await setDoc(doc(db_fs, "warungs", finalWarungId), warungData);
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
          } catch (dbErr) {
            await deleteUser(createdUser);
            throw new Error("Gagal menulis ke database. Pastikan Firestore Rules sudah diizinkan.");
          }
        }

        // 3. Create User Profile
        const userProfile: UserProfile = {
          uid: createdUser.uid,
          email: createdUser.email!,
          displayName: displayName,
          warungId: finalWarungId,
          role: role,
          active: true,
        };
        await setDoc(doc(db_fs, "users", createdUser.uid), userProfile);
        await updateProfile(createdUser, { displayName: displayName });
      } else {
        await signInWithEmailAndPassword(auth, email, password);
      }
    } catch (err: any) {
      console.error("Auth Error:", err);
      let msg = err.message;
      if (msg.includes("auth/email-already-in-use")) msg = "Email sudah terdaftar. Silakan mendaftar dengan email lain atau login.";
      if (msg.includes("permission-denied")) msg = "Izin database ditolak. Mohon hubungi admin atau cek Firestore Rules.";
      setError(msg || "Terjadi kesalahan sistem.");
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
            <div className="p-4 bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl flex items-start gap-3 animate-in fade-in slide-in-from-top-2">
              <i className="fa-solid fa-circle-exclamation mt-0.5"></i>
              <span>{error}</span>
            </div>
          )}

          {isRegistering && (
            <>
              <div className="flex bg-slate-100 p-1 rounded-xl mb-4">
                <button
                  type="button"
                  onClick={() => {
                    setIsJoining(false);
                    setError("");
                  }}
                  className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${!isJoining ? "bg-white shadow text-blue-600" : "text-slate-500"}`}
                >
                  Buat Warung
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIsJoining(true);
                    setError("");
                  }}
                  className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${isJoining ? "bg-white shadow text-blue-600" : "text-slate-500"}`}
                >
                  Gabung Warung
                </button>
              </div>

              <Input label="Nama Lengkap" type="text" placeholder="Nama Anda" value={displayName} onChange={(e) => setDisplayName(e.target.value)} required />

              {isJoining ? (
                <div className="space-y-1">
                  <Input label="Warung ID" type="text" placeholder="Contoh: WRG-XXXXXX" value={joinWarungId} onChange={(e) => setJoinWarungId(e.target.value.toUpperCase())} required />
                  <p className="text-[10px] text-gray-400 italic">Dapatkan ID ini dari Pemilik Warung Anda.</p>
                </div>
              ) : (
                <Input label="Nama Warung / Toko" type="text" placeholder="Contoh: Warung Berkah" value={storeName} onChange={(e) => setStoreName(e.target.value)} required />
              )}
            </>
          )}

          <Input label="Email" type="email" placeholder="email@toko.com" value={email} onChange={(e) => setEmail(e.target.value)} required />

          <Input label="Password" type="password" placeholder="Min. 6 Karakter" value={password} onChange={(e) => setPassword(e.target.value)} required />

          <Button type="submit" className="w-full py-3 text-lg font-bold shadow-lg" disabled={loading}>
            {loading ? <i className="fa-solid fa-circle-notch fa-spin mr-2"></i> : null}
            {isRegistering ? (isJoining ? "Gabung Sekarang" : "Buat Warung & Akun") : "Masuk Sekarang"}
          </Button>

          <div className="text-center mt-6">
            <button
              type="button"
              onClick={() => {
                setIsRegistering(!isRegistering);
                setIsJoining(false);
                setError("");
              }}
              className="text-sm text-blue-600 hover:text-blue-800 font-bold transition-colors"
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
