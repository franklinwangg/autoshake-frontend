export const COLORS = {
	primary:         '#4c61af',
	primaryDark:     '#3b4f8f',
	success:         '#4caf50',
	error:           '#d32f2f',
	danger:          '#ff4444',
	brandDark:       '#1e2a5e',
	logout:          '#ef9a9a',
	white:           '#ffffff',

	textPrimary:     '#333333',
	textSecondary:   '#555555',
	textMuted:       '#666666',
	textFaint:       '#888888',
	textPlaceholder: '#999999',
	textDisabled:    '#bbbbbb',
	textCode:        '#d4d4d4',

	border:          '#dddddd',
	borderSubtle:    '#dde3f5',
	borderDrop:      '#b0bce8',
	borderDisabled:  '#cccccc',

	bgSubtle:        '#f5f5f5',
	bgLight:         '#fafafa',
	bgGradientStart: '#f8faff',
	bgGradientEnd:   '#eef1fb',
	bgSuccess:       '#f0faf0',
	bgSuccessHover:  '#e8f5e9',
	bgHover:         '#e8e8e8',
	bgDark:          '#1e1e1e',
} as const;

export const SPACING = {
	4:  '4px',
	6:  '6px',
	8:  '8px',
	10: '10px',
	12: '12px',
	14: '14px',
	16: '16px',
	20: '20px',
	24: '24px',
	32: '32px',
	36: '36px',
	40: '40px',
} as const;

export const FONT_SIZE = {
	xs:      '11px',
	sm:      '12px',
	base:    '14px',
	md:      '1rem',
	lg:      '1.25rem',
	xl:      '1.4rem',
	'2xl':   '1.6rem',
	'3xl':   '2rem',
	'4xl':   '2.2rem',
	display: '3rem',
} as const;

export const RADIUS = {
	sm:   '4px',
	md:   '6px',
	lg:   '8px',
	xl:   '10px',
	'2xl': '16px',
	pill: '34px',
} as const;

export const TRANSITION = {
	fast:   '0.2s',
	faster: '0.15s',
} as const;

function camelToKebab(s: string): string {
	return s.replace(/([A-Z])/g, '-$1').toLowerCase();
}

export function injectCSSVariables(): void {
	const rules: string[] = [];

	for (const [key, value] of Object.entries(COLORS)) {
		rules.push(`  --color-${camelToKebab(key)}: ${value};`);
	}
	for (const [key, value] of Object.entries(SPACING)) {
		rules.push(`  --space-${key}: ${value};`);
	}
	for (const [key, value] of Object.entries(FONT_SIZE)) {
		rules.push(`  --text-${key}: ${value};`);
	}
	for (const [key, value] of Object.entries(RADIUS)) {
		rules.push(`  --radius-${key}: ${value};`);
	}
	for (const [key, value] of Object.entries(TRANSITION)) {
		rules.push(`  --transition-${key}: ${value};`);
	}

	const style = document.createElement('style');
	style.textContent = `:root {\n${rules.join('\n')}\n}`;
	document.head.appendChild(style);
}
