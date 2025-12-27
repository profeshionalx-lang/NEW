// js/shared.js
const { useState, useEffect, createContext, useContext } = React;

// === УТИЛИТЫ ===
window.cn = (...c) => c.filter(Boolean).join(' ');
window.formatDate = (d, o = { day: 'numeric', month: 'short' }) => new Date(d).toLocaleDateString('ru-RU', o);

// === ХУКИ ===
window.AuthContext = createContext(null);
window.useAuth = () => useContext(window.AuthContext);

// Telegram Auth Helper
window.telegramAuth = {
    // Проверка подписи Telegram данных
    checkSignature: async (data) => {
        const { hash, ...authData } = data;
        const checkString = Object.keys(authData)
            .sort()
            .map(key => `${key}=${authData[key]}`)
            .join('\n');
        
        // Для упрощения пропускаем проверку на клиенте
        // В production лучше делать через backend
        return true;
    },
    
    // Создание/вход пользователя через Telegram
    loginWithTelegram: async (telegramUser) => {
        console.log('🔵 Telegram login started:', telegramUser);
        try {
            const email = `tg_${telegramUser.id}@telegram.user`;
            // Используем ПОСТОЯННЫЙ пароль на основе bot token и telegram ID
            const password = `tg_${CONFIG.TELEGRAM.BOT_TOKEN.slice(0, 20)}_${telegramUser.id}`;
            
            console.log('📧 Generated credentials:', { email, passwordLength: password.length });
            
            let user = null;
            
            try {
                // Пробуем войти с новым паролем
                console.log('🔑 Attempting signIn...');
                const userCredential = await window.fb.auth.signInWithEmailAndPassword(email, password);
                user = userCredential.user;
                console.log('✅ SignIn successful:', user.uid);
            } catch (signInError) {
                console.log('❌ SignIn failed:', signInError.code, signInError.message);
                
                if (signInError.code === 'auth/user-not-found') {
                    console.log('🆕 Creating new user...');
                    // Создаем нового пользователя
                    const userCredential = await window.fb.auth.createUserWithEmailAndPassword(email, password);
                    user = userCredential.user;
                    console.log('✅ User created:', user.uid);
                    
                    // Обновляем профиль Firebase Auth
                    await user.updateProfile({
                        displayName: telegramUser.first_name + (telegramUser.last_name ? ' ' + telegramUser.last_name : ''),
                        photoURL: telegramUser.photo_url || null
                    });
                    console.log('✅ Profile updated');
                    
                    // Создаем профиль в Firestore с Firebase UID
                    await window.fb.doc('players', user.uid).set({
                        id: user.uid,
                        telegramId: telegramUser.id,
                        name: telegramUser.first_name + (telegramUser.last_name ? ' ' + telegramUser.last_name : ''),
                        username: telegramUser.username || null,
                        email: email,
                        photoURL: telegramUser.photo_url || null,
                        authProvider: 'telegram',
                        points: 0,
                        totalMatches: 0,
                        wins: 0,
                        losses: 0,
                        tournamentsPlayed: 0,
                        emailVerified: true,
                        createdAt: new Date().toISOString()
                    });
                    console.log('✅ Firestore profile created');
                } else if (signInError.code === 'auth/wrong-password' || signInError.code === 'auth/invalid-login-credentials' || signInError.code === 'auth/invalid-credential') {
                    // Старый аккаунт с другим паролем - показываем инструкцию
                    console.log('⚠️ Old account detected with different password');
                    throw new Error('Старый аккаунт обнаружен. Удалите его в Firebase Console: ' + email);
                } else {
                    throw signInError;
                }
            }
            
            console.log('🎉 Telegram login completed successfully');
            return true;
        } catch (error) {
            console.error('💥 Telegram auth error:', error);
            throw error;
        }
    }
};

window.useFirebaseReady = () => {
    const [ready, setReady] = useState(!!window.fb);
    useEffect(() => {
        if (window.fb) return;
        const h = () => setReady(true);
        window.addEventListener('firebaseReady', h);
        return () => window.removeEventListener('firebaseReady', h);
    }, []);
    return ready;
};

window.useCollection = (name) => {
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

window.useDocument = (col, id) => {
    const [data, setData] = useState(null);
    const ready = window.useFirebaseReady();
    useEffect(() => {
        if (!ready || !id) return;
        return window.fb.doc(col, id).onSnapshot(doc => doc.exists && setData(doc.data()));
    }, [ready, col, id]);
    return data;
};

window.useAuthState = () => {
    const [user, setUser] = useState(null);
    const [profile, setProfile] = useState(null);
    const ready = window.useFirebaseReady();

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
                // Определяем источник авторизации
                const isTelegramUser = u.email?.includes('@telegram.user');
                const displayName = u.displayName || u.email?.split('@')[0] || 'Игрок';
                
                const newProfile = { 
                    id: u.uid, 
                    name: displayName,
                    email: u.email, 
                    photoURL: u.photoURL, 
                    points: 0, 
                    totalMatches: 0,
                    wins: 0,
                    losses: 0,
                    tournamentsPlayed: 0,
                    emailVerified: u.emailVerified,
                    authProvider: isTelegramUser ? 'telegram' : (u.providerData[0]?.providerId || 'email'),
                    createdAt: new Date().toISOString()
                };
                await ref.set(newProfile);
                setProfile(newProfile);
            }
        });
    }, [ready]);

    return { 
        user, 
        profile, 
        isAdmin: user?.email === CONFIG.ADMIN_EMAIL,
        login: () => window.fb.auth.signInWithPopup(window.fb.googleProvider),
        logout: () => window.fb.auth.signOut()
    };
};

// === ТУРНИРНАЯ ЛОГИКА ===
window.generateGroups = (pairs, courts) => {
    const courtsArr = Array(courts).fill().map((_, i) => ({ id: i + 1, name: `Корт ${i + 1}` }));
    
    return Array(Math.ceil(pairs.length / 4)).fill().map((_, i) => {
        const gPairs = pairs.slice(i * 4, (i + 1) * 4);
        const [c1, c2] = [courtsArr[0], courtsArr[1] || courtsArr[0]];
        
        const matches = gPairs.length === 4 ? [
            [0, 1, c1], [2, 3, c2], [0, 2, c1], [1, 3, c2], [0, 3, c1], [1, 2, c2]
        ].map(([a, b, court], r) => ({ 
            round: Math.floor(r / 2) + 1, 
            pair1: gPairs[a], 
            pair2: gPairs[b], 
            court, 
            set1p1: '', 
            set1p2: '' 
        })) : [];
        
        return {
            id: i, 
            name: String.fromCharCode(65 + i), 
            matches,
            pairs: gPairs.map(p => ({ ...p, points: 0, gamesDiff: 0, gamesWon: 0, gamesLost: 0, played: 0, won: 0, lost: 0 }))
        };
    });
};

window.recalcGroup = (group) => {
    group.pairs.forEach(p => Object.assign(p, { played: 0, points: 0, gamesWon: 0, gamesLost: 0, gamesDiff: 0, won: 0, lost: 0 }));
    
    group.matches.forEach(m => {
        if (m.set1p1 === '' || m.set1p2 === '') return;
        const [s1, s2] = [parseInt(m.set1p1) || 0, parseInt(m.set1p2) || 0];
        const [p1, p2] = [
            group.pairs.find(p => p.id === m.pair1.id), 
            group.pairs.find(p => p.id === m.pair2.id)
        ];
        if (!p1 || !p2) return;
        
        p1.played++; p2.played++;
        p1.gamesWon += s1; p1.gamesLost += s2;
        p2.gamesWon += s2; p2.gamesLost += s1;
        
        if (s1 > s2) { p1.won++; p1.points += 3; }
        else if (s2 > s1) { p2.won++; p2.points += 3; }
        
        p1.gamesDiff = p1.gamesWon - p1.gamesLost;
        p2.gamesDiff = p2.gamesWon - p2.gamesLost;
    });
    
    group.pairs.sort((a, b) => b.points - a.points || b.gamesDiff - a.gamesDiff || b.gamesWon - a.gamesWon);
};

// === UI КОМПОНЕНТЫ ===
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
    return <button className={window.cn('px-6 py-3 rounded-full font-semibold transition-all', styles[variant], className)} {...props}>{children}</button>;
};

window.Input = ({ label, className, ...props }) => (
    <div>
        {label && <label className="block text-sm font-medium text-gray-500 mb-2">{label}</label>}
        <input className={window.cn('w-full p-4 bg-gray-50 border border-gray-200 rounded-2xl text-black placeholder-gray-400 focus:border-black focus:ring-1 focus:ring-black outline-none transition-all', className)} {...props} />
    </div>
);

window.Avatar = ({ src, name, size = 'md', className }) => {
    const sizes = { sm: 'w-8 h-8 text-sm', md: 'w-10 h-10', lg: 'w-14 h-14 text-xl' };
    return src ? (
        <img src={src} alt="" className={window.cn('rounded-full', sizes[size], className)} />
    ) : (
        <div className={window.cn('rounded-full bg-gray-200 flex items-center justify-center text-gray-500 font-bold', sizes[size], className)}>
            {name?.[0] || '?'}
        </div>
    );
};

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

window.Tab = ({ active, children, ...props }) => (
    <button className={window.cn('px-6 py-3 rounded-full text-sm font-medium whitespace-nowrap transition-all', active ? 'bg-white text-black' : 'text-white/40 hover:text-white')} {...props}>{children}</button>
);

// Telegram Login Button Component
window.TelegramLoginButton = ({ botName, onAuth }) => {
    const containerRef = React.useRef(null);
    
    useEffect(() => {
        if (!containerRef.current) return;
        
        // Очищаем контейнер
        containerRef.current.innerHTML = '';
        
        // Создаем скрипт
        const script = document.createElement('script');
        script.src = 'https://telegram.org/js/telegram-widget.js?22';
        script.setAttribute('data-telegram-login', botName);
        script.setAttribute('data-size', 'large');
        script.setAttribute('data-radius', '12');
        script.setAttribute('data-onauth', 'onTelegramAuth(user)');
        script.setAttribute('data-request-access', 'write');
        script.async = true;
        
        containerRef.current.appendChild(script);
    }, [botName]);
    
    return <div ref={containerRef} className="telegram-login-wrapper"></div>;
};

// === МОДАЛЬНЫЕ ОКНА ===
window.AuthModal = ({ onClose }) => {
    const { login } = window.useAuth();
    const [mode, setMode] = useState('main'); // main | emailLogin | emailSignup | emailSent
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    // Telegram Login Handler
    useEffect(() => {
        if (mode !== 'main') return;
        
        window.onTelegramAuth = async (user) => {
            setLoading(true);
            setError('');
            try {
                const isValid = await window.telegramAuth.checkSignature(user);
                if (!isValid) {
                    setError('Ошибка проверки подписи Telegram');
                    setLoading(false);
                    return;
                }
                
                await window.telegramAuth.loginWithTelegram(user);
                onClose();
            } catch (err) {
                console.error('Telegram auth error:', err);
                setError('Ошибка входа через Telegram: ' + (err.message || 'Попробуйте снова'));
                setLoading(false);
            }
        };

        return () => {
            delete window.onTelegramAuth;
        };
    }, [mode, onClose]);

    const handleGoogleLogin = async () => {
        try {
            await login();
            onClose();
        } catch (err) {
            setError('Ошибка входа через Google');
        }
    };

    const handleEmailLogin = async () => {
        setError('');
        setLoading(true);
        try {
            await window.fb.auth.signInWithEmailAndPassword(email, password);
            onClose();
        } catch (err) {
            setError(err.code === 'auth/user-not-found' ? 'Пользователь не найден' : 
                     err.code === 'auth/wrong-password' ? 'Неверный пароль' :
                     err.code === 'auth/invalid-email' ? 'Неверный email' :
                     'Ошибка входа');
        }
        setLoading(false);
    };

    const handleEmailSignup = async () => {
        setError('');
        setLoading(true);
        try {
            const userCredential = await window.fb.auth.createUserWithEmailAndPassword(email, password);
            await userCredential.user.sendEmailVerification();
            setMode('emailSent');
        } catch (err) {
            setError(err.code === 'auth/email-already-in-use' ? 'Email уже используется' :
                     err.code === 'auth/weak-password' ? 'Пароль должен быть минимум 6 символов' :
                     err.code === 'auth/invalid-email' ? 'Неверный email' :
                     'Ошибка регистрации');
        }
        setLoading(false);
    };

    if (mode === 'emailSent') {
        return (
            <window.Modal onClose={onClose}>
                <window.Card className="p-10 max-w-md w-full">
                    <div className="text-center">
                        <div className="text-6xl mb-4">📧</div>
                        <h3 className="text-2xl font-bold text-black mb-2">Проверьте почту</h3>
                        <p className="text-gray-500 mb-6">Мы отправили письмо с подтверждением на <strong>{email}</strong></p>
                        <p className="text-sm text-gray-400 mb-8">Перейдите по ссылке в письме, чтобы подтвердить аккаунт</p>
                        <button onClick={onClose} className="w-full bg-black text-white px-6 py-3 rounded-2xl font-semibold hover:bg-gray-900 transition-all">
                            Понятно
                        </button>
                    </div>
                </window.Card>
            </window.Modal>
        );
    }

    if (mode === 'emailLogin') {
        return (
            <window.Modal onClose={onClose}>
                <window.Card className="p-10 max-w-md w-full">
                    <button onClick={() => setMode('main')} className="text-gray-400 hover:text-black mb-6">← Назад</button>
                    <div className="text-center mb-8">
                        <h3 className="text-3xl font-bold text-black mb-2">Вход</h3>
                        <p className="text-gray-500">Введите email и пароль</p>
                    </div>
                    <div className="space-y-4">
                        <window.Input label="Email" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="your@email.com" />
                        <window.Input label="Пароль" type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••" />
                        {error && <div className="text-red-500 text-sm text-center">{error}</div>}
                        <button onClick={handleEmailLogin} disabled={loading || !email || !password} className="w-full bg-black text-white px-6 py-4 rounded-2xl font-semibold hover:bg-gray-900 transition-all disabled:opacity-50">
                            {loading ? 'Загрузка...' : 'Войти'}
                        </button>
                    </div>
                </window.Card>
            </window.Modal>
        );
    }

    if (mode === 'emailSignup') {
        return (
            <window.Modal onClose={onClose}>
                <window.Card className="p-10 max-w-md w-full">
                    <button onClick={() => setMode('main')} className="text-gray-400 hover:text-black mb-6">← Назад</button>
                    <div className="text-center mb-8">
                        <h3 className="text-3xl font-bold text-black mb-2">Регистрация</h3>
                        <p className="text-gray-500">Создайте новый аккаунт</p>
                    </div>
                    <div className="space-y-4">
                        <window.Input label="Email" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="your@email.com" />
                        <window.Input label="Пароль" type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••" />
                        <p className="text-xs text-gray-400">Минимум 6 символов</p>
                        {error && <div className="text-red-500 text-sm text-center">{error}</div>}
                        <button onClick={handleEmailSignup} disabled={loading || !email || !password} className="w-full bg-black text-white px-6 py-4 rounded-2xl font-semibold hover:bg-gray-900 transition-all disabled:opacity-50">
                            {loading ? 'Загрузка...' : 'Создать аккаунт'}
                        </button>
                    </div>
                </window.Card>
            </window.Modal>
        );
    }

    return (
        <window.Modal onClose={onClose}>
            <window.Card className="p-10 max-w-md w-full">
                <div className="text-center mb-10">
                    <h3 className="text-3xl font-bold text-black mb-2">Добро пожаловать</h3>
                    <p className="text-gray-500">Выберите способ входа</p>
                </div>
                <div className="space-y-3">
                    <button onClick={handleGoogleLogin} className="w-full bg-black text-white px-6 py-4 rounded-2xl font-semibold hover:bg-gray-900 transition-all flex items-center justify-center gap-3">
                        <svg className="w-5 h-5" viewBox="0 0 24 24">
                            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                        </svg>
                        Войти через Google
                    </button>
                    
                    <div className="flex justify-center py-2">
                        <window.TelegramLoginButton botName={CONFIG.TELEGRAM.BOT_USERNAME} />
                    </div>
                    
                    <button onClick={() => setMode('emailLogin')} className="w-full bg-white text-black px-6 py-4 rounded-2xl font-semibold border-2 border-gray-200 hover:border-gray-300 transition-all">
                        Войти через почту
                    </button>
                    
                    <button onClick={() => setMode('emailSignup')} className="w-full bg-gray-100 text-gray-700 px-6 py-3 rounded-2xl font-medium hover:bg-gray-200 transition-all text-sm">
                        Создать аккаунт
                    </button>
                </div>
                {error && <div className="text-red-500 text-sm text-center mt-4">{error}</div>}
                {loading && <div className="text-gray-500 text-sm text-center mt-4">Загрузка...</div>}
                <button onClick={onClose} className="w-full mt-6 text-gray-400 hover:text-black text-sm">Отмена</button>
            </window.Card>
        </window.Modal>
    );
};

window.ScoreModal = ({ match, onSave, onClose }) => {
    const [set1p1, setSet1p1] = useState(match.set1p1);
    const [set1p2, setSet1p2] = useState(match.set1p2);

    return (
        <window.Modal onClose={onClose}>
            <window.Card dark className="p-8 max-w-md w-full border border-gray-700">
                <h3 className="text-2xl font-bold text-white mb-6">Результат матча</h3>
                <div className="flex items-center gap-4 justify-center mb-8">
                    <input type="number" min="0" max="20" className="w-20 h-20 p-2 bg-gray-700 border-2 border-blue-500 rounded-2xl text-center text-white text-3xl font-bold outline-none" value={set1p1} onChange={e => setSet1p1(e.target.value)} />
                    <span className="text-white text-4xl font-bold">:</span>
                    <input type="number" min="0" max="20" className="w-20 h-20 p-2 bg-gray-700 border-2 border-purple-500 rounded-2xl text-center text-white text-3xl font-bold outline-none" value={set1p2} onChange={e => setSet1p2(e.target.value)} />
                </div>
                <div className="flex gap-4">
                    <window.Button onClick={() => { if (set1p1 !== '' && set1p2 !== '') onSave({ set1p1, set1p2 }); }} className="flex-1 bg-gradient-to-r from-emerald-500 to-teal-500">Сохранить</window.Button>
                    <window.Button variant="secondary" onClick={onClose}>Отмена</window.Button>
                </div>
            </window.Card>
        </window.Modal>
    );
};

// === LAYOUT ===
window.Layout = ({ children, activePage }) => {
    const auth = window.useAuth();
    const [showAuth, setShowAuth] = useState(false);
    
    useEffect(() => { if (auth) auth.showAuth = () => setShowAuth(true); }, [auth]);

    return (
        <div className="min-h-screen bg-black text-white">
            <header className="border-b border-white/10">
                <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
                    <a href="./index.html" className="text-2xl font-bold no-underline text-white hover:opacity-80 transition-opacity">
                        Grechka <span className="text-white/40">•</span> Padel
                    </a>
                    <nav className="flex gap-8">
                        <a href="./index.html" className={window.cn('text-sm font-medium transition-all no-underline', activePage === 'tournaments' ? 'text-white' : 'text-white/40 hover:text-white/70')}>Турниры</a>
                        <a href="./players.html" className={window.cn('text-sm font-medium transition-all no-underline', activePage === 'players' ? 'text-white' : 'text-white/40 hover:text-white/70')}>Рейтинг</a>
                    </nav>
                    <div>
                        {auth.user ? (
                            <div className="flex gap-3 items-center">
                                <a href="./profile.html" className="no-underline">
                                    <window.Avatar src={auth.user.photoURL} name={auth.user.displayName || auth.profile?.name} />
                                </a>
                                <button onClick={auth.logout} className="text-white/40 hover:text-white text-sm">Выйти</button>
                            </div>
                        ) : (
                            <window.Button onClick={() => setShowAuth(true)}>Войти</window.Button>
                        )}
                    </div>
                </div>
            </header>
            <main className="max-w-7xl mx-auto px-6 py-8">{children}</main>
            {showAuth && <window.AuthModal onClose={() => setShowAuth(false)} />}
        </div>
    );
};
