package app.kidstube.tv;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageInstaller;
import android.graphics.Bitmap;
import android.os.Build;
import android.provider.Settings;
import android.net.Uri;
import android.os.Bundle;
import android.speech.RecognizerIntent;
import android.view.KeyEvent;
import android.view.WindowManager;
import android.view.inputmethod.InputMethodManager;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import org.json.JSONObject;

import java.io.ByteArrayInputStream;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Hosts the TV interface (assets/web) in a WebView served from a fake https origin,
 * forwards remote-control keys to JavaScript and exposes a small native bridge.
 */
public class MainActivity extends Activity {

    static final String HOST = "app.kidstube.tv";
    static final String START_URL = "https://" + HOST + "/index.html";
    private static final int REQ_VOICE = 1;

    private WebView web;
    private SettingsServer server;
    private boolean okLongFired;
    private final ExecutorService pool = Executors.newFixedThreadPool(3);

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_FULLSCREEN);

        web = new WebView(this);
        web.setBackgroundColor(0xFF0F1420);
        setContentView(web);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setSupportZoom(false);
        s.setBuiltInZoomControls(false);
        s.setTextZoom(100);

        web.addJavascriptInterface(new Bridge(), "Android");
        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public Bitmap getDefaultVideoPoster() {
                return Bitmap.createBitmap(1, 1, Bitmap.Config.ARGB_8888);
            }
        });
        web.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                Uri u = request.getUrl();
                if (HOST.equals(u.getHost())) return serveAsset(u.getPath());
                return null;
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                // Never let the main window navigate away (e.g. to youtube.com).
                return request.isForMainFrame() && !HOST.equals(request.getUrl().getHost());
            }

            @Override
            @SuppressWarnings("deprecation")
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                return !HOST.equals(Uri.parse(url).getHost());
            }
        });

        web.loadUrl(START_URL);
        web.requestFocus();

        server = new SettingsServer(this);
        server.start();
        handleInstallStatus(getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        handleInstallStatus(intent);
    }

    /** Result of an in-app update handed to the system installer. */
    private void handleInstallStatus(Intent intent) {
        if (intent == null || !Updater.ACTION_INSTALL_STATUS.equals(intent.getAction())) return;
        int status = intent.getIntExtra(PackageInstaller.EXTRA_STATUS, PackageInstaller.STATUS_FAILURE);
        if (status == PackageInstaller.STATUS_PENDING_USER_ACTION) {
            Intent confirm = intent.getParcelableExtra(Intent.EXTRA_INTENT);
            if (confirm != null) {
                confirm.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                try {
                    startActivity(confirm);
                } catch (Exception e) {
                    js("window.kt && kt.onUpdateError(" + JSONObject.quote(Store.tr(this, "Could not open the installer", "Не удалось открыть установщик")) + ")");
                }
            }
        } else if (status != PackageInstaller.STATUS_SUCCESS) {
            String msg = intent.getStringExtra(PackageInstaller.EXTRA_STATUS_MESSAGE);
            js("window.kt && kt.onUpdateError(" + JSONObject.quote(status == PackageInstaller.STATUS_FAILURE_ABORTED
                    ? Store.tr(this, "Installation cancelled", "Установка отменена")
                    : Store.tr(this, "Installation failed", "Установка не удалась") + (msg == null ? "" : ": " + msg)) + ")");
        }
    }

    private WebResourceResponse serveAsset(String path) {
        if (path == null || path.equals("/") || path.isEmpty()) path = "/index.html";
        String name = "web" + path;
        Map<String, String> headers = new HashMap<String, String>();
        headers.put("Cache-Control", "no-cache");
        try {
            InputStream in = getAssets().open(name);
            return new WebResourceResponse(mime(name), "utf-8", 200, "OK", headers, in);
        } catch (Exception e) {
            return new WebResourceResponse("text/plain", "utf-8", 404, "Not Found", headers,
                    new ByteArrayInputStream(new byte[0]));
        }
    }

    static String mime(String name) {
        if (name.endsWith(".html")) return "text/html";
        if (name.endsWith(".js")) return "application/javascript";
        if (name.endsWith(".css")) return "text/css";
        if (name.endsWith(".svg")) return "image/svg+xml";
        if (name.endsWith(".png")) return "image/png";
        if (name.endsWith(".json")) return "application/json";
        return "application/octet-stream";
    }

    // ---- Remote control ---------------------------------------------------------------

    private static String keyName(int code) {
        switch (code) {
            case KeyEvent.KEYCODE_DPAD_UP: return "up";
            case KeyEvent.KEYCODE_DPAD_DOWN: return "down";
            case KeyEvent.KEYCODE_DPAD_LEFT: return "left";
            case KeyEvent.KEYCODE_DPAD_RIGHT: return "right";
            case KeyEvent.KEYCODE_DPAD_CENTER:
            case KeyEvent.KEYCODE_ENTER:
            case KeyEvent.KEYCODE_NUMPAD_ENTER: return "ok";
            case KeyEvent.KEYCODE_BACK: return "back";
            case KeyEvent.KEYCODE_MENU: return "menu";
            case KeyEvent.KEYCODE_SEARCH: return "voice";
            case KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE:
            case KeyEvent.KEYCODE_HEADSETHOOK: return "playpause";
            case KeyEvent.KEYCODE_MEDIA_PLAY: return "play";
            case KeyEvent.KEYCODE_MEDIA_PAUSE: return "pause";
            case KeyEvent.KEYCODE_MEDIA_FAST_FORWARD: return "ff";
            case KeyEvent.KEYCODE_MEDIA_REWIND: return "rew";
            case KeyEvent.KEYCODE_MEDIA_NEXT: return "next";
            default: return null;
        }
    }

    @Override
    public boolean dispatchKeyEvent(KeyEvent e) {
        String name = keyName(e.getKeyCode());
        if (name == null) return super.dispatchKeyEvent(e);
        int action = e.getAction();

        if (name.equals("ok")) {
            // Short press -> "ok" on release; holding -> "longok" once.
            if (action == KeyEvent.ACTION_DOWN) {
                if (e.getRepeatCount() == 0) okLongFired = false;
                else if (!okLongFired) { okLongFired = true; sendKey("longok"); }
            } else if (action == KeyEvent.ACTION_UP && !okLongFired) {
                sendKey("ok");
            }
            return true;
        }

        if (name.equals("back")) {
            if (action == KeyEvent.ACTION_UP) {
                web.evaluateJavascript("(window.kt ? !!kt.key('back') : false)", new ValueCallback<String>() {
                    @Override
                    public void onReceiveValue(String value) {
                        if (!"true".equals(value)) finish();
                    }
                });
            }
            return true;
        }

        if (action == KeyEvent.ACTION_DOWN) sendKey(name);
        return true;
    }

    private void sendKey(String name) {
        js("window.kt && kt.key('" + name + "')");
    }

    void js(final String code) {
        runOnUiThread(new Runnable() {
            @Override
            public void run() {
                if (web != null) web.evaluateJavascript(code, null);
            }
        });
    }

    void onSettingsChangedRemotely() {
        js("window.kt && kt.onSettingsChanged()");
    }

    // ---- Lifecycle --------------------------------------------------------------------

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode != REQ_VOICE) return;
        if (resultCode == RESULT_OK && data != null) {
            ArrayList<String> res = data.getStringArrayListExtra(RecognizerIntent.EXTRA_RESULTS);
            if (res != null && !res.isEmpty()) {
                js("window.kt && kt.onVoice(" + JSONObject.quote(res.get(0)) + ")");
            }
        }
    }

    @Override
    protected void onPause() {
        js("window.kt && kt.onPause()");
        super.onPause();
    }

    @Override
    protected void onDestroy() {
        if (server != null) server.stop();
        pool.shutdownNow();
        if (web != null) web.destroy();
        web = null;
        super.onDestroy();
    }

    // ---- JavaScript bridge ------------------------------------------------------------

    class Bridge {
        @JavascriptInterface
        public String getSettings() {
            return Store.get(MainActivity.this);
        }

        @JavascriptInterface
        public String saveSettings(String json) {
            try {
                new JSONObject(json);
                Store.save(MainActivity.this, json);
                return "ok";
            } catch (Exception e) {
                return "error";
            }
        }

        // ---- YouTube internal API (async: the answer comes back through kt.onNative) ----

        @JavascriptInterface
        public void innertube(final String callId, final String kind, final String arg, final String continuation) {
            pool.execute(new Runnable() {
                @Override
                public void run() {
                    String ok = "false", payload;
                    try {
                        String lang = Store.lang(MainActivity.this);
                        JSONObject res = "related".equals(kind)
                                ? InnerTube.related(arg, lang)
                                : InnerTube.search(arg, continuation, lang);
                        ok = "true";
                        payload = res.toString();
                    } catch (Throwable e) {
                        payload = JSONObject.quote(String.valueOf(e.getMessage()));
                    }
                    js("window.kt && kt.onNative(" + JSONObject.quote(callId) + "," + ok + "," + payload + ")");
                }
            });
        }

        // ---- In-app updates from GitHub releases ----

        @JavascriptInterface
        public void checkUpdate(final String callId) {
            pool.execute(new Runnable() {
                @Override
                public void run() {
                    try {
                        JSONObject res = Updater.check(MainActivity.this);
                        js("window.kt && kt.onNative(" + JSONObject.quote(callId) + ",true," + res + ")");
                    } catch (Throwable e) {
                        js("window.kt && kt.onNative(" + JSONObject.quote(callId) + ",false," + JSONObject.quote(String.valueOf(e.getMessage())) + ")");
                    }
                }
            });
        }

        @JavascriptInterface
        public void installUpdate(final String callId, final String url) {
            if (Build.VERSION.SDK_INT >= 26 && !getPackageManager().canRequestPackageInstalls()) {
                // The parent has to allow KidsTube to install apps once.
                runOnUiThread(new Runnable() {
                    @Override
                    public void run() {
                        try {
                            startActivity(new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                                    Uri.parse("package:" + getPackageName())));
                        } catch (Exception ignored) {
                        }
                    }
                });
                js("window.kt && kt.onNative(" + JSONObject.quote(callId) + ",false,'need-permission')");
                return;
            }
            pool.execute(new Runnable() {
                @Override
                public void run() {
                    try {
                        Updater.downloadAndInstall(MainActivity.this, url, new Updater.Progress() {
                            @Override
                            public void onProgress(int percent) {
                                js("window.kt && kt.onUpdateProgress(" + percent + ")");
                            }
                        });
                        js("window.kt && kt.onNative(" + JSONObject.quote(callId) + ",true,'started')");
                    } catch (Throwable e) {
                        js("window.kt && kt.onNative(" + JSONObject.quote(callId) + ",false," + JSONObject.quote(String.valueOf(e.getMessage())) + ")");
                    }
                }
            });
        }

        // ---- Watch history ----

        @JavascriptInterface
        public String getHistory() {
            return Store.getHistory(MainActivity.this);
        }

        @JavascriptInterface
        public void addHistory(String videoJson) {
            Store.addHistory(MainActivity.this, videoJson);
        }

        @JavascriptInterface
        public void clearHistory() {
            Store.clearHistory(MainActivity.this);
        }

        @JavascriptInterface
        public String remoteUrl() {
            return server == null ? "" : server.url();
        }

        @JavascriptInterface
        public void showKeyboard() {
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    web.requestFocus();
                    InputMethodManager imm = (InputMethodManager) getSystemService(Context.INPUT_METHOD_SERVICE);
                    if (imm != null) imm.showSoftInput(web, InputMethodManager.SHOW_FORCED);
                }
            });
        }

        @JavascriptInterface
        public void hideKeyboard() {
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    InputMethodManager imm = (InputMethodManager) getSystemService(Context.INPUT_METHOD_SERVICE);
                    if (imm != null) imm.hideSoftInputFromWindow(web.getWindowToken(), 0);
                }
            });
        }

        @JavascriptInterface
        public void startVoice() {
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    Intent i = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
                    i.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
                    boolean ru = "ru".equals(Store.lang(MainActivity.this));
                    i.putExtra(RecognizerIntent.EXTRA_LANGUAGE, ru ? "ru-RU" : "en-US");
                    i.putExtra(RecognizerIntent.EXTRA_PROMPT, ru ? "Что ищем?" : "What shall we watch?");
                    try {
                        startActivityForResult(i, REQ_VOICE);
                    } catch (ActivityNotFoundException e) {
                        js("window.kt && kt.onVoiceError()");
                    }
                }
            });
        }

        @JavascriptInterface
        public void keepScreenOn(final boolean on) {
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    if (on) getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
                    else getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
                }
            });
        }

        @JavascriptInterface
        public String version() {
            try {
                return getPackageManager().getPackageInfo(getPackageName(), 0).versionName;
            } catch (Exception e) {
                return "";
            }
        }

        @JavascriptInterface
        public void exit() {
            finish();
        }
    }
}
