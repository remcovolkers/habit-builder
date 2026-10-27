package io.github.remcovolkers.habitbuilder;

import android.os.Bundle;
import android.view.View;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;
import io.github.remcovolkers.habitbuilder.widget.HabitWidgetPlugin;

public class MainActivity extends BridgeActivity {

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        // de brug naar de widget voor het startscherm (docs/ANDROID-WIDGET.md); plugins moeten vóór super.onCreate worden aangemeld
        registerPlugin(HabitWidgetPlugin.class);
        super.onCreate(savedInstanceState);
        // Zonder bridge (geen WebView op dit toestel) valt er niets in te stellen.
        if (getBridge() == null) return;
        WebView webView = getBridge().getWebView();
        // Geen elastisch meetrekken aan de boven- of onderkant: Android 12+ rekt dan de hele WebView uit, ook de vaste tabbalk, en dat voelt niet
        // als een app. (overscroll-behavior in de CSS regelt dit alleen voor de browser, niet voor een WebView.)
        webView.setOverScrollMode(View.OVER_SCROLL_NEVER);
        // Geen scrollbalk van de WebView zelf; een app toont die ook niet als je met je vinger scrolt.
        webView.setVerticalScrollBarEnabled(false);
        webView.setHorizontalScrollBarEnabled(false);
    }
}
