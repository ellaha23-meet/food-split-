# Food cutout images

Transparent **PNG** cutouts rendered as floating decorations behind the UI
(see `src/components/BackgroundDecor.tsx`). They have no background, so they
"float" over the two-colour wave.

Current assets:

- `burger.png`    — cheeseburger
- `fries.png`     — fries
- `pizza.png`     — cheese pizza
- `spaghetti.png` — plate of spaghetti (no longer used)
- `milkshake.png` — milkshake

To add, move, resize, or rotate an item, edit the `FOOD` array in
`src/components/BackgroundDecor.tsx`. New cutouts should be transparent PNGs.
