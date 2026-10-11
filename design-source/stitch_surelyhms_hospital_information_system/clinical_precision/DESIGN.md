---
name: Clinical Precision
colors:
  surface: '#f8f9ff'
  surface-dim: '#ccdbf4'
  surface-bright: '#f8f9ff'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#eff4ff'
  surface-container: '#e5eeff'
  surface-container-high: '#dce9ff'
  surface-container-highest: '#d4e4fd'
  on-surface: '#0c1c2e'
  on-surface-variant: '#574142'
  inverse-surface: '#223144'
  inverse-on-surface: '#eaf1ff'
  outline: '#8a7171'
  outline-variant: '#debfbf'
  surface-tint: '#a83541'
  primary: '#680118'
  on-primary: '#ffffff'
  primary-container: '#881d2c'
  on-primary-container: '#ff999d'
  inverse-primary: '#ffb3b5'
  secondary: '#7f5258'
  on-secondary: '#ffffff'
  secondary-container: '#fdc3ca'
  on-secondary-container: '#7a4d54'
  tertiary: '#402e00'
  on-tertiary: '#ffffff'
  tertiary-container: '#5b4400'
  on-tertiary-container: '#d4b264'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#ffdada'
  primary-fixed-dim: '#ffb3b5'
  on-primary-fixed: '#40000b'
  on-primary-fixed-variant: '#881d2c'
  secondary-fixed: '#ffd9dd'
  secondary-fixed-dim: '#f1b8bf'
  on-secondary-fixed: '#321117'
  on-secondary-fixed-variant: '#643b41'
  tertiary-fixed: '#ffdf9a'
  tertiary-fixed-dim: '#e6c273'
  on-tertiary-fixed: '#251a00'
  on-tertiary-fixed-variant: '#5a4300'
  background: '#f8f9ff'
  on-background: '#0c1c2e'
  surface-variant: '#d4e4fd'
typography:
  display-lg:
    fontFamily: Inter
    fontSize: 28px
    fontWeight: '700'
    lineHeight: 36px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Inter
    fontSize: 22px
    fontWeight: '600'
    lineHeight: 28px
    letterSpacing: -0.01em
  headline-md:
    fontFamily: Inter
    fontSize: 18px
    fontWeight: '600'
    lineHeight: 24px
    letterSpacing: -0.01em
  title-md:
    fontFamily: Inter
    fontSize: 15px
    fontWeight: '600'
    lineHeight: 20px
  body-lg:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  body-md:
    fontFamily: Inter
    fontSize: 13px
    fontWeight: '400'
    lineHeight: 18px
  body-sm:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '400'
    lineHeight: 16px
  label-lg:
    fontFamily: Inter
    fontSize: 13px
    fontWeight: '600'
    lineHeight: 16px
    letterSpacing: 0.01em
  label-md:
    fontFamily: Inter
    fontSize: 11px
    fontWeight: '600'
    lineHeight: 14px
    letterSpacing: 0.03em
  label-sm:
    fontFamily: Inter
    fontSize: 10px
    fontWeight: '700'
    lineHeight: 12px
    letterSpacing: 0.04em
  data-mono:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 16px
    letterSpacing: -0.01em
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  gutter: 1rem
  margin: 1.5rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 0.75rem
  space-lg: 1rem
  space-xl: 1.5rem
---

## Brand & Style
The design system delivers an institutional, high-density desktop environment tailored to the cognitive demands of acute healthcare settings, hospital operations, and multi-departmental administrative workflows across India. The aesthetic balances clinical authority with modern administrative clarity.

The visual style is **Corporate Modern with High-Density Precision**:
- Uncluttered, purpose-built information architecture prioritizing scannability and low error rates under critical conditions.
- Strict visual hierarchy driven by micro-typography, deterministic status indicators, and hairline structural dividers.
- High-trust physical tone pairing deep medical burgundy and refined gold accents with clinical neutral slates.

## Colors
The palette is engineered specifically for prolonged desktop usage by doctors, nurses, pharmacists, and administrators. It employs a cool, low-fatigue base overlaid with high-contrast functional color cues.

### Brand & Core Neutrals
- **Primary Canvas (`#F5F7FA`)**: Soft cool slate background providing gentle contrast against pure white operational surfaces.
- **Card & Data Surfaces (`#FFFFFF`)**: Pure crisp white surfaces dedicated to high-density content, data grids, patient files, and diagnostic feeds.
- **Brand Primary (`#881D2C`)**: Deep clinical burgundy applied to primary CTAs, active module indicators, and top-tier institutional elements.
- **Dark Brand Shell (`#39171D`)**: Saturated deep burgundy reserved for the main application shell, global sidebars, and critical system headers.
- **Restrained Gold (`#C3A256`)**: Subdued metallic accent used strictly for specialized departmental markers, active focus rings, and VIP/NABH accreditation indicators.
- **Primary Text (`#172B4D`)**: Deep slate navy ensuring optimal legibility and contrast against white surfaces.
- **Secondary Text (`#526176`)**: Cool slate for metadata, secondary captions, table column headers, and structural labeling.
- **Structural Border (`#D8DFE8`)**: Crisp, low-contrast hairline borders for grid divisions, tables, and panel boundaries.

### Semantic Status Colors
- **Success / Admitted / Cleared**: Forest Green `#166534` over Mint Background `#DCFCE7`.
- **Warning / Under Observation / Pending**: Warm Amber `#92400E` over Soft Honey `#FEF3C7`.
- **Informational / Triage Level 3 / Processing**: Marine Blue `#1E40AF` over Ice Blue `#DBEAFE`.
- **Critical / Emergency / Allergy Alert**: Crimson Red `#B91C1C` over Soft Rose `#FEE2E2`.

## Typography
Typographic implementation relies entirely on **Inter**, taking advantage of its optimized vertical metrics, uniform numerical figures, and high-density readability at low font sizes.

- Numerical figures in vital signs, UHID tags, billing amounts, and diagnostic results must enforce tabular figures (`tnum`) and zero slash formatting (`zero`).
- Micro-labels (`label-md`, `label-sm`) are rendered in uppercase with subtle positive letter tracking for instant visual categorization of medical units, bed codes, and triage classifications.
- Strict limit on scale differentiation to preserve screen real estate on desktop work-stations (1080p and 1440p displays).

## Layout & Spacing
The layout follows an unyielding **8px spatial grid** (with a 4px half-step for micro-alignment within compact table cells and status badges).

### Grid & Density
- **Global Structure**: Persistent Left Navigation Rail (collapsed at 64px, expanded at 240px) coupled with an Operational Work Area utilizing a fluid 12-column system.
- **Section Gutters**: Fixed 16px (`1rem`) horizontal and vertical grid separations between cards, data containers, and split-screen charts.
- **Inner Padding**: High-density elements (patient roster, prescription logs) use 8px (`0.5rem`) internal cell padding. Standard administrative panels leverage 12px to 16px (`0.75rem` to `1rem`).
- **Screen Adaptation**: Desktop-first layout optimized for 1280px, 1440px, and 1920px hospital displays. Breakpoints at 1024px collapse auxiliary side panels into modal drawers.

## Elevation & Depth
Depth is created through **low-contrast outlines and micro-tonal surfaces** rather than dramatic drop shadows, ensuring screens remain clinical, sharp, and glare-resistant under fluorescent hospital lighting.

- **Level 0 (Canvas Base)**: `#F5F7FA` base layer.
- **Level 1 (Work Surfaces & Tables)**: `#FFFFFF` surface with a crisp 1px solid `#D8DFE8` border. No drop shadow.
- **Level 2 (Dropdowns, Menus, Hover Panes)**: `#FFFFFF` surface, 1px `#D8DFE8` border, and an ambient shadow: `0 4px 12px rgba(23, 43, 77, 0.08)`.
- **Level 3 (Modals & Emergency Drawers)**: `#FFFFFF` surface, 1px `#C3A256` or `#D8DFE8` border, and an ambient shadow: `0 12px 32px rgba(57, 23, 29, 0.16)`.

## Shapes
The design uses restrained, structural geometric geometry to communicate institutional reliability.

- Standard interactive controls (buttons, inputs, select fields) implement a precise **4px radius** (`roundedness: 1`).
- Content cards, dashboard panels, and data tables feature a controlled **8px to 12px radius** to soften the layout while maintaining clean technical intersections.
- Status badges and patient category pills implement a full circular/capsule profile to distinguish them immediately from functional, clickable input containers.

## Components

### Buttons
- **Primary Action**: Background `#881D2C`, text `#FFFFFF`, border none, 4px corner radius. Height: 32px (compact) or 38px (standard). Hover state shifts background to `#39171D`. Focus state displays an active 2px outer ring in `#C3A256`.
- **Secondary Action**: Background `#FFFFFF`, text `#172B4D`, border 1px solid `#D8DFE8`. Hover state applies `#F5F7FA` background.
- **Critical Action**: Background `#B91C1C`, text `#FFFFFF`. Reserved solely for irrevocable clinical or transactional steps (e.g., Code Blue alert, discharge confirmation, record archival).

### Form Fields & Inputs
- **Base Style**: Height 32px (compact grid) or 36px (forms). White background `#FFFFFF`, 1px solid `#D8DFE8` border, 4px border radius. Typography: `body-md` in `#172B4D`.
- **Placeholder**: Text `#526176` at 70% opacity.
- **Active / Focus**: Border shifts to `#881D2C` with a 1px outline of `#C3A256`.
- **Dense Medical Inputs**: Paired numeric-unit inputs (e.g., Blood Pressure, SpO2, Dosage) display right-aligned unit badges inside the field wrapper with `#F5F7FA` fill.

### Data Tables & Clinical Rosters
- **Header Cells**: 32px height, uppercase `label-md` in `#526176`, background `#F5F7FA`, 1px bottom border `#D8DFE8`.
- **Data Rows**: 36px height (compact density) or 44px (expanded review density). 1px horizontal border `#D8DFE8`. Alternating zebra striping disabled; hover row effect utilizes `#F8FAFC`.
- **Alignment**: Numerical clinical data (UHID, Age, Dosage, Vitals, Billing) is right-aligned; clinical status and names are left-aligned.

### Semantic Status Badges & Chips
- **Format**: Pill-shaped (fully rounded), 20px total height, padding 2px 8px, font: `label-sm`.
- **Admitted / Normal**: Mint background `#DCFCE7`, text `#166534`.
- **Pending / Observation**: Soft Honey background `#FEF3C7`, text `#92400E`.
- **ICU / Critical / Allergy**: Rose background `#FEE2E2`, text `#B91C1C`, accompanied by a solid 4px dot indicator.
- **Diagnostic / In Progress**: Ice Blue background `#DBEAFE`, text `#1E40AF`.

### Checkboxes & Radios
- Size: 16px × 16px square (checkbox) or circle (radio). Border: 1.5px solid `#526176`.
- Checked state: `#881D2C` fill with crisp white checkmark or center pip. Focus ring in `#C3A256`.

### Patient Header Banner
- Dedicated high-context clinical card with 8px corner radius, `#FFFFFF` background, and a 1px solid `#D8DFE8` outline. Includes high-visibility patient demographics (UHID, Age/Sex, Blood Group badge, Attending Physician) structured with a 16px internal gutter for rapid triage recognition.