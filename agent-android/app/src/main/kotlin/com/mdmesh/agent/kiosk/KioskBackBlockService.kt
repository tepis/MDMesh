package com.mdmesh.agent.kiosk

import android.accessibilityservice.AccessibilityService
import android.view.KeyEvent
import android.view.accessibility.AccessibilityEvent
import com.mdmesh.core.store.KioskStateStore
import dagger.hilt.android.AndroidEntryPoint
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import javax.inject.Inject

/**
 * Swallows Back while the applied kiosk asks for it (`features.blockBack`), so the Back arrow of the navigation bar
 * (or a hardware Back key) can't close the pinned app and make the kiosk launch it again.
 *
 * Accessibility key filtering sees key events, which is what the three-button navigation bar and hardware keys send.
 * The gesture navigation's back swipe doesn't go through key events on recent Android versions, so it is not caught.
 *
 * The service reads no screen content and receives no accessibility events. Android lets no app turn an accessibility
 * service on by itself: enable it once with adb (`settings put secure enabled_accessibility_services …`).
 */
@AndroidEntryPoint
class KioskBackBlockService : AccessibilityService() {

    @Inject lateinit var store: KioskStateStore

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)

    @Volatile private var blockBack = false

    override fun onServiceConnected() {
        super.onServiceConnected()
        scope.launch {
            store.flow().collect { blockBack = it?.features?.blockBack == true }
        }
    }

    override fun onKeyEvent(event: KeyEvent): Boolean = blockBack && event.keyCode == KeyEvent.KEYCODE_BACK

    override fun onAccessibilityEvent(event: AccessibilityEvent?) = Unit

    override fun onInterrupt() = Unit

    override fun onDestroy() {
        scope.cancel()
        super.onDestroy()
    }
}
