package com.heavyfocus.bezman;

import android.app.AlarmManager;
import android.app.NotificationManager;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.PowerManager;
import android.provider.Settings;
import android.webkit.JavascriptInterface;
import android.widget.Toast;

import org.json.JSONArray;
import org.json.JSONObject;

import java.security.SecureRandom;

/** What the screens (HTML/JS) can ask the phone to do. */
public class Bridge {
    static final String APK_URL = "https://github.com/heavyfocus-art/bezman/releases/latest/download/bezman.apk";
    final MainActivity a;
    final Context c;

    Bridge(MainActivity a) {
        this.a = a;
        this.c = a.getApplicationContext();
    }

    @JavascriptInterface
    public String state() {
        JSONObject me = U.obj("role", Store.role(c), "name", Store.name(c), "dev", Store.dev(c),
                "code", Store.code(c), "lastSync", Store.getLong(c, "lastSync"));
        return U.obj("items", Store.items(c), "me", me, "version", BuildConfig.VERSION_NAME,
                "apk", APK_URL, "now", System.currentTimeMillis()).toString();
    }

    @JavascriptInterface
    public String upsert(String json) {
        try {
            JSONArray arr = json.trim().startsWith("[") ? new JSONArray(json) : new JSONArray().put(new JSONObject(json));
            Store.upsertLocal(c, arr);
            Store.afterLocalChange(c);
        } catch (Exception ignored) {
        }
        return state();
    }

    @JavascriptInterface
    public String setup(String role, String name, String code) {
        Store.setup(c, role, name.trim(), normCode(code));
        Store.afterLocalChange(c);
        Sync.syncAsync(c);
        return state();
    }

    static String normCode(String code) {
        StringBuilder sb = new StringBuilder();
        for (char ch : code.toUpperCase().toCharArray()) if (Character.isLetterOrDigit(ch)) sb.append(ch);
        return sb.toString();
    }

    @JavascriptInterface
    public String newCode() {
        String abc = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
        SecureRandom r = new SecureRandom();
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < 10; i++) sb.append(abc.charAt(r.nextInt(abc.length())));
        return sb.toString();
    }

    @JavascriptInterface
    public void syncNow() {
        Sync.syncAsync(c);
    }

    /** what: "left" | "task". Returns points earned, or -1 if already recorded. */
    @JavascriptInterface
    public int action(String what, String ref, String occ) {
        int pts = -1;
        if ("left".equals(what)) pts = Store.left(c, ref, occ);
        else if ("task".equals(what)) pts = Store.taskDone(c, ref, occ);
        Notify.cancel(c, ("left".equals(what) ? "ev:" : "tk:") + ref + ":" + occ);
        return pts;
    }

    @JavascriptInterface
    public void share(String text) {
        Intent wa = new Intent(Intent.ACTION_SEND).setType("text/plain").putExtra(Intent.EXTRA_TEXT, text);
        wa.setPackage("com.whatsapp");
        try {
            a.startActivity(wa);
        } catch (Exception e) {
            Intent any = new Intent(Intent.ACTION_SEND).setType("text/plain").putExtra(Intent.EXTRA_TEXT, text);
            try {
                a.startActivity(Intent.createChooser(any, "שיתוף"));
            } catch (Exception ignored) {
            }
        }
    }

    @JavascriptInterface
    public String perms() {
        NotificationManager nm = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
        AlarmManager am = (AlarmManager) c.getSystemService(Context.ALARM_SERVICE);
        PowerManager pm = (PowerManager) c.getSystemService(Context.POWER_SERVICE);
        boolean notif = nm.areNotificationsEnabled();
        boolean exact = Build.VERSION.SDK_INT < 31 || am.canScheduleExactAlarms();
        boolean full = Build.VERSION.SDK_INT < 34 || nm.canUseFullScreenIntent();
        boolean battery = pm.isIgnoringBatteryOptimizations(c.getPackageName());
        return U.obj("notif", notif, "exact", exact, "full", full, "battery", battery,
                "samsung", "samsung".equalsIgnoreCase(Build.MANUFACTURER)).toString();
    }

    @JavascriptInterface
    public void fixPerm(String which) {
        String pkg = c.getPackageName();
        Intent i;
        switch (which) {
            case "notif":
                i = new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, pkg);
                break;
            case "exact":
                i = new Intent("android.settings.REQUEST_SCHEDULE_EXACT_ALARM", Uri.parse("package:" + pkg));
                break;
            case "full":
                i = new Intent("android.settings.MANAGE_APP_USE_FULL_SCREEN_INTENT", Uri.parse("package:" + pkg));
                break;
            case "battery":
                i = new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, Uri.parse("package:" + pkg));
                break;
            default:
                i = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + pkg));
        }
        try {
            a.startActivity(i);
        } catch (Exception e) {
            try {
                a.startActivity(new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + pkg)));
            } catch (Exception ignored) {
            }
        }
    }

    @JavascriptInterface
    public void testAlarm() {
        Sched.scheduleTest(c);
    }

    @JavascriptInterface
    public void toast(String s) {
        a.runOnUiThread(() -> Toast.makeText(c, s, Toast.LENGTH_SHORT).show());
    }

    @JavascriptInterface
    public void openUrl(String url) {
        try {
            a.startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url)));
        } catch (Exception ignored) {
        }
    }

    @JavascriptInterface
    public String reset() {
        Store.reset(c);
        Sched.reschedule(c);
        return state();
    }
}
