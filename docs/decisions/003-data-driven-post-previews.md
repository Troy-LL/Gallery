# Render unbranded social previews from platform data files with export-only handoff

Status: Accepted

## Context

Users curate photos to see how a post will look on Instagram, LinkedIn, and Facebook before downloading files to publish manually. Building separate React components per platform (`InstagramPreview`, `LinkedInPreview`, `FacebookPreview`), bundling trademarked social logos, or adding OAuth publishing/scheduling integrations looks natural, but platform crop ratios and caption truncation limits drift over time, official brand assets create trademark clutter, and publishing APIs expand auth, review, and maintenance scope far beyond photo curation.

## Decision

We will define every social platform as a versioned declarative data file (`surfaces`, `frame_tokens`, `media_rules`, `caption_rules`, `version`, `last_verified`) rendered by one generic component labeled `Preview` using placeholder identity chrome and zero official brand marks, and we will end the workflow at preset-sized, EXIF-stripped file or zip download (`Export all`) plus a local `Post` history record — never platform publishing or scheduling APIs.

## Consequences

Instagram, LinkedIn, and Facebook share one ordered image list, one caption input, and uniform `Compare` and `Focus` layouts where visual differences reflect only platform crop and truncation rules. Updating a changed aspect ratio or adding a future platform (such as TikTok, X, or Pinterest) requires editing or adding one config file rather than UI code, and exported images strip location/EXIF metadata by default without external platform tokens.
