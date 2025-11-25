// js/shared.js
const { useState, useEffect, useContext, createContext } = React;

// --- UTILS ---
window.cn = (...classes) => classes.filter(Boolean).join(' ');
window.formatDate = (date, opts = { day: 'numeric', month: 'short' }) => 
    new Date(date).toLocaleDateString('ru-RU', opts);

// --- CONTEXTS ---
window.AuthContext = createContext(null);
window.useAuth = () => useContext(window.AuthContext);

// --- HOOKS ---
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

window.useCollection = function(name, enabled = true) {
    const [data, setData] = useState([]);
    const ready = window.useFirebaseReady();
    useEffect(() => {
        if (!ready || !enabled) return;
        return window.fb.collection(name).onSnapshot(snap => {
            const items = [];
            snap.forEach(doc => items.push(doc.data()));
            setData(items);
        });
    }, [ready, name, enabled]);
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
            if (snap.exists) {
                setProfile(snap.data());
            } else {
                const newProfile = {
                    id: u.uid, name: u.displayName || 'Игрок', email: u.email,
                    photoURL: u.photoURL, tournamentsPlayed: 0, totalMatches: 0,
                    wins: 0, losses: 0, points: 0, createdAt: new Date().toISOString()
                };
                await ref.set(newProfile);
                setProfile(newProfile);
            }
        });
    }, [ready]);

    const login = async (provider) => {
        const p = provider === 'google' ? window.fb.googleProvider : window.fb.appleProvider;
        await window.fb.auth.signInWithPopup(p);
    };
    const logout = () => window.fb.auth.signOut();

    return { user, profile, isAdmin, login, logout };
};

// --- UI COMPONENTS ---
window.Card = ({ children, className, dark, ...props }) => (
    <div className={window.cn(dark ? 'bg-white/5 border border-white/10' : 'bg-white', 'rounded-3xl', className)} {...props}>
        {children}
    </div>
);

window.Button = ({ children, variant = 'primary', className, ...props }) => {
    const styles = {
        primary: 'bg-white text-black hover:bg-white/90',
        secondary: 'bg-white/10 text-white hover:bg-white/20',
        danger: 'border-2 border-red-500 text-red-500 hover:bg-red-50',
        ghost: 'text-white/40 hover:text-white'
    };
    return (
        <button className={window.cn('px-6 py-3 rounded-full font-semibold transition-all', styles[variant], className)} {...props}>
            {children}
        </button>
    );
};

window.Avatar = ({ src, name, size = 'md', className }) => {
    const sizes = { sm: 'w-8 h-8 text-sm', md: 'w-10 h-10', lg: 'w-14 h-14 text-xl', xl: 'w-24 h-24 text-4xl' };
    return src ? (
        <img src={src} alt="" className={window.cn('rounded-full', sizes[size], className)} />
    ) : (
        <div className={window.cn('rounded-full bg-gray-200 flex items-center justify-center text-gray-500 font-bold', sizes[size], className)}>
            {name?.[0] || '?'}
        </div>
    );
};

window.Input = ({ label, className, ...props }) => (
    <div>
        {label && <label className="block text-sm font-medium text-gray-500 mb-2">{label}</label>}
        <input className={window.cn('w-full p-4 bg-gray-50 border border-gray-200 rounded-2xl text-black placeholder-gray-400 focus:border-black focus:ring-1 focus:ring-black outline-none transition-all', className)} {...props} />
    </div>
);

window.Modal = ({ children, onClose }) => (
    <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-50 p-4" onClick={onClose}>
        <div onClick={e => e.stopPropagation()}>{children}</div>
    </div>
);

window.Badge = ({ children, variant = 'default' }) => {
    const styles = {
        default: 'bg-gray-100 text-gray-700',
        active: 'bg-black text-white',
        completed: 'bg-gray-200 text-gray-600'
    };
    return <span className={window.cn('px-3 py-1 rounded-full text-xs font-semibold', styles[variant])}>{children}</span>;
};

// --- GLOBAL LAYOUT & AUTH MODAL ---

window.AuthModal = ({ onClose }) => {
    const { login } = window.useAuth();
    const handleLogin = async (provider) => { await login(provider); onClose(); };
    return (
        <window.Modal onClose={onClose}>
            <window.Card className="p-10 max-w-md w-full">
                <div className="text-center mb-10">
                    <h3 className="text-3xl font-bold text-black mb-2">Добро пожаловать</h3>
                </div>
                <div className="space-y-4">
                    <button onClick={() => handleLogin('google')} className="w-full bg-gray-100 hover:bg-gray-200 text-black px-6 py-4 rounded-2xl font-semibold transition-all">Войти через Google</button>
                    <button onClick={() => handleLogin('apple')} className="w-full bg-black text-white px-6 py-4 rounded-2xl font-semibold hover:bg-gray-900 transition-all">Войти через Apple</button>
                </div>
                <button onClick={onClose} className="w-full mt-8 text-gray-400 hover:text-black transition-all text-sm">Отмена</button>
            </window.Card>
        </window.Modal>
    );
};

window.Layout = ({ children, activePage }) => {
    const auth = window.useAuth();
    const [showAuth, setShowAuth] = useState(false);

    return (
        <div className="min-h-screen bg-black text-white">
            <header className="border-b border-white/10">
                <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
                    <a href="index.html" className="cursor-pointer no-underline">
                        <h1 className="text-2xl font-bold tracking-tight">
                            <span className="text-white">Grechka</span>
                            <span className="text-white/40 font-light mx-2">•</span>
                            <span className="text-white/60 font-light">Padel</span>
                        </h1>
                    </a>
                    
                    <nav className="hidden md:flex items-center gap-8">
                        <a href="index.html" className={window.cn('text-sm font-medium transition-all no-underline', activePage === 'tournaments' ? 'text-white' : 'text-white/40 hover:text-white/70')}>Турниры</a>
                        <a href="trainings.html" className={window.cn('text-sm font-medium transition-all no-underline', activePage === 'trainings' ? 'text-white' : 'text-white/40 hover:text-white/70')}>Тренировки</a>
                        <a href="players.html" className={window.cn('text-sm font-medium transition-all no-underline', activePage === 'players' ? 'text-white' : 'text-white/40 hover:text-white/70')}>Рейтинг</a>
                    </nav>
                    
                    <div className="flex items-center gap-4">
                        {auth.user ? (
                            <div className="flex items-center gap-3">
                                <window.Avatar src={auth.user.photoURL} name={auth.user.displayName} />
                                <button onClick={auth.logout} className="text-white/40 hover:text-white text-sm">Выйти</button>
                            </div>
                        ) : (
                            <window.Button onClick={() => setShowAuth(true)}>Войти</window.Button>
                        )}
                    </div>
                </div>
            </header>

            <main className="max-w-7xl mx-auto px-6 py-8">
                {children}
            </main>

            {showAuth && <window.AuthModal onClose={() => setShowAuth(false)} />}
        </div>
    );
};
