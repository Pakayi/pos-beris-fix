import React, { useState, useEffect } from "react";
import { auth, db_fs } from "../services/firebase";
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, updateProfile, GoogleAuthProvider, signInWithPopup, sendPasswordResetEmail, signOut } from "firebase/auth";
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
  const [success, setSuccess] = useState("");

  // Deteksi jika user sebenarnya sudah login tapi datanya belum sinkron
  useEffect(() => {
    const checkAuthStatus = async () => {
      if (auth.currentUser) {
        setLoading(true);
        try {
          const userSnap = await getDoc(doc(db_fs, "users", auth.currentUser.uid));
          if (!userSnap.exists()) {
            setIsRegistering(true);
            setDisplayName(auth.currentUser.displayName || "");
          }
        } catch (e: any) {
          console.warn("Sistem menunggu izin Firestore...", e.message);
          // Jangan langsung tampilkan error merah di sini agar user tidak panik
        } finally {
          setLoading(false);
        }
      }
    };
    checkAuthStatus();
  }, []);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setSuccess("");

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

  const handleForgotPassword = async () => {
    if (!email) {
      setError("Masukkan email dulu bro untuk reset password.");
      return;
    }
    setLoading(true);
    try {
      await sendPasswordResetEmail(auth, email);
      setSuccess("Link reset password sudah dikirim ke email Bapak. Cek Inbox/Spam ya!");
      setError("");
    } catch (err: any) {
      handleAuthError(err);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setLoading(true);
    setError("");
    setSuccess("");
    const provider = new GoogleAuthProvider();

    try {
      const result = await signInWithPopup(auth, provider);
      const user = result.user;

      // Beri jeda sebentar agar Firebase Auth benar-benar settle
      await new Promise((resolve) => setTimeout(resolve, 1000));

      try {
        const userSnap = await getDoc(doc(db_fs, "users", user.uid));
        if (!userSnap.exists()) {
          setIsRegistering(true);
          setDisplayName(user.displayName || "");
        }
      } catch (e) {
        // Jika gagal read profil (karena rules), paksa isi profil baru
        setIsRegistering(true);
        setDisplayName(user.displayName || "");
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

    let user = auth.currentUser;

    // 1. Buat Auth User jika belum ada
    if (!user) {
      const userCredential = await createUserWithEmailAndPassword(auth, emailStr, passStr);
      user = userCredential.user;
    }

    if (!user) throw new Error("Gagal mengautentikasi.");

    // Beri jeda krusial agar Security Rules mengenali user yang baru login
    await new Promise((resolve) => setTimeout(resolve, 2000));

    let finalWarungId = "";
    let role: "owner" | "cashier" = "owner";

    if (isJoining) {
      const cleanId = joinWarungId.trim().toUpperCase();
      try {
        const warungRef = doc(db_fs, "warungs", cleanId);
        const warungSnap = await getDoc(warungRef);
        if (!warungSnap.exists()) throw new Error("Warung ID tidak ditemukan. Periksa kembali kodenya.");
        finalWarungId = cleanId;
        role = "cashier";
      } catch (e: any) {
        if (e.code === "permission-denied") {
          throw new Error("Akses Gabung Ditolak. Pastikan Rules Firestore sudah diset ke 'Production' atau 'Test Mode' dengan benar.");
        }
        throw e;
      }
    } else {
      finalWarungId = `WRG-${Math.random().toString(36).substr(2, 6).toUpperCase()}`;
    }

    // 2. Simpan profil USER
    const userProfile: UserProfile = {
      uid: user.uid,
      email: user.email!,
      displayName: nameStr,
      warungId: finalWarungId,
      role: role,
      active: true,
    };

    await setDoc(doc(db_fs, "users", user.uid), userProfile);

    // 3. Buat dokumen Warung jika owner
    if (!isJoining) {
      await setDoc(doc(db_fs, "warungs", finalWarungId), {
        id: finalWarungId,
        name: storeName,
        ownerUid: user.uid,
        status: "active",
        plan: "free",
        createdAt: Date.now(),
      });

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

    if (user.displayName !== nameStr) {
      await updateProfile(user, { displayName: nameStr });
    }

    // Tunggu sebentar agar penulisan selesai sebelum reload
    await new Promise((resolve) => setTimeout(resolve, 1500));
    window.location.reload();
  };

  const handleAuthError = (err: any) => {
    console.error("Detail Error:", err);
    let msg = err.message || "Terjadi kesalahan.";
    const fullMsg = msg.toLowerCase();

    if (fullMsg.includes("permission") || fullMsg.includes("insufficient")) {
      msg = "Izin Firestore Bermasalah! Mohon Bapak cek tab 'Rules' di Firebase Console. Pastikan aturan 'allow read, write: if request.auth != null;' sudah dipublikasikan.";
    } else if (fullMsg.includes("auth/email-already-in-use")) {
      msg = "Email sudah terdaftar. Silakan Masuk (Login) saja.";
      setIsRegistering(false);
    } else if (fullMsg.includes("auth/invalid-credential")) {
      msg = "Email atau Password salah.";
    }

    setError(msg);
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
            <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-[11px] rounded-lg flex items-start gap-2 leading-relaxed font-bold animate-pulse">
              <i className="fa-solid fa-circle-exclamation mt-1"></i>
              <span>{error}</span>
            </div>
          )}

          {success && (
            <div className="p-3 bg-green-50 border border-green-200 text-green-700 text-[11px] rounded-lg flex items-start gap-2 leading-relaxed font-bold">
              <i className="fa-solid fa-circle-check mt-1"></i>
              <span>{success}</span>
            </div>
          )}

          {isRegistering && (
            <>
              <div className="flex bg-slate-100 p-1 rounded-xl mb-2">
                <button type="button" onClick={() => setIsJoining(false)} className={`flex-1 py-1 text-[10px] font-bold rounded-lg transition-all ${!isJoining ? "bg-white shadow text-blue-600" : "text-slate-500"}`}>
                  Buat Warung
                </button>
                <button type="button" onClick={() => setIsJoining(true)} className={`flex-1 py-1 text-[10px] font-bold rounded-lg transition-all ${isJoining ? "bg-white shadow text-blue-600" : "text-slate-500"}`}>
                  Gabung Warung
                </button>
              </div>
              <Input label="Nama Lengkap" value={displayName} onChange={(e) => setDisplayName(e.target.value)} required />
              {isJoining ? (
                <Input label="Warung ID (dari Owner)" value={joinWarungId} onChange={(e) => setJoinWarungId(e.target.value.toUpperCase())} placeholder="WRG-XXXXXX" required />
              ) : (
                <Input label="Nama Warung Baru" value={storeName} onChange={(e) => setStoreName(e.target.value)} required />
              )}
            </>
          )}

          <Input label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          {!success && <Input label="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required={!success} />}

          <Button type="submit" className="w-full py-3 font-bold" disabled={loading}>
            {loading ? <i className="fa-solid fa-circle-notch fa-spin mr-2"></i> : isRegistering ? "Konfirmasi & Simpan" : "Masuk"}
          </Button>

          {!isRegistering && (
            <div className="space-y-3">
              <button type="button" onClick={handleGoogleLogin} className="w-full flex items-center justify-center gap-3 py-2.5 bg-white border rounded-xl hover:bg-slate-50 font-bold text-sm">
                <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" className="w-5 h-5" alt="G" />
                Masuk dengan Google
              </button>
              <button type="button" onClick={handleForgotPassword} className="w-full text-xs text-slate-400 hover:text-blue-500 transition-colors">
                Lupa Password? Reset di sini
              </button>
            </div>
          )}

          <div className="text-center mt-4 border-t pt-4">
            {auth.currentUser ? (
              <button type="button" onClick={() => signOut(auth)} className="text-xs text-red-500 font-bold">
                Ganti Akun / Logout
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setIsRegistering(!isRegistering);
                  setIsJoining(false);
                  setError("");
                  setSuccess("");
                }}
                className="text-xs text-blue-600 font-bold"
              >
                {isRegistering ? "Sudah punya akun? Masuk Saja" : "Belum punya akun? Daftar Gratis"}
              </button>
            )}
          </div>
        </form>
      </Card>
    </div>
  );
};

export default Login;
