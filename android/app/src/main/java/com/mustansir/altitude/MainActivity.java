package com.mustansir.altitude;

import android.app.Activity;
import android.content.Intent;
import android.graphics.Color;
import android.graphics.Insets;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.util.Base64;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.view.ViewGroup;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;
import android.widget.FrameLayout;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.FilterInputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.Locale;

public class MainActivity extends Activity {
    private static final String OLD_HOST = "appassets.androidplatform.net";
    private static final String LIVE_HOST = "altitude-lime-two.vercel.app";
    private static final String OLD_URL = "https://" + OLD_HOST + "/assets/index.html";
    private static final String LIVE_URL = "https://" + LIVE_HOST + "/";
    private static final String STORAGE_KEY = "altitude-roadmap-v1";
    private static final String MIGRATION_KEY = "live_origin_migrated";
    private static final int IMPORT_REQUEST = 1001;
    private static final int EXPORT_REQUEST = 1002;
    private WebView webView;
    private ValueCallback<Uri[]> importCallback;
    private byte[] pendingExport;
    private boolean migrationPending;
    private String oldProgress;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().setStatusBarColor(Color.rgb(8, 36, 51));
        getWindow().setNavigationBarColor(Color.rgb(8, 36, 51));
        if (Build.VERSION.SDK_INT >= 30) {
            getWindow().setDecorFitsSystemWindows(false);
            getWindow().getInsetsController().setSystemBarsAppearance(0,
                    WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS |
                    WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS);
        }

        webView = new WebView(this);
        webView.setBackgroundColor(Color.rgb(246, 249, 248));
        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(Color.rgb(8, 36, 51));
        root.addView(webView, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        if (Build.VERSION.SDK_INT >= 30) {
            root.setOnApplyWindowInsetsListener((view, insets) -> {
                Insets bars = insets.getInsets(
                        WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout());
                FrameLayout.LayoutParams bounds = (FrameLayout.LayoutParams) webView.getLayoutParams();
                if (bounds.leftMargin != bars.left || bounds.topMargin != bars.top ||
                        bounds.rightMargin != bars.right || bounds.bottomMargin != bars.bottom) {
                    bounds.setMargins(bars.left, bars.top, bars.right, bars.bottom);
                    webView.setLayoutParams(bounds);
                }
                return insets;
            });
        }
        setContentView(root);
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setCacheMode(WebSettings.LOAD_NO_CACHE);
        webView.addJavascriptInterface(new AndroidBridge(), "AltitudeAndroid");
        webView.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                if (isOldUrl(uri)) {
                    String path = uri.getPath();
                    if (path == null || !path.startsWith("/assets/")) return null;
                    return bundledAsset(path.substring("/assets/".length()));
                }
                if (isLiveUrl(uri)) {
                    String name = assetName(uri.getPath());
                    if (name != null) return liveOrBundled(uri, name);
                }
                return null;
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                if (request.isForMainFrame() && !isOldUrl(request.getUrl()) && !isLiveUrl(request.getUrl())) {
                    openExternal(request.getUrl());
                    return true;
                }
                return false;
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                Uri uri = Uri.parse(url);
                if (migrationPending && isOldUrl(uri)) {
                    view.evaluateJavascript("localStorage.getItem('" + STORAGE_KEY + "')", result -> {
                        oldProgress = decodeJsString(result);
                        view.loadUrl(LIVE_URL);
                    });
                } else if (migrationPending && isLiveUrl(uri)) {
                    migrationPending = false;
                    if (oldProgress != null) {
                        String script = "(function(){try{if(!localStorage.getItem('" + STORAGE_KEY + "')){" +
                                "localStorage.setItem('" + STORAGE_KEY + "'," + JSONObject.quote(oldProgress) + ");}" +
                                "return true;}catch(e){return false;}})()";
                        view.evaluateJavascript(script, result -> {
                            if ("true".equals(result)) {
                                getPreferences(MODE_PRIVATE).edit().putBoolean(MIGRATION_KEY, true).apply();
                                view.reload();
                            } else {
                                Toast.makeText(MainActivity.this, "Could not move old progress. Use backup import.", Toast.LENGTH_LONG).show();
                            }
                        });
                    } else {
                        getPreferences(MODE_PRIVATE).edit().putBoolean(MIGRATION_KEY, true).apply();
                    }
                }
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
        migrationPending = !getPreferences(MODE_PRIVATE).getBoolean(MIGRATION_KEY, false);
        webView.loadUrl(migrationPending ? OLD_URL : LIVE_URL);
    }

    private boolean isOldUrl(Uri uri) {
        return "https".equals(uri.getScheme()) && OLD_HOST.equals(uri.getHost());
    }

    private boolean isLiveUrl(Uri uri) {
        return "https".equals(uri.getScheme()) && LIVE_HOST.equals(uri.getHost());
    }

    private String assetName(String path) {
        if ("/".equals(path) || "/index.html".equals(path)) return "index.html";
        if ("/app.js".equals(path)) return "app.js";
        if ("/styles.css".equals(path)) return "styles.css";
        return null;
    }

    private WebResourceResponse bundledAsset(String name) {
        if (!"index.html".equals(name) && !"app.js".equals(name) && !"styles.css".equals(name)) return null;
        try {
            return new WebResourceResponse(mimeType(name), "UTF-8", getAssets().open(name));
        } catch (Exception ignored) {
            return null;
        }
    }

    private WebResourceResponse liveOrBundled(Uri uri, String name) {
        try {
            HttpURLConnection connection = (HttpURLConnection) new URL(uri.toString()).openConnection();
            connection.setConnectTimeout(5000);
            connection.setReadTimeout(5000);
            connection.setRequestProperty("Cache-Control", "no-cache");
            if (connection.getResponseCode() == 200) {
                InputStream stream = new FilterInputStream(connection.getInputStream()) {
                    @Override
                    public void close() throws java.io.IOException {
                        super.close();
                        connection.disconnect();
                    }
                };
                return new WebResourceResponse(mimeType(name), "UTF-8", stream);
            }
            connection.disconnect();
        } catch (Exception ignored) {
            // The copy bundled in the APK is available when the phone is offline.
        }
        return bundledAsset(name);
    }

    private String decodeJsString(String value) {
        if (value == null || "null".equals(value)) return null;
        try {
            return new JSONArray("[" + value + "]").getString(0);
        } catch (Exception ignored) {
            return null;
        }
    }

    private String mimeType(String filename) {
        String lower = filename.toLowerCase(Locale.ROOT);
        if (lower.endsWith(".html")) return "text/html";
        if (lower.endsWith(".css")) return "text/css";
        if (lower.endsWith(".js")) return "text/javascript";
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
                importCallback.onReceiveValue(resultCode == RESULT_OK && data != null && data.getData() != null ? new Uri[]{data.getData()} : null);
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
