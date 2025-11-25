// js/auth.js
// Простая обвязка для авторизации.
// Если используете Firebase Auth — подключите SDK в config/initPlatform и замените реализации ниже.

window.Auth = (function () {
  let currentUser = null;
  const listeners = [];

  function init() {
    // Если есть интеграция с Firebase, можно подписаться на onAuthStateChanged
    // firebase.auth().onAuthStateChanged(user => { currentUser = user; emit(user); });
    // Сейчас — заглушка
    currentUser = null;
    emit(currentUser);
  }

  function signIn(email, password) {
    // TODO: реализовать через ваш бэкенд/файрбейс
    // fake:
    currentUser = { uid: 'u1', email: email || 'user@example.com' };
    emit(currentUser);
    return Promise.resolve(currentUser);
  }

  function signOut() {
    currentUser = null;
    emit(currentUser);
    return Promise.resolve();
  }

  function onAuthStateChanged(cb) {
    listeners.push(cb);
    cb(currentUser);
    return () => {
      const i = listeners.indexOf(cb);
      if (i >= 0) listeners.splice(i, 1);
    };
  }

  function emit(user) {
    listeners.forEach(cb => {
      try { cb(user); } catch (e) { console.error(e); }
    });
  }

  return { init, signIn, signOut, onAuthStateChanged };
})();