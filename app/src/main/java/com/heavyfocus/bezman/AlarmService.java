package com.heavyfocus.bezman;

import android.app.Notification;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.media.AudioAttributes;
import android.media.AudioManager;
import android.media.MediaPlayer;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.PowerManager;
import android.os.VibrationEffect;
import android.os.Vibrator;

/** Plays the wake-up alarm until she solves the challenge on the alarm screen. */
public class AlarmService extends Service {
    public static final String STOP = "com.heavyfocus.bezman.STOP";
    static volatile boolean ringing = false;

    MediaPlayer mp;
    Vibrator vib;
    PowerManager.WakeLock wl;
    int prevVol = -1;
    final Handler h = new Handler(Looper.getMainLooper());

    public static void start(Context c, String id, String occ, String label) {
        Intent i = new Intent(c, AlarmService.class)
                .putExtra("id", id == null ? "" : id)
                .putExtra("occ", occ == null ? "" : occ)
                .putExtra("label", label == null ? "" : label);
        try {
            c.startForegroundService(i);
        } catch (Exception e) {
            // Could not start in background: at least show the alarm screen notification.
            try {
                Notify.remind(c, "alarmfallback", "⏰ בוקר טוב! זמן לקום", label, null, null, null);
            } catch (Exception ignored) {
            }
        }
    }

    public static void stop(Context c) {
        try {
            c.startService(new Intent(c, AlarmService.class).setAction(STOP));
        } catch (Exception ignored) {
        }
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null && STOP.equals(intent.getAction())) {
            stopRinging();
            stopForeground(STOP_FOREGROUND_REMOVE);
            stopSelf();
            return START_NOT_STICKY;
        }
        String id = intent == null ? "" : intent.getStringExtra("id");
        String occ = intent == null ? "" : intent.getStringExtra("occ");
        String label = intent == null ? "" : intent.getStringExtra("label");

        Intent full = new Intent(this, AlarmActivity.class)
                .putExtra("id", id).putExtra("occ", occ).putExtra("label", label)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_NO_USER_ACTION);
        PendingIntent fpi = PendingIntent.getActivity(this, 7, full,
                PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        Notification n = new Notification.Builder(this, Notify.CH_ALARM)
                .setSmallIcon(R.drawable.ic_notif)
                .setContentTitle("⏰ בוקר טוב! זמן לקום")
                .setContentText(label == null || label.isEmpty() ? "לוחצים כאן כדי לכבות" : label)
                .setCategory(Notification.CATEGORY_ALARM)
                .setVisibility(Notification.VISIBILITY_PUBLIC)
                .setFullScreenIntent(fpi, true)
                .setContentIntent(fpi)
                .setOngoing(true)
                .setColor(0xFFFF7A59)
                .build();
        try {
            if (Build.VERSION.SDK_INT >= 29) {
                startForeground(1001, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK);
            } else {
                startForeground(1001, n);
            }
        } catch (Exception e) {
            try {
                Notify.nm(this).notify(1001, n);
            } catch (Exception ignored) {
            }
        }
        startRinging();
        try {
            startActivity(full);
        } catch (Exception ignored) {
        }
        h.removeCallbacksAndMessages(null);
        h.postDelayed(() -> {
            stopRinging();
            stopForeground(STOP_FOREGROUND_REMOVE);
            stopSelf();
        }, 30 * U.MIN);
        return START_NOT_STICKY;
    }

    void startRinging() {
        if (ringing && mp != null) return;
        ringing = true;
        try {
            PowerManager pm = (PowerManager) getSystemService(POWER_SERVICE);
            wl = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "bezman:alarm");
            wl.acquire(31 * U.MIN);
        } catch (Exception ignored) {
        }
        AudioAttributes attrs = new AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_ALARM)
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                .build();
        try {
            AudioManager am = (AudioManager) getSystemService(AUDIO_SERVICE);
            prevVol = am.getStreamVolume(AudioManager.STREAM_ALARM);
            int max = am.getStreamMaxVolume(AudioManager.STREAM_ALARM);
            int target = (int) Math.ceil(max * 0.85);
            if (prevVol < target) am.setStreamVolume(AudioManager.STREAM_ALARM, target, 0);
        } catch (Exception ignored) {
        }
        String chosen = Store.getStr(this, "ringtone");
        Uri[] uris = {
                chosen.isEmpty() ? null : Uri.parse(chosen),
                RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM),
                RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE),
                RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION)
        };
        for (Uri u : uris) {
            if (u == null) continue;
            try {
                mp = new MediaPlayer();
                mp.setAudioAttributes(attrs);
                mp.setDataSource(this, u);
                mp.setLooping(true);
                mp.prepare();
                mp.start();
                break;
            } catch (Exception e) {
                try {
                    mp.release();
                } catch (Exception ignored) {
                }
                mp = null;
            }
        }
        try {
            vib = (Vibrator) getSystemService(VIBRATOR_SERVICE);
            if (vib != null) vib.vibrate(VibrationEffect.createWaveform(new long[]{0, 800, 600}, 0), attrs);
        } catch (Exception ignored) {
        }
    }

    void stopRinging() {
        ringing = false;
        h.removeCallbacksAndMessages(null);
        if (mp != null) {
            try {
                mp.stop();
            } catch (Exception ignored) {
            }
            try {
                mp.release();
            } catch (Exception ignored) {
            }
            mp = null;
        }
        if (vib != null) {
            try {
                vib.cancel();
            } catch (Exception ignored) {
            }
        }
        if (prevVol >= 0) {
            try {
                ((AudioManager) getSystemService(AUDIO_SERVICE)).setStreamVolume(AudioManager.STREAM_ALARM, prevVol, 0);
            } catch (Exception ignored) {
            }
            prevVol = -1;
        }
        if (wl != null && wl.isHeld()) {
            try {
                wl.release();
            } catch (Exception ignored) {
            }
        }
    }

    @Override
    public void onDestroy() {
        stopRinging();
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
