package io.github.remcovolkers.habitbuilder.widget;

import android.content.Context;
import android.graphics.Color;
import io.github.remcovolkers.habitbuilder.R;
import org.json.JSONObject;

/**
 * De kleuren van de widget: die van het thema dat in de app is gekozen (de app geeft ze mee in de momentopname), met voor elke kleur een
 * standaardwaarde uit colors.xml als de app er geen heeft gegeven of de waarde niet te lezen is.
 */
final class WidgetColors {
    final int background;
    final int text;
    final int muted;
    final int accent;
    final int onAccent;
    final int hairline;

    WidgetColors(Context context, JSONObject snapshot) {
        JSONObject colors = snapshot == null ? null : snapshot.optJSONObject("colors");
        background = pick(context, colors, "background", R.color.widget_background);
        text = pick(context, colors, "text", R.color.widget_text);
        muted = pick(context, colors, "muted", R.color.widget_muted);
        accent = pick(context, colors, "accent", R.color.widget_accent);
        onAccent = pick(context, colors, "onAccent", R.color.widget_on_accent);
        hairline = pick(context, colors, "hairline", R.color.widget_hairline);
    }

    private static int pick(Context context, JSONObject colors, String name, int fallbackResource) {
        int fallback = context.getColor(fallbackResource);
        if (colors == null) return fallback;
        String value = colors.optString(name, "");
        if (value.isEmpty()) return fallback;
        try {
            return Color.parseColor(value); // "#rrggbb" of "#aarrggbb"
        } catch (IllegalArgumentException e) {
            return fallback;
        }
    }
}
