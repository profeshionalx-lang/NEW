// js/config.js
const CONFIG = {
    ADMIN_EMAIL: 'profeshionalx@gmail.com',
    FIREBASE: {
        apiKey: "AIzaSyBVKxWXOxVq_9vIpRr7eQCEJOPv7PKImg0",
        authDomain: "grechka-6bdb7.firebaseapp.com",
        projectId: "grechka-6bdb7",
        storageBucket: "grechka-6bdb7.firebasestorage.app",
        messagingSenderId: "746199017331",
        appId: "1:746199017331:web:2e4e08023cb89484fd4706"
    },
    GOOGLE_CALENDAR: {
        calendarId: 'AcZssZ39bALgvffeZCDnD-PVGXCvm-xQd8rq1opxYDVAhGa8bdMc4q1IN81jwva0c3HVTP2SFZIPOzu_',
        apiKey: "AIzaSyBVKxWXOxVq_9vIpRr7eQCEJOPv7PKImg0",
        bookingUrl: 'https://calendar.google.com/calendar/u/0/appointments/schedules/AcZssZ39bALgvffeZCDnD-PVGXCvm-xQd8rq1opxYDVAhGa8bdMc4q1IN81jwva0c3HVTP2SFZIPOzu_'
    }
};

(function initFirebase() {
    if (typeof firebase === 'undefined') return;
    if (!firebase.apps.length) firebase.initializeApp(CONFIG.FIREBASE);
    
    const db = firebase.firestore();
    const auth = firebase.auth();
    const googleProvider = new firebase.auth.GoogleAuthProvider();
    
    // КРИТИЧНО: Добавляем Calendar scope
    googleProvider.addScope('https://www.googleapis.com/auth/calendar.readonly');
    
    window.fb = {
        db, auth, googleProvider,
        appleProvider: new firebase.auth.OAuthProvider('apple.com'),
        collection: (name) => db.collection(name),
        doc: (col, id) => db.collection(col).doc(id),
        increment: firebase.firestore.FieldValue.increment,
        arrayUnion: firebase.firestore.FieldValue.arrayUnion,
        arrayRemove: firebase.firestore.FieldValue.arrayRemove
    };
    
    window.dispatchEvent(new Event('firebaseReady'));
})();
