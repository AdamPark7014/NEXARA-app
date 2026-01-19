export const revalidate = 60; // ISR: refresca cada 60 segundos
import { generateProductSlug } from "@/lib/seo-utils";
import type { MetadataRoute } from "next";

type Product = {
  id: string;
  clave?: string;
  numParte?: string;
  sku?: string;
  name?: string;
  title?: string;
  nombre?: string;
  brand?: string;
  marca?: string;
  updatedAt?: string;
};

function getApiBase() {
  return process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:3001";
}

async function fetchAllProducts(): Promise<Product[]> {
  try {
    const base = getApiBase();
    // Usar endpoint minimal para sitemap
    const endpoint = new URL("/products/minimal", base).toString();
    const res = await fetch(endpoint, { next: { revalidate: 60 } });
    if (!res.ok) {
      console.error(`Failed to fetch products for sitemap: ${res.status}`);
      return [];
    }
    const products = await res.json();
    return products;
  } catch (error) {
    console.error("Error fetching products for sitemap:", error);
    return [];
  }
}


export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  let products = await fetchAllProducts();
  if (!Array.isArray(products)) {
    if (
      products &&
      typeof products === 'object' &&
      'products' in products &&
      Array.isArray((products as { products?: unknown }).products)
    ) {
      const prodList = (products as { products: unknown }).products;
      if (Array.isArray(prodList)) {
        products = prodList;
      } else {
        products = [];
      }
    } else {
      products = [];
    }
  }
  
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "https://nexara.com";
  
  // URLs estáticas
  const staticPages: MetadataRoute.Sitemap = [
    {
      url: baseUrl,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 1,
    },
    {
      url: `${baseUrl}/tienda`,
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 0.9,
    },
    {
      url: `${baseUrl}/tienda/carrito`,
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 0.5,
    },
    {
      url: `${baseUrl}/nexara`,
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 0.8,
    },
    {
      url: `${baseUrl}/servicios`,
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 0.8,
    },
    {
      url: `${baseUrl}/soluciones`,
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 0.8,
    },
    {
      url: `${baseUrl}/proyectos`,
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 0.7,
    },
    {
      url: `${baseUrl}/contacto`,
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 0.6,
    },
  ];
  
  // URLs dinámicas de productos
  const productPages: MetadataRoute.Sitemap = products.map((product) => {
    const name = product.name || product.title || product.nombre || "producto";
    const brand = product.brand || product.marca;
    const sku = product.clave || product.numParte || product.sku || String(product.id);
    
    const slug = generateProductSlug(name, brand, sku);
    
    return {
      url: `${baseUrl}/tienda/${slug}`,
      lastModified: product.updatedAt ? new Date(product.updatedAt) : new Date(),
      changeFrequency: "weekly" as const,
      priority: 0.7,
    };
  });
  
  return [...staticPages, ...productPages];
}
