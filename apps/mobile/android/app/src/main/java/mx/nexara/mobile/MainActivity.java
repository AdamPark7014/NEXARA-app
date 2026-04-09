package mx.nexara.mobile;

import android.Manifest;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Bundle;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import com.getcapacitor.BridgeActivity;
import java.util.ArrayList;
import java.util.List;

public class MainActivity extends BridgeActivity {

  private static final int REQ_PERMISSIONS = 0x4e58;

  @Override
  public void onCreate(Bundle savedInstanceState) {
    super.onCreate(savedInstanceState);
    requestNeededPermissions();
  }

  private void requestNeededPermissions() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) {
      return;
    }

    List<String> required = new ArrayList<>();

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      required.add(Manifest.permission.POST_NOTIFICATIONS);
      required.add(Manifest.permission.READ_MEDIA_IMAGES);
    } else {
      required.add(Manifest.permission.READ_EXTERNAL_STORAGE);
    }

    required.add(Manifest.permission.CAMERA);
    required.add(Manifest.permission.ACCESS_FINE_LOCATION);
    required.add(Manifest.permission.ACCESS_COARSE_LOCATION);

    List<String> toRequest = new ArrayList<>();
    for (String permission : required) {
      if (ContextCompat.checkSelfPermission(this, permission) != PackageManager.PERMISSION_GRANTED) {
        toRequest.add(permission);
      }
    }

    if (!toRequest.isEmpty()) {
      ActivityCompat.requestPermissions(
        this,
        toRequest.toArray(new String[0]),
        REQ_PERMISSIONS
      );
    }
  }
}
