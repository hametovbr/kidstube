package app.kidstube.tv;

import org.json.JSONObject;

import java.io.BufferedInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.Inet4Address;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.NetworkInterface;
import java.net.ServerSocket;
import java.net.Socket;
import java.util.Collections;
import java.util.Locale;

/**
 * Tiny HTTP server on the local network so parents can edit settings from a phone.
 * Every read or write of settings requires the parental PIN.
 */
final class SettingsServer implements Runnable {
    private static final int FIRST_PORT = 8765;
    private static final int MAX_BODY = 256 * 1024;

    private final MainActivity act;
    private volatile ServerSocket socket;
    private volatile boolean running;
    private volatile int port;

    private int failures;
    private long lockedUntil;

    SettingsServer(MainActivity act) {
        this.act = act;
    }

    void start() {
        Thread t = new Thread(this, "settings-server");
        t.setDaemon(true);
        t.start();
    }

    void stop() {
        running = false;
        try {
            if (socket != null) socket.close();
        } catch (IOException ignored) {
        }
    }

    String url() {
        String ip = localIp();
        if (ip == null || port == 0) return "";
        return "http://" + ip + ":" + port;
    }

    @Override
    public void run() {
        for (int p = FIRST_PORT; p < FIRST_PORT + 10 && socket == null; p++) {
            try {
                ServerSocket s = new ServerSocket();
                s.setReuseAddress(true);
                s.bind(new InetSocketAddress(p));
                socket = s;
                port = p;
            } catch (IOException ignored) {
            }
        }
        if (socket == null) return;
        running = true;
        while (running) {
            try {
                final Socket client = socket.accept();
                new Thread(new Runnable() {
                    @Override
                    public void run() {
                        handle(client);
                    }
                }).start();
            } catch (IOException e) {
                if (!running) break;
            }
        }
    }

    private void handle(Socket client) {
        try {
            client.setSoTimeout(15000);
            InputStream in = new BufferedInputStream(client.getInputStream());
            OutputStream out = client.getOutputStream();

            String requestLine = readLine(in);
            if (requestLine == null) return;
            String[] parts = requestLine.split(" ");
            if (parts.length < 2) return;
            String method = parts[0];
            String path = parts[1];
            int q = path.indexOf('?');
            if (q >= 0) path = path.substring(0, q);

            int length = 0;
            String line;
            while ((line = readLine(in)) != null && !line.isEmpty()) {
                int c = line.indexOf(':');
                if (c > 0 && line.substring(0, c).trim().toLowerCase(Locale.ROOT).equals("content-length")) {
                    try {
                        length = Integer.parseInt(line.substring(c + 1).trim());
                    } catch (NumberFormatException ignored) {
                    }
                }
            }
            if (length > MAX_BODY) {
                send(out, 413, "text/plain", "Too large");
                return;
            }
            byte[] body = new byte[Math.max(0, length)];
            int read = 0;
            while (read < length) {
                int n = in.read(body, read, length - read);
                if (n < 0) break;
                read += n;
            }
            String bodyText = new String(body, 0, read, "UTF-8");

            if (method.equals("GET") && (path.equals("/") || path.equals("/index.html"))) {
                send(out, 200, "text/html; charset=utf-8", readAsset("web/remote.html"));
            } else if (method.equals("POST") && path.equals("/api/login")) {
                JSONObject req = new JSONObject(bodyText);
                String err = checkPin(req.optString("pin", ""));
                if (err != null) {
                    sendJson(out, 403, error(err));
                } else {
                    JSONObject res = new JSONObject();
                    res.put("ok", true);
                    res.put("settings", new JSONObject(Store.get(act)));
                    sendJson(out, 200, res);
                }
            } else if (method.equals("POST") && path.equals("/api/history")) {
                JSONObject req = new JSONObject(bodyText);
                String err = checkPin(req.optString("pin", ""));
                if (err != null) {
                    sendJson(out, 403, error(err));
                } else {
                    send(out, 200, "application/json; charset=utf-8",
                            "{\"ok\":true,\"history\":" + Store.getHistory(act) + "}");
                }
            } else if (method.equals("POST") && path.equals("/api/save")) {
                JSONObject req = new JSONObject(bodyText);
                String err = checkPin(req.optString("pin", ""));
                JSONObject settings = req.optJSONObject("settings");
                if (err != null) {
                    sendJson(out, 403, error(err));
                } else if (settings == null) {
                    sendJson(out, 400, error("Нет данных"));
                } else if (!settings.optString("pin", "").matches("\\d{4,8}")) {
                    sendJson(out, 400, error("PIN должен состоять из 4–8 цифр"));
                } else {
                    Store.save(act, settings.toString());
                    act.onSettingsChangedRemotely();
                    JSONObject res = new JSONObject();
                    res.put("ok", true);
                    sendJson(out, 200, res);
                }
            } else {
                send(out, 404, "text/plain", "Not found");
            }
        } catch (Exception e) {
            try {
                sendJson(client.getOutputStream(), 500, error("Ошибка сервера"));
            } catch (Exception ignored) {
            }
        } finally {
            try {
                client.close();
            } catch (IOException ignored) {
            }
        }
    }

    /** Returns null when the PIN is accepted, otherwise a message for the parent. */
    private synchronized String checkPin(String pin) {
        long now = System.currentTimeMillis();
        if (now < lockedUntil) return "Слишком много попыток. Подождите минуту.";
        String stored;
        try {
            stored = new JSONObject(Store.get(act)).optString("pin", "");
        } catch (Exception e) {
            stored = "";
        }
        if (stored.isEmpty() || stored.equals(pin)) {
            failures = 0;
            return null;
        }
        failures++;
        if (failures >= 5) {
            failures = 0;
            lockedUntil = now + 60000;
        }
        return "Неверный PIN";
    }

    private static JSONObject error(String msg) {
        JSONObject o = new JSONObject();
        try {
            o.put("ok", false);
            o.put("error", msg);
        } catch (Exception ignored) {
        }
        return o;
    }

    private String readAsset(String name) throws IOException {
        InputStream in = act.getAssets().open(name);
        ByteArrayOutputStream buf = new ByteArrayOutputStream();
        byte[] b = new byte[8192];
        int n;
        while ((n = in.read(b)) > 0) buf.write(b, 0, n);
        in.close();
        return buf.toString("UTF-8");
    }

    private static void sendJson(OutputStream out, int code, JSONObject o) throws IOException {
        send(out, code, "application/json; charset=utf-8", o.toString());
    }

    private static void send(OutputStream out, int code, String type, String body) throws IOException {
        byte[] data = body.getBytes("UTF-8");
        String head = "HTTP/1.1 " + code + " " + (code == 200 ? "OK" : "Error") + "\r\n"
                + "Content-Type: " + type + "\r\n"
                + "Content-Length: " + data.length + "\r\n"
                + "Cache-Control: no-store\r\n"
                + "Connection: close\r\n\r\n";
        out.write(head.getBytes("UTF-8"));
        out.write(data);
        out.flush();
    }

    private static String readLine(InputStream in) throws IOException {
        ByteArrayOutputStream buf = new ByteArrayOutputStream();
        int c;
        while ((c = in.read()) >= 0) {
            if (c == '\n') break;
            if (c != '\r') buf.write(c);
            if (buf.size() > 8192) break;
        }
        if (c < 0 && buf.size() == 0) return null;
        return buf.toString("UTF-8");
    }

    static String localIp() {
        try {
            String fallback = null;
            for (NetworkInterface ni : Collections.list(NetworkInterface.getNetworkInterfaces())) {
                if (!ni.isUp() || ni.isLoopback()) continue;
                for (InetAddress a : Collections.list(ni.getInetAddresses())) {
                    if (!(a instanceof Inet4Address) || a.isLoopbackAddress()) continue;
                    if (a.isSiteLocalAddress()) return a.getHostAddress();
                    if (fallback == null) fallback = a.getHostAddress();
                }
            }
            return fallback;
        } catch (Exception e) {
            return null;
        }
    }
}
