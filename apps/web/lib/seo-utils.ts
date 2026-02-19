// Utilidades SEO - placeholders
export function getSeoData() {
  return {};
}

// Genera un slug para un producto (placeholder)
// Puede recibir (name, brand, sku) y unirlos en un slug
export function generateProductSlug(name: string | undefined, brand: string | undefined, sku: string | undefined) {
  // Normaliza a string vacío si es undefined
  const safeName = name ?? '';
  const safeBrand = brand ?? '';
  const safeSku = sku ?? '';
  const parts = [safeName, safeBrand, safeSku].filter(Boolean);
  return parts
    .join('-')
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '');
}

// Extrae el SKU de un slug (placeholder)
export function extractSkuFromSlug(slug: string) {
  // Personaliza según tu formato de slug
  // Ejemplo: "producto-12345" => "12345"
  const match = slug.match(/(\d+)$/);
  return match ? match[1] : '';
}
