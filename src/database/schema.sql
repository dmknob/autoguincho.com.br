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
  plan_level TEXT DEFAULT 'basic', -- 'basic', 'partner', 'elite'
  whatsapp_number TEXT,  
  description_markdown TEXT,  -- Texto do painel Admin
  logo_url TEXT,
  gallery_images JSON, -- Array de strings das imagens
  social_links JSON,
  maps_link TEXT,
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
