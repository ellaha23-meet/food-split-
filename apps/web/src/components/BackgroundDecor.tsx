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

const TOP_COLOR = '#FF3B30'; // bold red, top band
const BOTTOM_COLOR = '#F2E4CC'; // warm cream, bottom band

// Floating food cutouts. `src` points at /food/<file> in the public dir.
// Positions are kept toward the edges so they frame the content rather than
// sit under the readable middle.
const FOOD = [
  { src: '/food/burger.png', top: '3%', left: '1%', size: 200, rotate: -12 },
  { src: '/food/fries.png', top: '7%', right: '9%', size: 95, rotate: 18 },
  { src: '/food/milkshake.png', top: '23%', right: '1%', size: 135, rotate: -6 },
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
          d="M0,64 C180,140 360,140 540,90 C720,40 900,0 1080,24 C1260,48 1380,96 1440,80 L1440,0 L0,0 Z"
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
