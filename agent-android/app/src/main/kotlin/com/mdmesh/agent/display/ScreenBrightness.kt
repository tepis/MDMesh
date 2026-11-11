package com.mdmesh.agent.display

import android.os.Build
import android.provider.Settings
import com.mdmesh.policy.wifi.DpmHandle
import com.mdmesh.proto.ConfigDisplay

/**
 * The configuration's screen brightness (`config.apply` `display`), set as Device Owner with
 * `DevicePolicyManager.setSystemSetting` (API 28+). That works in kiosk too, where neither Settings nor the quick
 * settings are reachable, and needs no WRITE_SETTINGS grant.
 */
class ScreenBrightness(private val handle: DpmHandle, private val packageName: String) {

    /** @return false when this device can't (below Android 9, or not Device Owner): reported unsupported. */
    fun apply(display: ConfigDisplay): Boolean {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.P || !handle.dpm.isDeviceOwnerApp(packageName)) return false
        val mode = if (display.autoBrightness) {
            Settings.System.SCREEN_BRIGHTNESS_MODE_AUTOMATIC
        } else {
            Settings.System.SCREEN_BRIGHTNESS_MODE_MANUAL
        }
        handle.dpm.setSystemSetting(handle.admin, Settings.System.SCREEN_BRIGHTNESS_MODE, mode.toString())
        val level = display.brightness
        if (!display.autoBrightness && level != null) {
            handle.dpm.setSystemSetting(
                handle.admin,
                Settings.System.SCREEN_BRIGHTNESS,
                level.coerceIn(0, MAX_BRIGHTNESS).toString(),
            )
        }
        return true
    }

    private companion object {
        const val MAX_BRIGHTNESS = 255
    }
}
