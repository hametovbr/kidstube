package app.kidstube.tv;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.ArrayList;
import java.util.Iterator;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

/**
 * YouTube's internal web API (the one youtube.com itself uses). Free and without quota, but
 * unofficial: it is only used to get video IDs for search and "up next" recommendations.
 * Every video is then checked through the official Data API before it is shown.
 */
final class InnerTube {
    static final String CLIENT_VERSION = "2.20261019.01.00";
    private static final String BASE = "https://www.youtube.com/youtubei/v1/";
    private static final String UA =
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36";
    /** Search filter "type: video". */
    private static final String VIDEOS_ONLY = "EgIQAfABAQ%3D%3D";

    private InnerTube() {}

    /** Search: returns {"ids":[...], "next": token|null}. */
    static JSONObject search(String query, String continuation) throws Exception {
        JSONObject body = new JSONObject();
        body.put("context", context());
        if (continuation != null && !continuation.isEmpty()) {
            body.put("continuation", continuation);
        } else {
            body.put("query", query);
            body.put("params", VIDEOS_ONLY);
        }
        return extract(post("search", body));
    }

    /** "Up next" recommendations for a video: returns {"ids":[...], "next": null}. */
    static JSONObject related(String videoId) throws Exception {
        JSONObject body = new JSONObject();
        body.put("context", context());
        body.put("videoId", videoId);
        body.put("contentCheckOk", true);
        body.put("racyCheckOk", false);
        JSONObject res = extract(post("next", body));
        // Never recommend the video that is being watched.
        JSONArray ids = res.getJSONArray("ids");
        JSONArray out = new JSONArray();
        for (int i = 0; i < ids.length(); i++) if (!videoId.equals(ids.getString(i))) out.put(ids.getString(i));
        res.put("ids", out);
        res.put("next", JSONObject.NULL);
        return res;
    }

    private static JSONObject context() throws Exception {
        JSONObject client = new JSONObject();
        client.put("clientName", "WEB");
        client.put("clientVersion", CLIENT_VERSION);
        client.put("hl", "ru");
        client.put("gl", "RU");
        client.put("platform", "DESKTOP");
        client.put("originalUrl", "https://www.youtube.com");
        client.put("utcOffsetMinutes", 180);
        JSONObject user = new JSONObject();
        // Restricted mode, same as the "safety mode" switch on youtube.com.
        user.put("enableSafetyMode", true);
        user.put("lockedSafetyMode", true);
        JSONObject ctx = new JSONObject();
        ctx.put("client", client);
        ctx.put("user", user);
        return ctx;
    }

    private static String post(String endpoint, JSONObject body) throws Exception {
        HttpURLConnection c = (HttpURLConnection) new URL(BASE + endpoint + "?prettyPrint=false").openConnection();
        try {
            c.setConnectTimeout(12000);
            c.setReadTimeout(20000);
            c.setRequestMethod("POST");
            c.setDoOutput(true);
            c.setRequestProperty("Content-Type", "application/json");
            c.setRequestProperty("User-Agent", UA);
            c.setRequestProperty("Accept-Language", "ru-RU,ru;q=0.9");
            c.setRequestProperty("Origin", "https://www.youtube.com");
            c.setRequestProperty("Referer", "https://www.youtube.com/");
            c.setRequestProperty("X-YouTube-Client-Name", "1");
            c.setRequestProperty("X-YouTube-Client-Version", CLIENT_VERSION);
            byte[] data = body.toString().getBytes("UTF-8");
            OutputStream out = c.getOutputStream();
            out.write(data);
            out.close();
            int code = c.getResponseCode();
            if (code != 200) throw new Exception("HTTP " + code);
            InputStream in = c.getInputStream();
            ByteArrayOutputStream buf = new ByteArrayOutputStream();
            byte[] b = new byte[16384];
            int n;
            while ((n = in.read(b)) > 0) buf.write(b, 0, n);
            in.close();
            return buf.toString("UTF-8");
        } finally {
            c.disconnect();
        }
    }

    /** Pulls video IDs (in page order) and the "load more" token out of a raw response. */
    static JSONObject extract(String json) throws Exception {
        Set<String> ids = new LinkedHashSet<String>();
        String[] token = new String[1];
        walk(new JSONObject(json), ids, token);
        JSONObject res = new JSONObject();
        List<String> list = new ArrayList<String>(ids);
        res.put("ids", new JSONArray(list));
        res.put("next", token[0] == null ? JSONObject.NULL : token[0]);
        return res;
    }

    private static void walk(Object node, Set<String> ids, String[] token) {
        if (node instanceof JSONArray) {
            JSONArray a = (JSONArray) node;
            for (int i = 0; i < a.length(); i++) walk(a.opt(i), ids, token);
            return;
        }
        if (!(node instanceof JSONObject)) return;
        JSONObject o = (JSONObject) node;
        Iterator<String> keys = o.keys();
        while (keys.hasNext()) {
            String k = keys.next();
            Object v = o.opt(k);
            if (v instanceof JSONObject) {
                JSONObject child = (JSONObject) v;
                if (k.equals("videoRenderer") || k.equals("compactVideoRenderer") || k.equals("gridVideoRenderer")
                        || k.equals("videoWithContextRenderer") || k.equals("endScreenVideoRenderer")) {
                    addId(ids, child.optString("videoId", ""));
                } else if (k.equals("lockupViewModel")) {
                    if (child.optString("contentType", "").contains("VIDEO")) addId(ids, child.optString("contentId", ""));
                } else if (k.equals("continuationItemRenderer") && token[0] == null) {
                    JSONObject ep = child.optJSONObject("continuationEndpoint");
                    JSONObject cmd = ep == null ? null : ep.optJSONObject("continuationCommand");
                    if (cmd != null && cmd.optString("token", "").length() > 0) token[0] = cmd.optString("token");
                }
            }
            walk(v, ids, token);
        }
    }

    private static void addId(Set<String> ids, String id) {
        if (id != null && id.matches("[A-Za-z0-9_-]{11}")) ids.add(id);
    }
}
