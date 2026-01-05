
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore, enableIndexedDbPersistence, terminate } from 'firebase/firestore';

// Kunci ini KHUSUS untuk Firebase, jangan dicampur dengan process.env.API_KEY (Gemini)
const firebaseConfig = {
  apiKey: "AIzaSyAR5fQXEhFVdCwXjCVSzZzMDWwqqpvdCwE", // Gunakan kunci Firebase asli Bapak
  authDomain: "warung-pos.firebaseapp.com",
  projectId: "warung-pos",
  storageBucket: "warung-pos.firebasestorage.app",
  messagingSenderId: "241812132692",
  appId: "1:241812132692:web:6788fdf4c25eb1d297eec1"
};

// Inisialisasi Singleton
const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db_fs = getFirestore(app);

// Aktifkan Offline Persistence agar tetap bisa jualan saat internet mati
if (typeof window !== 'undefined') {
  enableIndexedDbPersistence(db_fs).catch((err) => {
    if (err.code === 'failed-precondition') {
      console.warn('Firestore Persistence: Gagal karena banyak tab terbuka');
    } else if (err.code === 'unimplemented') {
      console.warn('Firestore Persistence: Browser tidak mendukung');
    }
  });
}
