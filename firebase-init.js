// firebase-init.js

// TODO: Bu kısmı Firebase projenizden aldığınız kendi yapılandırma kodunuzla değiştirin!
const firebaseConfig = {
    apiKey: "AIzaSyBzFrKpdtCxk3qdrt7CvaEuTTbNqZzj3_8",
    authDomain: "borc-program.firebaseapp.com",
    projectId: "borc-program",
    storageBucket: "borc-program.firebasestorage.app",
    messagingSenderId: "183504790933",
    appId: "1:183504790933:web:209442a8388ec6655fc29c"
};

// Firebase servislerini başlat
const app = firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
const auth = firebase.auth();
const googleProvider = new firebase.auth.GoogleAuthProvider(); // Google sağlayıcısını oluştur

let currentUser;

// Kullanıcının oturum açma durumunu dinle
auth.onAuthStateChanged(user => {
    const signInBtn = document.getElementById('sign-in-btn');
    const userInfoDiv = document.getElementById('user-info');
    const mainContent = document.querySelector('main');

    if (user) {
        // KULLANICI GİRİŞ YAPMIŞ
        currentUser = user;
        console.log("Kullanıcı giriş yaptı:", currentUser.uid);
        
        // Arayüzü güncelle
        signInBtn.style.display = 'none';
        userInfoDiv.style.display = 'flex';
        mainContent.style.display = 'block';
        document.getElementById('user-email').textContent = user.email;

        // Kullanıcı hazır olduğu için verileri yükle
        loadAllData();
    } else {
        // KULLANICI GİRİŞ YAPMAMIŞ
        currentUser = null;
        console.log("Oturum açık değil.");
        
        // Arayüzü güncelle
        signInBtn.style.display = 'block';
        userInfoDiv.style.display = 'none';
        mainContent.style.display = 'none'; // Ana içeriği gizle
    }
});
