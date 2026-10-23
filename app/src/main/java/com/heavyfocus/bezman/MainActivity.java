package com.heavyfocus.bezman;

import android.Manifest;
import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.ClipData;
import android.content.ContentValues;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.provider.MediaStore;
import android.widget.Toast;
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
        s.setMediaPlaybackRequiresUserGesture(false);
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
        LiveService.start(this);
        refreshUi();
    }

    @Override
    protected void onPause() {
        super.onPause();
        if (current.get() == this) current = new WeakReference<>(null);
    }

    static final int REQ_RINGTONE = 11, REQ_SONG = 12, REQ_PHOTO = 13;
    String photoTask = "", photoOcc = "";
    Uri cameraUri = null;

    /** mode: "camera" or "gallery". The picture is attached when she marks the task done. */
    void startPhoto(String taskId, String occ, String mode) {
        photoTask = taskId;
        photoOcc = occ;
        cameraUri = null;
        try {
            if ("camera".equals(mode)) {
                ContentValues cv = new ContentValues();
                cv.put(MediaStore.Images.Media.DISPLAY_NAME, "bezman_" + System.currentTimeMillis() + ".jpg");
                cv.put(MediaStore.Images.Media.MIME_TYPE, "image/jpeg");
                if (Build.VERSION.SDK_INT >= 29) cv.put(MediaStore.Images.Media.RELATIVE_PATH, "Pictures/Bezman");
                cameraUri = getContentResolver().insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, cv);
                Intent i = new Intent(MediaStore.ACTION_IMAGE_CAPTURE);
                i.putExtra(MediaStore.EXTRA_OUTPUT, cameraUri);
                i.setClipData(ClipData.newRawUri("", cameraUri));
                i.addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION | Intent.FLAG_GRANT_READ_URI_PERMISSION);
                startActivityForResult(i, REQ_PHOTO);
            } else {
                Intent i = new Intent(Intent.ACTION_GET_CONTENT).setType("image/*").addCategory(Intent.CATEGORY_OPENABLE);
                startActivityForResult(Intent.createChooser(i, "בחירת תמונה"), REQ_PHOTO);
            }
        } catch (Exception e) {
            if ("camera".equals(mode)) startPhoto(taskId, occ, "gallery");
        }
    }

    void onPhoto(int resultCode, Intent data) {
        Uri u = null;
        if (resultCode == RESULT_OK) {
            if (data != null && data.getData() != null) u = data.getData();
            else u = cameraUri;
        }
        final Uri src = u;
        final String task = photoTask, occ = photoOcc;
        final Uri cam = cameraUri;
        if (src == null) {
            if (cam != null) {
                try {
                    getContentResolver().delete(cam, null, null);
                } catch (Exception ignored) {
                }
            }
            return;
        }
        final Context ac = getApplicationContext();
        new Thread(() -> {
            byte[] jpg = Photos.compress(ac, src);
            if (jpg == null) {
                runOnUiThread(() -> Toast.makeText(ac, "לא הצלחתי לקרוא את התמונה, נסו שוב", Toast.LENGTH_LONG).show());
                return;
            }
            String logId = "task:" + task + ":" + occ;
            Photos.save(ac, logId, jpg);
            int pts = Store.taskDone(ac, task, occ, true);
            if (pts < 0) return;
            Notify.cancel(ac, "tk:" + task + ":" + occ);
            runOnUiThread(() -> {
                try {
                    web.evaluateJavascript("window.onPhotoSent && window.onPhotoSent()", null);
                } catch (Exception ignored) {
                }
            });
            Photos.upload(ac, logId);
        }).start();
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == REQ_PHOTO) {
            onPhoto(resultCode, data);
            return;
        }
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
