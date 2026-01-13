import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore, enableIndexedDbPersistence } from "firebase/firestore";

// Konfigurasi resmi dari proyek 'warung-pos' milik Anda
const firebaseConfig = {
  apiKey: "AIzaSyAR5fQXEhFVdCwXjCVSzZzMDWwqqpvdCwE",
  authDomain: "warung-pos.firebaseapp.com",
  projectId: "warung-pos",
  storageBucket: "warung-pos.firebasestorage.app",
  messagingSenderId: "241812132692",
  appId: "1:241812132692:web:6788fdf4c25eb1d297eec1",
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db_fs = getFirestore(app);

// Aktifkan Offline Persistence
// Ini sangat penting untuk Warung agar aplikasi tetap bisa transaksi meski sinyal lemah
enableIndexedDbPersistence(db_fs).catch((err) => {
  if (err.code === "failed-precondition") {
    console.warn("Persistence failed: Multiple tabs open");
  } else if (err.code === "unimplemented") {
    console.warn("Persistence is not available in this browser");
  }
});
