// js/config.js
const CONFIG = {
    ADMIN_EMAIL: 'profeshionalx@gmail.com',
    TELEGRAM: {
        BOT_TOKEN: '8523408241:AAF9LSodUHSeG6UgGm0ZmkPnL8BkimXUHhQ',
        BOT_USERNAME: 'GrechkaPadelBot'
    },
    FIREBASE: {
        apiKey: "AIzaSyBVKxWXOxVq_9vIpRr7eQCEJOPv7PKImg0",
        authDomain: "grechka-6bdb7.firebaseapp.com",
        projectId: "grechka-6bdb7",
        storageBucket: "grechka-6bdb7.firebasestorage.app",
        messagingSenderId: "746199017331",
        appId: "1:746199017331:web:2e4e08023cb89484fd4706"
    }
};

// Firebase Init
(function() {
    if (typeof firebase === 'undefined' || firebase.apps.length) return;
    
    firebase.initializeApp(CONFIG.FIREBASE);
    const db = firebase.firestore();
    const auth = firebase.auth();
    
    window.fb = {
        db, auth,
        googleProvider: new firebase.auth.GoogleAuthProvider(),
        collection: (name) => db.collection(name),
        doc: (col, id) => db.collection(col).doc(id),
        increment: firebase.firestore.FieldValue.increment,
        arrayUnion: firebase.firestore.FieldValue.arrayUnion,
        arrayRemove: firebase.firestore.FieldValue.arrayRemove,
        storage: () => firebase.storage() // Функция для получения storage
    };
    
    window.dispatchEvent(new Event('firebaseReady'));
})();
