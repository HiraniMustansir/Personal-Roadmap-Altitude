package com.mustansir.altitude;

import android.app.Activity;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.os.Build;
import android.util.Base64;
import android.graphics.Insets;
import android.view.WindowInsets;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import java.io.InputStream;
import java.io.OutputStream;
import java.util.Locale;

public class MainActivity extends Activity {
    private static final String APP_HOST = "appassets.androidplatform.net";
    private static final int IMPORT_REQUEST = 1001;
    private static final int EXPORT_REQUEST = 1002;
    private WebView webView;
    private ValueCallback<Uri[]> importCallback;
    private byte[] pendingExport;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().setStatusBarColor(Color.rgb(8, 36, 51));
        getWindow().setNavigationBarColor(Color.rgb(8, 36, 51));

        webView = new WebView(this);
        webView.setBackgroundColor(Color.rgb(246, 249, 248));
        if (Build.VERSION.SDK_INT >= 35) {
            webView.setOnApplyWindowInsetsListener((view, insets) -> {
                Insets bars = insets.getInsets(WindowInsets.Type.systemBars());
                view.setPadding(0, bars.top, 0, bars.bottom);
                return insets;
            });
        }
        setContentView(webView);
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        webView.addJavascriptInterface(new AndroidBridge(), "AltitudeAndroid");
        webView.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                if (!isAppUrl(uri)) return null;
                String path = uri.getPath();
                if (path == null || !path.startsWith("/assets/")) return null;
                String filename = path.substring("/assets/".length());
                if (filename.isEmpty() || filename.contains("..") || filename.startsWith("/")) return null;
                try {
                    InputStream stream = getAssets().open(filename);
                    return new WebResourceResponse(mimeType(filename), "UTF-8", stream);
                } catch (Exception ignored) {
                    return null;
                }
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                if (request.isForMainFrame() && !isAppUrl(request.getUrl())) {
                    openExternal(request.getUrl());
                    return true;
                }
                return false;
            }
        });
        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (importCallback != null) importCallback.onReceiveValue(null);
                importCallback = callback;
                Intent intent = new Intent(Intent.ACTION_GET_CONTENT);
                intent.addCategory(Intent.CATEGORY_OPENABLE);
                intent.setType("application/json");
                try {
                    startActivityForResult(Intent.createChooser(intent, "Choose an Altitude backup"), IMPORT_REQUEST);
                    return true;
                } catch (Exception e) {
                    importCallback = null;
                    return false;
                }
            }
        });
        webView.loadUrl("https://" + APP_HOST + "/assets/index.html");
    }

    private boolean isAppUrl(Uri uri) {
        return "https".equals(uri.getScheme()) && APP_HOST.equals(uri.getHost());
    }

    private String mimeType(String filename) {
        String lower = filename.toLowerCase(Locale.ROOT);
        if (lower.endsWith(".html")) return "text/html";
        if (lower.endsWith(".css")) return "text/css";
        if (lower.endsWith(".js")) return "text/javascript";
        if (lower.endsWith(".svg")) return "image/svg+xml";
        if (lower.endsWith(".json")) return "application/json";
        return "application/octet-stream";
    }

    private void openExternal(Uri uri) {
        String scheme = uri.getScheme();
        if (!"https".equals(scheme) && !"http".equals(scheme)) return;
        try {
            startActivity(new Intent(Intent.ACTION_VIEW, uri));
        } catch (Exception e) {
            Toast.makeText(this, "No browser found for this link", Toast.LENGTH_SHORT).show();
        }
    }

    private class AndroidBridge {
        @JavascriptInterface
        public void openExternal(String url) {
            Uri uri = Uri.parse(url);
            runOnUiThread(() -> MainActivity.this.openExternal(uri));
        }

        @JavascriptInterface
        public void saveFile(String name, String mime, String base64) {
            try {
                byte[] bytes = Base64.decode(base64, Base64.DEFAULT);
                runOnUiThread(() -> {
                    pendingExport = bytes;
                    Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
                    intent.addCategory(Intent.CATEGORY_OPENABLE);
                    intent.setType(mime);
                    intent.putExtra(Intent.EXTRA_TITLE, name);
                    startActivityForResult(intent, EXPORT_REQUEST);
                });
            } catch (Exception e) {
                runOnUiThread(() -> Toast.makeText(MainActivity.this, "Could not export file", Toast.LENGTH_SHORT).show());
            }
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == IMPORT_REQUEST) {
            if (importCallback != null) {
                importCallback.onReceiveValue(resultCode == RESULT_OK && data != null ? new Uri[]{data.getData()} : null);
                importCallback = null;
            }
        } else if (requestCode == EXPORT_REQUEST) {
            if (resultCode == RESULT_OK && data != null && pendingExport != null) {
                try (OutputStream stream = getContentResolver().openOutputStream(data.getData())) {
                    if (stream != null) {
                        stream.write(pendingExport);
                        Toast.makeText(this, "File saved", Toast.LENGTH_SHORT).show();
                    }
                } catch (Exception e) {
                    Toast.makeText(this, "Could not save file", Toast.LENGTH_SHORT).show();
                }
            }
            pendingExport = null;
        }
    }

    @Override
    protected void onDestroy() {
        if (webView != null) webView.destroy();
        super.onDestroy();
    }
}
