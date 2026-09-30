export { initializeApp } from "firebase/app";
export { getAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult, onAuthStateChanged, signOut, deleteUser, reauthenticateWithPopup, reauthenticateWithRedirect } from "firebase/auth";
export { initializeFirestore, persistentLocalCache, persistentMultipleTabManager, doc, setDoc, getDoc, deleteDoc, onSnapshot, collection, query, where, getDocs, writeBatch, terminate, clearIndexedDbPersistence } from "firebase/firestore";
