'use client';

/**
 * Purely decorative page background — sits *behind* everything (zIndex -1,
 * pointer-events none) so it never touches or alters the existing UI.
 *
 *   • a "wave" that splits the page into two colours (red on top,
 *     cream below) — echoing the burger-site reference
 *   • realistic food cutout images floating around the edges, framing the
 *     content the way the reference site does
 *
 * Food images are served from `apps/web/public/food/`. Drop transparent
 * PNG cutouts there using the filenames listed in FOOD below. Any file
 * that isn't present yet is hidden automatically (onError), so the page
 * never shows a broken image while assets are still being added.
 */

const TOP_COLOR = '#fb2a1b'; // --crav-red, top band
const BOTTOM_COLOR = '#ecdcbd'; // --crav-cream, bottom band (matches page canvas)

// Floating food cutouts. `src` points at /food/<file> in the public dir.
// Positions are kept toward the edges so they frame the content rather than
// sit under the readable middle.
const FOOD = [
  { src: '/food/burger.png', top: '10%', left: '1%', size: 200, rotate: -12 },
  { src: '/food/fries.png', top: '13%', right: '9%', size: 95, rotate: 18 },
  { src: '/food/milkshake.png', top: '30%', right: '1%', size: 135, rotate: -6 },
  { src: '/food/spaghetti.png', top: '57%', left: '3%', size: 110, rotate: 9 },
  { src: '/food/fries.png', bottom: '4%', left: '10%', size: 180, rotate: -8 },
  { src: '/food/burger.png', bottom: '15%', right: '27%', size: 80, rotate: 15 },
  { src: '/food/spaghetti.png', bottom: '6%', right: '2%', size: 190, rotate: -15 },
];

export function BackgroundDecor() {
  return (
    <div
      aria-hidden="true"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: -1,
        overflow: 'hidden',
        pointerEvents: 'none',
        background: BOTTOM_COLOR,
      }}
    >
      {/* Top colour band */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: '42%',
          background: TOP_COLOR,
        }}
      />

      {/* The wave that divides the two colours */}
      <svg
        viewBox="0 0 1440 160"
        preserveAspectRatio="none"
        style={{
          position: 'absolute',
          top: '42%',
          left: 0,
          width: '100%',
          height: 160,
          transform: 'translateY(-1px)',
          display: 'block',
        }}
      >
        <path
          fill={TOP_COLOR}
          d="M0,85 C96,35 192,35 288,85 C384,135 480,135 576,85 C672,35 768,35 864,85 C960,135 1056,135 1152,85 C1248,35 1344,35 1440,85 L1440,0 L0,0 Z"
        />
      </svg>

      {/* Floating food cutouts */}
      {FOOD.map((f, i) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={i}
          src={f.src}
          alt=""
          // Hide gracefully if the asset hasn't been uploaded yet.
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).style.display = 'none';
          }}
          style={{
            position: 'absolute',
            top: f.top,
            bottom: f.bottom,
            left: f.left,
            right: f.right,
            width: f.size,
            height: 'auto',
            transform: `rotate(${f.rotate}deg)`,
            filter: 'drop-shadow(0 8px 14px rgba(0,0,0,0.22))',
            userSelect: 'none',
          }}
        />
      ))}
    </div>
  );
}
