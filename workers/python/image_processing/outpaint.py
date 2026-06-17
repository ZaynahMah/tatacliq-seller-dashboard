"""
Fashion-aware outpaint engine.

Phase 1 stub returns deterministic mock results. Phase 3 plugs in:
  * OpenCV person detector (HOG or YuNet) to find head/hand keypoints
  * MediaPipe Pose for garment hem & sleeve endpoints
  * SDXL inpaint pipeline (diffusers) for background extension
  * Subject-safe padding logic: never pad inside subject bbox

The contract below is what the rest of the system depends on.
"""

from __future__ import annotations

from typing import Any


class OutpaintEngine:
    def __init__(self) -> None:
        # Heavy models lazily loaded in Phase 3
        self._sdxl = None
        self._detector = None

    def run(
        self,
        *,
        image_url: str,
        target: tuple[int, int],
        mode: str,
    ) -> dict[str, Any]:
        # ---- Phase 1 stub ----
        # Returns a believable mock result so the UI can be wired up.
        return {
            "enhanced_url": image_url.replace("original", "enhanced"),
            "person_detected": True,
            "head_crop_risk": 0.04,
            "hand_crop_risk": 0.07,
            "garment_integrity": 0.97,
        }

    # ----- Phase 3 implementation sketch -----
    #
    # def _detect_subject(self, image): ...
    # def _build_safe_canvas(self, image, target, subject_bbox): ...
    # def _run_sdxl_inpaint(self, padded, mask, prompt): ...
    # def _compose(self, original, generated_padding, subject_bbox): ...
