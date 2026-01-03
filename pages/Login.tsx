import React, { useState } from "react";
import { auth, db_fs } from "../services/firebase";
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, updateProfile, deleteUser, GoogleAuthProvider, signInWithPopup } from "firebase/auth";
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

  // State khusus untuk menangani User Google yang baru masuk tapi belum punya data Warung
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

      // Cek apakah user sudah ada di database 'users'
      const userSnap = await getDoc(doc(db_fs, "users", user.uid));

      if (!userSnap.exists()) {
        // User baru lewat Google, minta mereka isi data Warung
        setGoogleUserPending(user);
        setIsRegistering(true);
        setDisplayName(user.displayName || "");
      }
      // Jika sudah ada, onAuthStateChanged di App.tsx akan otomatis mengarahkan ke Dashboard
    } catch (err: any) {
      handleAuthError(err);
    } finally {
      setLoading(false);
    }
  };

  const processRegistration = async (emailStr: string, passStr: string, nameStr: string) => {
    if (isJoining && !joinWarungId) throw new Error("Warung ID wajib diisi untuk bergabung.");
    if (!isJoining && !storeName) throw new Error("Nama Warung wajib diisi untuk buat baru.");
    if (!nameStr) throw new Error("Nama Lengkap wajib diisi.");

    let user = googleUserPending;

    // Jika bukan dari Google, buat akun email/pass dulu
    if (!user) {
      const userCredential = await createUserWithEmailAndPassword(auth, emailStr, passStr);
      user = userCredential.user;
    }

    let finalWarungId = "";
    let role: "owner" | "cashier" = "owner";

    try {
      if (isJoining) {
        const warungRef = doc(db_fs, "warungs", joinWarungId.trim().toUpperCase());
        const warungSnap = await getDoc(warungRef);
        if (!warungSnap.exists()) throw new Error("Warung ID tidak ditemukan.");
        finalWarungId = joinWarungId.trim().toUpperCase();
        role = "cashier";
      } else {
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
      if (!googleUserPending) await updateProfile(user, { displayName: nameStr });
    } catch (dbErr: any) {
      if (!googleUserPending) await deleteUser(user);
      throw dbErr;
    }
  };

  const handleAuthError = (err: any) => {
    console.error("Auth Error:", err);
    let msg = err.message;
    if (msg.includes("auth/email-already-in-use")) msg = "Email sudah terdaftar.";
    if (msg.includes("permission-denied")) msg = "Izin database ditolak. Pastikan Firestore Rules sudah 'allow write: if request.auth != null'.";
    if (msg.includes("auth/popup-closed-by-user")) msg = "Login dibatalkan.";
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
          <p className="text-slate-500 text-sm mt-1">{isRegistering ? (isJoining ? "Bergabung ke Warung" : googleUserPending ? "Selesaikan Pendaftaran" : "Daftar Warung Baru") : "Masuk untuk mengelola toko"}</p>
        </div>

        <form onSubmit={handleAuth} className="space-y-4">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-[10px] rounded-lg flex items-start gap-2 animate-in fade-in">
              <i className="fa-solid fa-circle-exclamation mt-0.5"></i>
              <span>{error}</span>
            </div>
          )}

          {isRegistering && (
            <>
              <div className="flex bg-slate-100 p-1 rounded-xl mb-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsJoining(false);
                    setError("");
                  }}
                  className={`flex-1 py-1.5 text-[10px] font-bold rounded-lg transition-all ${!isJoining ? "bg-white shadow text-blue-600" : "text-slate-500"}`}
                >
                  Buat Warung
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIsJoining(true);
                    setError("");
                  }}
                  className={`flex-1 py-1.5 text-[10px] font-bold rounded-lg transition-all ${isJoining ? "bg-white shadow text-blue-600" : "text-slate-500"}`}
                >
                  Gabung Warung
                </button>
              </div>

              <Input label="Nama Lengkap" type="text" placeholder="Nama Anda" value={displayName} onChange={(e) => setDisplayName(e.target.value)} required />

              {isJoining ? (
                <Input label="Warung ID" type="text" placeholder="WRG-XXXXXX" value={joinWarungId} onChange={(e) => setJoinWarungId(e.target.value.toUpperCase())} required />
              ) : (
                <Input label="Nama Warung / Toko" type="text" placeholder="Contoh: Warung Berkah" value={storeName} onChange={(e) => setStoreName(e.target.value)} required />
              )}
            </>
          )}

          {!googleUserPending && (
            <>
              <Input label="Email" type="email" placeholder="email@toko.com" value={email} onChange={(e) => setEmail(e.target.value)} required />

              <Input label="Password" type="password" placeholder="Min. 6 Karakter" value={password} onChange={(e) => setPassword(e.target.value)} required />
            </>
          )}

          <Button type="submit" className="w-full py-2.5 font-bold" disabled={loading}>
            {loading && <i className="fa-solid fa-circle-notch fa-spin mr-2"></i>}
            {isRegistering ? "Konfirmasi & Simpan" : "Masuk Sekarang"}
          </Button>

          {!isRegistering && (
            <>
              <div className="relative flex items-center py-2">
                <div className="flex-grow border-t border-slate-200"></div>
                <span className="flex-shrink mx-4 text-slate-400 text-[10px] font-bold uppercase">Atau</span>
                <div className="flex-grow border-t border-slate-200"></div>
              </div>

              <button
                type="button"
                onClick={handleGoogleLogin}
                disabled={loading}
                className="w-full flex items-center justify-center gap-3 py-2.5 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-all shadow-sm text-slate-700 font-bold text-sm"
              >
                <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" className="w-5 h-5" alt="G" />
                Masuk dengan Google
              </button>
            </>
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
              className="text-xs text-blue-600 hover:text-blue-800 font-bold"
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
