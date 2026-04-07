import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getDatabase } from "firebase/database";

const firebaseConfig = {
  apiKey: "AIzaSyCZJEJlevQr475TjkU5SjbSYk_S5bSkaiU",
  authDomain: "earnapp-f8d27.firebaseapp.com",
  projectId: "earnapp-f8d27",
  databaseURL: "https://earnapp-f8d27-default-rtdb.asia-southeast1.firebasedatabase.app/",
  storageBucket: "earnapp-f8d27.appspot.com",
  messagingSenderId: "151886381795",
  appId: "1:151886381795:web:d76b5280b7c8cd30767bd6"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const rtdb = getDatabase(app, "https://earnapp-f8d27-default-rtdb.asia-southeast1.firebasedatabase.app/");