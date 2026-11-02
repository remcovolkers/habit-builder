package io.github.remcovolkers.habitbuilder.calendar;

import android.Manifest;
import android.content.ContentUris;
import android.database.Cursor;
import android.net.Uri;
import android.provider.CalendarContract;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;

/**
 * De brug tussen de app (de webweergave) en de agenda van de telefoon, zie docs/AGENDA.md.
 * De app roept dit aan via window.Capacitor.Plugins.DeviceCalendar (src/data/device-calendar.js).
 *
 * Alleen lezen: de plugin heeft geen schrijfrechten en geeft niets door buiten de app. Herhalingen en tijdzones rekent Android zelf uit
 * (CalendarContract.Instances); de app krijgt per keer een begin en een einde in milliseconden.
 */
@CapacitorPlugin(
    name = "DeviceCalendar",
    permissions = { @Permission(alias = "calendar", strings = { Manifest.permission.READ_CALENDAR }) }
)
public class DeviceCalendarPlugin extends Plugin {

    /** Meer dan dit geven we niet terug: een agenda met honderden afspraken per dag is geen agenda meer, en de brug is geen vrachtwagen. */
    private static final int MAX_EVENTS = 1500;

    private static final String[] PROJECTION = {
        CalendarContract.Instances.EVENT_ID,
        CalendarContract.Instances.TITLE,
        CalendarContract.Instances.BEGIN,
        CalendarContract.Instances.END,
        CalendarContract.Instances.ALL_DAY,
        CalendarContract.Calendars.VISIBLE,
        CalendarContract.Events.STATUS,
        CalendarContract.Events.SELF_ATTENDEE_STATUS,
    };

    /**
     * De afspraken die tussen `begin` en `end` (milliseconden sinds 1970) vallen, als { events: [{ id, title, begin, end, allDay }] }.
     * Wat je zelf hebt afgewezen, wat is geannuleerd en wat in een verborgen agenda staat, komt er niet in.
     * Een hele dag staat in Android als middernacht UTC tot middernacht UTC; de app rekent dat om.
     */
    @PluginMethod
    public void getEvents(PluginCall call) {
        if (getPermissionState("calendar") != PermissionState.GRANTED) {
            call.reject("geen toestemming om de agenda te lezen");
            return;
        }
        long begin = call.getData().optLong("begin", Long.MIN_VALUE);
        long end = call.getData().optLong("end", Long.MIN_VALUE);
        if (begin == Long.MIN_VALUE || end == Long.MIN_VALUE || end <= begin) {
            call.reject("ongeldig bereik");
            return;
        }

        Uri.Builder builder = CalendarContract.Instances.CONTENT_URI.buildUpon();
        ContentUris.appendId(builder, begin);
        ContentUris.appendId(builder, end);

        JSArray events = new JSArray();
        try (Cursor cursor = getContext().getContentResolver().query(builder.build(), PROJECTION, null, null, CalendarContract.Instances.BEGIN + " ASC")) {
            if (cursor != null) {
                while (cursor.moveToNext() && events.length() < MAX_EVENTS) {
                    if (cursor.getInt(5) == 0) continue; // een agenda die je op de telefoon hebt verborgen
                    if (cursor.getInt(6) == CalendarContract.Events.STATUS_CANCELED) continue;
                    if (cursor.getInt(7) == CalendarContract.Attendees.ATTENDEE_STATUS_DECLINED) continue;
                    JSObject event = new JSObject();
                    event.put("id", cursor.getLong(0));
                    event.put("title", cursor.isNull(1) ? "" : cursor.getString(1));
                    event.put("begin", cursor.getLong(2));
                    event.put("end", cursor.getLong(3));
                    event.put("allDay", cursor.getInt(4) == 1);
                    events.put(event);
                }
            }
        } catch (SecurityException e) {
            call.reject("geen toestemming om de agenda te lezen");
            return;
        } catch (RuntimeException e) {
            call.reject("de agenda lezen is niet gelukt");
            return;
        }

        JSObject result = new JSObject();
        result.put("events", events);
        call.resolve(result);
    }
}
