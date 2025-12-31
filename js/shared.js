// js/shared.js
const { useState, useEffect, createContext, useContext } = React;

// === УТИЛИТЫ ===
window.cn = (...c) => c.filter(Boolean).join(' ');
window.formatDate = (d, o = { day: 'numeric', month: 'short' }) => new Date(d).toLocaleDateString('ru-RU', o);

// === ХУКИ ===
window.AuthContext = createContext(null);
window.useAuth = () => useContext(window.AuthContext);

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
                // Генерируем имя из email если displayName отсутствует
                const defaultName = u.displayName || (u.email ? u.email.split('@')[0] : 'Игрок');
                
                const newProfile = { 
                    id: u.uid, 
                    name: defaultName,
                    email: u.email, 
                    photoURL: u.photoURL, 
                    points: 0, 
                    totalMatches: 0,
                    wins: 0,
                    losses: 0,
                    tournamentsPlayed: 0,
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

// === AMERICANA ЛОГИКА ===

// Инициализация первого раунда Americana
window.initAmericanaRound1 = (courtSetup) => {
    // courtSetup = [{courtNumber: 5, pairs: [{player1, player2}, {player1, player2}]}, ...]
    return {
        roundNumber: 1,
        courts: courtSetup.map(court => ({
            courtNumber: court.courtNumber,
            pair1: {
                player1: court.pairs[0].player1,
                player2: court.pairs[0].player2
            },
            pair2: {
                player1: court.pairs[1].player1,
                player2: court.pairs[1].player2
            },
            score: { set1p1: '', set1p2: '' },
            completed: false
        }))
    };
};

// Формирование новых пар из 4 игроков с учетом истории партнерств
window.formNewPairs = (players, partnerships, isFixed) => {
    // players = [player1, player2, player3, player4]
    // partnerships = { playerId: [list of partner ids] }
    // isFixed = true/false
    
    if (isFixed) {
        // Для фиксированных пар просто возвращаем существующие пары
        return [
            { player1: players[0], player2: players[1] },
            { player1: players[2], player2: players[3] }
        ];
    }
    
    // Для смены партнеров - находим комбинацию, где игроки еще не играли вместе
    const [p1, p2, p3, p4] = players;
    
    // Все возможные комбинации пар из 4 игроков
    const combinations = [
        [[p1, p2], [p3, p4]], // 1-2 vs 3-4
        [[p1, p3], [p2, p4]], // 1-3 vs 2-4
        [[p1, p4], [p2, p3]]  // 1-4 vs 2-3
    ];
    
    // Функция проверки, играли ли два игрока вместе
    const havePlayed = (player1, player2) => {
        const p1Partners = partnerships[player1.id] || [];
        return p1Partners.includes(player2.id);
    };
    
    // Ищем комбинацию, где оба игрока в паре еще не играли вместе
    for (const combo of combinations) {
        const [pair1, pair2] = combo;
        if (!havePlayed(pair1[0], pair1[1]) && !havePlayed(pair2[0], pair2[1])) {
            return [
                { player1: pair1[0], player2: pair1[1] },
                { player1: pair2[0], player2: pair2[1] }
            ];
        }
    }
    
    // Если все уже играли, берем комбинацию с минимальным количеством повторов
    // Для простоты берем первую комбинацию
    const [pair1, pair2] = combinations[0];
    return [
        { player1: pair1[0], player2: pair1[1] },
        { player1: pair2[0], player2: pair2[1] }
    ];
};

// Генерация следующего раунда Americana
window.generateNextAmericanaRound = (currentRound, partnerships, isFixed) => {
    const courts = currentRound.courts;
    const newCourts = [];
    
    for (let i = 0; i < courts.length; i++) {
        const court = courts[i];
        const courtNumber = court.courtNumber;
        
        // Определяем победителей и проигравших
        const score1 = parseInt(court.score.set1p1) || 0;
        const score2 = parseInt(court.score.set1p2) || 0;
        const winners = score1 > score2 ? court.pair1 : court.pair2;
        const losers = score1 > score2 ? court.pair2 : court.pair1;
        
        let playersForCourt = [];
        
        if (courtNumber === courts.length) {
            // Самый верхний корт: победители остаются + победители с корта ниже поднимаются
            const winnersHere = [winners.player1, winners.player2];
            if (i < courts.length - 1) {
                const courtBelow = courts[i + 1];
                const score1Below = parseInt(courtBelow.score.set1p1) || 0;
                const score2Below = parseInt(courtBelow.score.set1p2) || 0;
                const winnersBelow = score1Below > score2Below ? courtBelow.pair1 : courtBelow.pair2;
                playersForCourt = [...winnersHere, winnersBelow.player1, winnersBelow.player2];
            } else {
                playersForCourt = winnersHere;
            }
        } else if (courtNumber === 1) {
            // Самый нижний корт: проигравшие остаются + проигравшие с корта выше спускаются
            const losersHere = [losers.player1, losers.player2];
            if (i > 0) {
                const courtAbove = courts[i - 1];
                const score1Above = parseInt(courtAbove.score.set1p1) || 0;
                const score2Above = parseInt(courtAbove.score.set1p2) || 0;
                const losersAbove = score1Above > score2Above ? courtAbove.pair2 : courtAbove.pair1;
                playersForCourt = [losersAbove.player1, losersAbove.player2, ...losersHere];
            } else {
                playersForCourt = losersHere;
            }
        } else {
            // Средние корты: проигравшие сверху + победители снизу
            const courtAbove = courts[i - 1];
            const courtBelow = courts[i + 1];
            
            const score1Above = parseInt(courtAbove.score.set1p1) || 0;
            const score2Above = parseInt(courtAbove.score.set1p2) || 0;
            const losersAbove = score1Above > score2Above ? courtAbove.pair2 : courtAbove.pair1;
            
            const score1Below = parseInt(courtBelow.score.set1p1) || 0;
            const score2Below = parseInt(courtBelow.score.set1p2) || 0;
            const winnersBelow = score1Below > score2Below ? courtBelow.pair1 : courtBelow.pair2;
            
            playersForCourt = [losersAbove.player1, losersAbove.player2, winnersBelow.player1, winnersBelow.player2];
        }
        
        // Формируем новые пары
        if (playersForCourt.length === 4) {
            const pairs = window.formNewPairs(playersForCourt, partnerships, isFixed);
            newCourts.push({
                courtNumber,
                pair1: pairs[0],
                pair2: pairs[1],
                score: { set1p1: '', set1p2: '' },
                completed: false
            });
        }
    }
    
    return {
        roundNumber: currentRound.roundNumber + 1,
        courts: newCourts
    };
};

// Обновление истории партнерств
window.updatePartnerships = (partnerships, pair) => {
    const p1 = pair.player1.id;
    const p2 = pair.player2.id;
    
    if (!partnerships[p1]) partnerships[p1] = [];
    if (!partnerships[p2]) partnerships[p2] = [];
    
    if (!partnerships[p1].includes(p2)) partnerships[p1].push(p2);
    if (!partnerships[p2].includes(p1)) partnerships[p2].push(p1);
    
    return partnerships;
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

// === МОДАЛЬНЫЕ ОКНА ===
window.EmailAuthModal = ({ onClose, onSuccess, initialMode = 'login' }) => {
    const [mode, setMode] = useState(initialMode);
    const [loading, setLoading] = useState(false);
    const [form, setForm] = useState({
        email: '',
        password: '',
        name: '',
        telegram: ''
    });

    const handleLogin = async () => {
        if (!form.email || !form.password) {
            alert('Заполните все поля');
            return;
        }

        setLoading(true);
        try {
            await window.fb.auth.signInWithEmailAndPassword(form.email, form.password);
            onSuccess?.();
            onClose();
        } catch (error) {
            if (error.code === 'auth/user-not-found') {
                alert('Пользователь не найден. Зарегистрируйтесь.');
            } else if (error.code === 'auth/wrong-password') {
                alert('Неверный пароль');
            } else {
                alert('Ошибка входа: ' + error.message);
            }
        }
        setLoading(false);
    };

    const handleRegister = async () => {
        if (!form.email || !form.password || !form.name || !form.telegram) {
            alert('Заполните все обязательные поля');
            return;
        }

        if (form.password.length < 6) {
            alert('Пароль должен содержать минимум 6 символов');
            return;
        }

        setLoading(true);
        try {
            const userCredential = await window.fb.auth.createUserWithEmailAndPassword(form.email, form.password);
            const user = userCredential.user;

            await user.updateProfile({ displayName: form.name });

            await window.fb.doc('players', user.uid).set({
                id: user.uid,
                name: form.name,
                email: form.email,
                telegram: form.telegram,
                photoURL: null,
                points: 0,
                totalMatches: 0,
                wins: 0,
                losses: 0,
                tournamentsPlayed: 0,
                gamesWon: 0,
                gamesLost: 0,
                createdAt: new Date().toISOString(),
                source: 'email'
            });

            await user.sendEmailVerification();
            
            alert('Регистрация успешна! Проверьте почту для подтверждения.');
            onSuccess?.();
            onClose();
        } catch (error) {
            if (error.code === 'auth/email-already-in-use') {
                alert('Email уже используется');
            } else if (error.code === 'auth/weak-password') {
                alert('Слишком простой пароль');
            } else {
                alert('Ошибка регистрации: ' + error.message);
            }
        }
        setLoading(false);
    };

    return (
        <window.Modal onClose={onClose}>
            <window.Card className="p-8 w-full max-w-3xl relative">
                <button 
                    onClick={onClose}
                    className="absolute top-6 right-6 text-gray-400 hover:text-black text-2xl leading-none transition-all"
                >
                    ×
                </button>
                
                <div className="mb-8">
                    <h3 className="text-3xl font-bold text-black mb-2">
                        {mode === 'login' ? 'Вход' : 'Регистрация'}
                    </h3>
                    <p className="text-gray-500">
                        {mode === 'login' ? 'Войдите в свой аккаунт' : 'Создайте новый аккаунт'}
                    </p>
                </div>

                {mode === 'register' ? (
                    <div className="grid grid-cols-2 gap-6">
                        <div className="space-y-4">
                            <window.Input
                                label="Имя и Фамилия *"
                                value={form.name}
                                onChange={e => setForm({...form, name: e.target.value})}
                                placeholder="Александр Иванов"
                                disabled={loading}
                            />
                            
                            <window.Input
                                label="Телеграм *"
                                value={form.telegram}
                                onChange={e => setForm({...form, telegram: e.target.value})}
                                placeholder="@username"
                                disabled={loading}
                            />
                        </div>

                        <div className="space-y-4">
                            <window.Input
                                label="Email *"
                                type="email"
                                value={form.email}
                                onChange={e => setForm({...form, email: e.target.value})}
                                placeholder="example@email.com"
                                disabled={loading}
                            />

                            <window.Input
                                label="Пароль *"
                                type="password"
                                value={form.password}
                                onChange={e => setForm({...form, password: e.target.value})}
                                placeholder="Минимум 6 символов"
                                disabled={loading}
                            />
                        </div>
                    </div>
                ) : (
                    <div className="space-y-4">
                        <window.Input
                            label="Email *"
                            type="email"
                            value={form.email}
                            onChange={e => setForm({...form, email: e.target.value})}
                            placeholder="example@email.com"
                            disabled={loading}
                        />

                        <window.Input
                            label="Пароль *"
                            type="password"
                            value={form.password}
                            onChange={e => setForm({...form, password: e.target.value})}
                            placeholder="Минимум 6 символов"
                            disabled={loading}
                        />
                    </div>
                )}

                <button
                    onClick={mode === 'login' ? handleLogin : handleRegister}
                    className="w-full mt-6 bg-black text-white px-6 py-4 rounded-2xl font-semibold hover:bg-gray-800 transition-all disabled:opacity-50"
                    disabled={loading}
                >
                    {loading ? 'Загрузка...' : (mode === 'login' ? 'Войти' : 'Создать аккаунт')}
                </button>

                <div className="text-center mt-6">
                    <button
                        onClick={() => setMode(mode === 'login' ? 'register' : 'login')}
                        className="text-gray-500 hover:text-black text-sm transition-all"
                        disabled={loading}
                    >
                        {mode === 'login' ? 'Нет аккаунта? Зарегистрироваться' : 'Уже есть аккаунт? Войти'}
                    </button>
                </div>
            </window.Card>
        </window.Modal>
    );
};

window.AuthModal = ({ onClose }) => {
    const { login } = window.useAuth();
    const [showEmailAuth, setShowEmailAuth] = useState(false);
    const [emailAuthMode, setEmailAuthMode] = useState('login');
    
    const handleGoogleLogin = async () => { 
        await login(); 
        onClose(); 
    };

    if (showEmailAuth) {
        return <window.EmailAuthModal 
            onClose={onClose} 
            onSuccess={() => setShowEmailAuth(false)} 
            initialMode={emailAuthMode}
        />;
    }
    
    return (
        <window.Modal onClose={onClose}>
            <window.Card className="p-10 max-w-md w-full relative">
                <button 
                    onClick={onClose}
                    className="absolute top-6 right-6 text-gray-400 hover:text-black text-2xl leading-none transition-all"
                >
                    ×
                </button>

                <div className="text-center mb-10">
                    <h3 className="text-3xl font-bold text-black mb-2">Добро пожаловать</h3>
                    <p className="text-gray-500">Выберите способ входа</p>
                </div>
                
                <div className="space-y-4">
                    <button 
                        onClick={handleGoogleLogin} 
                        className="w-full bg-black text-white px-6 py-4 rounded-2xl font-semibold hover:bg-gray-800 transition-all flex items-center justify-center gap-3"
                    >
                        <svg className="w-5 h-5" viewBox="0 0 24 24">
                            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                        </svg>
                        Войти через Google
                    </button>

                    <button
                        onClick={() => {
                            setEmailAuthMode('login');
                            setShowEmailAuth(true);
                        }}
                        className="w-full bg-gray-100 text-black px-6 py-4 rounded-2xl font-semibold hover:bg-gray-200 transition-all flex items-center justify-center gap-3"
                    >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                        </svg>
                        Войти через Email
                    </button>
                </div>
                
                <div className="text-center mt-6">
                    <button
                        onClick={() => {
                            setEmailAuthMode('register');
                            setShowEmailAuth(true);
                        }}
                        className="text-gray-500 hover:text-black text-sm transition-all"
                    >
                        Создать аккаунт
                    </button>
                </div>
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
                    <a href="/NEW/index.html" className="text-2xl font-bold no-underline text-white hover:opacity-80 transition-opacity">
                        Grechka <span className="text-white/40">•</span> Padel
                    </a>
                    <nav className="flex gap-8">
                        <a href="/NEW/index.html" className={window.cn('text-sm font-medium transition-all no-underline', activePage === 'tournaments' ? 'text-white' : 'text-white/40 hover:text-white/70')}>Турниры</a>
                        <a href="/NEW/players.html" className={window.cn('text-sm font-medium transition-all no-underline', activePage === 'players' ? 'text-white' : 'text-white/40 hover:text-white/70')}>Рейтинг</a>
                    </nav>
                    <div>
                        {auth.user ? (
                            <a href="/NEW/profile.html" className="flex gap-3 items-center no-underline cursor-pointer group">
                                <window.Avatar src={auth.user.photoURL} name={auth.user.displayName} />
                                <span className="text-white/40 group-hover:text-white text-sm transition-all">Профиль</span>
                            </a>
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
