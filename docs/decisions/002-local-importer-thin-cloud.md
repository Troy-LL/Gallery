# Run heavy ingest and AI calls in a lease-coordinated desktop importer

Status: Accepted

## Context

The gallery must stay private, accessible from anywhere on desktop, and within $0/month cloud infrastructure limits for ~5,000 photos, while ingesting from Google Photos Takeout archives (up to 50 GB zip splits), on-demand Google Photos Picker sessions, and an iPhone near-live inbox across both a MacBook and a Windows desktop. Running archive extraction, HEIC transcoding, pixel rotation, OKLab k-means, CLIP embeddings, Google OAuth, and `jev` requests inside serverless cloud functions would exceed free-tier compute/memory quotas and place Google and `jev` secrets on cloud endpoints.

## Decision

We will execute all archive watching, `localhost` Google Photos Picker OAuth (`photospicker.mediaitems.readonly`), iPhone inbox ingestion, HEIC-to-JPEG conversion, upright pixel rotation, color/technical math, local CLIP embedding generation, sidecar JSON writing, and `jev` calls inside a cross-platform desktop importer (macOS and Windows) coordinated by a short database lease, leaving the cloud tier strictly to static UI, a thin metadata API, Postgres (`pgvector`), and S3-compatible R2 working copies — with a local SQLite + filesystem mode behind the same storage interface.

## Consequences

Cloud hosting fits inside Cloudflare Pages/Workers, R2 (`10 GB` free tier), and free Postgres (`Neon` or `Supabase`) at $0/month infrastructure cost, and neither Google OAuth tokens nor `TYPESAFE_API_KEY` ever reach the browser or cloud workers. Either desktop can process imports whenever awake without duplicate work (enforced by lease + SHA-256/`source_ref` deduplication); when both machines are asleep, new photos queue locally while browsing, curating, and post previewing in the cloud app remain fully available.
