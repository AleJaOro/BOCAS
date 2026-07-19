/**
 * Product options: variants, modifiers/extras, halves
 *
 * priceMode:
 *  - "same"     → no cambia el precio base
 *  - "delta"    → suma (o resta) al precio actual
 *  - "absolute" → reemplaza el precio base (solo variantes)
 */

import { formatMoney, escapeHtml, generateId } from './utils.js';

export function emptyOptionRow(overrides = {}) {
  return {
    id: generateId('opt'),
    name: '',
    priceMode: 'same',
    price: 0,
    ...overrides
  };
}

export function emptyOptionsConfig() {
  return {
    variants: {
      enabled: false,
      label: 'Variante / tamaño',
      required: true,
      options: []
    },
    modifiers: {
      enabled: false,
      label: 'Extras / modificadores',
      multi: true,
      options: []
    },
    halves: {
      enabled: false,
      label: 'Mitades',
      options: []
    }
  };
}

/** Normalize legacy / partial item options */
export function normalizeItemOptions(item = {}) {
  const base = emptyOptionsConfig();
  const src = item.options || {};
  return {
    variants: {
      ...base.variants,
      ...(src.variants || {}),
      options: Array.isArray(src.variants?.options) ? src.variants.options : []
    },
    modifiers: {
      ...base.modifiers,
      ...(src.modifiers || {}),
      options: Array.isArray(src.modifiers?.options) ? src.modifiers.options : []
    },
    halves: {
      ...base.halves,
      ...(src.halves || {}),
      options: Array.isArray(src.halves?.options) ? src.halves.options : []
    }
  };
}

export function itemHasCustomOptions(item) {
  const o = item?.options;
  if (!o || typeof o !== 'object') return false;
  const varN = o.variants?.options?.length || 0;
  const modN = o.modifiers?.options?.length || 0;
  const halfN = o.halves?.options?.length || 0;
  // Explicit enabled OR options present (fallback if flag was lost)
  if (varN > 0 && o.variants?.enabled !== false) return true;
  if (modN > 0 && o.modifiers?.enabled !== false) return true;
  if (halfN >= 2 && o.halves?.enabled !== false) return true;
  return false;
}

function applyPriceMode(current, opt) {
  if (!opt) return current;
  const mode = opt.priceMode || 'same';
  const p = Number(opt.price) || 0;
  if (mode === 'absolute') return p;
  if (mode === 'delta') return current + p;
  return current; // same
}

/**
 * @param {object} item menu item
 * @param {object} selection { variantId, modifierIds: [], halfAId, halfBId }
 * @returns {{ unitPrice: number, label: string, selection: object, breakdown: string[] }}
 */
export function computeConfiguredPrice(item, selection = {}) {
  const opts = normalizeItemOptions(item);
  let unit = Number(item.price) || 0;
  const breakdown = [];
  const resolved = {
    variant: null,
    modifiers: [],
    halfA: null,
    halfB: null
  };

  if (opts.variants.options.length && opts.variants.enabled !== false) {
    const v = opts.variants.options.find((x) => x.id === selection.variantId);
    if (v) {
      const before = unit;
      unit = applyPriceMode(unit, v);
      resolved.variant = v;
      const diff = unit - before;
      breakdown.push(
        `${opts.variants.label || 'Variante'}: ${v.name}` +
          (v.priceMode === 'same' ? '' : ` (${diff >= 0 ? '+' : ''}${formatMoney(diff).replace('₡', '₡')})`)
      );
    }
  }

  // Halves / modifiers only use same | delta (absolute treated as surcharge)
  const addSurcharge = (current, opt) => {
    if (!opt || opt.priceMode === 'same') return current;
    return current + (Number(opt.price) || 0);
  };

  if (opts.halves.options.length && opts.halves.enabled !== false) {
    const a = opts.halves.options.find((x) => x.id === selection.halfAId);
    const b = opts.halves.options.find((x) => x.id === selection.halfBId);
    if (a) {
      const before = unit;
      unit = addSurcharge(unit, a);
      resolved.halfA = a;
      const extra = unit - before;
      breakdown.push(`Mitad 1: ${a.name}${extra ? ` (+${formatMoney(extra)})` : ''}`);
    }
    if (b) {
      const before = unit;
      unit = addSurcharge(unit, b);
      resolved.halfB = b;
      const extra = unit - before;
      breakdown.push(`Mitad 2: ${b.name}${extra ? ` (+${formatMoney(extra)})` : ''}`);
    }
  }

  if (opts.modifiers.options.length && opts.modifiers.enabled !== false) {
    const ids = Array.isArray(selection.modifierIds) ? selection.modifierIds : [];
    ids.forEach((mid) => {
      const m = opts.modifiers.options.find((x) => x.id === mid);
      if (!m) return;
      const before = unit;
      unit = addSurcharge(unit, m);
      resolved.modifiers.push(m);
      const extra = unit - before;
      breakdown.push(
        `+ ${m.name}${!extra ? '' : ` (${extra >= 0 ? '+' : ''}${formatMoney(extra)})`}`
      );
    });
  }

  if (unit < 0) unit = 0;

  const nameParts = [item.name];
  if (resolved.variant) nameParts.push(resolved.variant.name);
  if (resolved.halfA && resolved.halfB) {
    nameParts.push(`½ ${resolved.halfA.name} / ½ ${resolved.halfB.name}`);
  }
  if (resolved.modifiers.length) {
    nameParts.push(resolved.modifiers.map((m) => m.name).join(', '));
  }

  return {
    unitPrice: unit,
    label: nameParts.join(' · '),
    selection: resolved,
    breakdown,
    displayName: nameParts.join(' · ')
  };
}

export function validateSelection(item, selection = {}) {
  const opts = normalizeItemOptions(item);
  if (opts.variants.options.length && opts.variants.enabled !== false && opts.variants.required !== false) {
    if (!selection.variantId) return 'Selecciona una variante / tamaño';
  }
  if (opts.halves.options.length >= 2 && opts.halves.enabled !== false) {
    if (!selection.halfAId || !selection.halfBId) return 'Selecciona ambas mitades';
  }
  return null;
}

/** Admin editor rows HTML */
export function optionRowHtml(type, opt = emptyOptionRow()) {
  const showAbsolute = type === 'variant';
  const mode = opt.priceMode || 'same';
  return `
    <div class="option-editor-row" data-id="${escapeHtml(opt.id)}">
      <div>
        <label class="form-label xs mobile-only-label">Nombre</label>
        <input class="form-input opt-name" placeholder="Ej: 12 pedazos" value="${escapeHtml(opt.name || '')}" />
      </div>
      <div>
        <label class="form-label xs mobile-only-label">Tipo de precio</label>
        <select class="form-select opt-mode">
          <option value="same" ${mode === 'same' ? 'selected' : ''}>Mismo precio</option>
          <option value="delta" ${mode === 'delta' ? 'selected' : ''}>Sumar / restar ₡</option>
          ${showAbsolute ? `<option value="absolute" ${mode === 'absolute' ? 'selected' : ''}>Precio fijo ₡</option>` : ''}
        </select>
      </div>
      <div>
        <label class="form-label xs mobile-only-label">Monto ₡</label>
        <input class="form-input opt-price" type="number" step="1" inputmode="numeric" placeholder="0" value="${opt.price ?? 0}" title="Deja 0 si es mismo precio" />
      </div>
      <button type="button" class="btn btn-ghost btn-sm opt-remove" title="Quitar">Quitar</button>
    </div>`;
}

export function collectOptionRows(container) {
  return [...container.querySelectorAll('.option-editor-row')]
    .map((row) => ({
      id: row.dataset.id || generateId('opt'),
      name: row.querySelector('.opt-name')?.value?.trim() || '',
      priceMode: row.querySelector('.opt-mode')?.value || 'same',
      price: Number(row.querySelector('.opt-price')?.value) || 0
    }))
    .filter((o) => o.name);
}

export function priceModeHint(mode, price) {
  if (mode === 'same') return 'Incluido';
  if (mode === 'absolute') return formatMoney(price);
  const n = Number(price) || 0;
  if (!n) return 'Incluido';
  return n > 0 ? `+${formatMoney(n)}` : formatMoney(n);
}

/** Public customize modal fields */
export function buildCustomizeFieldsHtml(item) {
  const opts = normalizeItemOptions(item);
  const showVar = opts.variants.options.length > 0 && opts.variants.enabled !== false;
  const showHalf = opts.halves.options.length >= 2 && opts.halves.enabled !== false;
  const showMod = opts.modifiers.options.length > 0 && opts.modifiers.enabled !== false;
  let html = '';

  if (showVar) {
    html += `
      <div class="form-group">
        <label class="form-label">${escapeHtml(opts.variants.label || 'Variante')}</label>
        <select class="form-select" id="cfgVariant">
          <option value="">Seleccionar…</option>
          ${opts.variants.options
            .map(
              (o) =>
                `<option value="${escapeHtml(o.id)}" data-mode="${escapeHtml(o.priceMode || 'same')}" data-price="${o.price || 0}">${escapeHtml(o.name)} · ${priceModeHint(o.priceMode, o.price)}</option>`
            )
            .join('')}
        </select>
      </div>`;
  }

  if (showHalf) {
    const halfOpts = opts.halves.options
      .map(
        (o) =>
          `<option value="${escapeHtml(o.id)}">${escapeHtml(o.name)} · ${priceModeHint(o.priceMode, o.price)}</option>`
      )
      .join('');
    html += `
      <div class="form-group">
        <label class="form-label">${escapeHtml(opts.halves.label || 'Mitades')}</label>
        <div class="form-row">
          <div>
            <label class="form-label xs">Mitad 1</label>
            <select class="form-select" id="cfgHalfA"><option value="">…</option>${halfOpts}</select>
          </div>
          <div>
            <label class="form-label xs">Mitad 2</label>
            <select class="form-select" id="cfgHalfB"><option value="">…</option>${halfOpts}</select>
          </div>
        </div>
      </div>`;
  }

  if (showMod) {
    html += `
      <div class="form-group">
        <label class="form-label">${escapeHtml(opts.modifiers.label || 'Extras')}</label>
        <div class="modifier-list">
          ${opts.modifiers.options
            .map(
              (o) => `
            <label class="form-check modifier-check">
              <input type="checkbox" class="cfg-mod" value="${escapeHtml(o.id)}" />
              <span>${escapeHtml(o.name)} <span class="muted">(${priceModeHint(o.priceMode, o.price)})</span></span>
            </label>`
            )
            .join('')}
        </div>
      </div>`;
  }

  if (!html) {
    html = `<p class="muted small">Este platillo no tiene opciones configuradas.</p>`;
  }

  return html;
}

export function readCustomizeSelection(root = document) {
  return {
    variantId: root.querySelector('#cfgVariant')?.value || '',
    halfAId: root.querySelector('#cfgHalfA')?.value || '',
    halfBId: root.querySelector('#cfgHalfB')?.value || '',
    modifierIds: [...root.querySelectorAll('.cfg-mod:checked')].map((el) => el.value)
  };
}

export function optionsSummaryBadges(item) {
  const o = normalizeItemOptions(item);
  const tags = [];
  if (o.variants.enabled && o.variants.options.length) tags.push(`${o.variants.options.length} variantes`);
  if (o.modifiers.enabled && o.modifiers.options.length) tags.push(`${o.modifiers.options.length} extras`);
  if (o.halves.enabled && o.halves.options.length) tags.push('mitades');
  return tags;
}
