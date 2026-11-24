CREATE EXTENSION IF NOT EXISTS vector;
ALTER TABLE images ADD COLUMN IF NOT EXISTS embedding vector(32);
CREATE INDEX IF NOT EXISTS images_embedding_hnsw ON images USING hnsw (embedding vector_cosine_ops);
