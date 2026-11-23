package tr.com.ozguvenis.portal;

import android.net.Uri;
import android.util.Base64;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;

/**
 * Paylaşılacak dosyayı (ör. fatura PDF'i) uygulama önbelleğine yazar ve file:// adresini döner;
 * @capacitor/share bu adresi FileProvider (res/xml/file_paths.xml → cache-path) üzerinden paylaşır.
 * @capacitor/filesystem yerine: o eklenti derleme için ayrı bir JDK 21 araç zinciri istiyor.
 */
@CapacitorPlugin(name = "FileCache")
public class FileCachePlugin extends Plugin {
    private static final String DIR = "shared";

    @PluginMethod
    public void write(PluginCall call) {
        String name = call.getString("name");
        String data = call.getString("data");
        if (name == null || data == null) {
            call.reject("name ve data gerekli");
            return;
        }
        // Yalnızca dosya adı: klasör geçişi (../) engellenir.
        String safe = new File(name).getName().replaceAll("[\\\\/:*?\"<>|]", "-");
        if (safe.isEmpty() || safe.equals(".") || safe.equals("..")) safe = "belge";
        File dir = new File(getContext().getCacheDir(), DIR);
        if (!dir.exists() && !dir.mkdirs()) {
            call.reject("Önbellek klasörü oluşturulamadı");
            return;
        }
        File out = new File(dir, safe);
        try (FileOutputStream fos = new FileOutputStream(out)) {
            fos.write(Base64.decode(data, Base64.DEFAULT));
        } catch (IOException | IllegalArgumentException e) {
            call.reject("Dosya yazılamadı", e);
            return;
        }
        JSObject ret = new JSObject();
        ret.put("uri", Uri.fromFile(out).toString());
        call.resolve(ret);
    }
}
