import { Storefront } from '@phosphor-icons/react';
import { useEffect, useState } from 'react';

interface ProductLogoProps {
  src: string;
  alt?: string;
  /** Shared sizing/border class from the call site; used by both states so the
   *  placeholder occupies the exact footprint the real logo would. */
  className?: string;
  iconSize?: number;
  width?: number;
  height?: number;
  loading?: 'lazy' | 'eager';
  decoding?: 'async' | 'sync' | 'auto';
}

/**
 * A product's logo is served at a predictable URL whether or not one has been
 * uploaded yet, so a brand-new product renders a broken image until an admin
 * adds its artwork. When the image fails to load we fall back to a shop icon on
 * a theme-adaptive surface instead — readable in both light and dark.
 */
export function ProductLogo({ src, alt = '', className, iconSize = 28, ...imgProps }: ProductLogoProps) {
  const [failed, setFailed] = useState(false);

  // A product can gain a real logo later (its src gains a new version); when the
  // src changes, give the image another chance instead of staying on the icon.
  useEffect(() => setFailed(false), [src]);

  if (failed) {
    return (
      <span
        className={className}
        aria-hidden
        // Overriding inline beats the caller class's white logo background in
        // both themes, whatever order the stylesheets happen to load in.
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'var(--bg-secondary)',
          color: 'var(--text-muted)',
        }}
      >
        <Storefront size={iconSize} weight="duotone" />
      </span>
    );
  }

  return (
    <img
      className={className}
      src={src}
      alt={alt}
      draggable={false}
      onContextMenu={(event) => event.preventDefault()}
      onError={() => setFailed(true)}
      style={{ WebkitTouchCallout: 'none', userSelect: 'none', pointerEvents: 'none' }}
      {...imgProps}
    />
  );
}
