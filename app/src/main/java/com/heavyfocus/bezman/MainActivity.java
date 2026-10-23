package com.heavyfocus.bezman;

import android.Manifest;
import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.database.Cursor;
import android.media.Ringtone;
import android.media.RingtoneManager;
import android.net.Uri;
import android.provider.OpenableColumns;
import android.os.Build;
import android.os.Bundle;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import java.lang.ref.WeakReference;

public class MainActivity extends Activity {
    static WeakReference<MainActivity> current = new WeakReference<>(null);
    WebView web;

    @SuppressLint({"SetJavaScriptEnabled", "AddJavascriptInterface"})
    @Override
    protected void onCreate(Bundle b) {
        super.onCreate(b);
        web = new WebView(this);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setAllowFileAccess(true);
        s.setTextZoom(100);
        web.setWebChromeClient(new WebChromeClient());
        web.setWebViewClient(new WebViewClient());
        web.addJavascriptInterface(new Bridge(this), "Android");
        web.loadUrl("file:///android_asset/www/index.html");
        setContentView(web);
        askNotifications();
        SyncJob.schedule(this);
        Sched.reschedule(this);
    }

    void askNotifications() {
        if (Build.VERSION.SDK_INT >= 33
                && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, 5);
        }
    }

    @Override
    protected void onResume() {
        super.onResume();
        current = new WeakReference<>(this);
        Sync.syncAsync(this);
        refreshUi();
    }

    @Override
    protected void onPause() {
        super.onPause();
        if (current.get() == this) current = new WeakReference<>(null);
    }

    static final int REQ_RINGTONE = 11, REQ_SONG = 12;

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (resultCode != RESULT_OK || data == null) return;
        Uri u = null;
        String name = "";
        try {
            if (requestCode == REQ_RINGTONE) {
                u = data.getParcelableExtra(RingtoneManager.EXTRA_RINGTONE_PICKED_URI);
                if (u != null) {
                    Ringtone r = RingtoneManager.getRingtone(this, u);
                    if (r != null) name = r.getTitle(this);
                }
            } else if (requestCode == REQ_SONG) {
                u = data.getData();
                if (u != null) {
                    try {
                        getContentResolver().takePersistableUriPermission(u, Intent.FLAG_GRANT_READ_URI_PERMISSION);
                    } catch (Exception ignored) {
                    }
                    try (Cursor cur = getContentResolver().query(u, new String[]{OpenableColumns.DISPLAY_NAME}, null, null, null)) {
                        if (cur != null && cur.moveToFirst()) name = cur.getString(0);
                    }
                    if (name != null && name.lastIndexOf('.') > 0) name = name.substring(0, name.lastIndexOf('.'));
                }
            }
        } catch (Exception ignored) {
        }
        if (u == null) return;
        Store.setStr(this, "ringtone", u.toString());
        Store.setStr(this, "ringtoneName", name == null || name.isEmpty() ? "צלצול שנבחר" : name);
        refreshUi();
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        refreshUi();
    }

    /** Tells the screen to reload data (safe to call from any thread). */
    public static void refreshUi() {
        final MainActivity a = current.get();
        if (a == null || a.web == null) return;
        a.runOnUiThread(() -> {
            try {
                a.web.evaluateJavascript("window.onNative && window.onNative()", null);
            } catch (Exception ignored) {
            }
        });
    }

    @Override
    public void onBackPressed() {
        web.evaluateJavascript("window.onBack ? window.onBack() : false", v -> {
            if (!"true".equals(v)) finish();
        });
    }
}
