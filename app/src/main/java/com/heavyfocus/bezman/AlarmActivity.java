package com.heavyfocus.bezman;

import android.app.Activity;
import android.app.KeyguardManager;
import android.content.Intent;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.text.InputType;
import android.view.Gravity;
import android.view.View;
import android.view.WindowManager;
import android.view.inputmethod.EditorInfo;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.TextView;

import java.util.Random;

/** Full-screen wake-up screen: solve a quick question to turn off the alarm. */
public class AlarmActivity extends Activity {
    String id = "", occ = "", label = "";
    int answer;
    TextView clock, question, feedback;
    EditText input;
    Button snooze;
    final Handler h = new Handler(Looper.getMainLooper());
    final Random rnd = new Random();

    @Override
    protected void onCreate(Bundle b) {
        super.onCreate(b);
        if (Build.VERSION.SDK_INT >= 27) {
            setShowWhenLocked(true);
            setTurnScreenOn(true);
        } else {
            getWindow().addFlags(WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED
                    | WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON);
        }
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        readIntent(getIntent());
        build();
        newQuestion();
        tick();
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        readIntent(intent);
        updateSnooze();
    }

    void readIntent(Intent i) {
        if (i == null) return;
        if (i.getStringExtra("id") != null) id = i.getStringExtra("id");
        if (i.getStringExtra("occ") != null) occ = i.getStringExtra("occ");
        if (i.getStringExtra("label") != null) label = i.getStringExtra("label");
    }

    int dp(int v) {
        return (int) (v * getResources().getDisplayMetrics().density);
    }

    TextView text(String s, int sp, int color, boolean bold) {
        TextView t = new TextView(this);
        t.setText(s);
        t.setTextSize(sp);
        t.setTextColor(color);
        t.setGravity(Gravity.CENTER);
        if (bold) t.setTypeface(Typeface.DEFAULT_BOLD);
        return t;
    }

    Button button(String s, int bg, int fg) {
        Button btn = new Button(this);
        btn.setText(s);
        btn.setTextSize(20);
        btn.setTextColor(fg);
        btn.setAllCaps(false);
        GradientDrawable d = new GradientDrawable();
        d.setColor(bg);
        d.setCornerRadius(dp(18));
        btn.setBackground(d);
        btn.setPadding(dp(16), dp(14), dp(16), dp(14));
        return btn;
    }

    void build() {
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setGravity(Gravity.CENTER_HORIZONTAL);
        root.setLayoutDirection(View.LAYOUT_DIRECTION_RTL);
        root.setPadding(dp(24), dp(48), dp(24), dp(24));
        GradientDrawable bg = new GradientDrawable(GradientDrawable.Orientation.TOP_BOTTOM,
                new int[]{0xFF2B2160, 0xFF6C4BF5, 0xFFFF7A59});
        root.setBackground(bg);

        clock = text("", 64, Color.WHITE, true);
        root.addView(clock);
        String name = Store.name(this);
        root.addView(text("בוקר טוב" + (name.isEmpty() ? "" : ", " + name) + " ☀️", 26, Color.WHITE, true));
        if (label != null && !label.isEmpty()) root.addView(text(label, 18, 0xFFE9E3FF, false));

        View space = new View(this);
        root.addView(space, new LinearLayout.LayoutParams(1, dp(28)));

        LinearLayout card = new LinearLayout(this);
        card.setOrientation(LinearLayout.VERTICAL);
        card.setPadding(dp(20), dp(20), dp(20), dp(20));
        GradientDrawable cd = new GradientDrawable();
        cd.setColor(Color.WHITE);
        cd.setCornerRadius(dp(24));
        card.setBackground(cd);

        card.addView(text("כדי לכבות – פותרים תרגיל קטן 🧠", 16, 0xFF5A5577, false));
        question = text("", 36, 0xFF2B2160, true);
        question.setLayoutDirection(View.LAYOUT_DIRECTION_LTR);
        card.addView(question);

        input = new EditText(this);
        input.setInputType(InputType.TYPE_CLASS_NUMBER);
        input.setTextSize(30);
        input.setGravity(Gravity.CENTER);
        input.setHint("?");
        input.setImeOptions(EditorInfo.IME_ACTION_DONE);
        input.setOnEditorActionListener((v, actionId, ev) -> {
            check();
            return true;
        });
        card.addView(input);

        feedback = text("", 16, 0xFFE5484D, false);
        card.addView(feedback);

        Button ok = button("קמתי! ✅", 0xFF3DDC97, 0xFF0D3B2A);
        ok.setOnClickListener(v -> check());
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        lp.topMargin = dp(12);
        card.addView(ok, lp);
        root.addView(card, new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT));

        snooze = button("😴 עוד 5 דקות (פחות נקודות)", 0x33FFFFFF, Color.WHITE);
        snooze.setTextSize(16);
        snooze.setOnClickListener(v -> doSnooze());
        LinearLayout.LayoutParams sp = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        sp.topMargin = dp(20);
        root.addView(snooze, sp);
        updateSnooze();

        TextView hint = text("קמה בלי נודניק = 10 ⭐   ·   עם נודניק = 5 ⭐", 14, 0xFFFFE6DC, false);
        LinearLayout.LayoutParams hp = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        hp.topMargin = dp(16);
        root.addView(hint, hp);

        setContentView(root);
    }

    void updateSnooze() {
        if (snooze == null) return;
        boolean test = "test".equals(occ);
        boolean used = !test && Store.wasSnoozed(this, id, occ);
        snooze.setVisibility(used ? View.GONE : View.VISIBLE);
    }

    void newQuestion() {
        int a = 12 + rnd.nextInt(38), b = 11 + rnd.nextInt(38);
        answer = a + b;
        question.setText(a + " + " + b + " = ?");
        input.setText("");
    }

    void tick() {
        clock.setText(U.hhmm(System.currentTimeMillis()));
        h.postDelayed(this::tick, 10_000);
    }

    void check() {
        int v;
        try {
            v = Integer.parseInt(input.getText().toString().trim());
        } catch (Exception e) {
            feedback.setText("כותבים את התשובה במספרים 🙂");
            return;
        }
        if (v != answer) {
            feedback.setText("לא בדיוק... הנה תרגיל חדש");
            newQuestion();
            return;
        }
        AlarmService.stop(this);
        final boolean test = "test".equals(occ);
        new Thread(() -> {
            int pts = test ? 0 : Store.woke(getApplicationContext(), id, occ, label);
            h.post(() -> done(test, pts));
        }).start();
    }

    void done(boolean test, int pts) {
        feedback.setTextColor(0xFF1B8A5A);
        if (test) feedback.setText("הבדיקה עברה! השעון עובד ✅");
        else if (pts > 0) feedback.setText("כל הכבוד! \u200E+" + pts + " ⭐");
        else feedback.setText("בוקר טוב! ✅");
        h.postDelayed(this::finishAndOpen, 1800);
    }

    void finishAndOpen() {
        try {
            KeyguardManager km = (KeyguardManager) getSystemService(KEYGUARD_SERVICE);
            if (km == null || !km.isKeyguardLocked()) {
                startActivity(new Intent(this, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
            }
        } catch (Exception ignored) {
        }
        finish();
    }

    void doSnooze() {
        AlarmService.stop(this);
        final String fid = id, focc = occ, flabel = label;
        final boolean test = "test".equals(occ);
        new Thread(() -> {
            if (!test) Store.snoozed(getApplicationContext(), fid, focc, flabel);
            Sched.scheduleSnooze(getApplicationContext(), fid, focc, flabel, System.currentTimeMillis() + 5 * U.MIN);
        }).start();
        feedback.setTextColor(0xFF5A5577);
        feedback.setText("😴 עוד 5 דקות מצלצל שוב");
        h.postDelayed(this::finish, 1200);
    }

    @Override
    public void onBackPressed() {
        // The alarm screen can't be closed with the back button.
    }

    @Override
    protected void onDestroy() {
        h.removeCallbacksAndMessages(null);
        super.onDestroy();
    }
}
