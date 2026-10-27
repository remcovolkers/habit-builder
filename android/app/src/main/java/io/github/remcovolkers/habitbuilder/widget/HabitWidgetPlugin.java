package io.github.remcovolkers.habitbuilder.widget;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * De brug tussen de app (de webweergave) en de widget voor het startscherm, zie docs/ANDROID-WIDGET.md.
 * De app roept dit aan via window.Capacitor.Plugins.HabitWidget (src/ui/widget.js).
 */
@CapacitorPlugin(name = "HabitWidget")
public class HabitWidgetPlugin extends Plugin {

    /** Bewaart de lijst van vandaag (als JSON-tekst in `json`) en laat de widget verversen. */
    @PluginMethod
    public void setSnapshot(PluginCall call) {
        String json = call.getString("json");
        if (json == null || !WidgetStore.saveSnapshot(getContext(), json)) {
            call.reject("ongeldige momentopname");
            return;
        }
        HabitWidgetProvider.refreshAll(getContext());
        call.resolve();
    }

    /** Geeft wat er in de widget is aangetikt (JSON-tekst in `json`) en maakt de wachtrij leeg. */
    @PluginMethod
    public void takeQueue(PluginCall call) {
        JSObject result = new JSObject();
        result.put("json", WidgetStore.takeQueue(getContext()));
        call.resolve(result);
    }
}
