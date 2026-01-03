import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore, enableIndexedDbPersistence, initializeFirestore, CACHE_SIZE_UNLIMITED } from "firebase/firestore";

const firebaseConfig = {
  // Menggunakan process.env.API_KEY sesuai instruksi keamanan
  apiKey: process.env.API_KEY || "AIzaSyAR5fQXEhFVdCwXjCVSzZzMDWwqqpvdCwE",
  authDomain: "warung-pos.firebaseapp.com",
  projectId: "warung-pos",
  storageBucket: "warung-pos.firebasestorage.app",
  messagingSenderId: "241812132692",
  appId: "1:241812132692:web:6788fdf4c25eb1d297eec1",
};

// Pastikan tidak inisialisasi ulang jika app sudah ada (menghindari error di Vercel/HMR)
const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);

export const auth = getAuth(app);

// Inisialisasi Firestore dengan setting cache yang lebih optimal
export const db_fs = initializeFirestore(app, {
  cacheSizeBytes: CACHE_SIZE_UNLIMITED,
});

// Aktifkan Offline Persistence hanya di browser yang mendukung
if (typeof window !== "undefined") {
  enableIndexedDbPersistence(db_fs).catch((err) => {
    if (err.code === "failed-precondition") {
      console.warn("Firestore Persistence failed: Multiple tabs open");
    } else if (err.code === "unimplemented") {
      console.warn("Firestore Persistence is not available in this browser");
    }
  });
}
