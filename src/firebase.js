export { initializeApp } from "firebase/app";
export { getAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult, onAuthStateChanged, signOut } from "firebase/auth";
export { initializeFirestore, persistentLocalCache, persistentMultipleTabManager, doc, setDoc, getDoc, onSnapshot, collection, query, where, getDocs } from "firebase/firestore";
