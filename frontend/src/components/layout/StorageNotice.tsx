import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";

import { acknowledgeStorageNotice, storageNoticeAcknowledged } from "@/lib/session";

/**
 * First-visit notice about what this system stores on the device.
 *
 * There is no advertising or tracking here to consent to; the notice exists
 * because an evidence system should be explicit that it keeps a session
 * token on the device and logs every access. Shown once, dismissed
 * permanently on this browser.
 */
export function StorageNotice() {
  const [visible, setVisible] = useState(() => !storageNoticeAcknowledged());

  return (
    <AnimatePresence>
      {visible && (
        <motion.aside
          role="region"
          aria-label="Storage notice"
          initial={{ y: 40, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 40, opacity: 0 }}
          transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
          className="hud-frame fixed inset-x-4 bottom-4 z-[60] mx-auto max-w-2xl rounded-lg p-4 text-sm md:inset-x-auto md:right-6"
        >
          <p className="eyebrow mb-1 text-cot-violet/80">Stored on this device</p>
          <p className="text-on-surface-variant">
            Chain of Truth keeps a signed-in session token and your interface preferences in this browser's
            storage. No advertising or third-party tracking is used. Every action you take while signed in is
            written to the case audit trail.
          </p>
          <div className="mt-3 flex justify-end gap-2">
            <button
              onClick={() => {
                acknowledgeStorageNotice();
                setVisible(false);
              }}
              className="rounded bg-primary-container px-4 py-1.5 text-xs font-semibold text-on-primary"
            >
              Understood
            </button>
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}
