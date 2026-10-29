/* KidsTube UI strings. English is the default; the parent can switch to Russian in the settings. */
(function () {
  'use strict';

  var STR = {
    en: {
      // Navigation
      'nav.search': 'Search', 'nav.home': 'Home', 'nav.channels': 'My channels', 'nav.watched': 'Watched', 'nav.parents': 'Parents',
      // Home
      'row.forYou': 'For you', 'row.subs': 'New on your channels', 'row.again': 'Watch again', 'row.channels': 'My channels',
      'row.empty': 'Nothing here yet', 'row.all': 'All →', 'row.allSub': 'everything I watched', 'row.allVideos': 'All videos →',
      'home.tip': '<b>Hi! Pick “Search” on the left and say what you want to watch 🎤</b><br>Like a channel? Open it and press “Subscribe” — its new videos will show up here.',
      // Search
      'search.placeholder': 'Press the microphone and say what you want to watch',
      'search.voice': 'Voice search', 'search.prompt': 'What do you want to watch?',
      'search.ideas': 'Ideas to watch', 'search.recentIdeas': 'Recent searches and ideas',
      'search.none': 'Nothing found. Try saying it another way',
      'sugg': [['🚗', 'cars'], ['🐶', 'animals'], ['🎵', 'kids songs'], ['🦖', 'dinosaurs'], ['🧚', 'fairy tales'], ['🔢', 'learn numbers'], ['🎨', 'drawing'], ['🚀', 'space']],
      'more': 'More →',
      // Pages
      'page.channels': 'My channels', 'page.watched': 'Watched',
      'watched.empty': 'Videos you watch will appear here',
      'channels.empty': 'No channels yet. Open any channel and press “Subscribe”',
      'channel.empty': 'Nothing to watch on this channel yet',
      'channel.subscribe': 'Subscribe', 'channel.subscribed': 'Subscribed',
      'channel.unsubscribedToast': 'Unsubscribed', 'channel.subscribedToast': 'Subscribed ⭐ New videos from this channel will appear on Home',
      'channel.unavailable': 'This channel is not available',
      // Player
      'player.hintOk': 'pause', 'player.hintSeek': 'seek', 'player.hintDown': 'what to watch next', 'player.hintBack': 'exit',
      'player.back': 'Back',
      'player.loadFail': 'Could not load the YouTube player. Check the internet connection.',
      'player.unavailable': 'This video can’t be played here 🙈',
      'rel.continue': 'Keep watching', 'rel.similar': 'Up next', 'rel.moreFrom': 'More from “{0}”', 'rel.channelBtn': 'Channel “{0}”',
      'rel.none': 'Nothing suitable found',
      // Errors
      'err.noKey': 'No YouTube API key — open the settings', 'err.quota': 'Today’s search limit is used up. Try again tomorrow 🌙',
      'err.key': 'The API key doesn’t work — check the settings', 'err.network': 'No internet connection',
      'err.channel': 'Channel not found', 'err.youtube': 'YouTube error: {0}', 'err.unknown': 'unknown',
      'err.unsupported': 'Not available in this version',
      // Setup
      'setup.title': 'Let’s set up the app',
      'setup.open': 'On your phone (on the same Wi‑Fi), open this address or scan the QR code:',
      'setup.what': 'Paste your YouTube API key there, choose a PIN and list the words to block.',
      'setup.onTv': 'Enter on the TV', 'setup.wifi': 'Connect the TV to Wi‑Fi…',
      // PIN & parent menu
      'pin.title': 'Enter the parent PIN', 'pin.menu': 'PIN for the parent menu', 'pin.settings': 'PIN for the settings',
      'pin.wrong': 'Wrong PIN', 'ok': 'OK', 'cancel': 'Cancel',
      'menu.blockVideo': '🚫 Block this video', 'menu.blockChannel': '🚫 Block channel “{0}”',
      'menu.subscribe': '⭐ Subscribe to the channel', 'menu.unsubscribe': '✓ Unsubscribe from the channel',
      'toast.videoBlocked': 'Video blocked', 'toast.channelBlocked': 'Channel blocked',
      // Settings
      'set.title': 'Parent settings', 'set.phone': 'It’s easier to set up from your phone:',
      'set.quota': 'Quota used today: ~{0} of 10,000 · version {1}',
      'set.updates': 'Updates', 'set.updHint': 'Press “Check” to look for a new version.',
      'set.check': 'Check', 'set.install': 'Install',
      'set.save': 'Save', 'set.clearCache': 'Clear cache', 'set.clearHistory': 'Clear history',
      'f.lang': 'Language', 'f.theme': 'Interface style', 'theme.kids': 'Kids — bright and big', 'theme.teen': '6+ — calm and compact', 'f.apiKey': 'YouTube Data API key', 'f.pin': 'Parent PIN (4–8 digits)',
      'f.secBlock': 'Blocking', 'f.words': 'Blocked words (comma separated)',
      'f.wordsHint': 'Parts of words work too: “scar” hides “scary” and “scarecrow”.',
      'f.channels': 'Blocked channels (@handle, link or name, comma separated)', 'f.videos': 'Blocked videos (links or IDs)',
      'f.checkTitle': 'Look for words in the title', 'f.checkTags': 'Look for words in the tags',
      'f.checkDescription': 'Look for words in the description', 'f.checkChannel': 'Look for words in the channel name',
      'f.onlyKids': 'Only videos marked “made for kids”', 'f.hideShort': 'Hide very short videos (under 1 min)',
      'f.secHome': 'Home screen', 'f.homeChannels': 'Subscriptions — channels on Home (@handle or link, comma separated)',
      'f.homeQueries': 'Collections by search query (comma separated)', 'f.autoplay': 'Play the next video automatically',
      'toast.pinFormat': 'The PIN must be 4–8 digits', 'toast.needKey': 'Enter the YouTube API key',
      'toast.saved': 'Saved ✓', 'toast.cacheCleared': 'Cache cleared', 'toast.historyCleared': 'History cleared',
      'toast.remoteSaved': 'Settings saved from the phone ✓', 'toast.updated': 'Settings updated ✓',
      'toast.noVoice': 'Voice search isn’t available on this device',
      // Updates
      'upd.checking': 'Checking…', 'upd.newToast': 'A new KidsTube version is out — install it in the settings ⚙',
      'upd.checkFail': 'Couldn’t check: {0}', 'upd.available': 'New version available: {0}. Installed: {1}.',
      'upd.build': 'build {0}', 'upd.latest': 'You have the latest version ({0}).', 'upd.downloading': 'Downloading the update…',
      'upd.progress': 'Downloading the update… {0}%', 'upd.confirm': 'Confirm the installation on screen. The app will restart after the update.',
      'upd.permission': 'Allow KidsTube to install apps in the settings that opened, then come back and press “Install” again.',
      'upd.error': 'Update error: {0}'
    },

    ru: {
      'nav.search': 'Поиск', 'nav.home': 'Главная', 'nav.channels': 'Мои каналы', 'nav.watched': 'Я смотрел', 'nav.parents': 'Родителям',
      'row.forYou': 'Для тебя', 'row.subs': 'Новое на твоих каналах', 'row.again': 'Смотреть снова', 'row.channels': 'Мои каналы',
      'row.empty': 'Здесь пока ничего нет', 'row.all': 'Все →', 'row.allSub': 'что я смотрел', 'row.allVideos': 'Все видео →',
      'home.tip': '<b>Привет! Выбери слева «Поиск» и скажи в микрофон, что хочешь посмотреть 🎤</b><br>Понравился канал? Открой его и нажми «Подписаться» — новые видео будут появляться здесь.',
      'search.placeholder': 'Нажми на микрофон и скажи, что хочешь посмотреть',
      'search.voice': 'Голосовой поиск', 'search.prompt': 'Что хочешь посмотреть?',
      'search.ideas': 'Идеи, что посмотреть', 'search.recentIdeas': 'Недавно искали и идеи',
      'search.none': 'Ничего не нашлось. Попробуй сказать по‑другому',
      'sugg': [['🚗', 'машинки'], ['🐶', 'животные'], ['🎵', 'песенки'], ['🦖', 'динозавры'], ['🧚', 'сказки'], ['🔢', 'учим цифры'], ['🎨', 'рисуем'], ['🚀', 'космос']],
      'more': 'Ещё →',
      'page.channels': 'Мои каналы', 'page.watched': 'Я смотрел',
      'watched.empty': 'Здесь появятся видео, которые ты посмотришь',
      'channels.empty': 'Пока нет каналов. Открой любой канал и нажми «Подписаться»',
      'channel.empty': 'На этом канале пока нечего посмотреть',
      'channel.subscribe': 'Подписаться', 'channel.subscribed': 'Ты подписан',
      'channel.unsubscribedToast': 'Подписка отменена', 'channel.subscribedToast': 'Подписка оформлена ⭐ Новые видео канала появятся на главной',
      'channel.unavailable': 'Этот канал недоступен',
      'player.hintOk': 'пауза', 'player.hintSeek': 'перемотка', 'player.hintDown': 'что ещё посмотреть', 'player.hintBack': 'выйти',
      'player.back': 'Назад',
      'player.loadFail': 'Не удалось загрузить плеер YouTube. Проверьте интернет.',
      'player.unavailable': 'Это видео здесь не показывается 🙈',
      'rel.continue': 'Смотреть дальше', 'rel.similar': 'Похожие видео', 'rel.moreFrom': 'Ещё с канала «{0}»', 'rel.channelBtn': 'Канал «{0}»',
      'rel.none': 'Ничего подходящего не нашлось',
      'err.noKey': 'Не указан ключ API — откройте настройки', 'err.quota': 'На сегодня лимит поисков закончился. Попробуйте завтра 🌙',
      'err.key': 'Ключ API не подходит — проверьте настройки', 'err.network': 'Нет связи с интернетом',
      'err.channel': 'Канал не найден', 'err.youtube': 'Ошибка YouTube: {0}', 'err.unknown': 'неизвестно',
      'err.unsupported': 'Недоступно в этой версии',
      'setup.title': 'Давайте настроим приложение',
      'setup.open': 'Откройте на телефоне (в той же Wi‑Fi сети) этот адрес или отсканируйте QR‑код:',
      'setup.what': 'Там нужно вставить ключ YouTube API, придумать PIN и указать слова, которые нужно блокировать.',
      'setup.onTv': 'Ввести на телевизоре', 'setup.wifi': 'Подключите телевизор к Wi‑Fi…',
      'pin.title': 'Введите PIN родителя', 'pin.menu': 'PIN для родительского меню', 'pin.settings': 'PIN для настроек',
      'pin.wrong': 'Неверный PIN', 'ok': 'OK', 'cancel': 'Отмена',
      'menu.blockVideo': '🚫 Заблокировать это видео', 'menu.blockChannel': '🚫 Заблокировать канал «{0}»',
      'menu.subscribe': '⭐ Подписаться на канал', 'menu.unsubscribe': '✓ Отписаться от канала',
      'toast.videoBlocked': 'Видео заблокировано', 'toast.channelBlocked': 'Канал заблокирован',
      'set.title': 'Настройки для родителей', 'set.phone': 'Удобнее настраивать с телефона:',
      'set.quota': 'Использовано квоты сегодня: ~{0} из 10 000 · версия {1}',
      'set.updates': 'Обновления', 'set.updHint': 'Нажмите «Проверить», чтобы узнать о новой версии.',
      'set.check': 'Проверить', 'set.install': 'Установить',
      'set.save': 'Сохранить', 'set.clearCache': 'Очистить кэш', 'set.clearHistory': 'Очистить историю',
      'f.lang': 'Язык', 'f.theme': 'Стиль интерфейса', 'theme.kids': 'Детский — яркий и крупный', 'theme.teen': '6+ — спокойный и компактный', 'f.apiKey': 'Ключ YouTube Data API', 'f.pin': 'PIN родителя (4–8 цифр)',
      'f.secBlock': 'Блокировка', 'f.words': 'Запрещённые слова (через запятую)',
      'f.wordsHint': 'Часть слова тоже работает: «страш» скроет «страшный», «страшилки».',
      'f.channels': 'Заблокированные каналы (@имя, ссылка или название, через запятую)', 'f.videos': 'Заблокированные видео (ссылки или ID)',
      'f.checkTitle': 'Искать слова в названии', 'f.checkTags': 'Искать слова в тегах',
      'f.checkDescription': 'Искать слова в описании', 'f.checkChannel': 'Искать слова в названии канала',
      'f.onlyKids': 'Только видео с пометкой «для детей»', 'f.hideShort': 'Скрывать очень короткие видео (до 1 мин)',
      'f.secHome': 'Главный экран', 'f.homeChannels': 'Подписки — каналы на главной (@имя или ссылка, через запятую)',
      'f.homeQueries': 'Подборки по запросам (через запятую)', 'f.autoplay': 'Автоматически включать следующее видео',
      'toast.pinFormat': 'PIN должен состоять из 4–8 цифр', 'toast.needKey': 'Укажите ключ YouTube API',
      'toast.saved': 'Сохранено ✓', 'toast.cacheCleared': 'Кэш очищен', 'toast.historyCleared': 'История очищена',
      'toast.remoteSaved': 'Настройки сохранены с телефона ✓', 'toast.updated': 'Настройки обновлены ✓',
      'toast.noVoice': 'Голосовой поиск недоступен на этом устройстве',
      'upd.checking': 'Проверяю…', 'upd.newToast': 'Вышла новая версия KidsTube — установить можно в настройках ⚙',
      'upd.checkFail': 'Не удалось проверить: {0}', 'upd.available': 'Доступна новая версия: {0}. Сейчас установлена {1}.',
      'upd.build': 'сборка {0}', 'upd.latest': 'Установлена последняя версия ({0}).', 'upd.downloading': 'Скачиваю обновление…',
      'upd.progress': 'Скачиваю обновление… {0}%', 'upd.confirm': 'Подтвердите установку на экране. После обновления приложение перезапустится.',
      'upd.permission': 'Разрешите KidsTube устанавливать приложения в открывшихся настройках, затем вернитесь и нажмите «Установить» ещё раз.',
      'upd.error': 'Ошибка обновления: {0}'
    }
  };

  var I18N = window.I18N = {
    lang: 'en',
    languages: [['en', 'English'], ['ru', 'Русский']],
    set: function (lang) { this.lang = STR[lang] ? lang : 'en'; document.documentElement.lang = this.lang; },
    /** t('key', arg0, arg1…) — {0}, {1} in the string are replaced by the arguments. */
    t: function (key) {
      var v = (STR[this.lang] && STR[this.lang][key]);
      if (v === undefined) v = STR.en[key];
      if (v === undefined) return key;
      if (typeof v !== 'string') return v;
      var args = arguments;
      return v.replace(/\{(\d)\}/g, function (m, i) { var a = args[+i + 1]; return a === undefined ? '' : String(a); });
    },
    /** Applies data-i18n (text), data-i18n-html, data-i18n-ph (placeholder) and data-i18n-label (aria-label). */
    apply: function (root) {
      root = root || document;
      var self = this;
      Array.prototype.forEach.call(root.querySelectorAll('[data-i18n]'), function (el) { el.textContent = self.t(el.getAttribute('data-i18n')); });
      Array.prototype.forEach.call(root.querySelectorAll('[data-i18n-ph]'), function (el) { el.placeholder = self.t(el.getAttribute('data-i18n-ph')); });
      Array.prototype.forEach.call(root.querySelectorAll('[data-i18n-label]'), function (el) { el.setAttribute('aria-label', self.t(el.getAttribute('data-i18n-label'))); });
    }
  };
  window.t = function () { return I18N.t.apply(I18N, arguments); };
})();
