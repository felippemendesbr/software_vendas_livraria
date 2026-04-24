'use client';

import { useEffect, useState } from 'react';
import { ImageIcon } from 'lucide-react';
import { resolveProductImageSrc } from '@/lib/product-image';

type Variant = 'thumb' | 'preview';

interface ProductPhotoProps {
  src: string | null | undefined;
  alt: string;
  variant?: Variant;
  className?: string;
}

const thumbClass =
  'h-11 w-11 sm:h-12 sm:w-12 rounded-lg object-cover border border-white shadow-sm ring-1 ring-[#E6E1CF] bg-[#FAF9F6]';

const previewClass =
  'max-h-52 w-full max-w-md mx-auto rounded-xl object-contain border border-[#E6E1CF] bg-[#F5F3ED]';

export default function ProductPhoto({ src, alt, variant = 'thumb', className = '' }: ProductPhotoProps) {
  const [broken, setBroken] = useState(false);
  const url = resolveProductImageSrc(src);

  useEffect(() => {
    setBroken(false);
  }, [src]);

  if (!url || broken) {
    const box =
      variant === 'thumb'
        ? `${thumbClass} flex items-center justify-center text-[#C4BBB4]`
        : 'flex h-48 w-full max-w-md mx-auto items-center justify-center rounded-xl border-2 border-dashed border-[#E6E1CF] bg-[#FAF9F6] text-[#C4BBB4]';

    return (
      <div className={`${box} ${className}`}>
        <ImageIcon className={variant === 'thumb' ? 'w-5 h-5' : 'w-12 h-12'} aria-hidden />
      </div>
    );
  }

  const imgClass = variant === 'thumb' ? thumbClass : previewClass;

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt={alt}
      loading={variant === 'thumb' ? 'lazy' : 'eager'}
      onError={() => setBroken(true)}
      className={`${imgClass} ${className}`}
    />
  );
}
