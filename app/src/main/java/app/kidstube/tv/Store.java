package app.kidstube.tv;

import android.content.Context;
import android.content.SharedPreferences;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.ByteArrayOutputStream;

/** Settings are kept as one JSON string; the JavaScript side owns the schema. */
final class Store {
    private static final String PREFS = "kidstube";
    private static final String KEY = "settings";

    private Store() {}

    static synchronized String get(Context c) {
        return prefs(c).getString(KEY, "{}");
    }

    static synchronized void save(Context c, String json) {
        prefs(c).edit().putString(KEY, json).commit();
    }

    // ---- Watch history: newest first, kept in a file so parents can see it from the phone ----

    private static final int HISTORY_MAX = 300;

    static synchronized String getHistory(Context c) {
        try {
            File f = historyFile(c);
            if (!f.exists()) return "[]";
            FileInputStream in = new FileInputStream(f);
            ByteArrayOutputStream buf = new ByteArrayOutputStream();
            byte[] b = new byte[8192];
            int n;
            while ((n = in.read(b)) > 0) buf.write(b, 0, n);
            in.close();
            String s = buf.toString("UTF-8");
            new JSONArray(s);
            return s;
        } catch (Exception e) {
            return "[]";
        }
    }

    /** Adds a watched video (JSON object with at least "id") to the top of the history. */
    static synchronized void addHistory(Context c, String videoJson) {
        try {
            JSONObject v = new JSONObject(videoJson);
            String id = v.optString("id", "");
            if (id.isEmpty()) return;
            JSONArray old = new JSONArray(getHistory(c));
            JSONArray out = new JSONArray();
            int count = 1;
            for (int i = 0; i < old.length(); i++) {
                JSONObject o = old.optJSONObject(i);
                if (o == null) continue;
                if (id.equals(o.optString("id"))) count = o.optInt("count", 1) + 1;
            }
            v.put("watchedAt", System.currentTimeMillis());
            v.put("count", count);
            out.put(v);
            for (int i = 0; i < old.length() && out.length() < HISTORY_MAX; i++) {
                JSONObject o = old.optJSONObject(i);
                if (o != null && !id.equals(o.optString("id"))) out.put(o);
            }
            write(historyFile(c), out.toString());
        } catch (Exception ignored) {
        }
    }

    static synchronized void clearHistory(Context c) {
        historyFile(c).delete();
    }

    private static File historyFile(Context c) {
        return new File(c.getApplicationContext().getFilesDir(), "history.json");
    }

    private static void write(File f, String s) throws Exception {
        File tmp = new File(f.getPath() + ".tmp");
        FileOutputStream out = new FileOutputStream(tmp);
        out.write(s.getBytes("UTF-8"));
        out.close();
        if (!tmp.renameTo(f)) {
            f.delete();
            tmp.renameTo(f);
        }
    }

    private static SharedPreferences prefs(Context c) {
        return c.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }
}
