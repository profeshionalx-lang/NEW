// js/shared.js
const { useState, useEffect, createContext, useContext } = React;

// --- Утилиты ---
window.cn = (...classes) => classes.filter(Boolean).join(' ');
window.formatDate = (date, opts = { day: 'numeric', month: 'short' }) => 
    new Date(date).toLocaleDateString('ru-RU', opts);

// --- Контекст и Хуки ---
window.AuthContext = createContext(null);
window.useAuth = () => useContext(window.AuthContext);

window.useFirebaseReady = function() {
    const [ready, setReady] = useState(!!window.fb);
    useEffect(() => {
        if (window.fb) return;
        const handler = () => setReady(true);
        window.addEventListener('firebaseReady', handler);
        return () => window.removeEventListener('firebaseReady', handler);
    }, []);
    return ready;
};

window.useCollection = function(name) {
    const [data, setData] = useState([]);
    const ready = window.useFirebaseReady();
    useEffect(() => {
        if (!ready) return;
        return window.fb.collection(name).onSnapshot(snap => {
            const items = [];
            snap.forEach(doc => items.push(doc.data()));
            setData(items);
        });
    }, [ready, name]);
    return data;
};

window.useDocument = function(collection, id) {
    const [data, setData] = useState(null);
    const ready = window.useFirebaseReady();
    useEffect(() => {
        if (!ready || !id) return;
        return window.fb.doc(collection, id).onSnapshot(doc => {
            if (doc.exists) setData(doc.data());
        });
    }, [ready, collection, id]);
    return data;
};

window.useAuthState = function() {
    const [user, setUser] = useState(null);
    const [profile, setProfile] = useState(null);
    const ready = window.useFirebaseReady();
    const isAdmin = user?.email === CONFIG.ADMIN_EMAIL;

    useEffect(() => {
        if (!ready) return;
        return window.fb.auth.onAuthStateChanged(async (u) => {
            setUser(u);
            if (!u) { setProfile(null); return; }
            const ref = window.fb.doc('players', u.uid);
            const snap = await ref.get();
            if (snap.exists) setProfile(snap.data());
            else {
                const newProfile = { id: u.uid, name: u.displayName, email: u.email, photoURL: u.photoURL, points: 0, totalMatches: 0, wins: 0 };
                await ref.set(newProfile);
                setProfile(newProfile);
            }
        });
    }, [ready]);

    const login = (provider) => window.fb.auth.signInWithPopup(provider === 'google' ? window.fb.googleProvider : window.fb.appleProvider);
    const logout = () => window.fb.auth.signOut();
    return { user, profile, isAdmin, login, logout };
};

// --- Компоненты UI (глобальные) ---
window.Card = ({ children, className, dark, ...props }) => (
    <div className={window.cn(dark ? 'bg-white/5 border border-white/10' : 'bg-white', 'rounded-3xl', className)} {...props}>{children}</div>
);

window.Button = ({ children, variant = 'primary', className, ...props }) => {
    const styles = {
        primary: 'bg-white text-black hover:bg-white/90',
        secondary: 'bg-white/10 text-white hover:bg-white/20',
        danger: 'border-2 border-red-500 text-red-500 hover:bg-red-50',
        ghost: 'text-white/40 hover:text-white'
    };
    return <button className={window.cn('px-6 py-3 rounded-full font-semibold transition-all', styles[variant], className)} {...props}>{children}</button>;
};

window.Input = ({ label, className, ...props }) => (
    <div>
        {label && <label className="block text-sm font-medium text-gray-500 mb-2">{label}</label>}
        <input className={window.cn('w-full p-4 bg-gray-50 border border-gray-200 rounded-2xl text-black outline-none', className)} {...props} />
    </div>
);

window.Avatar = ({ src, name, size = 'md' }) => {
    const s = { sm: 'w-8 h-8 text-xs', md: 'w-10 h-10', lg: 'w-14 h-14 text-xl' };
    return src ? <img src={src} className={`rounded-full ${s[size]}`} /> : <div className={`rounded-full bg-gray-200 flex items-center justify-center text-gray-500 font-bold ${s[size]}`}>{name?.[0]}</div>;
};

window.Modal = ({ children, onClose }) => (
    <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-50 p-4" onClick={onClose}>
        <div onClick={e => e.stopPropagation()}>{children}</div>
    </div>
);

window.Badge = ({ children, variant = 'default' }) => {
    const s = { default: 'bg-gray-100 text-gray-700', active: 'bg-black text-white', completed: 'bg-gray-200 text-gray-600' };
    return <span className={window.cn('px-3 py-1 rounded-full text-xs font-semibold', s[variant])}>{children}</span>;
};

// --- Модальное окно входа ---
window.AuthModal = ({ onClose }) => {
    const { login } = window.useAuth();
    const handle = async (p) => { await login(p); onClose(); };
    return (
        <window.Modal onClose={onClose}>
            <window.Card className="p-10 max-w-md w-full text-center">
                <h3 className="text-3xl font-bold text-black mb-8">Вход</h3>
                <div className="space-y-4">
                    <button onClick={() => handle('google')} className="w-full bg-gray-100 p-4 rounded-2xl font-bold text-black">Войти через Google</button>
                    <button onClick={() => handle('apple')} className="w-full bg-black p-4 rounded-2xl font-bold text-white">Войти через Apple</button>
                </div>
                <button onClick={onClose} className="mt-6 text-gray-400">Отмена</button>
            </window.Card>
        </window.Modal>
    );
};

// --- Основной Layout (Шапка) ---
window.Layout = ({ children, activePage }) => {
    const auth = window.useAuth();
    const [showAuth, setShowAuth] = useState(false);
    
    useEffect(() => { if (auth) auth.showAuth = () => setShowAuth(true); }, [auth]);

    return (
        <div className="min-h-screen bg-black text-white">
            <header className="border-b border-white/10">
                <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
                    {/* АБСОЛЮТНЫЕ ПУТИ ВНУТРИ JS НЕ НУЖНЫ, НО НУЖНО УЧЕСТЬ, ЧТО МЫ В ПОДДИРЕКТОРИИ /NEW/ */}
                    <a href="/NEW/index.html" className="text-2xl font-bold no-underline text-white">Grechka <span className="text-white/40">•</span> Padel</a>
                    <nav className="hidden md:flex gap-8">
                        <a href="/NEW/index.html" className={activePage === 'tournaments' ? 'text-white' : 'text-white/40'}>Турниры</a>
                        <a href="/NEW/trainings.html" className={activePage === 'trainings' ? 'text-white' : 'text-white/40'}>Тренировки</a>
                        <a href="/NEW/players.html" className={activePage === 'players' ? 'text-white' : 'text-white/40'}>Рейтинг</a>
                    </nav>
                    <div className="flex items-center gap-4">
                        {auth.user ? (
                            <div className="flex gap-3 items-center">
                                <window.Avatar src={auth.user.photoURL} name={auth.user.displayName} />
                                <button onClick={auth.logout} className="text-white/40 hover:text-white text-sm">Выйти</button>
                            </div>
                        ) : <window.Button onClick={() => setShowAuth(true)}>Войти</window.Button>}
                    </div>
                </div>
            </header>
            <main className="max-w-7xl mx-auto px-6 py-8">{children}</main>
            {showAuth && <window.AuthModal onClose={() => setShowAuth(false)} />}
        </div>
    );
};
