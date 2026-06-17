# How this engine compares to Catalogus.ai

This is a byte-level comparison against real Catalogus.ai output for the
Outzidr (seller 129449) catalog — the same seller file, run through both
systems, columns matched one-to-one. Every claim below is checked against
actual output, not a description of intended behavior.

## 1. Title accuracy: noun selection

Catalogus does not always force the L4 taxonomy noun into the title. A
product titled by the seller as "...Ruffle Top" but classified internally
as "Casual Dresses" (its HSN code falls in the dresses chapter) still gets
"Top" in the final title:

> `Outzidr Womens Multi Slim Fit Animal Print Ruffle Top`

Forcing the category noun here would have produced "...Ruffle Dress," which
contradicts what the product actually is. Our title generator now mirrors
this: it extracts the seller's own garment noun from their PRODUCT TITLE and
uses it whenever present, falling back to the category noun only when the
seller's title is uninformative. Verified against four real SKUs:

| SKU | Our title | Catalogus title | Result |
|---|---|---|---|
| WMNA0152501261002 | Outzidr Womens Black Regular Fit Floral Dress | Outzidr Womens Black Regular Fit Floral Dress | exact match |
| WMDA0172703262903 | Outzidr Womens Multi Flared Fit Floral Maxi Dress | Outzidr Womens Multi Flared Fit Floral Maxi Dress | exact match |
| WMNA0215805261002 | Outzidr Womens Black Slim Fit Solid Dress | Outzidr Womens Black Slim Fit Solid Dress | exact match |
| WMNA0215705262902 | Outzidr Womens Multi Slim Fit Animal Print Top | Outzidr Womens Multi Slim Fit Animal Print Ruffle Top | correct noun, missing one style modifier |

Three of four are exact matches; the fourth has the correct head noun and
differs only by a descriptive modifier ("Ruffle"). This was a real, fixed
bug, not a hypothetical — the engine previously appended "Mini Dress" to
every dress regardless of length, and always forced the category noun.

## 2. Title length qualifiers

Catalogus only adds a length qualifier ("Maxi") when the length is
notably non-default. The "Above Knee" default length gets no qualifier at
all — "Outzidr Womens Black Regular Fit Floral Dress," not "...Mini Dress."
Our engine previously appended "Mini Dress" unconditionally, which was a
verifiable deviation. Fixed: length qualifiers now only apply to Maxi, Midi,
and Ankle Length — the same convention Catalogus's own output follows.

## 3. Wash care: deterministic vs. inconsistent

Four different products in the same Catalogus batch, all Cotton Polyblend,
got four different wash-care strings with no discernible pattern:

- "Machine wash this polyester mini dress."
- "Machine wash with like colors"
- "Machine wash for easy maintenance"
- "Machine wash cold with like colors"

Same fabric, four different outputs, varying in detail and not fabric-aware
in any consistent way. Our `generateWashCare(fabric)` is a deterministic
lookup: the same fabric family always produces the same multi-clause
instruction (e.g. cotton-polyblend → a specific wash/dry/iron sequence).
Re-running the same input twice produces byte-identical wash care text. This
matters operationally — a seller with 50 SKUs in the same fabric should not
see 50 different care instructions for what's functionally identical
garment care.

## 4. Seller detail preservation in descriptions

For WMNA0152501261002, the seller's original description specified styling
detail: "strappy sandals, **a woven crossbody bag**, and **delicate gold
jewelry**." Catalogus's output description drops the specificity: "Pair it
with strappy sandals and a crossbody bag" — losing "woven" and the entire
jewelry mention.

Our `buildDescription()` detects the seller's own styling/pairing sentence
via pattern matching and preserves it verbatim when present, rather than
regenerating a thinner paraphrase. Verified in test output: the full
original phrase, including "woven" and "delicate gold jewelry," survives
unchanged. We only generate a styling sentence from scratch when the seller
didn't provide one.

## 5. Grammar: comma placement after introductory clauses

Catalogus's descriptions are missing commas after introductory clauses in
multiple instances:

> "Crafted from lightweight polyester fabric **this regular fit dress**
> features..." (missing comma before "this")

> "Crafted from a comfortable cotton polyblend fabric **this sleeveless
> dress** features..." (same pattern, different SKU)

This isn't a one-off — it recurs across the batch, suggesting a systematic
issue in how their generation pipeline joins clauses. Our description
generator runs the fabric/fit sentence through an Oxford-comma-aware joiner
and inserts the connecting comma correctly in every generated description
(`"Crafted from lightweight polyester, it features a regular fit..."`).

## 6. LOV compliance: a concrete violation we structurally cannot produce

For WMNA0215805261002 (a sleeveless, one-shoulder dress), the seller's
Neck/Collar field was "Other." Catalogus's output Neck/Collar column
contains **"One Shoulder."** That is not a valid Neck/Collar value in the
MDD — "One Shoulder" describes a shoulder/sleeve styling concept, not a
neckline, and it doesn't appear in the Neck/Collar LOV list at all. This
looks like a field-mapping bug: a "Sleeve Styling" attribute leaking into
the "Neck/Collar" column.

Our engine cannot produce this class of error. Every enum-constrained field
— Vision-derived or seller-derived — passes through `validateEnumValue()`
against the MDD's actual LOV list before it's written. A value that isn't
in the list is rejected outright (treated as unknown), never silently
written into the wrong column. This is enforced twice: once via the Gemini
`responseSchema` constraint on the Vision call itself, and again in
post-processing as a backstop independent of what the model returned.

## 7. Transparency: confidence and conflicts vs. silent overwrites

When Catalogus's Neck/Collar value disagrees with the seller's (e.g. seller
said "Round neck," Catalogus output says "V-Neck" for WMNA0152501261002),
there's no way to tell from the output file whether that's a correction, a
mistake, or noise — it's just overwritten with no record.

Our merge logic tags every field with its source (`seller` / `image` /
`merged` / `inferred`), a confidence score, and an explicit confidence tier
(HIGH ≥ 0.80, MEDIUM 0.55–0.79, LOW < 0.55). Disagreements between seller
data and Vision output are logged as conflict strings
(`"seller said 'Round neck', image shows 'V-Neck'"`) and surfaced in three
places: the per-row UI badge, the row detail panel, and a dedicated column
in the `_QA` sheet. Nothing gets silently overwritten — a human reviewer can
see exactly what changed and why before the file goes anywhere near Tata
CLiQ's upload portal.

## 8. The low-confidence floor: never guessing on weak signal

Fabric composition is the clearest example of a field that's structurally
unreliable to determine from a photo — a viscose-look fabric can be
polyester, and getting it wrong isn't cosmetic, it's a compliance problem
on a garment label. Our Vision confidence calibration caps fabric-from-image
confidence at roughly half of the model's stated certainty, which puts it
below a hard autofill floor (0.55). Below that floor, the value is never
written into the catalog automatically — it's surfaced only as a flagged
suggestion in the `_QA` sheet, and the seller's stated fabric is kept as
the actual value. The same floor applies to any other field where vision
disagrees with the seller and the vision confidence is weak: the seller's
value wins, with the disagreement noted for review rather than silently
discarded.

## 9. Fields confirmed to already match exactly

Across all twelve sample SKUs, the following were byte-identical between
our engine and Catalogus's reference output, with no changes needed: Lead
Variant ID placement (blank on the lead row, populated with the lead SKU on
every subsequent variant), Generic Name / Display Product Name (the L4
category display name), GST Eligible = "Yes," Seller Product Association
Status = "Yes," Lead time = "0," Net Quantity = "1," Multi Pack = "No,"
Platform = "Marketplace," Season = "SS26," and exact-match values for Color
Family, Brand, Fit, Pattern, Age Band, Country of Origin, MRP, Fabric, and
Pack Quantity. The output column schema itself (sheet structure, header
rows, `#ATTR_*` codes) matches Catalogus's structure exactly — this was
confirmed by direct comparison before any of the fixes above were made.

## Summary

| Area | Catalogus.ai (observed) | This engine |
|---|---|---|
| Wash care | Inconsistent across same fabric | Deterministic, fabric-specific |
| Seller styling detail | Dropped/paraphrased away | Preserved verbatim when present |
| Description grammar | Missing commas in repeated pattern | Oxford-comma-aware, consistently correct |
| LOV compliance | At least one confirmed violation (shoulder concept in Neck/Collar field) | Double-validated against MDD LOV, cannot write invalid enum values |
| Confidence/conflict visibility | None — overwrites are silent | Every field tagged with source, confidence, tier; conflicts logged and surfaced in three places |
| Low-confidence handling | Unknown / unverifiable | Hard floor — weak-signal vision values are never auto-applied, only flagged |
| Title noun accuracy | Correct (uses seller's noun) | Now matches (was previously a bug, now fixed and verified) |
| Output schema | — | Confirmed structurally identical |
