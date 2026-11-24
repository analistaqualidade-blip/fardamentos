import { initializeApp, deleteApp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import {
  getAuth,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  sendPasswordResetEmail,
  createUserWithEmailAndPassword
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
import {
  getFirestore,
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  addDoc,
  updateDoc,
  query,
  where,
  onSnapshot,
  writeBatch,
  Timestamp,
  serverTimestamp
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';

/**
 * CONFIGURAÇÃO DO FIREBASE (SUBSTITUA PELAS CREDENCIAIS DO SEU PROJETO)
 * Acesse o Firebase Console > Configurações do Projeto > Seus aplicativos > Web (</>)
 * e cole abaixo os valores do objeto firebaseConfig.
 */
export const firebaseConfig = {
  apiKey: 'AIzaSyB9SsZ7CtQk4N_x7yuTd4cHT73Xw1d31BY',
  authDomain: 'gestfardamentos.firebaseapp.com',
  projectId: 'gestfardamentos',
  storageBucket: 'gestfardamentos.firebasestorage.app',
  messagingSenderId: '281244918764',
  appId: '1:281244918764:web:2489b7a41bca232c3a56c9',
  measurementId: 'G-3EGHLR82LW'
};

export function isFirebaseConfigured() {
  const { apiKey, authDomain, projectId } = firebaseConfig;
  if (!apiKey || !authDomain || !projectId) return false;
  if (apiKey.includes('SUA_API_KEY') || authDomain.includes('SEU_PROJETO') || projectId.includes('SEU_PROJECT_ID')) {
    return false;
  }
  return true;
}

let app = null;
let auth = null;
let db = null;

if (isFirebaseConfigured()) {
  app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = getFirestore(app);
}

/**
 * Cria um usuário no Firebase Auth sem deslogar a sessão atual do Administrador,
 * utilizando uma instância secundária isolada que é destruída logo após a criação.
 */
export async function createAuthUserWithoutSignOut(email, password) {
  if (!isFirebaseConfigured()) {
    throw new Error('Firebase não configurado.');
  }

  const secondaryName = `secondary-admin-creator-${Date.now()}`;
  const secondaryApp = initializeApp(firebaseConfig, secondaryName);
  const secondaryAuth = getAuth(secondaryApp);

  try {
    const credential = await createUserWithEmailAndPassword(secondaryAuth, email, password);
    const uid = credential.user.uid;
    await signOut(secondaryAuth);
    return uid;
  } finally {
    await deleteApp(secondaryApp).catch(() => {});
  }
}

export {
  app,
  auth,
  db,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  sendPasswordResetEmail,
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  addDoc,
  updateDoc,
  query,
  where,
  onSnapshot,
  writeBatch,
  Timestamp,
  serverTimestamp
};
