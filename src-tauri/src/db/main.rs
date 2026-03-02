use tauri_plugin_sql::{Migration, MigrationKind};

/// Returns all database migrations
pub fn migrations() -> Vec<Migration> {
    vec![
        // Migration 1: Create system_prompts table with indexes and triggers
        Migration {
            version: 1,
            description: "create_system_prompts_table",
            sql: include_str!("migrations/system-prompts.sql"),
            kind: MigrationKind::Up,
        },
        // Migration 2: Create chat history tables (conversations and messages)
        Migration {
            version: 2,
            description: "create_chat_history_tables",
            sql: include_str!("migrations/chat-history.sql"),
            kind: MigrationKind::Up,
        },
        // Migration 3: Create clients table with seed data
        Migration {
            version: 3,
            description: "create_clients_table",
            sql: include_str!("migrations/clients.sql"),
            kind: MigrationKind::Up,
        },
        // Migration 4: Create KYC updates history table
        Migration {
            version: 4,
            description: "create_kyc_updates_table",
            sql: include_str!("migrations/kyc-updates.sql"),
            kind: MigrationKind::Up,
        },
        // Migration 5: Drop segment and aml_status columns from clients
        Migration {
            version: 5,
            description: "drop_client_segment_aml",
            sql: include_str!("migrations/drop-client-segment-aml.sql"),
            kind: MigrationKind::Up,
        },
        // Migration 6: Create products table with seed catalog
        Migration {
            version: 6,
            description: "create_products_table",
            sql: include_str!("migrations/products.sql"),
            kind: MigrationKind::Up,
        },
    ]
}
