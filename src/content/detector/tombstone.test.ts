/**
 * Tests for injectTombstone — sibling-div injection with click-to-reveal.
 * Uses jsdom (configured in vitest.config.ts) for DOM operations.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { injectTombstone, injectBlockedTombstone, PIRATE_LINES } from './tombstone';

describe('injectTombstone', () => {
  let parent: HTMLDivElement;
  let postNode: HTMLDivElement;

  beforeEach(() => {
    parent = document.createElement('div');
    postNode = document.createElement('div');
    postNode.setAttribute('data-urn', 'urn:li:activity:123');
    parent.appendChild(postNode);
    document.body.appendChild(parent);
  });

  it('inserts tombstone as sibling BEFORE postNode (sibling injection, not inside)', () => {
    injectTombstone(postNode, 'Jane Smith', 74);
    // Parent should now have [tombstone, postNode]
    expect(parent.children.length).toBe(2);
    expect(parent.children[0]?.classList.contains('llb-tombstone')).toBe(true);
    expect(parent.children[1]).toBe(postNode);
  });

  it('shows the ship logo, pirate copy, score, and a random pirate line', () => {
    injectTombstone(postNode, 'Jane Smith', 74);
    const tombstone = parent.children[0] as HTMLElement;
    const text = tombstone.textContent ?? '';
    expect(tombstone.querySelector('svg')).not.toBeNull();
    expect(text).toContain('Flying false colours');
    expect(text).toContain('Jane Smith');
    expect(text).toContain('Score: 74/100');
    expect(PIRATE_LINES.some(line => text.includes(line))).toBe(true);
  });

  it('renders a reveal button with the author name in its aria-label', () => {
    injectTombstone(postNode, 'Jane Smith', 74);
    const reveal = (parent.children[0] as HTMLElement).querySelector('.llb-tombstone__reveal');
    expect(reveal).not.toBeNull();
    expect(reveal?.getAttribute('aria-label')).toContain('Jane Smith');
  });

  it('reveal button removes llb-hidden from postNode and removes tombstone from DOM', () => {
    // Give postNode the hidden class first (as content/index.ts would)
    postNode.classList.add('llb-hidden');
    injectTombstone(postNode, 'Jane Smith', 74);

    const tombstone = parent.children[0] as HTMLElement;
    const reveal = tombstone.querySelector('.llb-tombstone__reveal') as HTMLButtonElement;
    expect(postNode.classList.contains('llb-hidden')).toBe(true);

    reveal.click();

    expect(postNode.classList.contains('llb-hidden')).toBe(false);
    expect(tombstone.parentNode).toBeNull();
  });
});

describe('injectBlockedTombstone', () => {
  let parent: HTMLDivElement;
  let postNode: HTMLDivElement;

  beforeEach(() => {
    parent = document.createElement('div');
    postNode = document.createElement('div');
    postNode.setAttribute('data-urn', 'urn:li:activity:456');
    parent.appendChild(postNode);
    document.body.appendChild(parent);
  });

  it('inserts blocked tombstone as sibling BEFORE postNode', () => {
    injectBlockedTombstone(postNode, 'Filipa Lobão', 62, 0);
    expect(parent.children.length).toBe(2);
    expect(parent.children[0]?.classList.contains('llb-tombstone--blocked')).toBe(true);
    expect(parent.children[1]).toBe(postNode);
  });

  it('shows the skull logo, pirate copy, author name, and scores', () => {
    injectBlockedTombstone(postNode, 'Filipa Lobão', 62, 0);
    const tombstone = parent.children[0] as HTMLElement;
    expect(tombstone.querySelector('svg')).not.toBeNull();
    expect(tombstone.textContent).toContain('walk the plank');
    expect(tombstone.textContent).toContain('Filipa Lobão');
    expect(tombstone.textContent).toContain('Post score: 62');
    expect(tombstone.textContent).toContain('Profile score: 0');
  });

  it('appends one of the known random pirate lines to the score line', () => {
    injectBlockedTombstone(postNode, 'Filipa Lobão', 62, 0);
    const tombstone = parent.children[0] as HTMLElement;
    const text = tombstone.textContent ?? '';
    expect(PIRATE_LINES.some(line => text.includes(line))).toBe(true);
  });

  it('renders a reveal button (XSS-safe: author via textContent, no markup injected)', () => {
    injectBlockedTombstone(postNode, '<img src=x onerror=alert(1)>', 50, 10);
    const tombstone = parent.children[0] as HTMLElement;
    const reveal = tombstone.querySelector('.llb-tombstone__reveal') as HTMLButtonElement;
    expect(reveal).not.toBeNull();
    expect(reveal.getAttribute('type')).toBe('button');
    // The author name must be inert text, never a live <img> element.
    expect(tombstone.querySelector('img')).toBeNull();
  });

  it('reveal button removes llb-hidden from postNode and removes the tombstone', () => {
    postNode.classList.add('llb-hidden');
    injectBlockedTombstone(postNode, 'Filipa Lobão', 62, 0);
    const tombstone = parent.children[0] as HTMLElement;
    const reveal = tombstone.querySelector('.llb-tombstone__reveal') as HTMLButtonElement;

    reveal.click();

    expect(postNode.classList.contains('llb-hidden')).toBe(false);
    expect(tombstone.parentNode).toBeNull();
  });
});
