"""
Gemini Enrichment Worker.

Phase 2 service. Receives a product (title + image URLs + partial attributes)
and returns the full enriched attribute set with confidence scores.

CRITICAL RULES embedded in the prompt:
  * NEVER reference Tata CLiQ as a data source.
  * Cross-reference allowed: Myntra, Ajio, Amazon Fashion, brand sites.
  * Return one suggestion per missing field with reasoning + confidence (0..1).
"""

from __future__ import annotations

import os
from typing import Any

from fastapi import FastAPI
from pydantic import BaseModel

from gemini_client import GeminiClient

app = FastAPI(title="TataCLiQ Enrichment Worker", version="0.1.0")
gemini = GeminiClient(api_key=os.getenv("GEMINI_API_KEY", ""))


class EnrichRequest(BaseModel):
    product_id: str
    title: str | None = None
    description: str | None = None
    brand: str | None = None
    category: str | None = None
    image_urls: list[str] = []
    known_attributes: dict[str, str] = {}
    missing_fields: list[str] = []


class Suggestion(BaseModel):
    field: str
    value: str
    reasoning: str
    source: str  # gemini_text | gemini_vision | cross_ref
    confidence: float


class EnrichResponse(BaseModel):
    product_id: str
    suggestions: list[Suggestion]
    overall_confidence: float


@app.get("/health")
def health() -> dict[str, Any]:
    return {
        "ok": True,
        "service": "enrichment-worker",
        "model": os.getenv("GEMINI_MODEL", "gemini-1.5-pro-latest"),
    }


@app.post("/enrich", response_model=EnrichResponse)
def enrich(req: EnrichRequest) -> EnrichResponse:
    raw = gemini.enrich_product(
        title=req.title,
        description=req.description,
        brand=req.brand,
        category=req.category,
        image_urls=req.image_urls,
        known_attributes=req.known_attributes,
        missing_fields=req.missing_fields,
    )

    suggestions = [
        Suggestion(
            field=s["field"],
            value=s["value"],
            reasoning=s.get("reasoning", ""),
            source=s.get("source", "gemini_text"),
            confidence=float(s.get("confidence", 0.0)),
        )
        for s in raw.get("suggestions", [])
    ]

    overall = sum(s.confidence for s in suggestions) / max(len(suggestions), 1)

    return EnrichResponse(
        product_id=req.product_id,
        suggestions=suggestions,
        overall_confidence=overall,
    )


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)


class DraftReplyRequest(BaseModel):
    sellerName: str
    brandName: str
    originalSubject: str
    missingFields: list[str]


class DraftReplyResponse(BaseModel):
    body: str


@app.post("/draft-reply", response_model=DraftReplyResponse)
def draft_reply(req: DraftReplyRequest) -> DraftReplyResponse:
    """Phase 4: Gemini-drafted seller email when fields are missing."""
    body = gemini.draft_seller_email(
        seller_name=req.sellerName,
        brand_name=req.brandName,
        original_subject=req.originalSubject,
        missing_fields=req.missingFields,
    )
    return DraftReplyResponse(body=body)
