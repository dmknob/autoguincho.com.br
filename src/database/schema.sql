-- src/database/schema.sql

-- Categorias Principais (Silos: Guincho, Mecânico, Chaveiro)
CREATE TABLE IF NOT EXISTS categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE NOT NULL,
  slug TEXT UNIQUE NOT NULL
);

-- Tabela de Cidades baseada no padrão IBGE (com Flag de Cache "Sujo" para SSG)
CREATE TABLE IF NOT EXISTS cities (
  ibge_id INTEGER PRIMARY KEY, -- Usar o código oficial do IBGE
  state_uf TEXT NOT NULL,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  is_dirty BOOLEAN DEFAULT 0
);

-- Tabela Principal de Parceiros
CREATE TABLE IF NOT EXISTS listings (
  id INTEGER PRIMARY KEY AUTOINCREMENT, 
  company_name TEXT NOT NULL, 
  slug TEXT UNIQUE NOT NULL, -- Usado na Vanity URL /perfil/slug
  plan_level TEXT DEFAULT 'basic', -- 'basic', 'intermediate', 'elite'
  whatsapp_number TEXT,  
  is_whatsapp_verified BOOLEAN DEFAULT 0, -- Se está entre os badges
  call_number TEXT,
  description_markdown TEXT,  -- Texto do Painel Admin (Texto Padrão + Personalizado)
  badges JSON, -- Array de strings com os badges do parceiro
  logo_url TEXT,
  gallery_images JSON, -- Array de strings das imagens
  social_links JSON,
  maps_link TEXT,
  base_city_ibge_id INTEGER, -- Cidade base do parceiro
  last_renewal_date DATETIME, -- Motor do CRM para rebaixamento
  is_active BOOLEAN DEFAULT 1,
  is_dirty BOOLEAN DEFAULT 1, -- Flag SSG
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Relação N:N (Múltiplas Categorias por Parceiro)
CREATE TABLE IF NOT EXISTS category_listings (
  listing_id INTEGER,
  category_id INTEGER,
  PRIMARY KEY (listing_id, category_id)
);

-- Relação N:N para Serviço Multi-Cidades
CREATE TABLE IF NOT EXISTS listing_service_cities (
  listing_id INTEGER,
  city_ibge_id INTEGER,
  PRIMARY KEY (listing_id, city_ibge_id)
);

-- Tags
CREATE TABLE IF NOT EXISTS tags (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE NOT NULL
);

-- Relação Tags
CREATE TABLE IF NOT EXISTS listing_tags (
  listing_id INTEGER, 
  tag_id INTEGER,
  PRIMARY KEY (listing_id, tag_id)
);

-- Analytics Próprio da Corpo Digital (Gravação Segura s/ LGPD)
CREATE TABLE IF NOT EXISTS analytics_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_type TEXT NOT NULL,        -- 'page_view' | 'cta_click' | 'form_submit'
    event_label TEXT,                -- 'whatsapp' | 'ligar' 
    page_path TEXT NOT NULL,         -- '/rs/novo-hamburgo/guincho-plataforma'
    referrer TEXT,                   -- 'https://google.com' | NULL
    ip_hash TEXT NOT NULL,           -- SHA-256(ip + salt_diario) — jamais gravar IP cru
    user_agent TEXT,                 -- Navigator UA 
    geo_country TEXT,                -- 'BR' 
    geo_region TEXT,                 -- 'RS'
    geo_city TEXT,                   -- 'Novo Hamburgo'
    utm_source TEXT,                 -- UTM Source
    utm_medium TEXT,                 -- UTM Medium
    utm_campaign TEXT,               -- UTM Campaign
    utm_content TEXT,                -- UTM Content
    utm_term TEXT,                   -- UTM Term
    entity_type TEXT,                -- 'listing' | 'category' | 'city'
    entity_id INTEGER,               -- FK para a entidade
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Índices Recomendados
CREATE INDEX IF NOT EXISTS idx_analytics_type_date ON analytics_events(event_type, created_at);
CREATE INDEX IF NOT EXISTS idx_analytics_entity ON analytics_events(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_analytics_geo ON analytics_events(geo_country, geo_region, geo_city);
