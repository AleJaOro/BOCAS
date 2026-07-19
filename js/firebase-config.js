/**
 * Bocas SaaS — Firebase configuration
 * Project: bocas-7848a
 */
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import { getAuth } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
import { getFirestore } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
import { getStorage } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-storage.js';

const firebaseConfig = {
  apiKey: 'AIzaSyDmfdlvwsxhXro9RR53AOVOMzKC7q6h2yo',
  authDomain: 'bocas-7848a.firebaseapp.com',
  projectId: 'bocas-7848a',
  storageBucket: 'bocas-7848a.firebasestorage.app',
  messagingSenderId: '173538393456',
  appId: '1:173538393456:web:a60fed0cb21d81ffb663b5'
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
export default app;
