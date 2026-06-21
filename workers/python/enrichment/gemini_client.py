"""
Gemini Pro client wrapper.

Important policy:
  * The system prompt explicitly forbids using Tata CLiQ as a reference.
  * Allowed cross-reference sources: Myntra, Ajio, Amazon Fashion, brand sites.
"""

from __future__ import annotations

import json
import re
from typing import Any

import google.generativeai as genai


ENRICHMENT_SYSTEM_PROMPT = """You are a fashion catalog enrichment expert for an
Indian e-commerce operations team. Your job is to fill in missing product
attributes for apparel/footwear/accessories so the catalog is portal-ready.

CRITICAL RULES — read carefully:

1. DO NOT use Tata CLiQ as a reference source. Never quote, mimic, or describe
   product data from tatacliq.com.
2. You MAY cross-reference these sources only:
     - Myntra (myntra.com)
     - Ajio (ajio.com)
     - Amazon Fashion (amazon.in/fashion)
     - The brand's own website / official channels
3. For each missing field, output:
     - field name (snake_case)
     - value (concise, portal-ready, no marketing fluff)
     - reasoning (1-2 lines explaining how you arrived at the value)
     - source: one of `gemini_text`, `gemini_vision`, `cross_ref`
     - confidence: float 0..1
4. Indian compliance fields (HSN, country_of_origin, manufacturer, EAN) must be
   strictly factual. If you are not confident, return confidence < 0.6 so an
   ops member reviews it.
5. SEO keywords: max 8, comma-separated, lowercase, no brand spam.
6. Title: max 80 characters, Title Case, no all-caps.
7. Description: 2-3 sentences, no superlatives like "best" or "world-class".
8. Output ONLY valid JSON. No prose, no markdown fences.

OUTPUT SCHEMA:
{
  "suggestions": [
    {
      "field": "fabric_family",
      "value": "Cotton",
      "reasoning": "Visible weave + product title mentions 'cotton kurta'",
      "source": "gemini_vision",
      "confidence": 0.92
    }
  ]
}
"""


class GeminiClient:
    def __init__(self, api_key: str, model: str = "gemini-1.5-pro-latest"):
        if api_key:
            genai.configure(api_key=api_key)
        self._model_name = model
        self._model = genai.GenerativeModel(model) if api_key else None

    def enrich_product(
        self,
        *,
        title: str | None,
        description: str | None,
        brand: str | None,
        category: str | None,
        image_urls: list[str],
        known_attributes: dict[str, str],
        missing_fields: list[str],
    ) -> dict[str, Any]:
        if self._model is None:
            return self._mock_response(missing_fields)

        user_prompt = self._build_prompt(
            title=title,
            description=description,
            brand=brand,
            category=category,
            known_attributes=known_attributes,
            missing_fields=missing_fields,
        )

        parts: list[Any] = [ENRICHMENT_SYSTEM_PROMPT, user_prompt]
        # In production, fetch images and append as inline parts.

        try:
            resp = self._model.generate_content(parts)
            text = resp.text or ""
            return self._extract_json(text)
        except Exception as exc:  # pragma: no cover
            return {"suggestions": [], "error": str(exc)}

    def _build_prompt(
        self,
        *,
        title: str | None,
        description: str | None,
        brand: str | None,
        category: str | None,
        known_attributes: dict[str, str],
        missing_fields: list[str],
    ) -> str:
        return f"""PRODUCT CONTEXT:
- Title: {title or '(missing)'}
- Description: {description or '(missing)'}
- Brand: {brand or '(missing)'}
- Category: {category or '(missing)'}
- Known attributes (from seller): {json.dumps(known_attributes, indent=2)}

MISSING FIELDS to enrich: {', '.join(missing_fields)}

Return only the JSON object described in the schema."""

    @staticmethod
    def _extract_json(text: str) -> dict[str, Any]:
        # Strip fenced code blocks if model added them despite instructions
        cleaned = re.sub(r"```(?:json)?", "", text).strip().strip("`")
        try:
            return json.loads(cleaned)
        except json.JSONDecodeError:
            match = re.search(r"\{.*\}", cleaned, re.DOTALL)
            if match:
                return json.loads(match.group(0))
            return {"suggestions": []}

    def _mock_response(self, missing_fields: list[str]) -> dict[str, Any]:
        """Used when GEMINI_API_KEY is not configured."""
        mock_values = {
            "hsn_code": ("61091000", "cotton t-shirts/kurtas HSN", "cross_ref", 0.91),
            "fabric_family": ("Cotton", "Visible weave in image", "gemini_vision", 0.93),
            "sleeve_type": ("Three Quarter Sleeves", "From front image", "gemini_vision", 0.88),
            "fit_type": ("Regular Fit", "Standard kurta silhouette", "gemini_vision", 0.84),
            "occasion": ("Casual, Festive", "Style + print suggest both", "gemini_text", 0.79),
            "country_of_origin": ("India", "Domestic seller default", "gemini_text", 0.95),
        }
        suggestions = []
        for field in missing_fields:
            if field in mock_values:
                v, r, s, c = mock_values[field]
                suggestions.append(
                    {"field": field, "value": v, "reasoning": r, "source": s, "confidence": c}
                )
        return {"suggestions": suggestions}


DRAFT_REPLY_SYSTEM_PROMPT = """You are an operations associate at a fashion
e-commerce catalog team writing to a seller. Tone: polite, concise,
action-oriented. Format: 2-3 short paragraphs + a bullet list of missing
items. Sign off with "Catalog Operations Team". Do NOT mention competitor
platforms (Myntra, Ajio, Amazon). Do NOT include subject line in the body."""


def _draft_reply_extension(self):
    """Bound below as GeminiClient.draft_seller_email."""
    pass


def draft_seller_email(
    self,
    *,
    seller_name: str,
    brand_name: str,
    original_subject: str,
    missing_fields: list[str],
) -> str:
    fields_md = "\n".join(f"- {f.replace('_', ' ').title()}" for f in missing_fields)
    user_prompt = f"""Seller: {seller_name}
Brand: {brand_name}
Original subject: {original_subject}

Missing fields the seller needs to provide:
{fields_md}

Write the email body only. No subject line."""

    if self._model is None:
        return f"""Hi {seller_name},

Thanks for sending the catalog for {brand_name}. Before we can submit your products, we need a few details:

{fields_md}

Could you reply to this email with the missing information? We will process everything within 24 hours of your response.

Best,
Catalog Operations Team"""

    try:
        resp = self._model.generate_content([DRAFT_REPLY_SYSTEM_PROMPT, user_prompt])
        return (resp.text or "").strip()
    except Exception:
        return f"""Hi {seller_name},

We need a few more details for the {brand_name} catalog:

{fields_md}

Please reply with the missing info. Thanks!

Catalog Operations Team"""


# Attach method to class at import time
GeminiClient.draft_seller_email = draft_seller_email  # type: ignore[attr-defined]
