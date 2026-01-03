import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore, enableIndexedDbPersistence } from "firebase/firestore";

const firebaseConfig = {
  apiKey: process.env.API_KEY || "AIzaSyAR5fQXEhFVdCwXjCVSzZzMDWwqqpvdCwE",
  authDomain: "warung-pos.firebaseapp.com",
  projectId: "warung-pos",
  storageBucket: "warung-pos.firebasestorage.app",
  messagingSenderId: "241812132692",
  appId: "1:241812132692:web:6788fdf4c25eb1d297eec1",
};

const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db_fs = getFirestore(app);

// Aktifkan Offline Persistence
if (typeof window !== "undefined") {
  enableIndexedDbPersistence(db_fs).catch((err) => {
    if (err.code === "failed-precondition") {
      console.warn("Firestore Persistence failed: Multiple tabs open");
    } else if (err.code === "unimplemented") {
      console.warn("Firestore Persistence not supported");
    }
  });
}
