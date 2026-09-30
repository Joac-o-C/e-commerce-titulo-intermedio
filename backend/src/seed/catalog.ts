import type { Garment } from './images.js';

/**
 * Catálogo de demo de la tienda (indumentaria). Dos niveles de categorías,
 * como exige CU-17; los productos cuelgan de la subcategoría y el filtro
 * del catálogo (CU-04) ya expande la categoría padre a sus hijas.
 *
 * Las variantes tienen un único atributo ("Talle"), igual que las que carga
 * el ABM de productos (CU-16), para que el admin pueda editarlas sin perder
 * datos. El color va en el nombre del producto.
 */
export interface SeedCategory {
  name: string;
  description?: string;
  children: { name: string; description?: string }[];
}

export interface SeedProduct {
  name: string;
  description: string;
  price: number;
  brand: string;
  /** Nombre de la subcategoría (único en todo el catálogo de demo). */
  category: string;
  garment: Garment;
  color: string;
  /** Prefijo del SKU; cada variante agrega su talle. */
  sku: string;
  /** Talle → stock inicial. Sin talles, una variante implícita única. */
  stock: Record<string, number> | number;
  isPublished?: boolean;
  lowStockThreshold?: number;
}

export const SEED_CATEGORIES: SeedCategory[] = [
  {
    name: 'Ropa',
    description: 'Remeras, buzos y pantalones',
    children: [
      { name: 'Remeras' },
      { name: 'Buzos y camperas' },
      { name: 'Pantalones' },
    ],
  },
  {
    name: 'Calzado',
    children: [{ name: 'Zapatillas' }, { name: 'Ojotas' }],
  },
  {
    name: 'Accesorios',
    children: [{ name: 'Gorras' }, { name: 'Medias' }, { name: 'Mochilas' }],
  },
];

const ROPA = (s: number, m: number, l: number, xl: number) => ({ S: s, M: m, L: l, XL: xl });

export const SEED_PRODUCTS: SeedProduct[] = [
  {
    name: 'Remera básica negra',
    description: 'Remera de algodón peinado 24/1, cuello redondo y costuras reforzadas.',
    price: 18000,
    brand: 'Pampa',
    category: 'Remeras',
    garment: 'remera',
    color: '#1f2937',
    sku: 'REM-BAS-NEG',
    stock: ROPA(12, 20, 18, 8),
  },
  {
    name: 'Remera básica blanca',
    description: 'Remera de algodón peinado 24/1, cuello redondo y costuras reforzadas.',
    price: 18000,
    brand: 'Pampa',
    category: 'Remeras',
    garment: 'remera',
    color: '#f3f4f6',
    sku: 'REM-BAS-BLA',
    stock: ROPA(10, 15, 3, 0),
  },
  {
    name: 'Remera estampada Andes',
    description: 'Remera oversize con estampa de la cordillera al frente. Algodón 100 %.',
    price: 24500,
    brand: 'Andes',
    category: 'Remeras',
    garment: 'remera',
    color: '#0e7490',
    sku: 'REM-AND-PET',
    stock: ROPA(6, 9, 9, 4),
  },
  {
    name: 'Buzo canguro gris melange',
    description: 'Buzo de frisa con capucha, bolsillo canguro y puños elastizados.',
    price: 45000,
    brand: 'Pampa',
    category: 'Buzos y camperas',
    garment: 'buzo',
    color: '#9ca3af',
    sku: 'BUZ-CAN-GRI',
    stock: ROPA(5, 8, 8, 5),
  },
  {
    name: 'Buzo cuello redondo verde',
    description: 'Buzo de frisa liviana, cuello redondo, ideal para media estación.',
    price: 39900,
    brand: 'Andes',
    category: 'Buzos y camperas',
    garment: 'buzo',
    color: '#166534',
    sku: 'BUZ-RED-VER',
    stock: ROPA(4, 2, 2, 1),
  },
  {
    name: 'Campera rompevientos azul',
    description: 'Campera liviana impermeable con capucha guardable y cierre frontal.',
    price: 68000,
    brand: 'Andes',
    category: 'Buzos y camperas',
    garment: 'buzo',
    color: '#1d4ed8',
    sku: 'CAM-ROM-AZU',
    stock: ROPA(3, 6, 6, 3),
  },
  {
    name: 'Jean recto azul',
    description: 'Jean de corte recto en denim rígido 14 oz, cinco bolsillos.',
    price: 52000,
    brand: 'Pampa',
    category: 'Pantalones',
    garment: 'pantalon',
    color: '#1e3a8a',
    sku: 'JEA-REC-AZU',
    stock: { '38': 5, '40': 10, '42': 10, '44': 6, '46': 3 },
  },
  {
    name: 'Jogger de frisa negro',
    description: 'Pantalón jogger con puño en el tobillo, cintura elastizada y cordón.',
    price: 36000,
    brand: 'Andes',
    category: 'Pantalones',
    garment: 'pantalon',
    color: '#111827',
    sku: 'JOG-FRI-NEG',
    stock: ROPA(7, 12, 10, 4),
  },
  {
    name: 'Zapatillas urbanas blancas',
    description: 'Zapatillas de cuero sintético con suela de goma vulcanizada.',
    price: 95000,
    brand: 'Pampa',
    category: 'Zapatillas',
    garment: 'zapatilla',
    color: '#e5e7eb',
    sku: 'ZAP-URB-BLA',
    stock: { '38': 3, '39': 5, '40': 6, '41': 6, '42': 4, '43': 2 },
  },
  {
    name: 'Zapatillas running rojas',
    description: 'Zapatillas livianas de malla respirable con entresuela amortiguada.',
    price: 112000,
    brand: 'Andes',
    category: 'Zapatillas',
    garment: 'zapatilla',
    color: '#dc2626',
    sku: 'ZAP-RUN-ROJ',
    stock: { '39': 2, '40': 4, '41': 4, '42': 3, '43': 1 },
  },
  {
    name: 'Ojotas de goma negras',
    description: 'Ojotas de goma con tira ancha y plantilla anatómica.',
    price: 14500,
    brand: 'Pampa',
    category: 'Ojotas',
    garment: 'ojota',
    color: '#374151',
    sku: 'OJO-GOM-NEG',
    stock: { '35/36': 8, '37/38': 10, '39/40': 10, '41/42': 6, '43/44': 4 },
  },
  {
    name: 'Gorra trucker bordó',
    description: 'Gorra trucker con frente de gabardina, red trasera y broche regulable.',
    price: 15000,
    brand: 'Andes',
    category: 'Gorras',
    garment: 'gorra',
    color: '#7f1d1d',
    sku: 'GOR-TRU-BOR',
    stock: 25,
  },
  {
    name: 'Pack x3 medias deportivas',
    description: 'Tres pares de medias de algodón con puño acanalado y talón reforzado.',
    price: 6500,
    brand: 'Pampa',
    category: 'Medias',
    garment: 'medias',
    color: '#f59e0b',
    sku: 'MED-DEP-X3',
    stock: { '35-39': 30, '40-45': 30 },
    lowStockThreshold: 10,
  },
  {
    name: 'Mochila urbana 20 L',
    description: 'Mochila de lona con compartimento acolchado para notebook de 15".',
    price: 38000,
    brand: 'Andes',
    category: 'Mochilas',
    garment: 'mochila',
    color: '#78350f',
    sku: 'MOC-URB-20L',
    stock: 2,
  },
  {
    name: 'Campera de jean (próximamente)',
    description: 'Campera de jean clásica con botones metálicos. Todavía sin publicar.',
    price: 74000,
    brand: 'Pampa',
    category: 'Buzos y camperas',
    garment: 'buzo',
    color: '#3b82f6',
    sku: 'CAM-JEA-AZU',
    stock: ROPA(0, 0, 0, 0),
    isPublished: false,
  },
];
