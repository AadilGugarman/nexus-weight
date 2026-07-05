package com.nexus.weight;

import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "WhatsAppShare")
public class WhatsAppSharePlugin extends Plugin {
    @PluginMethod
    public void share(PluginCall call) {
        String uriValue = call.getString("uri");
        String mimeType = call.getString("mimeType", "application/octet-stream");
        String phone = normalizePhone(call.getString("phone", ""));
        String text = call.getString("text", "");

        if (uriValue == null || uriValue.length() == 0) {
            call.reject("Missing file URI");
            return;
        }

        String packageName = installedPackage();
        if (packageName == null) {
            call.reject("WhatsApp is not installed");
            return;
        }

        Uri uri = Uri.parse(uriValue);
        Intent intent = new Intent(Intent.ACTION_SEND);
        intent.setType(mimeType);
        intent.setPackage(packageName);
        intent.putExtra(Intent.EXTRA_STREAM, uri);
        if (text.length() > 0) intent.putExtra(Intent.EXTRA_TEXT, text);
        if (phone.length() > 0) intent.putExtra("jid", phone + "@s.whatsapp.net");
        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        getContext().grantUriPermission(packageName, uri, Intent.FLAG_GRANT_READ_URI_PERMISSION);

        try {
            getActivity().startActivity(intent);
            call.resolve();
        } catch (ActivityNotFoundException error) {
            call.reject("Unable to open WhatsApp", error);
        } catch (Exception error) {
            call.reject("Unable to share with WhatsApp", error);
        }
    }

    private String installedPackage() {
        PackageManager pm = getContext().getPackageManager();
        if (isInstalled(pm, "com.whatsapp")) return "com.whatsapp";
        if (isInstalled(pm, "com.whatsapp.w4b")) return "com.whatsapp.w4b";
        return null;
    }

    private boolean isInstalled(PackageManager pm, String packageName) {
        try {
            pm.getPackageInfo(packageName, 0);
            return true;
        } catch (PackageManager.NameNotFoundException error) {
            return false;
        }
    }

    private String normalizePhone(String phone) {
        if (phone == null) return "";
        String digits = phone.replaceAll("[^0-9]", "");
        if (digits.length() == 10) return "91" + digits;
        return digits;
    }
}
