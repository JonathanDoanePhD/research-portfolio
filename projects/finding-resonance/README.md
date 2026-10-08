# Finding Resonance

A minimal, Jesus-centered story discovery concept for Jonathan Doane's portfolio, developed with AI assistance. The current demo opens on a welcome message and one input. A prompt appears in a small conversational bubble above a featured personal-account excerpt. A quiet explanation and explicit source credit follow the story. Left/right controls switch among one to five suggestions; the prompt bar sits below the response. Each new prompt appends a response to the thread. A jump menu revisits earlier prompts, and each response retains its selected story. Reloading clears the thread.

## Run

Requires Node.js 20+; no runtime packages or API keys.

```bash
node scripts/server.mjs
node scripts/verify.mjs
```

Open http://127.0.0.1:8000. The deployed demo runs in the browser. The local reference API provides `GET /health` and `POST /api/search`; this is core retrieval, while the browser adds curated theme matching and related-story selection.

Rebuild with Python 3.12 and `requirements.txt`:

```bash
python scripts/build.py
```

## Reviewed collection

60 distinct accounts are individually reviewed: eight explicitly name Jesus and 52 are thematic reflections on love, acceptance, connection, and purpose. Their displayed content is non-graphic and workplace-appropriate, with no profanity, sexual material, graphic injury, self-harm, or frightening imagery. This is informal editorial screening, not an official PG-13 rating. Screening does not extend to linked full accounts or every entry on a source list.

Excerpts come from NDERF's public-domain lists about God/supreme beings, love, and life reviews. Only the exact list text is reused. The source statements and text locations are documented in `data/provenance.json`, `data/curated-stories.json`, and `data/reviewed-source-extracts.txt`. Headings and topical labels are editorial. Quoted narrative wording is preserved, including spelling errors.

## Presentation

Inspired by Come Near's Jesus-focused, direct language, bold typography, and neutral paper imagery: textured gray paper, dark brown type and a light story bubble and a quiet explanation, sparse yellow keyword emphasis, a red punctuation accent, generous space, and one reading column. A reusable translucent SVG grain textures surfaces without covering their text. CSS uses Arial/Helvetica system fallbacks, not a claimed exact copy of Come Near's font files. The site identifies itself as an independent portfolio concept and does not use Come Near's logo or imply affiliation.

Research controls and performance metrics have been removed from the visitor flow. The revised collection is a small curated demonstration, not the previous broad-corpus benchmark. Old evaluation statistics are not applicable to this edition.

## Matching

`dist/engine.mjs` provides BM25/LSA text retrieval. `dist/discovery.mjs` adds inspectable prompt-to-theme matching, a modest preference for excerpts long enough to read as a narrative, and related-account ordering. Among candidates within 0.45 of the highest relevance score, unseen accounts are preferred, followed by the least recently displayed. Only stories actually opened are recorded in browser memory; this resets on reload. Searches offer one to five excerpts: candidates must score within 0.45 of the highest relevance score, with a maximum of five displayed suggestions. The count is determined before rotating the featured story, so identical prompts have consistent counts. Prompts with no usable topic signal receive a single starting account. Thematic reflections are clearly distinguished from accounts that explicitly identify Jesus. Requests naming Jesus or Christ use the explicit collection. Every nonempty prompt returns the closest available story. Explanations describe the excerpt’s content without claiming a match when topic signals are absent; prompts with no usable topic signal start with a general account of love and acceptance. The model does not generate accounts, verify their truth, or predict emotional benefit.

This version does not infer a person's religion or diagnose emotional state. Prompts are processed in the browser and no session history is persisted. Next-story navigation stays inside the reviewed collection. Each displayed excerpt also provides explicit contributor/NDERF credit, an original-account link, and a public-domain source-list link. External full accounts may be more intense than the reviewed excerpt.

## Files

- `dist/`: complete static website, reviewed collection, and model.
- `data/`: canonical stories, source attribution, provenance, and content review notes.
- `scripts/build.py`: reproducible model rebuild from the reviewed corpus.
- `scripts/server.mjs`: optional local serving/API reference.
- `scripts/verify.mjs`: content-scope, retrieval, and API checks.
- `research/`: model notes and a concise interview demonstration guide.

## Interview demonstration

Use “Feeling loved,” expand the compact explanation, and use the right control to view a similar story. Then try “Finding purpose” to see how the featured recommendation changes. Technical details stay in the accompanying documentation rather than the interview demo.

The Site remains private until sharing is changed. To host independently, publish the contents of `dist/` as a static site root; all application assets are relative.

Code license: MIT. Narrative excerpts are separately attributed to the specific source lists, not licensed by the software license. No affiliation with or endorsement by Come Near or NDERF is implied.

## Free public demo on GitHub Pages

The complete source is in `projects/finding-resonance/` in Jonathan's `research-portfolio` repository. The deployed static files are in `site/demos/finding-resonance/`. The existing Pages workflow publishes the `site/` folder when `main` changes.

Demo: https://JonathanDoanePhD.github.io/research-portfolio/demos/finding-resonance/

If Pages needs enabling, open the repository's Settings > Pages and set Source to GitHub Actions, then run the existing Deploy portfolio to GitHub Pages workflow from Actions. GitHub Pages is free for this public repository. Share the demo URL with testers; no sign-in or API key is required.

For future updates, copy the updated `dist/` files to `site/demos/finding-resonance/` and commit them to `main`. To host the project independently, publish `dist/` through a static hosting provider or a separate Pages workflow. Prompts are processed locally; conversations clear on reload.
