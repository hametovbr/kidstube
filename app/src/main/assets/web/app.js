/* KidsTube — TV interface for YouTube with parental keyword filtering. */
(function () {
  'use strict';

  // ===================================================================================
  // Native bridge (falls back to a stub so the page also works in a desktop browser)
  // ===================================================================================
  var Native = window.Android || {
    getSettings: function () { try { return localStorage.getItem('dev:settings') || '{}'; } catch (e) { return '{}'; } },
    saveSettings: function (j) { try { localStorage.setItem('dev:settings', j); } catch (e) {} return 'ok'; },
    remoteUrl: function () { return 'http://192.168.1.50:8765'; },
    showKeyboard: function () {}, hideKeyboard: function () {},
    startVoice: function () { setTimeout(function () { kt.onVoiceError(); }, 50); },
    keepScreenOn: function () {}, version: function () { return 'dev'; }, exit: function () {},
    innertube: function (id) { setTimeout(function () { kt.onNative(id, false, 'not available'); }, 10); },
    getHistory: function () { try { return localStorage.getItem('dev:history') || '[]'; } catch (e) { return '[]'; } },
    addHistory: function (j) {
      try {
        var v = JSON.parse(j), list = JSON.parse(localStorage.getItem('dev:history') || '[]');
        var old = list.filter(function (x) { return x.id === v.id; })[0];
        v.watchedAt = Date.now(); v.count = old ? (old.count || 1) + 1 : 1;
        list = [v].concat(list.filter(function (x) { return x.id !== v.id; })).slice(0, 300);
        localStorage.setItem('dev:history', JSON.stringify(list));
      } catch (e) {}
    },
    clearHistory: function () { try { localStorage.removeItem('dev:history'); } catch (e) {} },
    checkUpdate: function (id) { setTimeout(function () { kt.onNative(id, true, { available: false, current: 0, currentName: 'dev' }); }, 10); },
    installUpdate: function (id) { setTimeout(function () { kt.onNative(id, false, 'dev'); }, 10); }
  };

  function $(id) { return document.getElementById(id); }
  function h(tag, cls, text) {
    var el = document.createElement(tag);
    if (cls) el.className = cls;
    if (text != null) el.textContent = text;
    return el;
  }

  // ===================================================================================
  // Settings
  // ===================================================================================
  var DEFAULTS = {
    lang: 'en',
    apiKey: '',
    pin: '',
    blockedWords: [],
    blockedChannels: [],
    blockedVideos: [],
    checkTitle: true,
    checkTags: true,
    checkDescription: false,
    checkChannel: true,
    onlyKids: true,
    hideShort: false,
    autoplayNext: true,
    homeChannels: [],
    homeQueries: []
  };
  var LIST_KEYS = ['blockedWords', 'blockedChannels', 'blockedVideos', 'homeChannels', 'homeQueries'];
  var S = {};

  function loadSettings() {
    var raw = {};
    try { raw = JSON.parse(Native.getSettings() || '{}') || {}; } catch (e) { raw = {}; }
    S = {};
    for (var k in DEFAULTS) S[k] = raw.hasOwnProperty(k) ? raw[k] : DEFAULTS[k];
    LIST_KEYS.forEach(function (k) { S[k] = toList(S[k]); });
    S.blockedVideos = S.blockedVideos.map(videoIdFrom).filter(Boolean);
    rebuildFilter();
    applyLanguage();
  }

  function applyLanguage() {
    I18N.set(S.lang);
    I18N.apply();
  }

  function saveSettings() {
    var out = {};
    for (var k in DEFAULTS) out[k] = S[k];
    Native.saveSettings(JSON.stringify(out));
    rebuildFilter();
  }

  function toList(v) {
    if (Array.isArray(v)) return v.map(function (x) { return String(x).trim(); }).filter(Boolean);
    if (typeof v === 'string') return v.split(/[\n,;]+/).map(function (x) { return x.trim(); }).filter(Boolean);
    return [];
  }

  function videoIdFrom(s) {
    s = String(s || '').trim();
    var m = s.match(/(?:v=|youtu\.be\/|shorts\/|embed\/|live\/)([A-Za-z0-9_-]{11})/);
    if (m) return m[1];
    return /^[A-Za-z0-9_-]{11}$/.test(s) ? s : '';
  }

  // ===================================================================================
  // Filtering
  // ===================================================================================
  var F = { words: [], channelKeys: {}, videoIds: {} };

  function norm(s) { return String(s || '').toLowerCase().replace(/ё/g, 'е'); }

  function rebuildFilter() {
    F.words = S.blockedWords.map(norm).filter(Boolean);
    F.videoIds = {};
    S.blockedVideos.forEach(function (id) { F.videoIds[id] = true; });
    F.channelKeys = {};
    S.blockedChannels.forEach(function (c) {
      var ref = parseChannelRef(c);
      if (ref.id) F.channelKeys[ref.id] = true;
      if (ref.handle) {
        var cached = cacheGet('ch:' + norm(ref.handle), Infinity);
        if (cached) F.channelKeys[cached.id] = true;
        else resolveBlockedHandle(ref.handle);
      }
      if (!ref.id && !ref.handle) F.channelKeys['name:' + norm(c)] = true;
    });
  }

  function resolveBlockedHandle(handle) {
    if (!S.apiKey) return;
    channelInfo(handle).then(function (ch) {
      if (ch && !F.channelKeys[ch.id]) { F.channelKeys[ch.id] = true; refreshVisible(); }
    }).catch(function () {});
  }

  /** Returns why a video is hidden, or null when it may be shown. */
  function blockReason(v) {
    if (F.videoIds[v.id]) return 'video';
    if (F.channelKeys[v.channelId] || F.channelKeys['name:' + norm(v.channelTitle)]) return 'channel';
    if (v.embeddable === false) return 'embed';
    if (S.onlyKids && v.madeForKids === false) return 'notkids';
    if (S.hideShort && v.duration > 0 && v.duration <= 60) return 'short';
    if (!F.words.length) return null;
    var hay = [];
    if (S.checkTitle) hay.push(v.title);
    if (S.checkTags) hay.push((v.tags || []).join(' | '));
    if (S.checkDescription) hay.push(v.description);
    if (S.checkChannel) hay.push(v.channelTitle);
    var text = norm(hay.join('\n'));
    for (var i = 0; i < F.words.length; i++) if (text.indexOf(F.words[i]) >= 0) return 'word';
    return null;
  }

  function allowed(list) { return list.filter(function (v) { return !blockReason(v); }); }

  function queryBlocked(q) {
    var n = norm(q);
    for (var i = 0; i < F.words.length; i++) if (n.indexOf(F.words[i]) >= 0) return true;
    return false;
  }

  // ===================================================================================
  // Cache (localStorage)
  // ===================================================================================
  function cacheGet(key, maxAge) {
    try {
      var raw = localStorage.getItem('c:' + key);
      if (!raw) return null;
      var o = JSON.parse(raw);
      if (Date.now() - o.t > maxAge) return null;
      return o.v;
    } catch (e) { return null; }
  }
  function cacheSet(key, v) {
    try { localStorage.setItem('c:' + key, JSON.stringify({ t: Date.now(), v: v })); }
    catch (e) { pruneCache(true); try { localStorage.setItem('c:' + key, JSON.stringify({ t: Date.now(), v: v })); } catch (e2) {} }
  }
  function pruneCache(all) {
    try {
      var keys = [];
      for (var i = 0; i < localStorage.length; i++) keys.push(localStorage.key(i));
      keys.forEach(function (k) {
        if (k.indexOf('c:') !== 0 || k.indexOf('c:ch:') === 0) return;
        if (all) { localStorage.removeItem(k); return; }
        try { if (Date.now() - JSON.parse(localStorage.getItem(k)).t > 2 * 86400000) localStorage.removeItem(k); }
        catch (e) { localStorage.removeItem(k); }
      });
    } catch (e) {}
  }

  // ===================================================================================
  // YouTube Data API
  // ===================================================================================
  var API = 'https://www.googleapis.com/youtube/v3/';
  var HOUR = 3600000;

  function ApiError(reason, message) { this.reason = reason; this.message = message || reason; }

  function quotaDay() {
    try { return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' }); }
    catch (e) { return new Date().toISOString().slice(0, 10); }
  }
  function addQuota(units) {
    try {
      var o = JSON.parse(localStorage.getItem('quota') || '{}');
      var d = quotaDay();
      if (o.day !== d) o = { day: d, used: 0 };
      o.used += units;
      localStorage.setItem('quota', JSON.stringify(o));
    } catch (e) {}
  }
  function quotaUsed() {
    try { var o = JSON.parse(localStorage.getItem('quota') || '{}'); return o.day === quotaDay() ? o.used : 0; }
    catch (e) { return 0; }
  }

  function api(path, params, cost) {
    if (!S.apiKey) return Promise.reject(new ApiError('noKey'));
    params.key = S.apiKey;
    var qs = Object.keys(params).map(function (k) { return encodeURIComponent(k) + '=' + encodeURIComponent(params[k]); }).join('&');
    addQuota(cost);
    return fetch(API + path + '?' + qs).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) {
        if (!r.ok) {
          var e = j && j.error;
          var reason = e && e.errors && e.errors[0] && e.errors[0].reason;
          throw new ApiError(reason || ('http' + r.status), e && e.message);
        }
        return j;
      });
    }, function () { throw new ApiError('network'); });
  }

  function apiErrorText(e) {
    var r = e && e.reason;
    if (r === 'quotaExceeded' || r === 'dailyLimitExceeded') return t('err.quota');
    if (r === 'keyInvalid' || r === 'badRequest' && /key/i.test(e.message)) return t('err.key');
    if (r === 'noKey') return t('err.noKey');
    if (r === 'network') return t('err.network');
    if (r === 'channelNotFound') return t('err.channel');
    return t('err.youtube', (e && e.message) || r || t('err.unknown'));
  }

  function parseDuration(iso) {
    var m = /P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/.exec(iso || '');
    if (!m) return 0;
    return (+m[1] || 0) * 86400 + (+m[2] || 0) * 3600 + (+m[3] || 0) * 60 + (+m[4] || 0);
  }

  function bestThumb(t) {
    t = t || {};
    var o = t.medium || t.high || t['default'] || {};
    return o.url || '';
  }

  function normalizeVideo(it) {
    var sn = it.snippet || {}, st = it.status || {}, cd = it.contentDetails || {};
    return {
      id: it.id,
      title: sn.title || '',
      channelId: sn.channelId || '',
      channelTitle: sn.channelTitle || '',
      publishedAt: sn.publishedAt || '',
      description: (sn.description || '').slice(0, 1500),
      tags: sn.tags || [],
      thumb: bestThumb(sn.thumbnails),
      duration: parseDuration(cd.duration),
      live: sn.liveBroadcastContent && sn.liveBroadcastContent !== 'none',
      madeForKids: st.madeForKids,
      embeddable: st.embeddable
    };
  }

  /** Full details (tags, madeForKids, duration) for up to 50 ids per call, order preserved. */
  function videoDetails(ids) {
    ids = ids.filter(Boolean);
    if (!ids.length) return Promise.resolve([]);
    var chunks = [];
    for (var i = 0; i < ids.length; i += 50) chunks.push(ids.slice(i, i + 50));
    return Promise.all(chunks.map(function (c) {
      return api('videos', { part: 'snippet,contentDetails,status', id: c.join(','), maxResults: 50, hl: S.lang }, 1);
    })).then(function (pages) {
      var byId = {};
      pages.forEach(function (p) { (p.items || []).forEach(function (it) { byId[it.id] = normalizeVideo(it); }); });
      return ids.map(function (id) { return byId[id]; }).filter(function (v) { return v && !v.live; });
    });
  }

  // ---- YouTube internal API through the native side (no quota) ----
  var nativeCalls = {}, nativeSeq = 0;
  var IT = { failures: 0, until: 0 };

  function innertube(kind, arg, continuation) {
    if (Date.now() < IT.until || typeof Native.innertube !== 'function') return Promise.reject(new Error('innertube off'));
    return new Promise(function (resolve, reject) {
      var id = 'n' + (++nativeSeq);
      var timer = setTimeout(function () { delete nativeCalls[id]; reject(new Error('timeout')); }, 25000);
      nativeCalls[id] = function (ok, data) {
        clearTimeout(timer);
        if (ok && data && data.ids && data.ids.length) { IT.failures = 0; resolve(data); }
        else {
          // After repeated failures stop trying for a while and use the official API instead.
          if (++IT.failures >= 3) { IT.until = Date.now() + HOUR; IT.failures = 0; }
          reject(new Error(typeof data === 'string' ? data : 'empty'));
        }
      };
      Native.innertube(id, kind, arg || '', continuation || '');
    });
  }

  /** Calls an async native method whose answer comes back through kt.onNative. */
  function nativeAsync(method) {
    var args = Array.prototype.slice.call(arguments, 1);
    return new Promise(function (resolve, reject) {
      if (typeof Native[method] !== 'function') { reject(new Error(t('err.unsupported'))); return; }
      var id = 'n' + (++nativeSeq);
      nativeCalls[id] = function (ok, data) { if (ok) resolve(data); else reject(new Error(String(data))); };
      Native[method].apply(Native, [id].concat(args));
    });
  }

  // ---- In-app updates (GitHub releases) ----
  var Upd = { info: null, busy: false };

  function updInfo(text) { $('updInfo').textContent = text; }

  function checkUpdates(silent) {
    if (Upd.busy) return;
    if (!silent) updInfo(t('upd.checking'));
    nativeAsync('checkUpdate').then(function (r) {
      Upd.info = r;
      try { localStorage.setItem('updChecked', String(Date.now())); } catch (e) {}
      renderUpdate();
      if (silent && r.available) toast(t('upd.newToast'));
    }, function (e) { if (!silent) updInfo(t('upd.checkFail', e.message)); });
  }

  function renderUpdate() {
    var r = Upd.info;
    var gear = RAIL.querySelector('[data-action=settings]');
    if (gear) gear.classList.toggle('has-update', !!(r && r.available));
    if (!r || Upd.busy) return;
    $('updInstall').style.display = r.available ? '' : 'none';
    if (r.available) updInfo(t('upd.available', r.latestName || t('upd.build', r.latestCode), r.currentName));
    else updInfo(t('upd.latest', r.currentName));
  }

  function installUpdate() {
    if (!Upd.info || !Upd.info.available || Upd.busy) return;
    Upd.busy = true;
    updInfo(t('upd.downloading'));
    nativeAsync('installUpdate', Upd.info.url).then(function () {
      Upd.busy = false;
      updInfo(t('upd.confirm'));
    }, function (e) {
      Upd.busy = false;
      if (e.message === 'need-permission') updInfo(t('upd.permission'));
      else updInfo(t('upd.error', e.message));
    });
  }

  function autoCheckUpdates() {
    var last = 0;
    try { last = +localStorage.getItem('updChecked') || 0; } catch (e) {}
    if (Date.now() - last > 12 * HOUR) setTimeout(function () { checkUpdates(true); }, 8000);
  }

  /** Search: YouTube's own search first (free), official search.list as a fallback (100 units). */
  function searchVideos(q, pageToken) {
    var key = 's:' + norm(q).trim() + ':' + (pageToken || '');
    var cached = cacheGet(key, 6 * HOUR);
    if (cached) return Promise.resolve(cached);
    var save = function (res) { cacheSet(key, res); return res; };
    if (!pageToken || pageToken.indexOf('it:') === 0) {
      var free = innertube('search', q, pageToken ? pageToken.slice(3) : '').then(function (r) {
        return videoDetails(r.ids).then(function (items) { return save({ items: items, next: r.next ? 'it:' + r.next : null }); });
      });
      if (pageToken) return free;
      return free.catch(function () { return apiSearch(q, null).then(save); });
    }
    return apiSearch(q, pageToken.slice(4)).then(save);
  }

  function apiSearch(q, pageToken) {
    var params = { part: 'snippet', type: 'video', q: q, maxResults: 50, safeSearch: 'strict', videoEmbeddable: 'true', relevanceLanguage: S.lang };
    if (pageToken) params.pageToken = pageToken;
    return api('search', params, 100).then(function (j) {
      var ids = (j.items || []).map(function (it) { return it.id && it.id.videoId; });
      return videoDetails(ids).then(function (items) {
        return { items: items, next: j.nextPageToken ? 'api:' + j.nextPageToken : null };
      });
    });
  }

  /** YouTube's real "up next" recommendations (free); rejects when unavailable. */
  function relatedFree(v) {
    var key = 'up-next:' + v.id;
    var cached = cacheGet(key, 12 * HOUR);
    if (cached) return Promise.resolve(cached);
    return innertube('related', v.id).then(function (r) {
      return videoDetails(r.ids).then(function (items) {
        items = items.filter(function (x) { return x.id !== v.id; });
        cacheSet(key, items);
        return items;
      });
    });
  }

  /** Recommendations for the player panel: real ones, or a title-based search as a fallback. */
  function relatedVideos(v) {
    return relatedFree(v).catch(function () { return similarVideos(v); });
  }

  function parseChannelRef(s) {
    s = String(s || '').trim();
    var m = s.match(/channel\/(UC[A-Za-z0-9_-]{22})/) || s.match(/^(UC[A-Za-z0-9_-]{22})$/);
    if (m) return { id: m[1] };
    m = s.match(/(@[^\/?#\s]+)/);
    if (m) return { handle: decodeURIComponent(m[1]) };
    return {};
  }

  function channelInfo(ref) {
    var r = typeof ref === 'string' ? parseChannelRef(ref) : ref;
    if (!r.id && !r.handle) r = { handle: '@' + String(ref).trim().replace(/^@/, '') };
    var key = 'ch:' + norm(r.id || r.handle);
    var cached = cacheGet(key, Infinity);
    if (cached) return Promise.resolve(cached);
    var params = { part: 'snippet,contentDetails' };
    if (r.id) params.id = r.id; else params.forHandle = r.handle;
    return api('channels', params, 1).then(function (j) {
      var it = j.items && j.items[0];
      if (!it) throw new ApiError('channelNotFound');
      var ch = {
        id: it.id,
        title: (it.snippet && it.snippet.title) || r.handle || it.id,
        thumb: bestThumb(it.snippet && it.snippet.thumbnails),
        uploads: it.contentDetails && it.contentDetails.relatedPlaylists && it.contentDetails.relatedPlaylists.uploads
      };
      cacheSet(key, ch);
      return ch;
    });
  }

  /** Uploads of a channel, newest first: {items, next}. Costs 2 quota units per page. */
  function channelVideos(ch, pageToken) {
    var key = 'up2:' + ch.id + ':' + (pageToken || '');
    var cached = cacheGet(key, 3 * HOUR);
    if (cached) return Promise.resolve(cached);
    if (!ch.uploads) return Promise.reject(new ApiError('channelNotFound'));
    var params = { part: 'contentDetails', playlistId: ch.uploads, maxResults: 50 };
    if (pageToken) params.pageToken = pageToken;
    return api('playlistItems', params, 1).then(function (j) {
      var ids = (j.items || []).map(function (it) { return it.contentDetails && it.contentDetails.videoId; });
      return videoDetails(ids).then(function (items) {
        var res = { items: items, next: j.nextPageToken || null };
        cacheSet(key, res);
        return res;
      });
    });
  }

  // The Data API no longer offers "related videos", so similar videos are found by
  // searching for the key words of the title (cached per video for a day).
  var STOP_WORDS = ['для', 'про', 'все', 'как', 'что', 'это', 'или', 'новые', 'новая', 'новый', 'серия', 'серии',
    'сборник', 'мультик', 'мультики', 'мультфильм', 'мультфильмы', 'детей', 'детские', 'детская', 'малышей',
    'the', 'and', 'with', 'for', 'new', 'episode', 'official', 'video', 'full', 'kids', 'part'];

  function similarQuery(v) {
    var words = norm(v.title).replace(/[^a-zа-я0-9\s]/g, ' ').split(/\s+/).filter(function (w) {
      return w.length > 2 && !/^\d+$/.test(w) && STOP_WORDS.indexOf(w) < 0;
    });
    var q = words.slice(0, 4).join(' ');
    if (!q && v.tags && v.tags.length) q = v.tags[0];
    return q || v.channelTitle;
  }

  function similarVideos(v) {
    var key = 'rel:' + v.id;
    var cached = cacheGet(key, 24 * HOUR);
    if (cached) return Promise.resolve(cached);
    return searchVideos(similarQuery(v)).then(function (res) {
      var items = res.items.filter(function (x) { return x.id !== v.id; });
      cacheSet(key, items);
      return items;
    });
  }

  // ===================================================================================
  // History (watched videos, no API cost)
  // ===================================================================================
  function getHistory() { try { return JSON.parse(Native.getHistory() || '[]'); } catch (e) { return []; } }
  function addHistory(v) {
    var o = {};
    for (var k in v) o[k] = v[k];
    o.description = '';
    o.tags = (v.tags || []).slice(0, 20);
    Native.addHistory(JSON.stringify(o));
  }

  // ---- "For you": recommendations based on what was watched recently ----
  function recommendations() {
    var hist = getHistory();
    var seen = {};
    hist.forEach(function (x) { seen[x.id] = true; });
    var seeds = allowed(hist).slice(0, 6);
    if (!seeds.length) return Promise.resolve([]);
    var key = 'recs:' + seeds.map(function (x) { return x.id; }).join(',');
    var cached = cacheGet(key, HOUR);
    if (cached) return Promise.resolve(cached);
    return Promise.all(seeds.map(function (v) {
      return relatedFree(v).catch(function () { return null; });
    })).then(function (lists) {
      if (lists.every(function (l) { return !l; })) {
        // YouTube's internal API is unavailable: fall back to new videos from the favourite channels.
        return favouriteChannelsVideos(hist);
      }
      return lists.map(function (l) { return l || []; });
    }).then(function (lists) {
      // Interleave: 1st from each seed, then 2nd from each… so one cartoon doesn't take over.
      var out = [], used = {};
      for (var i = 0; i < 50; i++) {
        lists.forEach(function (l) {
          var v = l[i];
          if (v && !used[v.id] && !seen[v.id]) { used[v.id] = true; out.push(v); }
        });
      }
      cacheSet(key, out.slice(0, 40));
      return out.slice(0, 40);
    });
  }

  function favouriteChannelsVideos(hist) {
    var score = {}, order = [];
    hist.slice(0, 60).forEach(function (v) {
      if (!v.channelId) return;
      if (!score[v.channelId]) { score[v.channelId] = 0; order.push(v.channelId); }
      score[v.channelId] += v.count || 1;
    });
    order.sort(function (a, b) { return score[b] - score[a]; });
    return Promise.all(order.slice(0, 3).map(function (id) {
      return channelInfo({ id: id }).then(function (ch) { return channelVideos(ch); })
        .then(function (r) { return r.items; }, function () { return []; });
    }));
  }

  // ===================================================================================
  // Focus navigation for the remote
  // ===================================================================================
  var RAIL = $('rail');
  var MEMORY_CONTAINERS = ['row-cards', 'rail-items', 'chips'];

  function memoryContainer(el) {
    var p = el && el.parentElement;
    if (!p) return null;
    for (var i = 0; i < MEMORY_CONTAINERS.length; i++) if (p.classList.contains(MEMORY_CONTAINERS[i])) return p;
    return null;
  }
  function visible(el) { return !!el && document.body.contains(el) && (el.offsetParent !== null || el.getClientRects().length > 0); }

  var Nav = {
    current: null,
    roots: function () {
      var s = Screens.top();
      if (!s) return [document.body];
      return s.rail ? [s.el, RAIL] : [s.el];
    },
    items: function () {
      var out = [];
      this.roots().forEach(function (root) {
        var all = root.querySelectorAll('.f');
        for (var i = 0; i < all.length; i++) if (visible(all[i])) out.push(all[i]);
      });
      return out;
    },
    set: function (el) {
      if (this.current && this.current !== el) {
        this.current.classList.remove('focused');
        var inp = inputOf(this.current);
        if (inp && document.activeElement === inp) inp.blur();
      }
      this.current = el || null;
      var inRail = !!el && RAIL.contains(el);
      document.body.classList.toggle('rail-open', inRail);
      if (!el) return;
      el.classList.add('focused');
      var mc = memoryContainer(el);
      if (mc) mc._last = el;
      var s = Screens.top();
      if (s && !inRail) s.lastFocus = el;
      scrollToEl(el);
    },
    /** Moves focus into the side menu, onto the current section. */
    toRail: function () {
      var a = RAIL.querySelector('.rail-item.active') || RAIL.querySelector('.rail-item');
      if (a && Screens.top() && Screens.top().rail) { this.set(a); return true; }
      return false;
    },
    first: function () { var it = this.items(); this.set(it[0] || null); },
    restore: function () {
      var s = Screens.top();
      if (s && s.lastFocus && s.el.contains(s.lastFocus) && s.lastFocus.offsetParent !== null) this.set(s.lastFocus);
      else this.first();
    },
    move: function (dir) {
      var items = this.items();
      if (!items.length) return false;
      if (!this.current || items.indexOf(this.current) < 0) { this.set(items[0]); return true; }
      // The side menu is its own column: up/down stay inside it, left/right cross over.
      var inRailNow = RAIL.contains(this.current);
      if (dir === 'up' || dir === 'down') items = items.filter(function (x) { return RAIL.contains(x) === inRailNow; });
      var a = this.current.getBoundingClientRect();
      var acx = a.left + a.width / 2, acy = a.top + a.height / 2;
      var best = null, bestScore = Infinity;
      for (var i = 0; i < items.length; i++) {
        var el = items[i];
        if (el === this.current) continue;
        var b = el.getBoundingClientRect();
        var bcx = b.left + b.width / 2, bcy = b.top + b.height / 2;
        var primary, cross;
        if (dir === 'right') { if (bcx <= acx + 2) continue; primary = Math.max(0, b.left - a.right); cross = gap(a.top, a.bottom, b.top, b.bottom) * 3 + Math.abs(bcy - acy) * 0.2; }
        else if (dir === 'left') { if (bcx >= acx - 2) continue; primary = Math.max(0, a.left - b.right); cross = gap(a.top, a.bottom, b.top, b.bottom) * 3 + Math.abs(bcy - acy) * 0.2; }
        else if (dir === 'down') { if (bcy <= acy + 2) continue; primary = Math.max(0, b.top - a.bottom); cross = gap(a.left, a.right, b.left, b.right) * 1.5 + Math.abs(bcx - acx) * 0.3; }
        else { if (bcy >= acy - 2) continue; primary = Math.max(0, a.top - b.bottom); cross = gap(a.left, a.right, b.left, b.right) * 1.5 + Math.abs(bcx - acx) * 0.3; }
        var score = primary + cross;
        if (score < bestScore) { bestScore = score; best = el; }
      }
      if (!best) return false;
      var s = Screens.top();
      if (s) s.userMoved = true;
      var fromRail = RAIL.contains(this.current), toRail = RAIL.contains(best);
      if (!fromRail && toRail) return this.toRail();
      if (fromRail && !toRail && s && visible(s.lastFocus)) { this.set(s.lastFocus); return true; }
      // Entering another row: go back to the card that was focused there last time.
      var mc = memoryContainer(best);
      if (mc && mc !== memoryContainer(this.current) && (dir === 'up' || dir === 'down') && visible(mc._last)) best = mc._last;
      this.set(best);
      return true;
    }
  };
  function gap(a1, a2, b1, b2) { return Math.max(0, Math.max(a1, b1) - Math.min(a2, b2)); }

  function inputOf(el) {
    if (!el) return null;
    if (el.tagName === 'INPUT') return el;
    return el.querySelector ? el.querySelector('input') : null;
  }

  function scrollToEl(el) {
    // Horizontal rows: keep the focused card comfortably inside the row.
    var row = el.parentElement && el.parentElement.classList.contains('row-cards') ? el.parentElement : null;
    if (row) {
      var left = el.offsetLeft - row.offsetLeft, pad = row.clientWidth * 0.08;
      var target = row.scrollLeft;
      if (left - pad < target) target = left - pad;
      else if (left + el.offsetWidth + pad > target + row.clientWidth) target = left + el.offsetWidth + pad - row.clientWidth;
      if (target !== row.scrollLeft) row.scrollTo({ left: Math.max(0, target), behavior: 'smooth' });
    }
    // Vertical: scroll the screen's scroller so the element sits in the upper middle.
    var sc = el.closest ? el.closest('.scroller') : null;
    if (sc) {
      var r = el.getBoundingClientRect(), sr = sc.getBoundingClientRect();
      var block = row ? row.parentElement : el;
      var br = block.getBoundingClientRect();
      var desired = sc.scrollTop + (br.top - sr.top) - sc.clientHeight * 0.18;
      if (r.top < sr.top + 10 || r.bottom > sr.bottom - 10 || row) sc.scrollTo({ top: Math.max(0, desired), behavior: 'smooth' });
    }
  }

  // ===================================================================================
  // Screens
  // ===================================================================================
  var Screens = {
    stack: [],
    defs: {},
    top: function () { return this.stack[this.stack.length - 1]; },
    push: function (name, data) {
      var s = this.defs[name];
      if (this.stack.indexOf(s) >= 0) this.stack.splice(this.stack.indexOf(s), 1);
      if (!s.dialog) this.stack.forEach(function (x) { x.el.classList.remove('shown'); });
      this.stack.push(s);
      s.el.classList.add('shown');
      s.lastFocus = null;
      s.userMoved = false;
      updateChrome();
      if (s.onShow) s.onShow(data);
      if (!Nav.current || !s.el.contains(Nav.current)) Nav.restore();
    },
    pop: function () {
      if (this.stack.length <= 1) return false;
      var s = this.stack.pop();
      s.el.classList.remove('shown');
      if (s.onHide) s.onHide();
      var t = this.top();
      t.el.classList.add('shown');
      updateChrome();
      if (t.onReturn) t.onReturn();
      Nav.restore();
      return true;
    },
    replaceAll: function (name, data) {
      this.stack.forEach(function (x) { x.el.classList.remove('shown'); if (x.onHide) x.onHide(); });
      this.stack = [];
      this.push(name, data);
    }
  };

  function def(name, o) { o.el = $(name); o.name = name; Screens.defs[name] = o; return o; }

  /** Shows the side menu on main sections and highlights the current one. */
  function updateChrome() {
    var top = null;
    for (var i = Screens.stack.length - 1; i >= 0; i--) if (!Screens.stack[i].dialog) { top = Screens.stack[i]; break; }
    var rail = !!(top && top.rail);
    document.body.classList.toggle('has-rail', rail);
    if (!rail) document.body.classList.remove('rail-open');
    var items = RAIL.querySelectorAll('.rail-item[data-section]');
    for (var j = 0; j < items.length; j++) items[j].classList.toggle('active', !!top && items[j].getAttribute('data-section') === (top.section || top.name));
  }

  /** Switches between the main sections (home, search, my channels, watched). */
  function openSection(name, data) {
    while (Screens.stack.length > 1 && Screens.top() !== Home) Screens.pop();
    if (name === 'home') { if (!Nav.current || RAIL.contains(Nav.current)) Nav.restore(); return; }
    Screens.push(name, data);
  }

  // ---------------- Cards ----------------
  function fmtTime(sec) {
    sec = Math.max(0, Math.floor(sec || 0));
    var hh = Math.floor(sec / 3600), m = Math.floor(sec % 3600 / 60), s = sec % 60;
    var ss = (s < 10 ? '0' : '') + s;
    return hh ? hh + ':' + (m < 10 ? '0' : '') + m + ':' + ss : m + ':' + ss;
  }

  function makeCard(v, list, index) {
    var c = h('div', 'card f');
    var th = h('div', 'thumb');
    var img = h('img');
    img.loading = 'lazy';
    img.src = v.thumb;
    img.alt = '';
    th.appendChild(img);
    if (v.duration) th.appendChild(h('span', 'dur', fmtTime(v.duration)));
    c.appendChild(th);
    c.appendChild(h('div', 'title', v.title));
    c.appendChild(h('div', 'ch', v.channelTitle));
    c._video = v;
    c._list = list;
    c._index = index;
    return c;
  }

  function icon(name) { return '<svg><use href="#i-' + name + '"/></svg>'; }

  function skeletons(n) {
    var frag = document.createDocumentFragment();
    for (var i = 0; i < n; i++) {
      var sk = h('div', 'skel');
      sk.appendChild(h('div', 'thumb'));
      sk.appendChild(h('div', 'line'));
      frag.appendChild(sk);
    }
    return frag;
  }

  function emptyState(emoji, text) {
    var e = h('div', 'empty');
    e.appendChild(h('span', 'big', emoji));
    e.appendChild(h('span', '', text));
    return e;
  }

  function makeChannelCard(ch) {
    var c = h('div', 'card more f', t('row.allVideos'));
    c.appendChild(h('span', 'more-sub', ch.title));
    c._channel = ch;
    return c;
  }

  // ---------------- Home ----------------
  var homeRows = [];

  var Home = def('home', {
    rail: true,
    onShow: function () { homeDirty = false; buildHome(); },
    onReturn: function () { if (homeDirty) { homeDirty = false; buildHome(); } else renderHomeRows(); },
    onKey: function (k) {
      // Back from the content jumps to the menu first; Back on the menu leaves the app.
      if (k === 'back') return RAIL.contains(Nav.current) ? false : Nav.toRail();
      return null;
    }
  });

  function buildHome() {
    var box = $('homeRows');
    box.innerHTML = '';
    homeRows = [];
    var subs = S.homeChannels.length ? loadSubscriptions() : null;
    homeRows.push({ kind: 'recs', icon: 'sparkle', title: t('row.forYou'), load: recommendations });
    if (subs) homeRows.push({ kind: 'subs', icon: 'new', title: t('row.subs'), load: function () { return subs.then(function (x) { return x.videos; }); } });
    homeRows.push({ kind: 'history', icon: 'history', title: t('row.again') });
    if (subs) homeRows.push({ kind: 'channels', icon: 'tv', title: t('row.channels'), load: function () { return subs.then(function (x) { return x.channels; }); } });
    S.homeQueries.forEach(function (q) {
      homeRows.push({ kind: 'query', icon: 'search', title: q, load: function () { return searchVideos(q).then(function (res) { return res.items; }); } });
    });

    homeRows.forEach(function (r) {
      r.el = h('div', 'row');
      r.titleEl = h('div', 'row-title', r.title);
      r.cardsEl = h('div', 'row-cards');
      r.el.appendChild(r.titleEl);
      r.el.appendChild(r.cardsEl);
      box.appendChild(r.el);
      loadRow(r);
    });

    if (!S.homeChannels.length && !S.homeQueries.length && !getHistory().length) {
      var tip = h('div', 'tip');
      tip.innerHTML = t('home.tip');
      box.appendChild(tip);
    }
    renderHomeRows();
  }

  /** Subscribed channels and their newest videos merged into one feed (2 quota units per channel). */
  function loadSubscriptions() {
    return Promise.all(S.homeChannels.map(function (ref) {
      return channelInfo(ref).catch(function () { return null; });
    })).then(function (chs) {
      chs = chs.filter(function (c) { return c && !channelBlocked(c.id, c.title); });
      return Promise.all(chs.map(function (ch) {
        return channelVideos(ch).then(function (r) { return r.items; }, function () { return []; });
      })).then(function (lists) {
        var all = [], seen = {};
        lists.forEach(function (l) { l.slice(0, 15).forEach(function (v) { if (!seen[v.id]) { seen[v.id] = true; all.push(v); } }); });
        all.sort(function (x, y) { return (y.publishedAt || '').localeCompare(x.publishedAt || ''); });
        return { channels: chs, videos: all.slice(0, 40) };
      });
    });
  }

  function loadRow(r) {
    if (r.kind === 'history') { r.items = getHistory(); return; }
    r.loading = true;
    r.load().then(function (items) { r.items = items; r.error = null; }, function (e) { r.error = apiErrorText(e); })
      .then(function () { r.loading = false; renderHomeRows(); });
  }

  function cardKey(el) {
    if (!el) return null;
    if (el._video) return 'v:' + el._video.id;
    if (el._channel) return 'c:' + el._channel.id;
    return null;
  }

  function makeChannelTile(ch) {
    var c = h('div', 'card chan-card f');
    var im = h('img');
    im.src = ch.thumb || '';
    im.alt = '';
    c.appendChild(im);
    c.appendChild(h('div', 'title', ch.title));
    c._channel = ch;
    return c;
  }

  function renderHomeRows() {
    var cur = Nav.current && Home.el.contains(Nav.current) ? Nav.current : Home.lastFocus;
    var keep = cardKey(cur);
    var keepRow = null;
    homeRows.forEach(function (r) {
      if (r.kind === 'history') r.items = getHistory();
      var items = r.kind === 'channels' ? (r.items || []) : allowed(r.items || []);
      if (keep && r.cardsEl.contains(cur)) keepRow = r;
      r.cardsEl.innerHTML = '';
      r.el.style.display = '';
      r.titleEl.innerHTML = icon(r.icon || 'sparkle');
      r.titleEl.appendChild(document.createTextNode(r.title));
      if (r.loading) { r.cardsEl.appendChild(skeletons(4)); }
      else if (r.error) { r.cardsEl.appendChild(h('div', 'row-msg', r.error)); }
      else if (!items.length) {
        if (r.kind !== 'query') { r.el.style.display = 'none'; return; }
        r.cardsEl.appendChild(h('div', 'row-msg', t('row.empty')));
      } else if (r.kind === 'channels') {
        items.forEach(function (ch) { r.cardsEl.appendChild(makeChannelTile(ch)); });
      } else {
        items.slice(0, 30).forEach(function (v, i) { r.cardsEl.appendChild(makeCard(v, items, i)); });
        if (r.kind === 'history' && items.length > 4) {
          var all = h('div', 'card more f', t('row.all'));
          all.appendChild(h('span', 'more-sub', t('row.allSub')));
          all._section = 'library';
          r.cardsEl.appendChild(all);
        }
      }
    });
    if (Screens.top() !== Home) return;
    // Until the child moves, keep focus on the first video so OK starts something right away.
    if (!Home.userMoved) {
      var firstCard = $('homeRows').querySelector('.card.f');
      if (firstCard) { Nav.set(firstCard); return; }
    }
    if (keepRow) {
      var cards = keepRow.cardsEl.querySelectorAll('.card');
      for (var i = 0; i < cards.length; i++) if (cardKey(cards[i]) === keep) { Nav.set(cards[i]); return; }
      if (cards.length) { Nav.set(cards[0]); return; }
    }
    if (!Nav.current || !Home.el.contains(Nav.current) || !document.body.contains(Nav.current)) Nav.first();
  }

  // ---------------- Results ----------------
  var R = { q: '', items: [], next: null, loading: false, error: null };

  var Results = def('search', {
    rail: true,
    onShow: function (q) {
      if (q) runSearch(q);
      else { R = { q: '', items: [], next: null, loading: false, error: null }; $('resultsSearch').value = ''; renderResults(true); }
    },
    onReturn: function () { renderResults(); }
  });


  function recentQueries() { try { return JSON.parse(localStorage.getItem('recentQ') || '[]'); } catch (e) { return []; } }
  function rememberQuery(q) {
    var list = recentQueries().filter(function (x) { return norm(x) !== norm(q); });
    list.unshift(q);
    try { localStorage.setItem('recentQ', JSON.stringify(list.slice(0, 6))); } catch (e) {}
  }

  /** Idle search screen: big mic plus one-press chips (recent searches and ideas) — no typing needed. */
  function renderSearchIdle() {
    var idle = !R.q;
    $('searchIdle').style.display = idle ? '' : 'none';
    if (!idle) return;
    var box = $('searchChips');
    box.innerHTML = '';
    var recent = recentQueries().filter(function (q) { return !queryBlocked(q); });
    $('chipsTitle').textContent = recent.length ? t('search.recentIdeas') : t('search.ideas');
    recent.forEach(function (q) { box.appendChild(makeChip('🕘', q)); });
    t('sugg').forEach(function (sg) { if (recent.indexOf(sg[1]) < 0) box.appendChild(makeChip(sg[0], sg[1])); });
  }

  function makeChip(emoji, q) {
    var c = h('button', 'chip f');
    c.appendChild(h('span', 'ico', emoji));
    c.appendChild(h('span', '', q));
    c._query = q;
    return c;
  }

  function openSearch(q) {
    if (Screens.top() === Results) { if (q) runSearch(q); return; }
    openSection('search', q);
  }

  function runSearch(q) {
    q = String(q || '').trim();
    if (!q) return;
    R = { q: q, items: [], next: null, loading: true, error: null };
    $('resultsSearch').value = q;
    rememberQuery(q);
    renderResults(true);
    if (queryBlocked(q)) { R.loading = false; renderResults(true); return; }
    searchVideos(q).then(function (res) {
      if (R.q !== q) return;
      R.items = res.items; R.next = res.next;
    }, function (e) { R.error = apiErrorText(e); }).then(function () {
      if (R.q !== q) return;
      R.loading = false;
      renderResults(true);
    });
  }

  function loadMore() {
    if (!R.next || R.loading) return;
    var q = R.q, token = R.next;
    R.loading = true;
    renderResults(false);
    searchVideos(q, token).then(function (res) {
      if (R.q !== q) return;
      var seen = {};
      R.items.forEach(function (v) { seen[v.id] = true; });
      res.items.forEach(function (v) { if (!seen[v.id]) R.items.push(v); });
      R.next = res.next;
    }, function (e) { toast(apiErrorText(e)); }).then(function () {
      R.loading = false;
      renderResults(false);
    });
  }

  function renderResults(resetFocus) {
    renderSearchIdle();
    if (!R.q) {
      $('resultsGrid').innerHTML = '';
      $('resultsStatus').innerHTML = '';
      if (Screens.top() === Results && (!Nav.current || !document.body.contains(Nav.current))) Nav.first();
      return;
    }
    renderGrid(Results, $('resultsGrid'), $('resultsStatus'), R, resetFocus, ['🙈', t('search.none')]);
  }

  /** Shared grid renderer for search results and channel pages. state: {items, next, loading, error}. */
  function renderGrid(screen, grid, status, st, resetFocus, emptyText) {
    var cur = Nav.current && screen.el.contains(Nav.current) ? Nav.current : screen.lastFocus;
    var prevId = !resetFocus && cur && cur._video ? cur._video.id : null;
    var wasMore = !resetFocus && cur && cur._more;
    var shownBefore = grid.querySelectorAll('.card:not(.more)').length;
    grid.innerHTML = '';
    status.innerHTML = '';
    var items = allowed(st.items);
    items.forEach(function (v, i) { grid.appendChild(makeCard(v, items, i)); });
    if (st.next && !st.loading && !st.error) {
      var more = h('div', 'card more f', t('more'));
      more._more = true;
      grid.appendChild(more);
    }
    if (st.loading && !items.length) grid.appendChild(skeletons(8));
    else if (st.loading) status.appendChild(h('div', 'spinner'));
    else if (st.error) status.appendChild(emptyState('📡', st.error));
    else if (!items.length) status.appendChild(emptyState(emptyText[0], emptyText[1]));

    if (Screens.top() !== screen) return;
    var cards = grid.querySelectorAll('.card');
    if (prevId) {
      for (var i = 0; i < cards.length; i++) if (cards[i]._video && cards[i]._video.id === prevId) { Nav.set(cards[i]); return; }
    }
    if (wasMore && cards.length) { Nav.set(cards[Math.min(shownBefore, cards.length - 1)]); return; }
    if (resetFocus && items.length) { Nav.set(cards[0]); return; }
    if (!Nav.current || !document.body.contains(Nav.current)) Nav.first();
  }

  // ---------------- Watched ("Я смотрел") ----------------
  var Library = def('library', {
    rail: true,
    onShow: function () { renderLibrary(true); },
    onReturn: function () { renderLibrary(false); }
  });

  function renderLibrary(resetFocus) {
    renderGrid(Library, $('libGrid'), $('libStatus'), { items: getHistory() }, resetFocus, ['📺', t('watched.empty')]);
  }

  // ---------------- My channels ----------------
  var MyChannels = def('mychannels', {
    rail: true,
    onShow: function () { renderMyChannels(null, true); loadMyChannels(); },
    onReturn: function () { if (homeDirty) loadMyChannels(); }
  });

  function loadMyChannels() {
    if (!S.homeChannels.length) { renderMyChannels([], true); return; }
    loadSubscriptions().then(function (x) { renderMyChannels(x.channels, true); }, function () { renderMyChannels([], true); });
  }

  function renderMyChannels(chs, resetFocus) {
    var grid = $('mcGrid'), status = $('mcStatus');
    grid.innerHTML = '';
    status.innerHTML = '';
    if (chs === null) { grid.appendChild(skeletons(5)); return; }
    if (!chs.length) status.appendChild(emptyState('⭐', t('channels.empty')));
    chs.forEach(function (ch) { grid.appendChild(makeChannelTile(ch)); });
    if (Screens.top() === MyChannels && resetFocus && !MyChannels.userMoved) {
      var first = grid.querySelector('.f');
      Nav.set(first || null);
      if (!first) Nav.toRail();
    }
  }

  // ---------------- Channel page ----------------
  var C = { ch: null, items: [], next: null, loading: false, error: null };

  var Channel = def('channel', {
    rail: true,
    section: 'mychannels',
    onShow: function (ref) { loadChannel(ref); },
    onReturn: function () { renderChannel(false); }
  });

  // Subscriptions are the channels on the home screen (settings key homeChannels).
  var homeDirty = false;

  function subscribedIndex(id) {
    for (var i = 0; i < S.homeChannels.length; i++) {
      var ref = parseChannelRef(S.homeChannels[i]);
      if (ref.id === id) return i;
      if (ref.handle) { var c = cacheGet('ch:' + norm(ref.handle), Infinity); if (c && c.id === id) return i; }
    }
    return -1;
  }

  function updateSubButton() {
    var on = subscribedIndex(C.id) >= 0;
    var b = $('chanSub');
    b.innerHTML = icon(on ? 'check' : 'star') + '<span>' + (on ? t('channel.subscribed') : t('channel.subscribe')) + '</span>';
    b.classList.toggle('on', on);
  }

  function toggleSubscribe(id) {
    var i = subscribedIndex(id);
    if (i >= 0) { S.homeChannels.splice(i, 1); toast(t('channel.unsubscribedToast')); }
    else { S.homeChannels.push('https://www.youtube.com/channel/' + id); toast(t('channel.subscribedToast')); }
    saveSettings();
    homeDirty = true;
  }

  function channelBlocked(id, title) {
    return !!(F.channelKeys[id] || F.channelKeys['name:' + norm(title)]);
  }

  /** ref: channel object, {id} or {id, title} taken from a video. */
  function openChannel(ref) {
    if (channelBlocked(ref.id, ref.title)) { toast(t('channel.unavailable')); return; }
    if (Screens.top() === Player) Screens.pop();
    Screens.push('channel', ref);
  }

  function loadChannel(ref) {
    C = { ch: null, items: [], next: null, loading: true, error: null, id: ref.id };
    updateSubButton();
    $('chanTitle').textContent = ref.title || '';
    $('chanAvatar').src = ref.thumb || '';
    renderChannel(true);
    var id = ref.id;
    (ref.uploads ? Promise.resolve(ref) : channelInfo({ id: id })).then(function (ch) {
      if (C.id !== id) return;
      C.ch = ch;
      $('chanTitle').textContent = ch.title;
      if (ch.thumb) $('chanAvatar').src = ch.thumb;
      return channelVideos(ch).then(function (res) {
        if (C.id !== id) return;
        C.items = res.items; C.next = res.next;
      });
    }).catch(function (e) { if (C.id === id) C.error = apiErrorText(e); }).then(function () {
      if (C.id !== id) return;
      C.loading = false;
      renderChannel(true);
    });
  }

  function loadMoreChannel() {
    if (!C.next || C.loading || !C.ch) return;
    var id = C.id, token = C.next;
    C.loading = true;
    renderChannel(false);
    channelVideos(C.ch, token).then(function (res) {
      if (C.id !== id) return;
      var seen = {};
      C.items.forEach(function (v) { seen[v.id] = true; });
      res.items.forEach(function (v) { if (!seen[v.id]) C.items.push(v); });
      C.next = res.next;
    }, function (e) { toast(apiErrorText(e)); }).then(function () {
      C.loading = false;
      renderChannel(false);
    });
  }

  function renderChannel(resetFocus) {
    renderGrid(Channel, $('chanGrid'), $('chanStatus'), C, resetFocus, ['📭', t('channel.empty')]);
  }

  // ---------------- Player ----------------
  var P = { yt: null, ready: null, list: [], index: 0, video: null, osdTimer: 0, tick: 0, paused: false };

  function loadYouTubeApi() {
    if (P.ready) return P.ready;
    P.ready = new Promise(function (resolve, reject) {
      window.onYouTubeIframeAPIReady = function () { resolve(); };
      var s = document.createElement('script');
      s.src = 'https://www.youtube.com/iframe_api';
      s.onerror = function () { P.ready = null; reject(new Error('api')); };
      document.head.appendChild(s);
    });
    return P.ready;
  }

  var Player = def('player', {
    onShow: function () { showOsd(); },
    onHide: function () {
      try { if (P.yt) P.yt.stopVideo(); } catch (e) {}
      Native.keepScreenOn(false);
      clearInterval(P.tick);
      hidePlayerMsg();
      closeRelated();
    },
    onKey: function (k) {
      if (P.panelOpen) {
        if (k === 'back') { closeRelated(); return true; }
        if (k === 'playpause') { togglePause(); return true; }
        if (k === 'up' || k === 'down' || k === 'left' || k === 'right') P.relAutoFocus = false;
        if (k === 'up') { if (!Nav.move('up')) closeRelated(); return true; }
        return null; // arrows / OK / long OK handled by the common navigation
      }
      if (k === 'down') { openRelated(); return true; }
      if (k === 'ok' || k === 'playpause') togglePause();
      else if (k === 'play') { if (P.yt) P.yt.playVideo(); }
      else if (k === 'pause') { if (P.yt) P.yt.pauseVideo(); }
      else if (k === 'left' || k === 'rew') seek(-10);
      else if (k === 'right' || k === 'ff') seek(10);
      else if (k === 'next') playNext();
      else if (k === 'up') showOsd();
      else if (k === 'longok' || k === 'menu') { if (P.video) openParentMenu(P.video); }
      else return null;
      return true;
    }
  });

  function play(list, index) {
    P.list = list; P.index = index;
    Screens.push('player');
    startVideo();
  }

  function startVideo() {
    var v = P.list[P.index];
    if (!v) { Screens.pop(); return; }
    P.video = v;
    P.paused = false;
    addHistory(v);
    $('osdTitle').textContent = v.title;
    $('osdChannel').textContent = v.channelTitle;
    $('osdBar').style.width = '0';
    $('osdTime').textContent = '0:00';
    $('osdDur').textContent = fmtTime(v.duration);
    hidePlayerMsg();
    showOsd();
    loadYouTubeApi().then(function () {
      if (Screens.top() !== Player || P.video !== v) return;
      if (P.yt && P.yt.loadVideoById) { P.yt.loadVideoById(v.id); return; }
      P.yt = new YT.Player('yt', {
        videoId: v.id,
        width: '100%', height: '100%',
        playerVars: { autoplay: 1, controls: 0, disablekb: 1, fs: 0, rel: 0, iv_load_policy: 3, playsinline: 1, modestbranding: 1, cc_load_policy: 0, hl: S.lang, origin: location.origin },
        events: {
          onReady: function (e) { if (Screens.top() === Player) e.target.playVideo(); },
          onStateChange: onPlayerState,
          onError: onPlayerError
        }
      });
    }, function () { showPlayerMsg(t('player.loadFail')); });
    clearInterval(P.tick);
    P.tick = setInterval(updateOsd, 500);
  }

  function onPlayerState(e) {
    var st = e.data;
    if (st === 1) { // playing
      P.paused = false;
      Native.keepScreenOn(true);
      $('osd').classList.remove('paused');
      hidePlayerMsg();
    } else if (st === 2) { // paused
      P.paused = true;
      Native.keepScreenOn(false);
      $('osdIcon').innerHTML = icon('pause');
      $('osd').classList.add('paused');
      showOsd(true);
    } else if (st === 0) { // ended
      Native.keepScreenOn(false);
      if (P.panelOpen) return; // the child is already choosing what to watch next
      if (S.autoplayNext) playNext(); else openRelated();
    }
  }

  function onPlayerError() {
    showPlayerMsg(t('player.unavailable'));
    setTimeout(function () { if (Screens.top() === Player) playNext(); }, 2500);
  }

  function playNext() {
    for (var i = P.index + 1; i < P.list.length; i++) {
      if (!blockReason(P.list[i])) { P.index = i; startVideo(); return; }
    }
    openRelated();
  }

  // ---------------- Related panel (similar videos + channel) ----------------
  function relatedState(v) {
    if (P.rel && P.rel.id === v.id) return P.rel;
    var rel = P.rel = { id: v.id, rows: [
      { key: 'similar', title: t('rel.similar'), loading: true },
      { key: 'channel', title: t('rel.moreFrom', v.channelTitle), loading: true }
    ] };
    relatedVideos(v).then(function (items) { rel.rows[0].items = items; }, function (e) { rel.rows[0].error = apiErrorText(e); })
      .then(function () { rel.rows[0].loading = false; if (P.rel === rel) renderRelated(); });
    channelInfo({ id: v.channelId }).then(function (ch) {
      rel.ch = ch;
      return channelVideos(ch).then(function (res) { rel.rows[1].items = res.items.filter(function (x) { return x.id !== v.id; }); });
    }).catch(function (e) { rel.rows[1].error = apiErrorText(e); })
      .then(function () { rel.rows[1].loading = false; if (P.rel === rel) renderRelated(); });
    return rel;
  }

  function openRelated() {
    if (!P.video) return;
    relatedState(P.video);
    P.panelOpen = true;
    P.relAutoFocus = true;
    $('osd').classList.remove('visible');
    $('relPanel').classList.add('open');
    $('relPanel').scrollTop = 0;
    var btn = $('relChannelBtn');
    btn.innerHTML = '';
    if (P.rel.ch && P.rel.ch.thumb) { var im = h('img'); im.src = P.rel.ch.thumb; btn.appendChild(im); }
    btn.appendChild(document.createTextNode(t('rel.channelBtn', P.video.channelTitle)));
    btn.style.display = channelBlocked(P.video.channelId, P.video.channelTitle) ? 'none' : '';
    renderRelated(true);
  }

  function closeRelated() {
    if (!P.panelOpen) return;
    P.panelOpen = false;
    $('relPanel').classList.remove('open');
    if (Nav.current) Nav.current.classList.remove('focused');
    Nav.current = null;
    showOsd();
  }

  function renderRelated(resetFocus) {
    if (!P.panelOpen || !P.rel) return;
    var box = $('relRows');
    var cur = Nav.current && box.contains(Nav.current) ? Nav.current : null;
    var keepId = !P.relAutoFocus && cur && cur._video ? cur._video.id : null;
    box.innerHTML = '';
    var target = null;
    P.rel.rows.forEach(function (r) {
      var items = allowed(r.items || []);
      var row = h('div', 'row');
      row.appendChild(h('div', 'row-title', r.title));
      var cards = h('div', 'row-cards');
      if (r.loading) cards.appendChild(h('div', 'spinner'));
      else if (r.error) cards.appendChild(h('div', 'row-msg', r.error));
      else if (!items.length) cards.appendChild(h('div', 'row-msg', t('rel.none')));
      items.slice(0, 30).forEach(function (v, i) {
        var c = makeCard(v, items, i);
        if (keepId && v.id === keepId) target = c;
        cards.appendChild(c);
      });
      if (r.key === 'channel' && P.rel.ch && items.length) cards.appendChild(makeChannelCard(P.rel.ch));
      row.appendChild(cards);
      box.appendChild(row);
    });
    if (Screens.top() !== Player) return;
    if (target) { Nav.set(target); return; }
    var panel = $('relPanel');
    // Rows arrived after the panel opened and the child hasn't moved yet: jump to the first video.
    if (P.relAutoFocus && box.querySelector('.card.f')) resetFocus = true;
    if (resetFocus || !Nav.current || !panel.contains(Nav.current)) Nav.set(box.querySelector('.card.f') || panel.querySelector('.f'));
  }

  function togglePause() {
    if (!P.yt || !P.yt.getPlayerState) return;
    if (P.yt.getPlayerState() === 1) P.yt.pauseVideo();
    else { P.yt.playVideo(); flashIcon('play'); }
  }

  function seek(delta) {
    if (!P.yt || !P.yt.getCurrentTime) return;
    var t = Math.max(0, P.yt.getCurrentTime() + delta);
    P.yt.seekTo(t, true);
    flashIcon(delta > 0 ? 'ff' : 'rew');
    showOsd();
    updateOsd();
  }

  function flashIcon(sym) {
    var ic = $('osdIcon');
    ic.innerHTML = icon(sym);
    ic.classList.add('flash');
    clearTimeout(ic._t);
    ic._t = setTimeout(function () { ic.classList.remove('flash'); }, 700);
  }

  function showOsd(stay) {
    var o = $('osd');
    o.classList.add('visible');
    clearTimeout(P.osdTimer);
    if (!stay) P.osdTimer = setTimeout(function () { if (!P.paused) o.classList.remove('visible'); }, 3500);
  }

  function updateOsd() {
    if (!P.yt || !P.yt.getCurrentTime) return;
    var cur = P.yt.getCurrentTime() || 0, dur = P.yt.getDuration() || (P.video && P.video.duration) || 0;
    $('osdTime').textContent = fmtTime(cur);
    $('osdDur').textContent = fmtTime(dur);
    $('osdBar').style.width = (dur ? Math.min(100, cur / dur * 100) : 0) + '%';
  }

  function showPlayerMsg(t) { var m = $('playerMsg'); m.textContent = t; m.classList.add('shown'); }
  function hidePlayerMsg() { $('playerMsg').classList.remove('shown'); }

  // ---------------- PIN ----------------
  var pinCallback = null;

  var Pin = def('pin', {
    dialog: true,
    onShow: function (o) {
      pinCallback = o.done;
      $('pinTitle').textContent = o.title || t('pin.title');
      $('pinInput').value = '';
      $('pinErr').textContent = '';
      Nav.set($('pinInput'));
      openKeyboard($('pinInput'));
    }
  });

  function requirePin(title, done) {
    if (!S.pin) { done(); return; }
    Screens.push('pin', { title: title, done: done });
  }

  function submitPin() {
    var v = $('pinInput').value.trim();
    if (v === S.pin) {
      Native.hideKeyboard();
      var cb = pinCallback;
      pinCallback = null;
      Screens.pop();
      if (cb) cb();
    } else {
      $('pinErr').textContent = t('pin.wrong');
      $('pinInput').value = '';
    }
  }

  // ---------------- Parent menu ----------------
  var Menu = def('menu', { dialog: true });

  function openParentMenu(v) {
    requirePin(t('pin.menu'), function () {
      $('menuTitle').textContent = v.title;
      var list = $('menuList');
      list.innerHTML = '';
      var opts = [
        [t('menu.blockVideo'), function () {
          if (S.blockedVideos.indexOf(v.id) < 0) S.blockedVideos.push(v.id);
          saveSettings(); toast(t('toast.videoBlocked')); afterBlock();
        }],
        [t('menu.blockChannel', v.channelTitle), function () {
          S.blockedChannels.push(v.channelId ? 'https://www.youtube.com/channel/' + v.channelId : v.channelTitle);
          saveSettings(); toast(t('toast.channelBlocked')); afterBlock();
        }],
        [subscribedIndex(v.channelId) >= 0 ? t('menu.unsubscribe') : t('menu.subscribe'), function () {
          toggleSubscribe(v.channelId); Screens.pop();
        }],
        [t('cancel'), function () { Screens.pop(); }]
      ];
      opts.forEach(function (o) {
        var b = h('button', 'btn f', o[0]);
        b._run = o[1];
        list.appendChild(b);
      });
      Screens.push('menu');
    });
  }

  function afterBlock() {
    Screens.pop(); // menu
    if (Screens.top() === Player) {
      if (blockReason(P.video)) { closeRelated(); playNext(); }
      else renderRelated();
    }
    refreshVisible();
  }

  function refreshVisible() {
    if (Screens.defs.home.el.classList.contains('shown') || Screens.stack.indexOf(Home) >= 0) renderHomeRows();
    if (Screens.stack.indexOf(Results) >= 0) renderResults(false);
    if (Screens.stack.indexOf(Channel) >= 0) renderChannel(false);
    if (Screens.stack.indexOf(Player) >= 0) renderRelated();
  }

  // ---------------- Setup (first run) ----------------
  var Setup = def('setup', {
    onShow: function () { showRemote('setupQr', 'setupUrl', 10); }
  });

  function showRemote(qrId, urlId, size) {
    var url = '';
    try { url = Native.remoteUrl() || ''; } catch (e) {}
    if (!url) {
      // The server may still be starting; try again shortly.
      $(urlId).textContent = t('setup.wifi');
      setTimeout(function () { if ($(urlId).offsetParent) showRemote(qrId, urlId, size); }, 1500);
      return;
    }
    $(urlId).textContent = url;
    try {
      var qr = qrcode(0, 'M');
      qr.addData(url);
      qr.make();
      $(qrId).innerHTML = qr.createSvgTag(6, 2);
    } catch (e) { $(qrId).innerHTML = ''; }
  }

  // ---------------- Settings (TV) ----------------
  var FIELDS = [
    { key: 'lang', label: 'f.lang', type: 'choice', options: I18N.languages },
    { key: 'apiKey', label: 'f.apiKey', type: 'text' },
    { key: 'pin', label: 'f.pin', type: 'pin' },
    { section: 'f.secBlock' },
    { key: 'blockedWords', label: 'f.words', type: 'list', hint: 'f.wordsHint' },
    { key: 'blockedChannels', label: 'f.channels', type: 'list' },
    { key: 'blockedVideos', label: 'f.videos', type: 'list' },
    { key: 'checkTitle', label: 'f.checkTitle', type: 'bool' },
    { key: 'checkTags', label: 'f.checkTags', type: 'bool' },
    { key: 'checkDescription', label: 'f.checkDescription', type: 'bool' },
    { key: 'checkChannel', label: 'f.checkChannel', type: 'bool' },
    { key: 'onlyKids', label: 'f.onlyKids', type: 'bool' },
    { key: 'hideShort', label: 'f.hideShort', type: 'bool' },
    { section: 'f.secHome' },
    { key: 'homeChannels', label: 'f.homeChannels', type: 'list' },
    { key: 'homeQueries', label: 'f.homeQueries', type: 'list' },
    { key: 'autoplayNext', label: 'f.autoplay', type: 'bool' }
  ];

  var Settings = def('settings', {
    onShow: function () {
      showRemote('settingsQr', 'settingsUrl', 7);
      renderUpdate();
      $('quotaInfo').textContent = t('set.quota', quotaUsed(), Native.version());
      buildSettingsForm();
      this.el.querySelector('.scroller').scrollTop = 0;
    }
  });

  function buildSettingsForm() {
    var form = $('settingsForm');
    form.innerHTML = '';
    FIELDS.forEach(function (f) {
      if (f.section) { form.appendChild(h('div', 'section-title', t(f.section))); return; }
      if (f.type === 'bool') {
        var tg = h('button', 'toggle f' + (S[f.key] ? ' on' : ''));
        tg.appendChild(h('span', '', t(f.label)));
        tg.appendChild(h('span', 'sw'));
        tg._field = f;
        tg._value = !!S[f.key];
        form.appendChild(tg);
        return;
      }
      if (f.type === 'choice') {
        var ch = h('button', 'toggle choice f');
        ch.appendChild(h('span', '', t(f.label)));
        ch._val = h('span', 'choice-val');
        ch.appendChild(ch._val);
        ch._field = f;
        ch._value = S[f.key];
        ch._show = function () {
          var self = this;
          var o = f.options.filter(function (x) { return x[0] === self._value; })[0] || f.options[0];
          this._val.textContent = '◀ ' + o[1] + ' ▶';
        };
        ch._show();
        form.appendChild(ch);
        return;
      }
      var box = h('div', 'field f');
      box.appendChild(h('label', '', t(f.label)));
      var inp = h('input');
      inp.type = f.type === 'pin' ? 'text' : 'text';
      if (f.type === 'pin') inp.inputMode = 'numeric';
      inp.value = f.type === 'list' ? S[f.key].join(', ') : (S[f.key] || '');
      inp.autocomplete = 'off';
      box.appendChild(inp);
      if (f.hint) box.appendChild(h('div', 'hint', t(f.hint)));
      box._field = f;
      form.appendChild(box);
    });
  }

  function saveSettingsForm() {
    var form = $('settingsForm');
    var next = {};
    var nodes = form.children;
    for (var i = 0; i < nodes.length; i++) {
      var n = nodes[i], f = n._field;
      if (!f) continue;
      if (f.type === 'bool' || f.type === 'choice') next[f.key] = n._value;
      else if (f.type === 'list') next[f.key] = toList(n.querySelector('input').value);
      else next[f.key] = n.querySelector('input').value.trim();
    }
    if (!/^\d{4,8}$/.test(next.pin)) { toast(t('toast.pinFormat')); return; }
    if (!next.apiKey) { toast(t('toast.needKey')); return; }
    for (var k in next) S[k] = next[k];
    S.blockedVideos = S.blockedVideos.map(videoIdFrom).filter(Boolean);
    saveSettings();
    applyLanguage();
    Native.hideKeyboard();
    toast(t('toast.saved'));
    goHome();
  }

  function openSettings() {
    requirePin(t('pin.settings'), function () { Screens.push('settings'); });
  }

  function goHome() {
    if (!S.apiKey) { Screens.replaceAll('setup'); return; }
    Screens.replaceAll('home');
  }

  // ===================================================================================
  // Keyboard / input helpers
  // ===================================================================================
  function openKeyboard(inp) {
    if (!inp) return;
    inp.focus();
    try { var l = inp.value.length; inp.setSelectionRange(l, l); } catch (e) {}
    Native.showKeyboard();
  }

  function startVoice() { Native.startVoice(); }

  function doSearchFrom(inp) {
    var q = inp.value.trim();
    if (!q) return;
    inp.blur();
    Native.hideKeyboard();
    openSearch(q);
  }

  // Enter / "search" on the on-screen keyboard.
  document.addEventListener('keydown', function (e) {
    var t = e.target;
    if (t && t.tagName === 'INPUT' && (e.key === 'Enter' || e.keyCode === 13)) {
      e.preventDefault();
      if (t.id === 'resultsSearch') doSearchFrom(t);
      else if (t.id === 'pinInput') submitPin();
      else { t.blur(); Native.hideKeyboard(); }
    }
  }, true);

  // ===================================================================================
  // Actions on OK
  // ===================================================================================
  function activate(el) {
    if (!el) return;
    // Short "pressed" feedback so the child sees the button reacted.
    el.classList.add('pressed');
    setTimeout(function () { el.classList.remove('pressed'); }, 140);
    var section = el.getAttribute && el.getAttribute('data-section');
    if (section) { openSection(section); return; }
    if (el._section) { openSection(el._section); return; }
    if (el._query) { runSearch(el._query); return; }
    if (el._video) {
      if (Screens.top() === Player) { closeRelated(); P.list = el._list; P.index = el._index; startVideo(); }
      else play(el._list, el._index);
      return;
    }
    if (el._channel) { openChannel(el._channel); return; }
    if (el._more) { if (Screens.top() === Channel) loadMoreChannel(); else loadMore(); return; }
    if (el._run) { el._run(); return; }
    if (el._field && el._field.type === 'choice') {
      var opts = el._field.options, idx = 0;
      for (var oi = 0; oi < opts.length; oi++) if (opts[oi][0] === el._value) idx = oi;
      el._value = opts[(idx + 1) % opts.length][0];
      el._show();
      return;
    }
    if (el._field && el._field.type === 'bool') {
      el._value = !el._value;
      el.classList.toggle('on', el._value);
      return;
    }
    var inp = inputOf(el);
    var action = el.getAttribute('data-action');
    if (action === 'voice') return startVoice();
    if (action === 'settings') return openSettings();
    if (action === 'settings-direct') return Screens.push('settings');
    if (action === 'settings-save') return saveSettingsForm();
    if (action === 'back') return handleBack();
    if (action === 'pin-ok') return submitPin();
    if (action === 'upd-check') return checkUpdates(false);
    if (action === 'upd-install') return installUpdate();
    if (action === 'subscribe') { if (C.id) { toggleSubscribe(C.id); updateSubButton(); } return; }
    if (action === 'rel-close') return closeRelated();
    if (action === 'rel-channel') return openChannel(P.rel && P.rel.ch ? P.rel.ch : { id: P.video.channelId, title: P.video.channelTitle });
    if (action === 'clear-cache') { pruneCache(true); toast(t('toast.cacheCleared')); return; }
    if (action === 'clear-history') { Native.clearHistory(); toast(t('toast.historyCleared')); return; }
    if (inp) openKeyboard(inp);
  }

  function handleBack() {
    var s = Screens.top();
    if (s === Pin) pinCallback = null;
    if (Screens.pop()) return true;
    return false;
  }

  // ===================================================================================
  // Public API used by the native side
  // ===================================================================================
  var kt = window.kt = {
    key: function (k) {
      var s = Screens.top();
      if (s && s.onKey) {
        var r = s.onKey(k);
        if (r === true) return true;
        if (r === false) return false;
      }
      switch (k) {
        case 'up': case 'down': case 'left': case 'right':
          Nav.move(k); return true;
        case 'ok': activate(Nav.current); return true;
        case 'longok': case 'menu':
          if (Nav.current && Nav.current._video) openParentMenu(Nav.current._video);
          return true;
        case 'voice': startVoice(); return true;
        case 'back': return handleBack();
        case 'playpause': case 'play':
          if (Nav.current && Nav.current._video) activate(Nav.current);
          return true;
      }
      return true;
    },
    onVoice: function (text) {
      text = String(text || '').trim();
      if (!text) return;
      var top = Screens.top();
      if (top === Player || top.dialog) return;
      openSearch(text);
    },
    onNative: function (id, ok, data) {
      var cb = nativeCalls[id];
      delete nativeCalls[id];
      if (cb) cb(ok, data);
    },
    onUpdateProgress: function (p) { if (Upd.busy) updInfo(t('upd.progress', p)); },
    onUpdateError: function (msg) { Upd.busy = false; updInfo(msg); toast(msg); },
    onVoiceError: function () { toast(t('toast.noVoice')); },
    onPause: function () { try { if (P.yt && Screens.top() === Player) P.yt.pauseVideo(); } catch (e) {} },
    onSettingsChanged: function () {
      loadSettings();
      var top = Screens.top();
      if (top === Setup || top === Settings) { toast(t('toast.remoteSaved')); goHome(); return; }
      if (Screens.stack.indexOf(Home) >= 0) buildHome();
      refreshVisible();
      toast(t('toast.updated'));
    }
  };

  // Dev/desktop: allow the keyboard arrows when running outside the TV app.
  if (!window.Android) {
    var map = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', Enter: 'ok', Escape: 'back', m: 'menu' };
    document.addEventListener('keydown', function (e) {
      if (e.target && e.target.tagName === 'INPUT' && e.key !== 'ArrowUp' && e.key !== 'ArrowDown' && e.key !== 'Escape') return;
      var k = map[e.key];
      if (k) { e.preventDefault(); kt.key(k); }
    });
  }

  // ===================================================================================
  // Toast & start
  // ===================================================================================
  function toast(t) {
    var el = $('toast');
    el.textContent = t;
    el.classList.add('shown');
    clearTimeout(el._t);
    el._t = setTimeout(function () { el.classList.remove('shown'); }, 3000);
  }

  pruneCache(false);
  loadSettings();
  goHome();
  autoCheckUpdates();
})();
