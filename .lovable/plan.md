
## Text Updates in Header and Footer

### Changes Required

**1. Header Title Update (Line 234-238)**
- Change `<h1>` from `▌Nectarine API` to `▌Nectarine Compact Viewer`
- Remove or update the subtitle `<p>` that says "Demoscene Radio · Compact viewer"

**2. Footer Text Update (Lines 527-537)**
- Replace the entire footer content:
  - Remove: "Ported from nectarine-demoscene-radio. Data: scenestream.net/demovibes"
  - Add: "this is a compact viewer of the amazing Nectarine Demoscene Radio - https://scenestream.net/"
  - The URL should be a clickable link

### Technical Details
- File to modify: `src/pages/Index.tsx`
- Two separate text replacement operations
- The footer link should maintain the existing styling (`text-primary hover:underline`)

### Acceptance Criteria
- Header displays "Nectarine Compact Viewer"
- Footer displays the new attribution text with a clickable link to scenestream.net
