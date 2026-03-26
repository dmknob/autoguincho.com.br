DROP TABLE IF EXISTS analytics_events;
DROP TABLE IF EXISTS listing_tags;
DROP TABLE IF EXISTS listing_images;
DROP TABLE IF EXISTS listings;
DROP TABLE IF EXISTS tags;
DROP TABLE IF EXISTS zones;
DROP TABLE IF EXISTS cities;
DROP TABLE IF EXISTS states;

CREATE TABLE states (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  uf TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE
);

CREATE TABLE cities (
  id INTEGER PRIMARY KEY AUTOINCREMENT, 
  state_id INTEGER, 
  name TEXT, 
  slug TEXT, 
  latitude REAL,
  longitude REAL,
  has_zones BOOLEAN DEFAULT 0, 
  is_published BOOLEAN DEFAULT 0,
  FOREIGN KEY (state_id) REFERENCES states (id)
);

CREATE TABLE zones (
  id INTEGER PRIMARY KEY AUTOINCREMENT, 
  city_id INTEGER, 
  name TEXT, 
  slug TEXT
);

CREATE TABLE tags (
  id INTEGER PRIMARY KEY AUTOINCREMENT, 
  name TEXT, 
  slug TEXT, 
  description TEXT,
  icon_svg TEXT
);

CREATE TABLE listings (
  id INTEGER PRIMARY KEY AUTOINCREMENT, 
  city_id INTEGER, 
  zone_id INTEGER,
  company_name TEXT, 
  slug TEXT UNIQUE,
  whatsapp_number TEXT,  
  phone_number TEXT,     
  plan_type TEXT DEFAULT 'basic', 
  is_featured BOOLEAN DEFAULT 0,
  is_verified BOOLEAN DEFAULT 0, 
  is_active BOOLEAN DEFAULT 1,
  mini_bio TEXT,
  latitude REAL,
  longitude REAL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE listing_images (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  listing_id INTEGER,
  image_url TEXT,
  display_order INTEGER,
  is_primary BOOLEAN DEFAULT 0
);

CREATE TABLE listing_tags (
  listing_id INTEGER, 
  tag_id INTEGER,
  PRIMARY KEY (listing_id, tag_id)
);

CREATE TABLE analytics_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_type TEXT NOT NULL,        
  event_label TEXT,                
  page_path TEXT NOT NULL,         
  referrer TEXT,                   
  ip_hash TEXT NOT NULL,           
  user_agent TEXT,                 
  geo_country TEXT,                
  geo_region TEXT,                 
  geo_city TEXT,                   
  entity_type TEXT,                
  entity_id INTEGER,               
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

