/**
 * MGM HMS design system.
 *
 * The Stitch export used Material-style token names (surface-container-lowest,
 * on-surface-variant, …). Those names are kept so the 55 converted design files
 * render unchanged — but every value is re-pointed at the palette in section 5
 * of the operating brief: burgundy/gold brand, bright neutral work areas,
 * accessible slate text. Changing a hex here restyles the whole application.
 */
const brand = {
  primary: '#881D2C',   // brand primary — CTAs, selected nav
  dark: '#39171D',      // dark brand shell
  deep: '#6E1623',      // pressed / container burgundy
  accent: '#C3A256',    // restrained gold
  canvas: '#F5F7FA',
  surface: '#FFFFFF',
  text: '#172B4D',
  text2: '#526176',
  border: '#D8DFE8',
};

module.exports = {
  content: [
    './client/index.html',
    './client/my-health.html',
    './client/views/**/*.html',
    './client/src/**/*.js',
  ],
  darkMode: 'class',
  safelist: [
    { pattern: /^(bg|text|border|ring|fill|stroke)-(success|warning|info|danger|neutral)(-bg)?$/ },
    { pattern: /^(bg|text|border)-(emerald|amber|blue|rose|red|slate|green|sky|violet|orange|teal|indigo|purple|pink|yellow|cyan|lime|fuchsia|gray|zinc|stone|neutral)-(50|100|200|300|400|500|600|700|800|900)$/ },
    { pattern: /^(w|h)-(px|0|0\.5|1|1\.5|2|2\.5|3|3\.5|4|5|6|7|8|9|10|11|12|14|16|20|24|28|32|36|40|44|48|56|64|72|80|96|full|screen|auto|fit|min|max)$/ },
    { pattern: /^grid-cols-(1|2|3|4|5|6|7|8|9|10|11|12)$/, variants: ['sm', 'md', 'lg', 'xl', '2xl'] },
    { pattern: /^col-span-(1|2|3|4|5|6|7|8|9|10|11|12|full)$/, variants: ['sm', 'md', 'lg', 'xl', '2xl'] },
    'hidden', 'block', 'flex', 'grid', 'inline-flex', 'opacity-0', 'opacity-100',
    'translate-x-0', 'translate-x-full', 'pointer-events-none', 'animate-pulse', 'animate-spin',
  ],
  theme: {
    extend: {
      colors: {
        /* --- brand ------------------------------------------------------- */
        primary: brand.primary,
        'on-primary': '#FFFFFF',
        'primary-container': brand.deep,
        'on-primary-container': '#FFD9DD',
        'primary-fixed': '#FBE7EA',
        'primary-fixed-dim': '#F1C6CC',
        'on-primary-fixed': '#3B0A12',
        'on-primary-fixed-variant': brand.primary,
        'inverse-primary': '#E7A7AE',
        'surface-tint': brand.primary,
        'brand-dark': brand.dark,
        'brand-accent': brand.accent,

        /* --- secondary (slate, not pink) --------------------------------- */
        secondary: brand.text2,
        'on-secondary': '#FFFFFF',
        'secondary-container': '#E2E8F0',
        'on-secondary-container': '#1E293B',
        'secondary-fixed': '#E2E8F0',
        'secondary-fixed-dim': '#CBD5E1',
        'on-secondary-fixed': '#0F172A',
        'on-secondary-fixed-variant': '#334155',

        /* --- tertiary (gold) --------------------------------------------- */
        tertiary: '#806316',
        'on-tertiary': '#FFFFFF',
        'tertiary-container': '#6B5417',
        'on-tertiary-container': '#FFF4D9',
        'tertiary-fixed': '#F7EFD9',
        'tertiary-fixed-dim': '#E3CE93',
        'on-tertiary-fixed': '#3A2D07',
        'on-tertiary-fixed-variant': '#6B5417',

        /* --- neutral surfaces -------------------------------------------- */
        background: brand.canvas,
        'on-background': brand.text,
        surface: brand.surface,
        'surface-dim': '#E9EEF5',
        'surface-bright': '#FFFFFF',
        'surface-container-lowest': '#FFFFFF',
        'surface-container-low': brand.canvas,
        'surface-container': '#EEF2F7',
        'surface-container-high': '#E4EAF2',
        'surface-container-highest': '#DCE3ED',
        'surface-variant': '#EEF2F7',
        'on-surface': brand.text,
        'on-surface-variant': brand.text2,
        'inverse-surface': '#1F2A3C',
        'inverse-on-surface': '#EEF2F7',
        outline: '#A9B4C4',
        'outline-variant': brand.border,

        /* --- semantic status (brief §5) ---------------------------------- */
        error: '#B91C1C',
        'on-error': '#FFFFFF',
        'error-container': '#FEE2E2',
        'on-error-container': '#991B1B',
        success: '#166534', 'success-bg': '#DCFCE7',
        warning: '#92400E', 'warning-bg': '#FEF3C7',
        info: '#1E40AF', 'info-bg': '#DBEAFE',
        danger: '#B91C1C', 'danger-bg': '#FEE2E2',
        neutral: '#475569', 'neutral-bg': '#F1F5F9',
      },
      fontFamily: {
        sans: ['Inter', 'Segoe UI', 'system-ui', 'sans-serif'],
        'display-lg': ['Inter', 'sans-serif'],
        'headline-lg': ['Inter', 'sans-serif'],
        'headline-md': ['Inter', 'sans-serif'],
        'title-md': ['Inter', 'sans-serif'],
        'body-lg': ['Inter', 'sans-serif'],
        'body-md': ['Inter', 'sans-serif'],
        'body-sm': ['Inter', 'sans-serif'],
        'label-lg': ['Inter', 'sans-serif'],
        'label-md': ['Inter', 'sans-serif'],
        'label-sm': ['Inter', 'sans-serif'],
        'data-mono': ['Inter', 'ui-monospace', 'monospace'],
      },
      fontSize: {
        'display-lg': ['28px', { lineHeight: '36px', letterSpacing: '-0.02em', fontWeight: '700' }],
        'headline-lg': ['22px', { lineHeight: '28px', letterSpacing: '-0.01em', fontWeight: '600' }],
        'headline-md': ['18px', { lineHeight: '24px', letterSpacing: '-0.01em', fontWeight: '600' }],
        'title-md': ['15px', { lineHeight: '20px', fontWeight: '600' }],
        'body-lg': ['14px', { lineHeight: '20px', fontWeight: '400' }],
        'body-md': ['13px', { lineHeight: '18px', fontWeight: '400' }],
        'body-sm': ['12px', { lineHeight: '16px', fontWeight: '400' }],
        'label-lg': ['13px', { lineHeight: '16px', letterSpacing: '0.01em', fontWeight: '600' }],
        'label-md': ['11px', { lineHeight: '14px', letterSpacing: '0.03em', fontWeight: '600' }],
        'label-sm': ['10px', { lineHeight: '12px', letterSpacing: '0.04em', fontWeight: '700' }],
        'data-mono': ['12px', { lineHeight: '16px', letterSpacing: '-0.01em', fontWeight: '500' }],
      },
      borderRadius: { DEFAULT: '4px', lg: '6px', xl: '10px', '2xl': '12px', full: '9999px' },
      spacing: {
        gutter: '1rem', margin: '1.5rem',
        'space-xs': '0.25rem', 'space-sm': '0.5rem', 'space-md': '0.75rem',
        'space-lg': '1rem', 'space-xl': '1.5rem',
      },
      boxShadow: {
        sm: '0 1px 2px rgba(23,43,77,0.06)',
        DEFAULT: '0 1px 3px rgba(23,43,77,0.08)',
        md: '0 4px 12px rgba(23,43,77,0.08)',
        lg: '0 12px 32px rgba(57,23,29,0.16)',
        inner: 'inset 0 1px 2px rgba(23,43,77,0.05)',
      },
      maxWidth: { content: '1720px' },
    },
  },
  plugins: [],
};
