'use client';

/**
 * Purely decorative page background — sits *behind* everything (zIndex -1,
 * pointer-events none) so it never touches or alters the existing UI.
 *
 *   • a "wave" that splits the page into two colours (red on top,
 *     cream below) — echoing the burger-site reference
 *   • scattered food emoji "stickers" floating around the edges
 *
 * Nothing here is interactive; it's a backdrop only.
 */

const TOP_COLOR = '#FF3B30'; // bold red, top band
const BOTTOM_COLOR = '#F2E4CC'; // warm cream, bottom band

// Food "stickers" scattered around the margins. Positions are kept toward the
// edges so they frame the content without sitting under the readable middle.
const FOOD = [
  { emoji: '🍔', top: '6%', left: '4%', size: 64, rotate: -12 },
  { emoji: '🍟', top: '14%', right: '5%', size: 56, rotate: 14 },
  { emoji: '🥬', top: '46%', left: '3%', size: 52, rotate: -8 },
  { emoji: '🍅', top: '40%', right: '4%', size: 48, rotate: 16 },
  { emoji: '🧀', bottom: '24%', left: '6%', size: 50, rotate: 10 },
  { emoji: '🥒', bottom: '14%', right: '7%', size: 46, rotate: -14 },
  { emoji: '🥤', bottom: '6%', left: '12%', size: 54, rotate: 8 },
  { emoji: '🌶️', top: '70%', right: '12%', size: 44, rotate: -10 },
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

      {/* Floating food stickers */}
      {FOOD.map((f, i) => (
        <span
          key={i}
          style={{
            position: 'absolute',
            top: f.top,
            bottom: f.bottom,
            left: f.left,
            right: f.right,
            fontSize: f.size,
            lineHeight: 1,
            transform: `rotate(${f.rotate}deg)`,
            filter: 'drop-shadow(0 6px 10px rgba(0,0,0,0.18))',
            userSelect: 'none',
          }}
        >
          {f.emoji}
        </span>
      ))}
    </div>
  );
}
