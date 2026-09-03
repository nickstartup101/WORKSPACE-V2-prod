import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

// ✅ Firebase Configuration ຕົວຈິງຂອງ La Dolce Workspace
const firebaseConfig = {
  apiKey: "AIzaSyDttcZJfXZ4uI7mQiR-wv0pvKIGlreLh_0",
  authDomain: "la-dolce-workspace-f975d.firebaseapp.com",
  projectId: "la-dolce-workspace-f975d",
  storageBucket: "la-dolce-workspace-f975d.firebasestorage.app",
  messagingSenderId: "749405934698",
  appId: "1:749405934698:web:016a6985764177a40fa613",
  measurementId: "G-4G821Q7TQ4"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);

// Operation Types Helper
export enum OperationType {
  CREATE = 'CREATE',
  READ = 'READ',
  WRITE = 'WRITE',
  DELETE = 'DELETE',
  LIST = 'LIST',
  GET = 'GET'
}

// Global Firestore Error Handler
export function handleFirestoreError(error: any, operationType: OperationType, path: string) {
  console.warn(`Firestore ${operationType} warning on ${path}:`, error?.message || error);
}

export default app;
