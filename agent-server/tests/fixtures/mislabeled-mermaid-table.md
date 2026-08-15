
```mermaid
table
  title Build vs Buy Decisions
  | Component          | Decision | Justification |
  |--------------------|----------|---------------|
  | InventoryService   | Build    | Custom app needed for real-time sync |
  | NotificationHub    | Build    | Azure Service requires custom rules |
  | Key Vault          | Build    | PCI-DSS requires managed keys       |
  | Mobile App         | Build    | Zero-training requirement demands UI customization |
  | Azure SQL DB       | Buy      | Leverages Azure's SLAs              |
  | Azure AD           | Buy      | Pre-built identity service          |
```
