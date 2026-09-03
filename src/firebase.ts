import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

// ✅ Firebase Configuration ຫຼັກຂອງ La Dolce Workspace
const firebaseConfig = {
  apiKey: "AIzaSyDttcZJfXZ4uI7mQiR-wv0pvKIGlreLh_0",
  authDomain: "la-dolce-workspace-f975d.firebaseapp.com",
  projectId: "la-dolce-workspace-f975d",
  storageBucket: "la-dolce-workspace-f975d.firebasestorage.app",
  messagingSenderId: "749405934698",
  appId: "1:749405934698:web:016a6985764177a40fa613",
  measurementId: "G-4G821Q7TQ4"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);

// ✅ ຕໍ່ກົງຫາຖານຂໍ້ມູນຫຼັກ (default) ທີ່ມີຄວາມສະຖຽນ ແລະ ປອດໄພສູງສຸດ
export const db = getFirestore(app);
export const storage = getStorage(app);

export enum OperationType {
  CREATE = 'CREATE',
  READ = 'READ',
  WRITE = 'WRITE',
  DELETE = 'DELETE',
  LIST = 'LIST',
  GET = 'GET'
}

export function handleFirestoreError(error: any, operationType: OperationType, path: string) {
  console.warn(`Firestore ${operationType} on ${path}:`, error?.message || error);
}

export default app;
