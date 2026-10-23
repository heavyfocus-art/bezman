package com.heavyfocus.bezman;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;

/**
 * Keeps one open connection to the family channel, so every change on one phone
 * reaches the other phones within seconds (instead of every 15 minutes).
 */
public class LiveService extends Service {
    static final String CH_LIVE = "live";
    static volatile boolean running = false;

    volatile boolean stop = false;
    volatile HttpURLConnection con;
    Thread th;
    final Handler h = new Handler(Looper.getMainLooper());
    final Runnable doSync = () -> Sync.syncAsync(getApplicationContext());

    public static boolean wanted(Context c) {
        return !Store.code(c).isEmpty() && Store.p(c).getBoolean("live", true);
    }

    public static void start(Context c) {
        if (!wanted(c) || running) return;
        try {
            c.startForegroundService(new Intent(c, LiveService.class));
        } catch (Exception ignored) {
            // Android may refuse from the background; the 15-minute check keeps working and retries.
        }
    }

    public static void stopIt(Context c) {
        try {
            c.stopService(new Intent(c, LiveService.class));
        } catch (Exception ignored) {
        }
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        NotificationChannel ch = new NotificationChannel(CH_LIVE, "חיבור למשפחה", NotificationManager.IMPORTANCE_MIN);
        ch.setShowBadge(false);
        nm.createNotificationChannel(ch);
        Notification n = new Notification.Builder(this, CH_LIVE)
                .setSmallIcon(R.drawable.ic_notif)
                .setContentTitle("בזמן מחובר למשפחה 💜")
                .setContentText("עדכונים מגיעים מיד")
                .setOngoing(true)
                .setContentIntent(Notify.openApp(this))
                .build();
        try {
            if (Build.VERSION.SDK_INT >= 29) startForeground(1002, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC);
            else startForeground(1002, n);
        } catch (Exception e) {
            stopSelf();
            return START_NOT_STICKY;
        }
        if (!wanted(this)) {
            stopSelf();
            return START_NOT_STICKY;
        }
        running = true;
        if (th == null || !th.isAlive()) {
            stop = false;
            th = new Thread(this::loop, "bezman-live");
            th.start();
        }
        return START_STICKY;
    }

    void loop() {
        long backoff = 5000;
        Context c = getApplicationContext();
        Sync.syncAsync(c);
        while (!stop) {
            String code = Store.code(c);
            if (code.isEmpty()) break;
            try {
                String since = Store.getStr(c, "lastMsgId");
                String url = Sync.BASE + Sync.topic(code) + "/json" + (since.isEmpty() ? "" : "?since=" + since);
                con = (HttpURLConnection) new URL(url).openConnection();
                con.setConnectTimeout(20000);
                con.setReadTimeout(100_000); // the server sends a keep-alive about every 45 seconds
                if (con.getResponseCode() != 200) throw new Exception("http " + con.getResponseCode());
                backoff = 5000;
                BufferedReader br = new BufferedReader(new InputStreamReader(con.getInputStream(), StandardCharsets.UTF_8));
                String line;
                while (!stop && (line = br.readLine()) != null) {
                    if (line.contains("\"event\":\"message\"")) {
                        h.removeCallbacks(doSync);
                        h.postDelayed(doSync, 800);
                    }
                }
                br.close();
            } catch (Exception e) {
                if (stop) break;
                try {
                    Thread.sleep(backoff);
                } catch (InterruptedException ie) {
                    break;
                }
                backoff = Math.min(backoff * 2, 120_000);
            } finally {
                HttpURLConnection cc = con;
                if (cc != null) cc.disconnect();
            }
        }
    }

    @Override
    public void onDestroy() {
        stop = true;
        running = false;
        h.removeCallbacksAndMessages(null);
        HttpURLConnection cc = con;
        if (cc != null) {
            new Thread(cc::disconnect).start();
        }
        if (th != null) th.interrupt();
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
