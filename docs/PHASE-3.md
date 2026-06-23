# Phase 3 — AI Image Enhancement & Outpainting

## Goals

Convert seller-provided 1200×1200 product images into portal-ready 1080×1440 (3:4) without cropping heads, hands, or garments, and without ugly white padding.

## Approach

```
[1200x1200 input]
      |
      v
[Subject detector (OpenCV + pose)]
      |  -> head, hands, garment hem keypoints + bbox
      v
[Canvas planner]
      |  -> chooses padding (top/bottom/sides) so subject sits with safe margins
      v
[SDXL inpaint pipeline]
      |  -> generates background for the padded regions
      v
[Composer]
      |  -> pastes original subject onto inpainted canvas (subject untouched)
      v
[QA scorer]
      |  -> head_crop_risk, hand_crop_risk, garment_integrity
      v
[1080x1440 output + metadata]
```

## Why preserve subject region

Diffusion models hallucinate when asked to redraw faces, hands, and garments. We **never** redraw those — we only inpaint the new padding around the subject. This gives:

- Pixel-perfect garment preservation.
- No identity drift on faces/hands.
- Natural-looking background extension.

## Models

| Model | Use |
|-------|-----|
| YuNet / RetinaFace | Face detection |
| MediaPipe Pose | Keypoints (shoulders, wrists, hips, ankles) |
| SDXL Inpainting (`stabilityai/stable-diffusion-xl-1.0-inpainting-0.1`) | Background extension |

## Prompt seeding for SDXL

The prompt for the inpaint pass is built from product context:

```
"clean studio backdrop, soft natural light, neutral gradient,
 minimal shadow, professional fashion photography, color: <color_family>,
 mood: <occasion>"
```

Negative prompt:

```
"text, watermark, logo, extra limbs, deformed hands, blurry,
 jpeg artifacts, oversharpened"
```

## Performance

| Stage | Target latency |
|-------|----------------|
| Detection | < 200 ms |
| Canvas planning | < 10 ms |
| SDXL inpaint (1024 base, 30 steps) | 4-8 s on T4/A10G |
| Composition + QA | < 100 ms |

Run as a batched worker for throughput.

## UI

Image Studio (already scaffolded in Phase 1) gets the live data:

- Side-by-side: original (1200×1200) vs enhanced (1080×1440).
- Toggle outpaint mode: `fashion_aware` (default) | `balanced` | `background_only`.
- Per-image controls: regenerate, lock subject mask, adjust padding.
- Batch mode: apply settings to all selected images.

## Output storage

- Original: `s3://bucket/originals/{productId}/{imageId}.jpg`
- Enhanced: `s3://bucket/enhanced/{productId}/{imageId}.jpg`
- Mask used (for debugging): `s3://bucket/masks/{productId}/{imageId}.png`
