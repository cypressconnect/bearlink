# Design System Specification: The Collegiate Innovator

## 1. Overview & Creative North Star
The Creative North Star for this design system is **"The Collegiate Innovator."** 

We are moving away from the "template" aesthetic of traditional educational portals. Instead, we are leaning into a high-end editorial experience that blends the prestige of a heritage academic institution with the fluid, tech-forward energy of a modern professional network. This system is defined by **intentional asymmetry**, **tonal depth**, and **rhythmic white space**. 

We do not use boxes to contain ideas; we use layers to elevate them. The layout should feel like a curated digital ledger—organized and authoritative, yet breathing with the "innovative" spirit of Bridgeland FBLA.

---

## 2. Colors & Surface Architecture
This system utilizes a sophisticated navy base (`primary`) contrasted against a high-energy, "innovation" orange (`secondary`). 

### The "No-Line" Rule
**Explicit Instruction:** You are prohibited from using 1px solid borders for sectioning or containment. Traditional lines create visual "noise" that cheapens the experience. Instead, boundaries must be defined solely through background color shifts or subtle tonal transitions. 

*   **Primary Sectioning:** Transition from `surface` (`#f7fafd`) to `surface_container_low` (`#f1f4f7`) to define large content blocks.
*   **Signature Textures:** Use subtle linear gradients for Hero backgrounds, transitioning from `primary` (`#001a48`) to `primary_container` (`#002d72`) at a 135-degree angle. This provides a "soul" and depth that flat navy cannot achieve.

### Surface Hierarchy & Nesting
Treat the UI as a series of physical layers—stacked sheets of fine paper. 
*   **Base:** `surface`
*   **Section:** `surface_container_low`
*   **Component Card:** `surface_container_lowest` (White) sitting on a `low` background creates a natural, soft lift.
*   **Interactive Elements:** Use `surface_container_high` for hover states on neutral elements.

### The Glass & Gradient Rule
To achieve the "innovative" feel, use **Glassmorphism** for floating elements (like navigation bars or hovering action cards). 
*   **Token:** Use `surface` at 80% opacity with a `20px` backdrop-blur. 
*   **CTA Energy:** Use `secondary` (`#a04100`) for primary actions. To add a premium touch, apply a 10% `on_secondary_container` inner glow to the top edge of buttons.

---

## 3. Typography
We utilize a dual-font strategy to balance "Academic" (Manrope) and "Functional" (Inter).

*   **Display & Headlines (Manrope):** This is our "Editorial" voice. Manrope’s geometric yet warm proportions should be used for large, high-impact titles. Use `display-lg` with tight letter-spacing (-0.02em) to create an authoritative, modern header.
*   **Body, Titles, & Labels (Inter):** This is our "Utility" voice. Inter provides maximum readability for academic content. 
*   **Hierarchy Tip:** Always maintain a significant scale jump between `headline-md` and `body-lg`. If everything is important, nothing is. Use `label-md` in all-caps with +0.05em tracking for category tags to denote professional organization.

---

## 4. Elevation & Depth
Depth is achieved through **Tonal Layering**, not structural lines.

*   **The Layering Principle:** Stack `surface-container` tiers. For example, a `surface-container-lowest` card should sit atop a `surface-container-low` background. This creates a "soft" lift that feels more natural than a drop shadow.
*   **Ambient Shadows:** When an element must "float" (e.g., a modal or a floating action button), use an extra-diffused shadow.
    *   *Shadow Recipe:* `0px 12px 32px rgba(24, 28, 30, 0.06)`. The shadow color must be a tinted version of `on-surface`, never pure black.
*   **The "Ghost Border" Fallback:** If a container requires a border for accessibility (e.g., in a high-density data table), use a "Ghost Border": `outline-variant` (`#c4c6d2`) at **15% opacity**. 
*   **Glassmorphism:** Use semi-transparent surface colors for overlays to allow the brand colors of the background to bleed through, softening the edges and integrating the UI.

---

## 5. Components

### Buttons
*   **Primary:** `primary` background with `on_primary` text. Use `md` (0.375rem) roundedness.
*   **Secondary (Action):** `secondary` background. Reserve this for "Join," "Apply," or "Link" actions to draw the eye immediately.
*   **Tertiary:** No background, no border. Use `primary` text with a `surface_container_high` background appearing only on hover.

### Cards & Lists
*   **Constraint:** Forbid the use of divider lines. 
*   **Styling:** Use 24px–32px of vertical white space to separate list items. 
*   **Cards:** Use `surface_container_lowest` with an `xl` (0.75rem) corner radius. Place these on a `surface_container_low` background for a premium, recessed look.

### Input Fields
*   **Static State:** Use `surface_container_highest` as the fill. No border.
*   **Active State:** Transition to `primary` ghost border (20% opacity) and a subtle `primary` tint in the background. 
*   **Helper Text:** Use `label-md` with `on_surface_variant`.

### Signature Component: The "Connection Node"
Since the brand is 'Bear Link', create a custom "Node" component for community updates. This is a `surface_container_low` card with an asymmetrical `secondary` accent bar (4px wide) on the left side, signaling activity and innovation.

---

## 6. Do’s and Don’ts

### Do
*   **DO** use whitespace as a functional tool. If a section feels crowded, increase the padding, don't add a border.
*   **DO** use `secondary_container` for subtle highlights behind important keywords in body text.
*   **DO** align text to a strict baseline, but allow images and decorative "links" to break the grid for an editorial feel.

### Don’t
*   **DON'T** use 100% opaque borders. They create "visual cages."
*   **DON'T** use standard grey shadows. Always tint shadows with the `on_surface` color.
*   **DON'T** use `secondary` (Orange) for more than 10% of the screen real estate. It is a spark, not a flood.
*   **DON'T** use `full` (pill-shaped) roundedness for buttons; keep them `md` to maintain a "professional/academic" structure. Reserve `full` roundedness exclusively for Chips and Tags.

### Accessibility Note
Ensure that all text on `secondary` (Orange) backgrounds uses `on_secondary` (White) only if contrast ratios meet WCAG AA standards. If not, fallback to `on_secondary_fixed` for maximum legibility.