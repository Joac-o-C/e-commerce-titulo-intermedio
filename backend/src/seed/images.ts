/**
 * Ilustraciones SVG de los productos de demo: la silueta de la prenda en el
 * color del producto sobre un fondo neutro. Se generan al correr el seed, así
 * no hace falta red ni versionar binarios.
 */
export type Garment = 'remera' | 'buzo' | 'pantalon' | 'zapatilla' | 'ojota' | 'gorra' | 'medias' | 'mochila';

// Siluetas en un lienzo de 400×400, centradas.
const SHAPES: Record<Garment, string> = {
  remera:
    '<path d="M150 70 L110 80 L50 135 L85 185 L120 160 L120 340 L280 340 L280 160 L315 185 L350 135 L290 80 L250 70 Q200 110 150 70 Z"/>',
  buzo:
    '<path d="M150 75 L110 85 L60 150 L55 320 L95 320 L110 180 L115 345 L285 345 L290 180 L305 320 L345 320 L340 150 L290 85 L250 75 Q245 40 200 40 Q155 40 150 75 Z"/>' +
    '<path d="M150 260 L250 260 L240 310 L160 310 Z" fill="#000" fill-opacity="0.12"/>',
  pantalon:
    '<path d="M125 50 L275 50 L295 350 L225 350 L200 150 L175 350 L105 350 Z"/>' +
    '<rect x="125" y="50" width="150" height="22" fill="#000" fill-opacity="0.15"/>',
  zapatilla:
    '<path d="M60 250 Q70 170 130 160 L180 150 Q200 200 250 205 L320 215 Q350 222 350 260 L350 280 L60 280 Z"/>' +
    '<rect x="55" y="280" width="300" height="24" rx="10" fill="#fff" stroke="#000" stroke-opacity="0.2"/>',
  ojota:
    '<ellipse cx="200" cy="215" rx="90" ry="150"/>' +
    '<path d="M200 110 L140 190 M200 110 L260 190" stroke="#000" stroke-opacity="0.35" stroke-width="16" fill="none" stroke-linecap="round"/>',
  gorra:
    '<path d="M90 230 Q90 110 200 110 Q310 110 310 230 Z"/>' +
    '<path d="M60 230 L340 230 Q350 265 300 262 L100 262 Q50 265 60 230 Z" fill="#000" fill-opacity="0.2"/>' +
    '<circle cx="200" cy="108" r="10"/>',
  medias:
    '<path d="M110 50 L180 50 L180 230 L230 300 Q245 340 200 345 L110 330 Q80 320 95 280 L110 240 Z"/>' +
    '<path d="M220 50 L290 50 L290 230 L340 300 Q355 340 310 345 L220 330 Q190 320 205 280 L220 240 Z" fill-opacity="0.75"/>',
  mochila:
    '<rect x="110" y="90" width="180" height="260" rx="40"/>' +
    '<path d="M160 90 Q160 40 200 40 Q240 40 240 90" stroke="#000" stroke-opacity="0.3" stroke-width="14" fill="none"/>' +
    '<rect x="135" y="230" width="130" height="90" rx="18" fill="#000" fill-opacity="0.15"/>',
};

function escapeXml(text: string): string {
  return text.replace(/[<>&"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

export function productSvg(garment: Garment, color: string, label: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400" width="800" height="800" role="img" aria-label="${escapeXml(label)}">
<rect width="400" height="400" fill="#f5f5f4"/>
<g fill="${color}" stroke="#000" stroke-opacity="0.25" stroke-width="3" stroke-linejoin="round">${SHAPES[garment]}</g>
</svg>
`;
}
