-- =================================================================
--          SCHEMA DO BANCO DE DADOS - AUTOGUINCHO v0.2
-- =================================================================

-- Apaga a tabela antiga se ela existir, para garantir um começo limpo
DROP TABLE IF EXISTS states;
CREATE TABLE states (
    id INTEGER PRIMARY KEY, -- Removemos o AUTOINCREMENT para usar o ID do JSON
    name TEXT NOT NULL,
    uf TEXT UNIQUE -- Tornamos a UF opcional (sem NOT NULL)
);

DROP TABLE IF EXISTS cities;
CREATE TABLE cities (
    id INTEGER PRIMARY KEY, -- Removemos o AUTOINCREMENT para usar o ID do JSON
    name TEXT NOT NULL,
    sanitized_name TEXT NOT NULL,
    state_id INTEGER NOT NULL,
    FOREIGN KEY (state_id) REFERENCES states(id) ON DELETE CASCADE
    -- A constraint UNIQUE foi removida daqui, pois os IDs do JSON já são únicos
);

DROP TABLE IF EXISTS companies;
CREATE TABLE companies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    status TEXT NOT NULL CHECK(status IN ('active', 'inactive', 'pending_verification')) DEFAULT 'pending_verification',
    listing_tier TEXT NOT NULL CHECK(listing_tier IN ('free', 'premium', 'featured')) DEFAULT 'free',
    name TEXT NOT NULL,
    description TEXT,
    phone_whatsapp TEXT NOT NULL UNIQUE,
    phone_call TEXT,
    phone_secondary TEXT,
    email TEXT,
    contact_person TEXT,
    base_address TEXT,
    base_city TEXT,
    latitude REAL,
    longitude REAL,
    service_radius_km INTEGER,
    is_24_hours INTEGER CHECK(is_24_hours IN (0, 1)),
    services_offered TEXT,
    payment_methods TEXT,
    last_verified_at TEXT,
    notes_internal TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

DROP TABLE IF EXISTS company_cities;
CREATE TABLE company_cities (
    company_id INTEGER NOT NULL,
    city_id INTEGER NOT NULL,
    PRIMARY KEY (company_id, city_id),
    FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
    FOREIGN KEY (city_id) REFERENCES cities(id) ON DELETE CASCADE
);

DROP TABLE IF EXISTS concession_segments;
CREATE TABLE concession_segments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    concession_name TEXT NOT NULL,
    emergency_phone TEXT NOT NULL,
    highway_name TEXT NOT NULL,
    key_cities TEXT NOT NULL
);

DROP TABLE IF EXISTS emergency_contacts;
CREATE TABLE emergency_contacts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    phone TEXT NOT NULL,
    description TEXT,
    type TEXT CHECK(type IN ('national', 'state', 'highway_concession'))
);