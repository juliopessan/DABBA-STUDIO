
To satisfy PRA/FCA, ECB/EBA, and FINMA regulatory mandates, the platform implements a strict hybrid retrieval and authorization pipeline:

[Document Ingestion]
         │
         ▼
[Text Extraction & Purview Label Detection]
         │
         ▼
[Semantic Chunking (512 tokens + 10% overlap)]
         │
         ▼
[Enrich Chunk with Entra ID Security ACLs]
         │
         ▼
[Generate Embeddings via text-embedding-3-large]
         │