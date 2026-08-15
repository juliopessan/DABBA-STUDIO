## 6. Architecture Scope Definition

┌──────────────────────────────────────────────────────────────────────────┐
│                           ARCHITECTURE SCOPE                             │
├────────────────────────────────────┬─────────────────────────────────────┤
│             IN-SCOPE               │            OUT-OF-SCOPE             │
├────────────────────────────────────┼─────────────────────────────────────┤
│ 1. Enterprise AI Gateway & Router  │ 1. Direct hosting of non-approved   │
│ 2. Hybrid RAG Pipeline & Indexing  │    public AI services (ChatGPT etc) │
│ 3. Document Intelligence Service   │ 2. Core banking legacy system       │
│ 4. Governed Agentic Tool Runtime   │    modernisation / replacement      │
│ 5. Microsoft 365 Copilot Connector │ 3. Physical data centre management  │
│ 6. Bidirectional Guardrails & WAF  │    (Cloud-native target on Azure)   │
│ 7. Multi-Tenant Cost Allocation    │ 4. Bespoke LLM foundation pre-      │
│ 8. Immutable Audit & Compliance DB │    training from raw scratch        │
│ 9. Entra ID Role-Based Security    │ 5. Customer direct end-user facing  │
│10. Human-in-the-Loop Review Portal │    unsupervised autonomous trading  │
└────────────────────────────────────┴─────────────────────────────────────┘
