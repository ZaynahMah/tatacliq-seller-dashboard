"""
Fashion-aware image outpainting worker (Phase 3).

Pipeline:
  1. Accept 1200x1200 product image.
  2. Detect person/garment bounding box (OpenCV + lightweight detector).
  3. Compute target 1080x1440 canvas with subject-safe padding (no head/hand
     crop, no garment crop).
  4. Run SDXL inpaint on the new padded regions, preserving the subject mask.
  5. Return enhanced image + metadata (person_detected, garment_integrity).
"""

from __future__ import annotations

from fastapi import FastAPI
from pydantic import BaseModel

from outpaint import OutpaintEngine

app = FastAPI(title="TataCLiQ Image Worker", version="0.1.0")
engine = OutpaintEngine()


class OutpaintRequest(BaseModel):
    image_url: str
    target_width: int = 1080
    target_height: int = 1440
    mode: str = "fashion_aware"  # fashion_aware | balanced | background_only


class OutpaintResponse(BaseModel):
    enhanced_url: str
    person_detected: bool
    head_crop_risk: float
    hand_crop_risk: float
    garment_integrity: float


@app.get("/health")
def health() -> dict:
    return {"ok": True, "service": "image-worker"}


@app.post("/outpaint", response_model=OutpaintResponse)
def outpaint(req: OutpaintRequest) -> OutpaintResponse:
    result = engine.run(
        image_url=req.image_url,
        target=(req.target_width, req.target_height),
        mode=req.mode,
    )
    return OutpaintResponse(**result)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host="0.0.0.0", port=8001, reload=True)
