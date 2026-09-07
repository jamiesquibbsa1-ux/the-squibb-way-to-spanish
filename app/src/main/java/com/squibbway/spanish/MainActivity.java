package com.squibbway.spanish;

import android.Manifest;
import android.app.Activity;
import android.os.Bundle;
import android.content.pm.PackageManager;
import android.speech.RecognitionListener;
import android.speech.RecognizerIntent;
import android.speech.SpeechRecognizer;
import android.content.Intent;
import android.speech.tts.TextToSpeech;
import android.webkit.JavascriptInterface;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.graphics.Color;
import java.util.ArrayList;
import java.util.Locale;
import org.json.JSONObject;

public class MainActivity extends Activity implements TextToSpeech.OnInitListener {
    private WebView webView;
    private TextToSpeech tts;
    private SpeechRecognizer recognizer;
    private static final int REQ_AUDIO = 41;
    private boolean pendingRecognition = false;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().setStatusBarColor(Color.rgb(8,9,11));
        getWindow().setNavigationBarColor(Color.rgb(8,9,11));

        webView = new WebView(this);
        setContentView(webView);

        WebSettings s = webView.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setAllowFileAccess(true);
        s.setAllowContentAccess(true);
        // The app shell is a trusted local asset, but the shared Squibb League
        // must call the HTTPS Supabase backend. Without this Android blocks
        // fetch/XHR from file:///android_asset to https:// and cloud sync fails.
        s.setAllowUniversalAccessFromFileURLs(true);
        s.setAllowFileAccessFromFileURLs(true);
        s.setBuiltInZoomControls(false);
        s.setDisplayZoomControls(false);

        webView.setWebViewClient(new WebViewClient());
        webView.addJavascriptInterface(new Bridge(), "AndroidBridge");
        tts = new TextToSpeech(this, this);
        webView.loadUrl("file:///android_asset/index.html");
    }

    @Override
    public void onInit(int status) {
        if (status == TextToSpeech.SUCCESS && tts != null) {
            tts.setLanguage(new Locale("es", "ES"));
        }
    }

    public class Bridge {
        @JavascriptInterface
        public void speak(final String text, final float rate) {
            runOnUiThread(() -> {
                if (tts != null) {
                    tts.setLanguage(new Locale("es", "ES"));
                    tts.setSpeechRate(Math.max(0.45f, Math.min(rate, 1.25f)));
                    tts.speak(text, TextToSpeech.QUEUE_FLUSH, null, "squibb_spanish");
                }
            });
        }

        @JavascriptInterface
        public void startSpeechRecognition() {
            runOnUiThread(() -> requestOrStartRecognition());
        }
    }

    private void requestOrStartRecognition() {
        if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            pendingRecognition = true;
            requestPermissions(new String[]{Manifest.permission.RECORD_AUDIO}, REQ_AUDIO);
            return;
        }
        startRecognition();
    }

    private void startRecognition() {
        if (!SpeechRecognizer.isRecognitionAvailable(this)) {
            sendSpeechError("Speech recognition is not available on this phone.");
            return;
        }
        if (recognizer != null) recognizer.destroy();
        recognizer = SpeechRecognizer.createSpeechRecognizer(this);
        recognizer.setRecognitionListener(new RecognitionListener() {
            public void onReadyForSpeech(Bundle params) {}
            public void onBeginningOfSpeech() {}
            public void onRmsChanged(float rmsdB) {}
            public void onBufferReceived(byte[] buffer) {}
            public void onEndOfSpeech() {}
            public void onEvent(int eventType, Bundle params) {}
            public void onPartialResults(Bundle partialResults) {}
            public void onError(int error) { sendSpeechError("Didn't catch that — tap to retry."); }
            public void onResults(Bundle results) {
                ArrayList<String> list = results.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
                String heard = (list != null && !list.isEmpty()) ? list.get(0) : "";
                final String js = "window.SquibbNativeSpeechResult && window.SquibbNativeSpeechResult(" + JSONObject.quote(heard) + ");";
                webView.post(() -> webView.evaluateJavascript(js, null));
            }
        });
        Intent intent = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
        intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
        intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE, "es-ES");
        intent.putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, false);
        recognizer.startListening(intent);
    }

    private void sendSpeechError(String message) {
        final String js = "window.SquibbNativeSpeechError && window.SquibbNativeSpeechError(" + JSONObject.quote(message) + ");";
        webView.post(() -> webView.evaluateJavascript(js, null));
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == REQ_AUDIO) {
            if (grantResults.length > 0 && grantResults[0] == PackageManager.PERMISSION_GRANTED) {
                if (pendingRecognition) { pendingRecognition = false; startRecognition(); }
            } else {
                pendingRecognition = false;
                sendSpeechError("Microphone permission is needed for automatic speaking practice.");
            }
        }
    }

    @Override
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) webView.goBack();
        else super.onBackPressed();
    }

    @Override
    protected void onDestroy() {
        if (recognizer != null) recognizer.destroy();
        if (tts != null) { tts.stop(); tts.shutdown(); }
        if (webView != null) webView.destroy();
        super.onDestroy();
    }
}
