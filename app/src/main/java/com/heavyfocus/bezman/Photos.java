package com.heavyfocus.bezman;

import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Matrix;
import android.media.ExifInterface;
import android.net.Uri;
import android.util.Base64;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.Iterator;

/** Photos she attaches when finishing a task: shrunk, saved locally, and sent encrypted to the parents. */
public final class Photos {
    private Photos() {}

    static File file(Context c, String logId) {
        File dir = new File(c.getFilesDir(), "photos");
        if (!dir.exists()) dir.mkdirs();
        return new File(dir, logId.replaceAll("[^A-Za-z0-9_-]", "_") + ".jpg");
    }

    /** Reads a picture, turns it upright and shrinks it to max 1280px JPEG. */
    static byte[] compress(Context c, Uri uri) {
        try {
            BitmapFactory.Options o = new BitmapFactory.Options();
            o.inJustDecodeBounds = true;
            try (InputStream in = c.getContentResolver().openInputStream(uri)) {
                BitmapFactory.decodeStream(in, null, o);
            }
            if (o.outWidth <= 0) return null;
            int sample = 1;
            while (Math.max(o.outWidth, o.outHeight) / (sample * 2) >= 1280) sample *= 2;
            BitmapFactory.Options o2 = new BitmapFactory.Options();
            o2.inSampleSize = sample;
            Bitmap bm;
            try (InputStream in = c.getContentResolver().openInputStream(uri)) {
                bm = BitmapFactory.decodeStream(in, null, o2);
            }
            if (bm == null) return null;
            int rot = 0;
            try (InputStream in = c.getContentResolver().openInputStream(uri)) {
                ExifInterface ex = new ExifInterface(in);
                int or = ex.getAttributeInt(ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_NORMAL);
                if (or == ExifInterface.ORIENTATION_ROTATE_90) rot = 90;
                else if (or == ExifInterface.ORIENTATION_ROTATE_180) rot = 180;
                else if (or == ExifInterface.ORIENTATION_ROTATE_270) rot = 270;
            } catch (Exception ignored) {
            }
            float scale = Math.min(1f, 1280f / Math.max(bm.getWidth(), bm.getHeight()));
            if (rot != 0 || scale < 1f) {
                Matrix m = new Matrix();
                m.postScale(scale, scale);
                m.postRotate(rot);
                Bitmap b2 = Bitmap.createBitmap(bm, 0, 0, bm.getWidth(), bm.getHeight(), m, true);
                if (b2 != bm) bm.recycle();
                bm = b2;
            }
            ByteArrayOutputStream bo = new ByteArrayOutputStream();
            bm.compress(Bitmap.CompressFormat.JPEG, 72, bo);
            bm.recycle();
            return bo.toByteArray();
        } catch (Exception e) {
            return null;
        }
    }

    static void save(Context c, String logId, byte[] jpg) {
        try (FileOutputStream fo = new FileOutputStream(file(c, logId))) {
            fo.write(jpg);
        } catch (Exception ignored) {
        }
    }

    static byte[] read(File f) {
        try (FileInputStream in = new FileInputStream(f)) {
            ByteArrayOutputStream bo = new ByteArrayOutputStream();
            byte[] buf = new byte[8192];
            int n;
            while ((n = in.read(buf)) > 0) bo.write(buf, 0, n);
            return bo.toByteArray();
        } catch (Exception e) {
            return null;
        }
    }

    /** For the screen: "data:image/jpeg;base64,..." or "" if this phone doesn't have the picture (yet). */
    static String dataUrl(Context c, String logId) {
        File f = file(c, logId);
        if (!f.exists()) return "";
        byte[] b = read(f);
        if (b == null) return "";
        return "data:image/jpeg;base64," + Base64.encodeToString(b, Base64.NO_WRAP);
    }

    /** Uploads the encrypted picture as a file on the family channel and records its link on the task. */
    static boolean upload(Context c, String logId) {
        String code = Store.code(c);
        File f = file(c, logId);
        if (code.isEmpty() || !f.exists()) return false;
        HttpURLConnection con = null;
        try {
            byte[] enc = Sync.encryptBytes(code, read(f));
            con = (HttpURLConnection) new URL(Sync.BASE + Sync.topic(code)).openConnection();
            con.setConnectTimeout(20000);
            con.setReadTimeout(60000);
            con.setRequestMethod("PUT");
            con.setDoOutput(true);
            con.setRequestProperty("Filename", "p.bin");
            con.setRequestProperty("Message", "BZ1P");
            con.setFixedLengthStreamingMode(enc.length);
            try (OutputStream os = con.getOutputStream()) {
                os.write(enc);
            }
            if (con.getResponseCode() / 100 != 2) return false;
            ByteArrayOutputStream bo = new ByteArrayOutputStream();
            try (InputStream in = con.getInputStream()) {
                byte[] buf = new byte[4096];
                int n;
                while ((n = in.read(buf)) > 0) bo.write(buf, 0, n);
            }
            JSONObject resp = new JSONObject(bo.toString("UTF-8"));
            JSONObject att = resp.optJSONObject("attachment");
            String url = att == null ? "" : att.optString("url", "");
            if (url.isEmpty()) return false;
            JSONObject l = Store.get(c, logId);
            if (l == null) return false;
            U.put(l, "photoUrl", url);
            Store.upsertLocal(c, l);
            Sync.flush(c);
            MainActivity.refreshUi();
            return true;
        } catch (Exception e) {
            return false;
        } finally {
            if (con != null) con.disconnect();
        }
    }

    static boolean download(Context c, String logId, String url) {
        String code = Store.code(c);
        if (code.isEmpty() || url.isEmpty() || !url.startsWith("https://")) return false;
        HttpURLConnection con = null;
        try {
            con = (HttpURLConnection) new URL(url).openConnection();
            con.setConnectTimeout(20000);
            con.setReadTimeout(60000);
            if (con.getResponseCode() != 200) return false;
            ByteArrayOutputStream bo = new ByteArrayOutputStream();
            try (InputStream in = con.getInputStream()) {
                byte[] buf = new byte[8192];
                int n;
                while ((n = in.read(buf)) > 0) bo.write(buf, 0, n);
            }
            byte[] jpg = Sync.decryptBytes(code, bo.toByteArray());
            if (jpg == null) return false;
            save(c, logId, jpg);
            return true;
        } catch (Exception e) {
            return false;
        } finally {
            if (con != null) con.disconnect();
        }
    }

    /** Called during sync: send pictures that didn't go out, fetch pictures we don't have. */
    static void catchUp(Context c) {
        JSONObject all = Store.items(c);
        String me = Store.dev(c);
        long cutoff = System.currentTimeMillis() - 3 * U.DAY;
        boolean got = false;
        Iterator<String> it = all.keys();
        while (it.hasNext()) {
            JSONObject l = all.optJSONObject(it.next());
            if (!U.alive(l) || !l.optBoolean("photo") || l.optLong("upd") < cutoff) continue;
            String id = l.optString("id");
            String url = l.optString("photoUrl", "");
            boolean have = file(c, id).exists();
            if (url.isEmpty() && have && me.equals(l.optString("photoBy"))) upload(c, id);
            else if (!url.isEmpty() && !have) got |= download(c, id, url);
        }
        if (got) MainActivity.refreshUi();
    }
}
