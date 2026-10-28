package app.kidstube.tv;

import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageInfo;
import android.content.pm.PackageInstaller;
import android.os.Build;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * In-app updates from the GitHub releases of the project. CI publishes every build as the
 * "latest" release with a line "versionCode: N" in its notes and the KidsTube.apk asset.
 */
final class Updater {
    /** owner/repo on GitHub; the repository (or at least its releases) must be public. */
    static final String REPO = "hametovbr/kidstube";
    static final String ACTION_INSTALL_STATUS = "app.kidstube.tv.INSTALL_STATUS";

    private static final String API = "https://api.github.com/repos/" + REPO + "/releases/latest";
    private static final Pattern VERSION_CODE = Pattern.compile("versionCode\\s*[:=]\\s*(\\d+)");

    interface Progress {
        void onProgress(int percent);
    }

    private Updater() {}

    static int currentVersionCode(Context c) {
        try {
            PackageInfo p = c.getPackageManager().getPackageInfo(c.getPackageName(), 0);
            return p.versionCode;
        } catch (Exception e) {
            return 0;
        }
    }

    static String currentVersionName(Context c) {
        try {
            return c.getPackageManager().getPackageInfo(c.getPackageName(), 0).versionName;
        } catch (Exception e) {
            return "";
        }
    }

    /** {available, current, latestCode, latestName, notes, url, size, published} */
    static JSONObject check(Context c) throws Exception {
        HttpURLConnection conn = (HttpURLConnection) new URL(API).openConnection();
        JSONObject rel;
        try {
            conn.setConnectTimeout(12000);
            conn.setReadTimeout(20000);
            conn.setRequestProperty("Accept", "application/vnd.github+json");
            conn.setRequestProperty("User-Agent", "KidsTube-Updater");
            int code = conn.getResponseCode();
            if (code == 404) throw new Exception("На GitHub нет опубликованной версии (или репозиторий закрыт)");
            if (code != 200) throw new Exception("GitHub ответил " + code);
            rel = new JSONObject(readAll(conn.getInputStream()));
        } finally {
            conn.disconnect();
        }

        String body = rel.optString("body", "") + "\n" + rel.optString("name", "");
        Matcher m = VERSION_CODE.matcher(body);
        int latest = m.find() ? Integer.parseInt(m.group(1)) : 0;

        String url = null;
        long size = 0;
        JSONArray assets = rel.optJSONArray("assets");
        for (int i = 0; assets != null && i < assets.length(); i++) {
            JSONObject a = assets.getJSONObject(i);
            if (a.optString("name", "").toLowerCase().endsWith(".apk")) {
                url = a.optString("browser_download_url");
                size = a.optLong("size");
                break;
            }
        }

        int current = currentVersionCode(c);
        JSONObject res = new JSONObject();
        res.put("current", current);
        res.put("currentName", currentVersionName(c));
        res.put("latestCode", latest);
        res.put("latestName", rel.optString("name", ""));
        res.put("notes", rel.optString("body", ""));
        res.put("published", rel.optString("published_at", ""));
        res.put("url", url == null ? JSONObject.NULL : url);
        res.put("size", size);
        res.put("available", url != null && latest > current);
        return res;
    }

    /** Downloads the APK and hands it to the system installer (the user confirms on screen). */
    static void downloadAndInstall(Context c, String url, Progress progress) throws Exception {
        File dir = new File(c.getCacheDir(), "update");
        dir.mkdirs();
        File apk = new File(dir, "KidsTube.apk");

        HttpURLConnection conn = (HttpURLConnection) new URL(url).openConnection();
        try {
            conn.setInstanceFollowRedirects(true);
            conn.setConnectTimeout(15000);
            conn.setReadTimeout(30000);
            conn.setRequestProperty("User-Agent", "KidsTube-Updater");
            int code = conn.getResponseCode();
            if (code != 200) throw new Exception("Не удалось скачать обновление (" + code + ")");
            long total = conn.getContentLength();
            InputStream in = conn.getInputStream();
            OutputStream out = new FileOutputStream(apk);
            byte[] buf = new byte[65536];
            long done = 0;
            int n, last = -1;
            while ((n = in.read(buf)) > 0) {
                out.write(buf, 0, n);
                done += n;
                if (total > 0) {
                    int pct = (int) (done * 100 / total);
                    if (pct != last) { last = pct; progress.onProgress(pct); }
                }
            }
            out.close();
            in.close();
        } finally {
            conn.disconnect();
        }

        PackageInstaller installer = c.getPackageManager().getPackageInstaller();
        PackageInstaller.SessionParams params =
                new PackageInstaller.SessionParams(PackageInstaller.SessionParams.MODE_FULL_INSTALL);
        params.setAppPackageName(c.getPackageName());
        int sessionId = installer.createSession(params);
        PackageInstaller.Session session = installer.openSession(sessionId);
        try {
            OutputStream out = session.openWrite("KidsTube.apk", 0, apk.length());
            InputStream in = new FileInputStream(apk);
            byte[] buf = new byte[65536];
            int n;
            while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
            in.close();
            session.fsync(out);
            out.close();

            Intent status = new Intent(c, MainActivity.class).setAction(ACTION_INSTALL_STATUS);
            int flags = PendingIntent.FLAG_UPDATE_CURRENT;
            if (Build.VERSION.SDK_INT >= 31) flags |= PendingIntent.FLAG_MUTABLE;
            PendingIntent pi = PendingIntent.getActivity(c, sessionId, status, flags);
            session.commit(pi.getIntentSender());
        } catch (Exception e) {
            session.abandon();
            throw e;
        } finally {
            session.close();
        }
    }

    private static String readAll(InputStream in) throws Exception {
        ByteArrayOutputStream buf = new ByteArrayOutputStream();
        byte[] b = new byte[16384];
        int n;
        while ((n = in.read(b)) > 0) buf.write(b, 0, n);
        in.close();
        return buf.toString("UTF-8");
    }
}
