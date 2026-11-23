package tr.com.ozguvenis.portal;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Uygulamaya özel yerel eklentiler köprü kurulmadan önce kaydedilir.
        registerPlugin(FileCachePlugin.class);
        super.onCreate(savedInstanceState);
    }
}
