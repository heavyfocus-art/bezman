package com.heavyfocus.bezman;

import android.app.Application;

public class App extends Application {
    @Override
    public void onCreate() {
        super.onCreate();
        Notify.channels(this);
        SyncJob.schedule(this);
    }
}
