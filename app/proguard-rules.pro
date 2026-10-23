# Screens talk to the phone through these methods – keep their names.
-keepattributes JavascriptInterface
-keepclassmembers class com.heavyfocus.bezman.Bridge {
    @android.webkit.JavascriptInterface public *;
}
