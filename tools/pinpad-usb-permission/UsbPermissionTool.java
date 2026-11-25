import android.hardware.usb.UsbDevice;
import android.os.Bundle;
import android.os.IBinder;
import android.os.UserHandle;

import java.lang.reflect.InvocationTargetException;
import java.util.HashSet;
import java.util.Set;

/**
 * Runs on the tablet as the ADB shell user (via app_process) and talks to the system USB service.
 *
 * The shell user holds MANAGE_USB, which no installed app can get (not even a Device Owner), so
 * this is the only way to give a payment driver a USB permission that survives a reboot without
 * the system "Allow access?" dialog, which kiosk lock task blocks.
 *
 * Usage (see grant-pinpad-usb.sh, which builds and runs this):
 *   UsbPermissionTool list
 *   UsbPermissionTool grant  <uid> <vendorId>[,<vendorId>...]
 *   UsbPermissionTool revoke <uid> <vendorId>[,<vendorId>...]
 *
 * Output is one line per device: "DEVICE ...", "GRANTED ...", "REVOKED ...". Exit code 0 when at
 * least one device was handled (or for list), 2 when no connected device matched, 1 on error.
 */
public final class UsbPermissionTool {

    private UsbPermissionTool() {
    }

    public static void main(String[] args) {
        try {
            System.exit(run(args));
        } catch (InvocationTargetException e) {
            fail(e.getCause() != null ? e.getCause() : e);
        } catch (Throwable t) {
            fail(t);
        }
    }

    private static void fail(Throwable t) {
        if (t instanceof NoSuchMethodException) {
            System.out.println("ERROR this Android version has no persistent USB permissions "
                    + "(needs Android 10 or later): " + t.getMessage());
        } else if (t instanceof SecurityException) {
            System.out.println("ERROR the shell user may not manage USB permissions on this "
                    + "firmware: " + t.getMessage());
        } else {
            System.out.println("ERROR " + t);
        }
        System.exit(1);
    }

    private static int run(String[] args) throws Exception {
        if (args.length < 1) {
            System.out.println("ERROR usage: list | grant <uid> <vendorIds> | revoke <uid> <vendorIds>");
            return 1;
        }
        String command = args[0];
        Object usb = usbService();
        Bundle devices = new Bundle();
        usb.getClass().getMethod("getDeviceList", Bundle.class).invoke(usb, devices);
        devices.setClassLoader(UsbDevice.class.getClassLoader());

        if (command.equals("list")) {
            for (String name : devices.keySet()) {
                System.out.println("DEVICE " + describe(name, (UsbDevice) devices.getParcelable(name)));
            }
            return 0;
        }

        boolean grant = command.equals("grant");
        if ((!grant && !command.equals("revoke")) || args.length < 3) {
            System.out.println("ERROR usage: list | grant <uid> <vendorIds> | revoke <uid> <vendorIds>");
            return 1;
        }
        int uid = Integer.parseInt(args[1]);
        Set<Integer> vendorIds = new HashSet<>();
        for (String id : args[2].split(",")) {
            vendorIds.add(Integer.decode(id.trim()));
        }
        UserHandle user = (UserHandle) UserHandle.class.getMethod("of", int.class)
                .invoke(null, uid / 100000);

        int handled = 0;
        for (String name : devices.keySet()) {
            UsbDevice device = devices.getParcelable(name);
            if (!vendorIds.contains(device.getVendorId())) {
                continue;
            }
            // Survives reboots and replugs; keyed by the device's ids and serial number.
            usb.getClass()
                    .getMethod("setDevicePersistentPermission",
                            UsbDevice.class, int.class, UserHandle.class, boolean.class)
                    .invoke(usb, device, uid, user, grant);
            if (grant) {
                // Also valid right now, so no reboot or replug is needed after the first run.
                usb.getClass()
                        .getMethod("grantDevicePermission", UsbDevice.class, int.class)
                        .invoke(usb, device, uid);
            }
            System.out.println((grant ? "GRANTED " : "REVOKED ") + describe(name, device)
                    + " uid=" + uid);
            handled++;
        }
        return handled > 0 ? 0 : 2;
    }

    private static Object usbService() throws Exception {
        IBinder binder = (IBinder) Class.forName("android.os.ServiceManager")
                .getMethod("getService", String.class)
                .invoke(null, "usb");
        if (binder == null) {
            throw new IllegalStateException("USB service not found");
        }
        return Class.forName("android.hardware.usb.IUsbManager$Stub")
                .getMethod("asInterface", IBinder.class)
                .invoke(null, binder);
    }

    private static String describe(String name, UsbDevice device) {
        return name
                + " vendorId=" + device.getVendorId()
                + " productId=" + device.getProductId()
                + " manufacturer=\"" + device.getManufacturerName() + "\""
                + " product=\"" + device.getProductName() + "\"";
    }
}
