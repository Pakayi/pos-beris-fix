import React, { useState } from "react";
import { auth, db_fs } from "../services/firebase";
import { db } from "../services/db";
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, signInWithPopup, GoogleAuthProvider, updateProfile } from "firebase/auth";
import { doc, getDoc, setDoc } from "firebase/firestore";
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

  const generateUniqueWarungId = () => {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let result = "W-";
    for (let i = 0; i < 6; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  };

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      if (isRegistering) {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const createdUser = userCredential.user;
        await updateProfile(createdUser, { displayName });

        let targetWarungId = "";

        if (role === "staff") {
          const inputId = warungIdInput.trim().toUpperCase();
          if (!inputId) throw new Error("WARUNG_ID_REQUIRED");

          const warungDoc = await getDoc(doc(db_fs, "warungs", inputId));
          if (!warungDoc.exists()) {
            throw new Error("WARUNG_ID_INVALID");
          }
          targetWarungId = inputId;
        } else {
          targetWarungId = generateUniqueWarungId();
          await setDoc(doc(db_fs, "warungs", targetWarungId), {
            ownerId: createdUser.uid,
            createdAt: Date.now(),
          });
        }

        const profile: UserProfile = {
          uid: createdUser.uid,
          email: email,
          displayName: displayName,
          role: role,
          warungId: targetWarungId,
        };
        await db.saveUserProfile(profile);
      } else {
        await signInWithEmailAndPassword(auth, email, password);
      }
    } catch (err: any) {
      console.error("Auth Error Detail:", err);
      if (err.message === "WARUNG_ID_REQUIRED") setError("Masukkan Warung ID.");
      else if (err.message === "WARUNG_ID_INVALID") setError("Warung ID tidak valid.");
      else {
        switch (err.code) {
          case "auth/email-already-in-use":
            setError("Email sudah dipakai.");
            break;
          case "auth/weak-password":
            setError("Password minimal 6 karakter.");
            break;
          case "permission-denied":
            setError("Gagal menulis ke database. Cek Rules Firestore.");
            break;
          default:
            setError(err.message || "Terjadi kesalahan.");
        }
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
      const userDoc = await getDoc(doc(db_fs, "users", result.user.uid));

      if (!userDoc.exists()) {
        const newWarungId = generateUniqueWarungId();
        await setDoc(doc(db_fs, "warungs", newWarungId), {
          ownerId: result.user.uid,
          createdAt: Date.now(),
        });

        const profile: UserProfile = {
          uid: result.user.uid,
          email: result.user.email || "",
          displayName: result.user.displayName || "User",
          role: "owner",
          warungId: newWarungId,
        };
        await db.saveUserProfile(profile);
      } else {
        const profileData = userDoc.data() as UserProfile;
        localStorage.setItem("warung_user_profile", JSON.stringify(profileData));
        window.dispatchEvent(new Event("profile-updated"));
      }
    } catch (err: any) {
      if (err.code !== "auth/popup-closed-by-user") setError("Gagal login Google.");
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

              {role === "staff" && (
                <div className="bg-blue-50 p-3 rounded-lg border border-blue-100 mb-2">
                  <p className="text-[10px] text-blue-700 font-bold uppercase mb-2">Pendaftaran Kasir</p>
                  <Input label="Warung ID (Minta ke Owner)" placeholder="W-XXXXXX" value={warungIdInput} onChange={(e) => setWarungIdInput(e.target.value)} required />
                  <p className="text-[10px] text-blue-600 mt-1 italic">Tanya Owner di menu Pengaturan untuk ID ini.</p>
                </div>
              )}

              <Input label="Nama Lengkap" placeholder="Nama Anda" value={displayName} onChange={(e) => setDisplayName(e.target.value)} required />
            </>
          )}

          <Input label="Email" type="email" placeholder="email@contoh.com" value={email} onChange={(e) => setEmail(e.target.value)} required />

          <Input label="Password" type="password" placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} required />

          <Button type="submit" className="w-full py-2.5 font-bold" disabled={loading}>
            {loading ? <i className="fa-solid fa-circle-notch fa-spin mr-2"></i> : null}
            {isRegistering ? "Daftar Sekarang" : "Masuk"}
          </Button>

          <div className="text-center mt-4">
            <button type="button" onClick={() => setIsRegistering(!isRegistering)} className="text-xs text-blue-600 hover:underline font-medium">
              {isRegistering ? "Sudah punya akun? Login" : "Belum punya akun? Daftar Kasir/Owner"}
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
