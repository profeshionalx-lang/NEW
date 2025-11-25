// js/config.js
// Поместите сюда вашу конфигурацию Firebase.
// Этот файл подключается первым, остальные модули используют window.APP_CONFIG или App.init().

window.APP_CONFIG = {
  // Пример структуры — замените реальными значениями
  firebase: {
    apiKey: "<YOUR_API_KEY>",
    authDomain: "<YOUR_AUTH_DOMAIN>",
    projectId: "<YOUR_PROJECT_ID>",
    storageBucket: "<YOUR_STORAGE_BUCKET>",
    messagingSenderId: "<YOUR_MESSAGING_SENDER_ID>",
    appId: "<YOUR_APP_ID>"
  },
  // опционально: URL API или endpoints
  apiBaseUrl: ""
};

// Функция инициализации (если используете Firebase, вставьте инициализацию сюда)
window.initPlatform = function() {
  // Если используете Firebase, инициализируйте здесь:
  // firebase.initializeApp(window.APP_CONFIG.firebase);
  // и т.д.
  return Promise.resolve();
};